from pathlib import Path
from aiohttp import web
import asyncio
from concurrent.futures import ThreadPoolExecutor
import folder_paths
import server

from .multi_scheduled_lora_loader import MultiScheduledLoraLoader
from .visual_prompt_gallery import VisualPromptGallery
from .modules.lora_ops import LoraOps

NODE_DIR_NAME = Path(__file__).parent.name
LOG_PREFIX = f"[{NODE_DIR_NAME}]"

NODE_CLASS_MAPPINGS = {
    "MultiScheduledLoraLoader": MultiScheduledLoraLoader,
    "VisualPromptGallery": VisualPromptGallery,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "MultiScheduledLoraLoader": "Multi Scheduled Lora Loader",
    "VisualPromptGallery": "Visual Prompt Gallery (EXIF)",
}


executor = ThreadPoolExecutor(max_workers=2)

PACKAGE_NAME = "PROJECT-MAD-NODES"
WEB_DIRECTORY = "./js"
VERSION = "1.2.1"


@server.PromptServer.instance.routes.get("/mad-nodes/lora-preview")
async def get_lora_preview(request):
    """
    Serves preview images/videos for LoRAs.
    """
    lora_name = request.rel_url.query.get("lora_name", "")
    if not lora_name:
        return web.Response(status=404)

    path_str = folder_paths.get_full_path("loras", lora_name)
    if not path_str:
        return web.Response(status=404)

    path = Path(path_str)

    extensions = [
        ".preview.png",
        ".preview.jpg",
        ".preview.webp",
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".mp4",
        ".webm",
    ]

    for ext in extensions:
        candidate = path.parent / (path.stem + ext)
        if candidate.exists():
            return web.FileResponse(candidate)

    return web.Response(status=404)


@server.PromptServer.instance.routes.get("/mad-nodes/config")
async def get_ui_config(request):
    """
    Serves the UI configuration (Presets, Arch Mappings) from Python to JS.
    This ensures logic alignment.
    """
    return web.json_response(LoraOps.get_ui_config())


@server.PromptServer.instance.routes.get("/mad-nodes/inspect-lora")
async def inspect_lora(request):
    """
    API endpoint for the UI to inspect LoRA architecture and weight stats.
    """

    if request.rel_url.query.get("clear_cache_all", "false").lower() == "true":
        from .multi_scheduled_lora_loader import _LORA_CACHE

        _LORA_CACHE.clear()
        return web.json_response(
            {"status": "cleared", "message": "Global LoRA cache cleared."}
        )

    lora_name = request.rel_url.query.get("lora_name", "")

    refresh_param = request.rel_url.query.get("refresh", "false").lower()
    force_refresh = refresh_param in ["true", "1", "yes"]

    if not lora_name:
        return web.json_response({"arch": "UNKNOWN"})

    try:
        path_str = LoraOps.resolve_path(lora_name)
        if not path_str:
            return web.json_response({"arch": "UNKNOWN", "error": "File not found"})

        path = Path(path_str)

        arch = MultiScheduledLoraLoader.inspect_lora_architecture(
            path, force_refresh=force_refresh
        )

        loop = asyncio.get_event_loop()
        stats = await loop.run_in_executor(
            executor,
            MultiScheduledLoraLoader.analyze_lora_weights,
            path,
            force_refresh,
            arch,
        )

        if arch == "SDXL" and stats:
            sub_arch = MultiScheduledLoraLoader.classify_sdxl_lineage_from_stats(stats)
            if sub_arch != "SDXL":
                arch = sub_arch

        response = {"arch": arch}
        if stats:
            response["stats"] = stats

        return web.json_response(response)

    except Exception as e:
        print(f"{LOG_PREFIX} Inspection API error: {e}")
        return web.json_response({"arch": "UNKNOWN", "error": str(e)})


@server.PromptServer.instance.routes.get("/mad-nodes/check-compatibility")
async def check_compatibility(request):
    """
    Checks if a Checkpoint and a LoRA share the same base architecture.
    """
    ckpt_name = request.rel_url.query.get("ckpt_name", "")
    lora_name = request.rel_url.query.get("lora_name", "")

    response = {
        "status": "ok",
        "ckpt_arch": "UNKNOWN",
        "lora_arch": "UNKNOWN",
        "compatible": True,
        "message": "",
    }

    ckpt_path_str = folder_paths.get_full_path("checkpoints", ckpt_name)
    lora_path_str = LoraOps.resolve_path(lora_name)

    if not ckpt_path_str:
        return web.json_response({"status": "error", "message": "Checkpoint not found"})

    response["ckpt_arch"] = MultiScheduledLoraLoader.inspect_lora_architecture(
        ckpt_path_str
    )

    if lora_path_str:
        response["lora_arch"] = MultiScheduledLoraLoader.inspect_lora_architecture(
            lora_path_str
        )

    c_arch = response["ckpt_arch"]
    l_arch = response["lora_arch"]

    if c_arch == "UNKNOWN" or l_arch == "UNKNOWN":
        response["compatible"] = False
        if c_arch == "UNKNOWN" and l_arch == "UNKNOWN":
            response["message"] = (
                "Could not determine model or LoRA architecture. Compatibility cannot be verified."
            )
        elif c_arch == "UNKNOWN":
            response["message"] = (
                "Could not determine model architecture. Compatibility cannot be verified."
            )
        else:
            response["message"] = (
                "Could not determine LoRA architecture. Compatibility cannot be verified."
            )
        return web.json_response(response)

    def get_base(a):
        if "SDXL" in a:
            return "SDXL"
        if "FLUX" in a:
            return "FLUX"
        if "SD1" in a:
            return "SD15"
        if "SD2" in a:
            return "SD21"
        return a

    if get_base(c_arch) != get_base(l_arch):
        response["compatible"] = False
        response["message"] = (
            f"Architecture Mismatch: Model is {c_arch}, but LoRA is {l_arch}."
        )

    return web.json_response(response)
