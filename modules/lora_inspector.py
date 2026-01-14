import json
import struct
import logging
from pathlib import Path
from typing import Optional, Dict, Any

LOG_PREFIX = "[MAD-NODES-INSPECTOR]"


class LoRAInspector:
    @classmethod
    def detect(cls, file_path: Path) -> str:
        if not file_path.exists():
            return "UNKNOWN"

        meta_arch = cls._check_metadata(file_path)
        if meta_arch:
            return meta_arch

        if file_path.suffix.lower() == ".safetensors":
            return cls._analyze_header(file_path)

        return "UNKNOWN"

    @classmethod
    def classify_sdxl_lineage_from_stats(cls, stats: Dict[str, Any]) -> str:
        if not stats:
            return "SDXL"

        out_r = stats.get("output_ratio", 0)
        mid_r = stats.get("mid_ratio", 0)
        in_r = stats.get("input_ratio", 0)
        sparse = stats.get("sparsity", 0)
        bal = stats.get("balance", 0)

        if out_r > 0.55 and sparse > 0.18:
            return "SDXL_PONY"
        if mid_r > 0.40:
            return "SDXL_NOOBAI"
        if (in_r + mid_r) > 0.55 and sparse < 0.15:
            return "SDXL_ILLUSTRIOUS"
        if abs(bal) < 0.2 and sparse < 0.12:
            return "SDXL_REALISM"

        return "SDXL"

    @classmethod
    def classify_lineage(cls, lora_dict: Dict[str, Any], model_name: str = "") -> str:
        """Heuristic classification based on tensor keys present in the dict."""
        keys = list(lora_dict.keys())
        name = (model_name or "").lower()

        if any(x in name for x in ["pony", "noob"]):
            return "SDXL_STYLE_COMPRESSED"
        if "illustrious" in name:
            return "SDXL_DISTRIBUTED"
        if any(x in name for x in ["juggernaut", "realvis"]):
            return "SDXL_REALISM_ACCUMULATIVE"

        def count(sub: str) -> int:
            return sum(1 for k in keys if sub in k)

        attn_hits = count("attn") + count("to_k")
        conv_hits = count("resblock")
        out_blocks = count("output_blocks") + count("up_blocks")

        if conv_hits == 0:
            return "SDXL_BASELINE"

        attn_ratio = attn_hits / conv_hits
        if attn_ratio > 2.2:
            return "SDXL_ATTENTION_HEAVY"
        if out_blocks > 20 and attn_ratio < 1.0:
            return "SDXL_STYLE_COMPRESSED"

        return "SDXL_BASELINE"

    @classmethod
    def _check_metadata(cls, path: Path) -> Optional[str]:
        candidates = [
            path.with_name(f"{path.stem}.metadata.json"),
            path.with_name(f"{path.stem}.json"),
        ]
        for json_path in candidates:
            if not json_path.exists():
                continue
            try:
                with open(json_path, "r", encoding="utf-8") as f:
                    data = json.load(f)

                civitai = data.get("civitai", {})

                tags = civitai.get("tags", [])
                if isinstance(tags, list):
                    for tag in tags:
                        res = cls._map_str(str(tag))
                        if res and res != "SDXL":
                            return res

                sources = [
                    data.get("baseModel"),
                    data.get("base_model"),
                    data.get("sd_version"),
                    data.get("modelspec.architecture"),
                    civitai.get("baseModel"),
                ]

                generic_match = None
                for val in sources:
                    if val:
                        res = cls._map_str(str(val))
                        if res:
                            if res != "SDXL":
                                return res
                            generic_match = res

                if generic_match:
                    return generic_match

            except (OSError, json.JSONDecodeError):
                continue
        return None

    @classmethod
    def _analyze_header(cls, path: Path) -> str:
        try:
            with open(path, "rb") as f:
                header_len_bytes = f.read(8)
                if len(header_len_bytes) != 8:
                    return "UNKNOWN"
                header_len = struct.unpack("<Q", header_len_bytes)[0]
                header_bytes = f.read(header_len)
                header = json.loads(header_bytes)

            meta = header.get("__metadata__", {})
            if "ss_base_model_version" in meta:
                res = cls._map_str(meta["ss_base_model_version"])
                if res:
                    return res

            keys = [k for k in header.keys() if k != "__metadata__"]

            def has(sub):
                return any(sub in k for k in keys)

            if has("double_blocks") or has("img_in"):
                return "FLUX.1"
            if has("joint_blocks"):
                return "SD3"
            if has("input_blocks"):
                return "SDXL"
            if has("down_blocks"):
                return "SD15"

            if has("layers.0") or has("model.layers.0"):
                if has("final_layer"):
                    return "AURA"
                if has("visual"):
                    return "LUMINA"
                return "QWEN"

            if has("h.0"):
                return "HYVID"

            for k, v in header.items():
                if k == "__metadata__":
                    continue
                if ("to_k" in k or "linear" in k) and "down" in k:
                    shape = v.get("shape", [])
                    if shape:
                        dim = shape[-1]
                        if dim == 320:
                            return "SD15"
                        if dim in [768, 1024, 1280]:
                            return "SD21"
                        if dim == 640:
                            return "SDXL"

        except (OSError, struct.error, json.JSONDecodeError) as e:
            logging.warning(f"{LOG_PREFIX} Header analysis failed for {path.name}: {e}")

        return "UNKNOWN"

    @staticmethod
    def _map_str(text: str) -> Optional[str]:
        t = text.lower()
        if "flux.1" in t:
            return "FLUX.1"
        if "flux.2" in t:
            return "FLUX.2"
        if "flux" in t:
            return "FLUX.1"
        if "zimageturbo" in t or "z_image_turbo" in t:
            return "ZIMAGETURBO"
        if "lumina" in t:
            return "LUMINA"
        if "hidream" in t:
            return "HIDREAM"
        if "chroma" in t:
            return "CHROMA"
        if "qwen" in t:
            return "QWEN"
        if "aura" in t:
            return "AURA"
        if "hyvid" in t or "hunyuan" in t:
            return "HYVID"
        if "pony" in t:
            return "SDXL_PONY"
        if "illustrious" in t:
            return "SDXL_ILLUSTRIOUS"
        if "noob" in t:
            return "SDXL_NOOBAI"
        if "realism" in t or "realvis" in t:
            return "SDXL_REALISM"
        if "xl" in t:
            return "SDXL"
        if "v1" in t or "1.5" in t or "sd15" in t:
            return "SD15"
        if "v2" in t or "2.1" in t:
            return "SD21"
        if "sd3" in t:
            return "SD3"
        return None
