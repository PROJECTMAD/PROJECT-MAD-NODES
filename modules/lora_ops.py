import re
import json
import logging
import torch
import comfy.utils
import folder_paths
import comfy.lora
import comfy.model_management
import comfy.float
from comfy.model_patcher import get_key_weight, string_to_seed
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple


try:
    from safetensors import safe_open

    HAS_SAFETENSORS = True
except ImportError:
    HAS_SAFETENSORS = False


LOG_PREFIX = "[MAD-NODES-OPS]"


UI_CONFIG = {
    "config_version": "1.2.2",
    "BLOCK_ORDER": [
        "clip",
        "input",
        "down",
        "double",
        "middle",
        "mid",
        "joint",
        "layers",
        "single",
        "up",
        "output",
        "specialized",
    ],
    "BLOCK_GROUPS": [
        {
            "id": "clip",
            "label": "Text Encoder / CLIP",
            "patterns": ["^clip", "^te_", "^text_"],
            "toggles": ["split_mode"],
        },
        {
            "id": "input",
            "label": "Structure / Input",
            "patterns": ["input", "down", "double"],
        },
        {
            "id": "middle",
            "label": "Concept / Middle",
            "patterns": ["middle", "mid", "joint"],
        },
        {
            "id": "output",
            "label": "Style / Output",
            "patterns": ["output", "up", "single"],
        },
        {"id": "layers", "label": "Transformer Layers", "patterns": ["^layers"]},
        {
            "id": "aux",
            "label": "Embeddings / Aux",
            "patterns": [".*"],
        },
    ],
    "PRESET_COMPATIBLE_ARCHS": ["SDXL", "SD1", "SD2", "1.5", "FLUX", "SD3"],
    "PRESET_STRATEGIES": {
        "LINEAR": {
            "label": "Linear (Default)",
            "desc": "No modification. All blocks set to 1.0.",
            "weights": {
                "POSE": 1.0,
                "IDENTITY": 1.0,
                "STYLE": 1.0,
                "DETAILS": 1.0,
                "CLIP": 1.0,
                "OTHER": 1.0,
            },
        },
        "STYLE_FOCUSED": {
            "label": "Style Focused",
            "desc": "Reduces structural influence to let the LoRA's style bleed through.",
            "weights": {
                "POSE": 0.6,
                "IDENTITY": 1.0,
                "STYLE": 1.4,
                "DETAILS": 1.6,
                "CLIP": 1.0,
                "OTHER": 1.0,
            },
        },
        "BALANCED": {
            "label": "Balanced Distribution",
            "desc": "Slight boost to style and details while keeping structure firm.",
            "weights": {
                "POSE": 0.9,
                "IDENTITY": 1.1,
                "STYLE": 1.1,
                "DETAILS": 1.2,
                "CLIP": 1.0,
                "OTHER": 1.0,
            },
        },
        "HEAVY_STYLE": {
            "label": "Heavy Style Transfer",
            "desc": "Aggressive style transfer. May break anatomy.",
            "weights": {
                "POSE": 0.4,
                "IDENTITY": 1.2,
                "STYLE": 1.6,
                "DETAILS": 1.8,
                "CLIP": 1.0,
                "OTHER": 1.0,
            },
        },
        "REALISM": {
            "label": "Realism Tweak",
            "desc": "Subtle boost to texture and lighting blocks.",
            "weights": {
                "POSE": 1.0,
                "IDENTITY": 1.0,
                "STYLE": 1.05,
                "DETAILS": 1.1,
                "CLIP": 1.0,
                "OTHER": 1.0,
            },
        },
    },
    "ARCH_BLOCK_MAPPINGS": {
        "FLUX": {
            "pose": "Double Blocks (0-10)\nStructure & Composition",
            "identity": "Double Blocks (11+)\nSubject Likeness",
            "style": "Single Blocks (0-20)\nArtistic Flow",
            "details": "Single Blocks (21+)\nFine Texture",
        },
        "SD15": {
            "pose": "Input (0-8)\nCoarse Structure",
            "identity": "Input(9+) / Mid / Output(0-2)\nMain Subject",
            "style": "Output (3-8)\nLighting & Style",
            "details": "Output (9+)\nPixel Details",
        },
        "SD3": {
            "pose": "Joint Blocks (Early)\nSpatial Structure",
            "identity": "Joint Blocks (Mid)\nSubject Features",
            "style": "Joint Blocks (Late)\nArtistic Rendering",
            "details": "Joint Blocks (Final)\nOutput Refinement",
        },
        "LINEAR": {
            "pose": "Layers (0-30%)\nEarly Processing",
            "identity": "Layers (30-60%)\nMiddle Processing",
            "style": "Layers (60-80%)\nLate Processing",
            "details": "Layers (80-100%)\nFinal Refinement",
        },
        "SDXL": {
            "pose": "Input Blocks\nComposition & Structure",
            "identity": "Middle & Output(0-2)\nEntity & Concept",
            "style": "Output Blocks (3-5)\nLighting & Art Style",
            "details": "Output Blocks (6-8)\nTexture & Details",
        },
    },
}


class BlockMapper:
    """
    Maps raw tensor keys to Semantic Tags based on Architecture.
    Tags: POSE, IDENTITY, STYLE, DETAILS, CLIP, OTHER
    """

    _COMPILED_PATTERNS = {}

    @classmethod
    def _ensure_compiled(cls):
        if cls._COMPILED_PATTERNS:
            return

        for group in UI_CONFIG["BLOCK_GROUPS"]:
            gid = group["id"]
            cls._COMPILED_PATTERNS[gid] = [
                re.compile(p, re.IGNORECASE) for p in group["patterns"]
            ]

    @staticmethod
    def get_group(block_id: str) -> str:
        """Determines the UI group ID for a given block ID."""
        BlockMapper._ensure_compiled()

        for group in UI_CONFIG["BLOCK_GROUPS"]:
            gid = group["id"]
            patterns = BlockMapper._COMPILED_PATTERNS.get(gid, [])
            for pattern in patterns:
                if pattern.search(block_id):
                    return gid
        return "aux"

    @staticmethod
    def get_info(key: str, arch: str, total_layers: int = 0) -> Tuple[str, str]:
        """
        Returns (standardized_block_name, semantic_tag)
        """
        k = key.lower()

        if any(
            x in k
            for x in [
                "te_",
                "text_model",
                "text_encoder",
                "clip_l",
                "clip_g",
                "t5",
                "encoder",
                "txt_proj",
                "logit_scale",
            ]
        ):
            m = re.search(r"layers?[\._](\d+)", k)
            name = f"clip_layer_{m.group(1)}" if m else "clip_encoder"
            return name, "CLIP"

        if any(
            x in k
            for x in [
                "time_embed",
                "label_embed",
                "vector_in",
                "img_in",
                "guidance_in",
                "final_layer",
                "norm_out",
                "proj_out",
            ]
        ):
            return "specialized_embeds", "OTHER"

        if "SDXL" in arch or arch == "UNKNOWN":
            if "input_block" in k:
                m = re.search(r"input_blocks[\._](\d+)", k)
                idx = int(m.group(1)) if m else 0
                return f"input_{idx}", "POSE"

            if "middle_block" in k:
                return "middle_0", "IDENTITY"

            if "output_block" in k:
                m = re.search(r"output_blocks[\._](\d+)", k)
                idx = int(m.group(1)) if m else 0
                if idx <= 2:
                    tag = "IDENTITY"
                elif idx <= 5:
                    tag = "STYLE"
                else:
                    tag = "DETAILS"
                return f"output_{idx}", tag

        if "FLUX" in arch:
            if "double_block" in k:
                m = re.search(r"double_blocks[\._](\d+)", k)
                idx = int(m.group(1)) if m else 0
                tag = "POSE" if idx <= 10 else "IDENTITY"
                return f"double_{idx}", tag

            if "single_block" in k:
                m = re.search(r"single_blocks[\._](\d+)", k)
                idx = int(m.group(1)) if m else 0
                tag = "STYLE" if idx <= 20 else "DETAILS"
                return f"single_{idx}", tag

        if "SD1" in arch or "SD2" in arch:
            if "input_block" in k:
                m = re.search(r"input_blocks[\._](\d+)", k)
                idx = int(m.group(1)) if m else 0
                tag = "POSE" if idx <= 8 else "IDENTITY"
                return f"input_{idx}", tag
            if "middle_block" in k:
                return "middle_0", "IDENTITY"
            if "output_block" in k:
                m = re.search(r"output_blocks[\._](\d+)", k)
                idx = int(m.group(1)) if m else 0
                tag = "IDENTITY" if idx <= 2 else ("STYLE" if idx <= 8 else "DETAILS")
                return f"output_{idx}", tag

        if "SD3" in arch:
            if "joint_block" in k:
                m = re.search(r"joint_blocks[\._](\d+)", k)
                idx = int(m.group(1)) if m else 0
                if idx < 6:
                    tag = "POSE"
                elif idx < 12:
                    tag = "IDENTITY"
                elif idx < 18:
                    tag = "STYLE"
                else:
                    tag = "DETAILS"
                return f"joint_{idx}", tag

        m = re.search(r"(?:layers|blocks|h)[\._](\d+)", k)
        if m:
            idx = int(m.group(1))
            name = f"layers_{idx}"
            limit = total_layers if total_layers > 0 else 28
            ratio = idx / limit
            if ratio < 0.30:
                tag = "POSE"
            elif ratio < 0.60:
                tag = "IDENTITY"
            elif ratio < 0.80:
                tag = "STYLE"
            else:
                tag = "DETAILS"
            return name, tag

        return "misc", "OTHER"


class AnalysisMath:
    @staticmethod
    def calculate_gini(values: List[float]) -> float:
        if not values or len(values) < 2:
            return 0.0
        array = sorted([abs(x) for x in values])
        n = len(array)
        index = torch.arange(1, n + 1, dtype=torch.float32)
        n_tensor = torch.tensor(n, dtype=torch.float32)
        arr_tensor = torch.tensor(array, dtype=torch.float32)
        return ((2 * index - n_tensor - 1) * arr_tensor).sum() / (
            n_tensor * arr_tensor.sum()
        )

    @staticmethod
    def calculate_bias(block_data: Dict[str, float]) -> float:
        if not block_data:
            return 0.0

        order_list = UI_CONFIG["BLOCK_ORDER"]

        def sort_key(k):
            prefix = k.split("_")[0].lower()
            nums = re.findall(r"\d+", k)
            idx = int(nums[0]) if nums else 0
            try:
                rank = order_list.index(prefix)
            except ValueError:
                rank = 99
            return (rank, idx)

        sorted_keys = sorted(block_data.keys(), key=sort_key)
        total_energy = sum(block_data.values())
        if total_energy == 0:
            return 0.0

        weighted_sum = 0.0
        n = len(sorted_keys)
        if n <= 1:
            return 0.0

        for i, key in enumerate(sorted_keys):
            pos_norm = i / (n - 1)
            pos_bipolar = (pos_norm * 2) - 1.0
            energy = block_data[key]
            weighted_sum += energy * pos_bipolar

        return weighted_sum / total_energy


class LoraOps:
    @staticmethod
    def normalize_value(val: float) -> float:
        """Standardize float precision to 4 decimal places to match frontend."""
        return round(val, 4)

    @staticmethod
    def get_ui_config() -> Dict[str, Any]:
        return UI_CONFIG

    @staticmethod
    def resolve_path(lora_name: str) -> Optional[str]:
        if not lora_name:
            return None
        direct = folder_paths.get_full_path("loras", lora_name)
        if direct:
            return direct
        try:
            available = folder_paths.get_filename_list("loras")
        except Exception:
            available = []
        target_stem = Path(lora_name).stem.lower()
        target_base = Path(lora_name).name.lower()
        best, best_score = None, -1
        for rel in available:
            p = Path(rel)
            score = -1
            if p.name.lower() == target_base:
                score = 100
            elif p.stem.lower() == target_stem:
                score = 50
            if score > -1:
                provided_norm = str(Path(lora_name)).replace("\\", "/").lower()
                rel_norm = str(p).replace("\\", "/").lower()
                if "/" in provided_norm and provided_norm in rel_norm:
                    score += 25
                if score > best_score:
                    best_score = score
                    best = rel
        return folder_paths.get_full_path("loras", best) if best else None

    @staticmethod
    def compute_stats(
        file_path: Path, arch: str = "UNKNOWN"
    ) -> Optional[Dict[str, Any]]:
        try:
            block_data = {}
            block_metadata = {}
            total_norm = 0.0

            def process_tensor(k, w, total_layers):
                nonlocal total_norm

                try:
                    norm = torch.norm(w.float()).item() if w.dim() >= 1 else 0.01
                except (RuntimeError, TypeError):
                    norm = 0.01

                total_norm += norm

                block_id, tag = BlockMapper.get_info(k, arch, total_layers)

                block_data[block_id] = block_data.get(block_id, 0.0) + norm

                if block_id not in block_metadata:
                    block_metadata[block_id] = {
                        "tag": tag,
                        "group": BlockMapper.get_group(block_id),
                    }

            if HAS_SAFETENSORS and file_path.suffix.lower() == ".safetensors":
                try:
                    with safe_open(file_path, framework="pt", device="cpu") as f:
                        keys = f.keys()

                        max_layer_idx = 0
                        for k in keys:
                            m = re.search(r"(?:layers|blocks|h)[\._](\d+)", k)
                            if m:
                                max_layer_idx = max(max_layer_idx, int(m.group(1)))
                        total_layers = max_layer_idx + 1

                        for k in keys:
                            tensor = f.get_tensor(k)
                            process_tensor(k, tensor, total_layers)
                            del tensor

                except Exception as e:
                    logging.warning(
                        f"{LOG_PREFIX} Streaming failed, falling back to full load: {e}"
                    )

                    pass
                else:
                    return LoraOps._finalize_stats(
                        total_norm, block_data, block_metadata
                    )

            lora = comfy.utils.load_torch_file(str(file_path), safe_load=True)
            if not lora:
                return None

            max_layer_idx = 0
            for k in lora.keys():
                m = re.search(r"(?:layers|blocks|h)[\._](\d+)", k)
                if m:
                    max_layer_idx = max(max_layer_idx, int(m.group(1)))
            total_layers = max_layer_idx + 1

            for k, w in lora.items():
                process_tensor(k, w, total_layers)

            return LoraOps._finalize_stats(total_norm, block_data, block_metadata)

        except Exception as e:
            logging.error(f"{LOG_PREFIX} Analysis failed: {e}")
            return None

    @staticmethod
    def _finalize_stats(total_norm, block_data, block_metadata):
        """Helper to finalize and return stats dictionary."""
        energy_values = list(block_data.values())
        sparsity = float(AnalysisMath.calculate_gini(energy_values))
        bias = float(AnalysisMath.calculate_bias(block_data))

        return {
            "total_energy": float(total_norm),
            "energy_distribution": block_data,
            "block_metadata": block_metadata,
            "sparsity": sparsity,
            "balance": bias,
        }

    @classmethod
    def apply_lbw(cls, lora, arch, name, vectors=None):
        new_lora = {}
        has_vectors = vectors is not None and len(vectors) > 0

        max_layer_idx = 0
        for k in lora.keys():
            m = re.search(r"(?:layers|blocks|h)[\._](\d+)", k)
            if m:
                max_layer_idx = max(max_layer_idx, int(m.group(1)))
        total_layers = max_layer_idx + 1

        for key, tensor in lora.items():
            scalar = 1.0
            block_id, tag = BlockMapper.get_info(key, arch, total_layers)
            if has_vectors:
                scalar = float(vectors.get(block_id, 1.0))
            new_lora[key] = tensor * scalar

        return new_lora

    @staticmethod
    def get_vectors_for_preset(
        arch: str,
        preset_name: str,
        available_blocks: List[str],
        block_metadata: Dict[str, Any],
    ) -> Dict[str, float]:
        """
        Generates a vector dictionary for a specific preset and architecture.
        """
        if not preset_name or preset_name not in UI_CONFIG["PRESET_STRATEGIES"]:
            return {}

        strategy = UI_CONFIG["PRESET_STRATEGIES"][preset_name]["weights"]
        vectors = {}

        for block_id in available_blocks:
            if block_id in block_metadata:
                tag = block_metadata[block_id].get("tag", "OTHER")
            else:
                _, tag = BlockMapper.get_info(block_id, arch)

            val = strategy.get(tag, strategy.get("OTHER", 1.0))
            norm_val = LoraOps.normalize_value(val)

            if abs(norm_val - 1.0) > 0.001:
                vectors[block_id] = norm_val

        return vectors

    @staticmethod
    def extract_triggers(lora_path: Path) -> List[str]:
        triggers = []
        candidates = [
            lora_path.with_name(f"{lora_path.stem}.metadata.json"),
            lora_path.with_name(f"{lora_path.stem}.json"),
        ]
        for json_path in candidates:
            if not json_path.exists():
                continue
            try:
                with open(json_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    tw = data.get("trainedWords") or data.get("civitai", {}).get(
                        "trainedWords"
                    )
                    if isinstance(tw, list):
                        triggers.extend(
                            [str(t) for t in tw if isinstance(t, (str, int, float))]
                        )
            except (OSError, json.JSONDecodeError):
                continue
        return triggers

    @staticmethod
    def serialize_vectors(vectors: Dict[str, float]) -> str:
        """Canonical serialization of vectors to string format."""
        if not vectors:
            return ""

        sorted_items = sorted(vectors.items())
        return ";".join(
            [
                f"{k}={LoraOps.normalize_value(v):.4f}".rstrip("0").rstrip(".")
                for k, v in sorted_items
            ]
        )

    @staticmethod
    def parse_external_string(input_string: str) -> List[Dict[str, Any]]:
        if not input_string or not input_string.strip():
            return []
        if input_string.strip().startswith("["):
            try:
                return json.loads(input_string)
            except json.JSONDecodeError:
                pass

        lora_list = []
        for line in input_string.split("\n"):
            line = line.strip()
            if not line.startswith("<lora:") or not line.endswith(">"):
                continue
            parts = line[6:-1].split(":")
            if len(parts) < 1:
                continue

            item = {
                "lora_name": parts[0],
                "strength_model": 1.0,
                "strength_clip": 1.0,
                "points": [],
                "enabled": True,
                "arch": "UNKNOWN",
                "vectors": {},
            }
            if len(parts) >= 2 and parts[1]:
                try:
                    item["strength_model"] = float(parts[1])
                except ValueError:
                    pass
            if len(parts) >= 3 and parts[2]:
                try:
                    item["strength_clip"] = float(parts[2])
                except ValueError:
                    pass

            is_legacy = False
            if len(parts) >= 9:
                try:
                    float(parts[3].strip())
                    if not any(x in parts[3] for x in ["=", ",", ";"]):
                        is_legacy = True
                except ValueError:
                    pass

            if is_legacy:
                try:
                    s_start, s_end = float(parts[3]), float(parts[4])
                    p_start, p_end = float(parts[6]), float(parts[7])
                    count = int(parts[8])
                    for i in range(count):
                        t = i / (count - 1) if count > 1 else 0.0
                        px = p_start + (p_end - p_start) * t
                        py = s_start + (s_end - s_start) * t
                        item["points"].append(
                            {"x": float(f"{px:.4f}"), "y": float(f"{py:.4f}")}
                        )
                except (ValueError, IndexError, ZeroDivisionError):
                    pass
            else:
                for part in parts[3:]:
                    part = part.strip()
                    if not part:
                        continue

                    if part.startswith("preset="):
                        item["preset"] = part.split("=", 1)[1].strip()
                    elif part.startswith("vectors="):
                        try:
                            vec_str = part.split("=", 1)[1]
                            for p in vec_str.split(";"):
                                p = p.strip()
                                if not p:
                                    continue
                                if "=" in p:
                                    k, v = p.split("=", 1)
                                elif ":" in p:
                                    k, v = p.split(":", 1)
                                item["vectors"][k.strip()] = float(v.strip())
                        except (ValueError, KeyError):
                            pass
                    elif "," in part:
                        for pair in part.split(";"):
                            if "," in pair:
                                try:
                                    px, py = pair.split(",")
                                    item["points"].append(
                                        {"x": float(px.strip()), "y": float(py.strip())}
                                    )
                                except (ValueError, IndexError):
                                    pass

            if not item["points"]:
                item["points"] = [{"x": 0.0, "y": 1.0}, {"x": 1.0, "y": 1.0}]
            item["points"].sort(key=lambda p: p["x"])
            lora_list.append(item)
        return lora_list


class MadPatcherOverrides:
    @staticmethod
    def _is_zero(value):
        """
        Safely checks if a value (float, int, or Tensor) is effectively zero.
        Prevents 'Boolean value of Tensor is ambiguous' errors.
        """
        if isinstance(value, torch.Tensor):
            if value.numel() == 1:
                return value.item() == 0.0
            return False
        return value == 0.0

    @staticmethod
    def optimized_calculate_weight(patches, weight, key, intermediate_dtype=None):
        """
        Optimized replacement for comfy.lora.calculate_weight.
        1. Filters out patches with 0.0 strength to save compute/memory.
        2. Returns early if no patches remain.
        """
        clean_patches = []
        for p in patches:
            if MadPatcherOverrides._is_zero(p[0]):
                continue
            clean_patches.append(p)

        if not clean_patches:
            return weight

        return comfy.lora.calculate_weight(
            clean_patches, weight, key, intermediate_dtype=intermediate_dtype
        )

    @staticmethod
    def patch_hook_weight_to_device(
        self,
        hooks,
        combined_patches,
        key,
        original_weights,
        memory_counter,
        *args,
        **kwargs,
    ):
        """
        Monkey-patch target for ModelPatcher.patch_hook_weight_to_device.
        """
        import comfy.hooks

        if key not in combined_patches:
            return

        weight, set_func, convert_func = get_key_weight(self.model, key)

        if key not in self.hook_backup:
            target_device = self.offload_device
            if self.hook_mode == comfy.hooks.EnumHookMode.MaxSpeed:
                used = memory_counter.use(weight)
                if used:
                    target_device = weight.device
            self.hook_backup[key] = (
                weight.to(device=target_device, copy=True),
                weight.device,
            )

        temp_weight = comfy.model_management.cast_to_device(
            weight, weight.device, torch.float32, copy=True
        )
        if convert_func is not None:
            temp_weight = convert_func(temp_weight, inplace=True)

        out_weight = MadPatcherOverrides.optimized_calculate_weight(
            combined_patches[key], temp_weight, key
        )

        if original_weights is not None:
            del original_weights[key]

        if set_func is None:
            out_weight = comfy.float.stochastic_rounding(
                out_weight, weight.dtype, seed=string_to_seed(key)
            )
            comfy.utils.copy_to_param(self.model, key, out_weight)
        else:
            set_func(out_weight, inplace_update=True, seed=string_to_seed(key))

        if self.hook_mode == comfy.hooks.EnumHookMode.MaxSpeed:
            target_device = self.offload_device
            used = memory_counter.use(weight)
            if used:
                target_device = weight.device
            self.cached_hook_patches.setdefault(hooks, {})
            self.cached_hook_patches[hooks][key] = (
                out_weight.to(device=target_device, copy=False),
                weight.device,
            )

        del temp_weight
        del out_weight
        del weight
