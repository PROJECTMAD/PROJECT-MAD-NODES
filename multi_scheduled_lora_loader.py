from __future__ import annotations
import json
from pathlib import Path
from typing import Any, Dict, Optional
import comfy.hooks
import comfy.utils

from .modules.lora_inspector import LoRAInspector
from .modules.lora_ops import LoraOps

NODE_DIR_NAME = Path(__file__).parent.name


_LORA_CACHE = {}


class MultiScheduledLoraLoader:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "schedule_config": ("STRING", {"default": "[]", "hidden": True}),
            },
            "optional": {
                "model": ("MODEL",),
                "previous_hooks": ("HOOKS",),
                "schedule_string": ("STRING", {"forceInput": True, "multiline": True}),
            },
        }

    RETURN_TYPES = ("MODEL", "HOOKS", "STRING", "STRING")
    RETURN_NAMES = ("MODEL", "HOOKS", "schedule_string", "trigger_words")
    FUNCTION = "process"
    CATEGORY = "advanced/hooks/scheduling"

    @classmethod
    def inspect_lora_architecture(
        cls, file_path: Path | str, force_refresh: bool = False
    ) -> str:
        if isinstance(file_path, str):
            file_path = Path(file_path)

        path_str = str(file_path)
        if (
            not force_refresh
            and path_str in _LORA_CACHE
            and _LORA_CACHE[path_str].get("arch")
        ):
            return _LORA_CACHE[path_str]["arch"]

        arch = LoRAInspector.detect(file_path)
        if path_str not in _LORA_CACHE:
            _LORA_CACHE[path_str] = {}
        _LORA_CACHE[path_str]["arch"] = arch
        return arch

    @classmethod
    def analyze_lora_weights(
        cls, file_path: Path, force_refresh: bool = False, arch: str = "UNKNOWN"
    ) -> Optional[Dict[str, Any]]:
        path_str = str(file_path)
        if (
            not force_refresh
            and path_str in _LORA_CACHE
            and _LORA_CACHE[path_str].get("stats")
        ):
            return _LORA_CACHE[path_str]["stats"]

        stats = LoraOps.compute_stats(file_path, arch)

        if path_str not in _LORA_CACHE:
            _LORA_CACHE[path_str] = {}
        _LORA_CACHE[path_str]["stats"] = stats
        return stats

    @staticmethod
    def classify_sdxl_lineage_from_stats(stats: Dict[str, Any]) -> str:
        return LoRAInspector.classify_sdxl_lineage_from_stats(stats)

    def process(
        self,
        schedule_config: str,
        schedule_string: Optional[str] = None,
        previous_hooks: Optional[comfy.hooks.HookGroup] = None,
        model: Optional[object] = None,
    ):
        internal_loras = []
        if schedule_config and schedule_config != "[]":
            try:
                data = json.loads(schedule_config)

                if isinstance(data, dict):
                    active_profile = data.get("active_profile", "Default")
                    profiles = data.get("profiles", {})
                    profile_data = profiles.get(active_profile, {})

                    if isinstance(profile_data, dict) and "loras" in profile_data:
                        raw_list = profile_data["loras"]
                    elif isinstance(profile_data, list):
                        raw_list = profile_data
                    else:
                        raw_list = []
                else:
                    raw_list = data

                internal_loras = [x for x in raw_list if x.get("enabled", True)]
            except (json.JSONDecodeError, TypeError):
                pass

        has_internal = len(internal_loras) > 0
        has_str = schedule_string is not None and len(schedule_string.strip()) > 0
        has_hooks = previous_hooks is not None

        mode = "STANDARD"
        if not has_internal and has_str and not has_hooks:
            mode = "EXTERNAL_A"
        elif not has_internal and not has_str and has_hooks:
            mode = "EXTERNAL_B"
        elif not has_internal and has_str and has_hooks:
            mode = "BRIDGE"
        elif has_internal and has_str and has_hooks:
            mode = "OVERRIDE"

        active_loras, str_prepend, hooks_prepend, extract_trig = [], "", None, False

        if mode == "STANDARD":
            active_loras = internal_loras
            if has_hooks:
                hooks_prepend = previous_hooks
        elif mode == "OVERRIDE":
            active_loras = internal_loras
            str_prepend = schedule_string
            hooks_prepend = previous_hooks
            extract_trig = True
        elif mode == "EXTERNAL_A":
            active_loras = LoraOps.parse_external_string(schedule_string)
        elif mode == "EXTERNAL_B":
            hooks_prepend = previous_hooks
        elif mode == "BRIDGE":
            str_prepend = schedule_string
            hooks_prepend = previous_hooks
            extract_trig = True

        hooks, text_out, triggers_out = [], [], []

        if extract_trig and str_prepend:
            for item in LoraOps.parse_external_string(str_prepend):
                path = LoraOps.resolve_path(item.get("lora_name"))
                if path:
                    triggers_out.extend(LoraOps.extract_triggers(Path(path)))

        for item in active_loras:
            if not item.get("enabled", True):
                continue
            lora_name = item.get("lora_name")
            path = LoraOps.resolve_path(lora_name)
            if not path:
                continue

            triggers_out.extend(LoraOps.extract_triggers(Path(path)))
            lora = comfy.utils.load_torch_file(path, safe_load=True)
            if not lora:
                continue

            p = {
                k: float(item.get(k, 1.0))
                for k in [
                    "strength_model",
                    "strength_clip",
                ]
            }
            arch = item.get("arch", "UNKNOWN")
            vectors = item.get("vectors", {})

            if arch == "UNKNOWN":
                arch = self.inspect_lora_architecture(Path(path))

            preset = item.get("preset")
            if preset:
                stats = self.analyze_lora_weights(Path(path), arch=arch)
                if stats:
                    available_blocks = list(stats.get("energy_distribution", {}).keys())
                    meta = stats.get("block_metadata", {})
                    preset_vectors = LoraOps.get_vectors_for_preset(
                        arch, preset, available_blocks, meta
                    )

                    preset_vectors.update(vectors)
                    vectors = preset_vectors

            if vectors:
                lora = LoraOps.apply_lbw(
                    lora,
                    arch,
                    lora_name,
                    vectors,
                )

            if abs(p["strength_model"]) < 1e-6 and abs(p["strength_clip"]) < 1e-6:
                continue

            pts = item.get("points", [])
            if pts:
                pts.sort(key=lambda x: x["x"])
                ramp = 0.001
                if pts[0]["x"] > 0:
                    pts = (
                        [{"x": 0.0, "y": 0.0}]
                        + (
                            [{"x": max(0, pts[0]["x"] - ramp), "y": 0.0}]
                            if pts[0]["x"] > ramp
                            else []
                        )
                        + pts
                    )
                if pts[-1]["x"] < 1.0:
                    pts += (
                        [{"x": min(1.0, pts[-1]["x"] + ramp), "y": 0.0}]
                        if pts[-1]["x"] < 1.0 - ramp
                        else []
                    ) + [{"x": 1.0, "y": 0.0}]
                item["points"] = pts

            hook = comfy.hooks.create_hook_lora(
                lora, p["strength_model"], p["strength_clip"]
            )
            if pts:
                grp = comfy.hooks.HookKeyframeGroup()
                for pt in pts:
                    grp.add(
                        comfy.hooks.HookKeyframe(
                            strength=float(pt["y"]), start_percent=float(pt["x"])
                        )
                    )
                hook.set_keyframes_on_hooks(grp)
            hooks.append(hook)

            def fv(v):
                return f"{v:.4f}".rstrip("0").rstrip(".")

            extra_s = ""

            active_preset = item.get("preset")

            if active_preset and active_preset != "CUSTOM":
                extra_s = f":preset={active_preset}"
            elif vectors:
                extra_s = f":vectors={LoraOps.serialize_vectors(vectors)}"

            pts_s = (
                ":" + ";".join([f"{fv(pt['x'])},{fv(pt['y'])}" for pt in pts])
                if pts
                else ""
            )

            clean_name = Path(lora_name).stem
            str_model = fv(p["strength_model"])
            str_clip = fv(p["strength_clip"])

            text_out.append(
                f"<lora:{clean_name}:{str_model}:{str_clip}{pts_s}{extra_s}>"
            )

        if hooks_prepend:
            hooks.insert(0, hooks_prepend)
        final_group = (
            comfy.hooks.HookGroup.combine_all_hooks(hooks)
            if hooks
            else comfy.hooks.HookGroup()
        )

        if model:
            model_out = model.clone()
            model_out.register_all_hook_patches(
                final_group,
                comfy.hooks.create_target_dict(comfy.hooks.EnumWeightTarget.Model),
            )
        else:
            model_out = None

        final_string = "\n".join(filter(None, [str_prepend, "\n".join(text_out)]))
        return (
            model_out,
            final_group,
            final_string,
            ", ".join(sorted(list(set(triggers_out)))),
        )
