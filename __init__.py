from pathlib import Path
import os
import mimetypes
import urllib.parse
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
VERSION = "1.2.5"


@server.PromptServer.instance.routes.post("/mad-nodes/vpg-hash-index")
async def vpg_hash_index(request):
    """
    Updates the Visual Prompt Gallery hash index for a given file.
    """
    try:
        data = await request.json()
    except Exception:
        data = {}

    filename = data.get("filename", "")
    subfolder = data.get("subfolder", "visual_gallery")
    pixel_hash = data.get("pixel_hash", "")

    if not filename:
        return web.json_response(
            {"status": "error", "message": "Missing filename"}, status=400
        )

    if subfolder != "visual_gallery":
        return web.json_response(
            {"status": "error", "message": "Invalid subfolder"}, status=400
        )

    if Path(filename).name != filename:
        return web.json_response(
            {"status": "error", "message": "Invalid filename"}, status=400
        )

    input_dir = folder_paths.get_input_directory()
    gallery_dir = str(Path(input_dir) / "visual_gallery")

    loop = asyncio.get_event_loop()
    vpg = VisualPromptGallery()
    img_hash, added = await loop.run_in_executor(
        executor,
        vpg.update_hash_index_for_file,
        gallery_dir,
        filename,
        pixel_hash or None,
    )

    if not img_hash:
        return web.json_response({"status": "skipped"})

    return web.json_response({"status": "ok", "hash": img_hash, "added": added})


@server.PromptServer.instance.routes.post("/mad-nodes/vpg-hash-lookup")
async def vpg_hash_lookup(request):
    """
    Returns hashes for provided gallery filenames.
    """
    try:
        data = await request.json()
    except Exception:
        data = {}

    filenames = data.get("filenames", [])
    subfolder = data.get("subfolder", "visual_gallery")

    if subfolder != "visual_gallery":
        return web.json_response(
            {"status": "error", "message": "Invalid subfolder"}, status=400
        )

    if not isinstance(filenames, list):
        return web.json_response(
            {"status": "error", "message": "Invalid filenames"}, status=400
        )

    safe_names = []
    for name in filenames[:500]:
        if not isinstance(name, str) or not name:
            continue
        if Path(name).name != name:
            continue
        safe_names.append(name)

    input_dir = folder_paths.get_input_directory()
    gallery_dir = str(Path(input_dir) / "visual_gallery")

    loop = asyncio.get_event_loop()
    vpg = VisualPromptGallery()
    hashes = await loop.run_in_executor(
        executor,
        vpg.get_hashes_for_files,
        gallery_dir,
        safe_names,
    )

    return web.json_response({"status": "ok", "hashes": hashes})


@server.PromptServer.instance.routes.post("/mad-nodes/vpg-hash-lookup-file-hash")
async def vpg_hash_lookup_file_hash(request):
    """
    Returns hashes for provided file hashes (dedupe shortcut).
    """
    try:
        data = await request.json()
    except Exception:
        data = {}

    hashes = data.get("hashes", [])
    if not isinstance(hashes, list):
        return web.json_response(
            {"status": "error", "message": "Invalid hashes"}, status=400
        )

    safe_hashes = []
    for value in hashes[:500]:
        if not isinstance(value, str) or not value:
            continue
        safe_hashes.append(value)

    if not safe_hashes:
        return web.json_response({"status": "ok", "hashes": {}})

    input_dir = folder_paths.get_input_directory()
    gallery_dir = str(Path(input_dir) / "visual_gallery")

    loop = asyncio.get_event_loop()
    vpg = VisualPromptGallery()
    found = await loop.run_in_executor(
        executor,
        vpg.get_hashes_for_file_hashes,
        gallery_dir,
        safe_hashes,
    )

    return web.json_response({"status": "ok", "hashes": found})


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


def _vpg_resolve_local_path(raw_path: str):
    if not isinstance(raw_path, str):
        return None
    value = raw_path.strip()
    if not value:
        return None
    if value.lower().startswith("file://"):
        try:
            parsed = urllib.parse.urlparse(value)
            value = urllib.parse.unquote(parsed.path or "")
        except Exception:
            value = value[7:]
        if (
            value.startswith("/")
            and len(value) >= 3
            and value[1].isalpha()
            and value[2] == ":"
        ):
            value = value[1:]
    value = os.path.expandvars(value)
    value = os.path.expanduser(value)
    path = Path(value)
    if not path.is_absolute():
        try:
            path = (Path.cwd() / path).resolve()
        except Exception:
            pass
    return path


@server.PromptServer.instance.routes.post("/mad-nodes/vpg-load-file")
async def vpg_load_file(request):
    """
    Streams a local image file for the upload dialog (URLs / file paths).
    """
    try:
        data = await request.json()
    except Exception:
        data = {}

    raw_path = data.get("path", "")
    path = _vpg_resolve_local_path(raw_path)
    if not path:
        return web.json_response(
            {"status": "error", "message": "Missing path"}, status=400
        )

    if not path.is_file():
        return web.json_response(
            {"status": "error", "message": "File not found"}, status=404
        )

    if not VisualPromptGallery._is_image_file(path.name):
        return web.json_response(
            {"status": "error", "message": "Not an image file"}, status=400
        )

    mime, _ = mimetypes.guess_type(path.name)
    headers = {"X-File-Name": path.name, "Cache-Control": "no-store"}
    if mime:
        headers["Content-Type"] = mime
    return web.FileResponse(path, headers=headers)


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

    ckpt_path_str = LoraOps.resolve_model_path(ckpt_name)
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
