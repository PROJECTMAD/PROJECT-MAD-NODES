import torch
import numpy as np
from PIL import Image, ImageOps, ImageFile
import folder_paths
import json
import os
import logging
import io
from pathlib import Path
import hashlib
import threading

ImageFile.LOAD_TRUNCATED_IMAGES = True


NODE_DIR_NAME = Path(__file__).parent.name
logger = logging.getLogger(NODE_DIR_NAME)
_HASH_INDEX_LOCK = threading.Lock()


class VisualPromptGallery:
    def __init__(self):
        pass

    @staticmethod
    def _is_image_file(name: str) -> bool:
        if not name:
            return False
        lower = name.lower()
        return lower.endswith((".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"))

    @staticmethod
    def _hash_file_streamed(path: str) -> str:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                h.update(chunk)
        return h.hexdigest()

    def _load_hash_index(self, gallery_dir: str) -> tuple:
        index_path = os.path.join(gallery_dir, ".vpg_hash_index.json")
        index = {"hashes": {}, "files": {}, "hash_type": "sha256-file"}
        if os.path.exists(index_path):
            try:
                with open(index_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    index = data
            except Exception:
                index = {"hashes": {}, "files": {}, "hash_type": "sha256-file"}
        if not isinstance(index, dict):
            index = {"hashes": {}, "files": {}, "hash_type": "sha256-file"}
        if index.get("hash_type") != "sha256-file":
            index = {"hashes": {}, "files": {}, "hash_type": "sha256-file"}
        if not isinstance(index.get("hashes"), dict):
            index["hashes"] = {}
        if not isinstance(index.get("files"), dict):
            index["files"] = {}
        if not isinstance(index.get("hash_type"), str):
            index["hash_type"] = "sha256-file"
        return index_path, index

    def _save_hash_index(self, index_path: str, index: dict) -> None:
        try:
            tmp_path = index_path + ".tmp"
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(index, f, ensure_ascii=True, separators=(",", ":"))
            os.replace(tmp_path, index_path)
        except Exception:
            pass

    @staticmethod
    def _stat_signature(path: str):
        st = os.stat(path)
        return st.st_size, st.st_mtime_ns

    @staticmethod
    def _get_cached_hash(index: dict, filename: str, stat_sig):
        files = index.get("files", {})
        if not isinstance(files, dict):
            return None
        entry = files.get(filename.lower())
        if not isinstance(entry, dict):
            return None
        if entry.get("size") == stat_sig[0] and entry.get("mtime_ns") == stat_sig[1]:
            cached = entry.get("hash")
            if isinstance(cached, str) and cached:
                return cached
        return None

    def update_hash_index_for_file(self, gallery_dir: str, filename: str) -> tuple:
        if not filename or not self._is_image_file(filename):
            return None, False
        file_path = os.path.join(gallery_dir, filename)
        if not os.path.isfile(file_path):
            return None, False
        try:
            stat_sig = self._stat_signature(file_path)
        except Exception:
            return None, False

        with _HASH_INDEX_LOCK:
            index_path, index = self._load_hash_index(gallery_dir)
            cached = self._get_cached_hash(index, filename, stat_sig)
            if cached:
                bucket = index.setdefault("hashes", {}).setdefault(cached, [])
                if filename not in bucket:
                    bucket.append(filename)
                    index.setdefault("files", {})[filename.lower()] = {
                        "hash": cached,
                        "size": stat_sig[0],
                        "mtime_ns": stat_sig[1],
                        "name": filename,
                    }
                    self._save_hash_index(index_path, index)
                    return cached, True
                return cached, False

        try:
            img_hash = self._hash_file_streamed(file_path)
        except Exception:
            return None, False

        with _HASH_INDEX_LOCK:
            index_path, index = self._load_hash_index(gallery_dir)
            cached = self._get_cached_hash(index, filename, stat_sig)
            if cached:
                return cached, False

            bucket = index.setdefault("hashes", {}).setdefault(img_hash, [])
            added = False
            dirty = False
            if filename not in bucket:
                bucket.append(filename)
                added = True
                dirty = True
            files = index.setdefault("files", {})
            entry = files.get(filename.lower())
            new_entry = {
                "hash": img_hash,
                "size": stat_sig[0],
                "mtime_ns": stat_sig[1],
                "name": filename,
            }
            if entry != new_entry:
                files[filename.lower()] = new_entry
                dirty = True
            if dirty:
                self._save_hash_index(index_path, index)
        return img_hash, added

    def get_hashes_for_files(self, gallery_dir: str, filenames) -> dict:
        if not filenames:
            return {}
        results = {}
        to_hash = []
        to_hash_stats = {}

        with _HASH_INDEX_LOCK:
            index_path, index = self._load_hash_index(gallery_dir)
            name_map = self._build_name_hash_map(index)
            files = index.get("files", {}) if isinstance(index.get("files"), dict) else {}

            for name in filenames:
                if not isinstance(name, str) or not name:
                    continue
                lower = name.lower()
                if not self._is_image_file(lower):
                    continue
                if lower in files:
                    file_path = os.path.join(gallery_dir, name)
                    if not os.path.isfile(file_path):
                        continue
                    try:
                        stat_sig = self._stat_signature(file_path)
                    except Exception:
                        continue

                    cached = self._get_cached_hash(index, name, stat_sig)
                    if cached:
                        results[name] = cached
                        continue

                    to_hash.append((name, file_path))
                    to_hash_stats[lower] = stat_sig
                    continue

                if lower in name_map:
                    results[name] = name_map[lower]
                    continue

                file_path = os.path.join(gallery_dir, name)
                if not os.path.isfile(file_path):
                    continue
                try:
                    stat_sig = self._stat_signature(file_path)
                except Exception:
                    continue
                to_hash.append((name, file_path))
                to_hash_stats[lower] = stat_sig

        computed = []
        for name, file_path in to_hash:
            try:
                img_hash = self._hash_file_streamed(file_path)
                results[name] = img_hash
                computed.append((name, img_hash))
            except Exception:
                continue

        if computed:
            with _HASH_INDEX_LOCK:
                index_path, index = self._load_hash_index(gallery_dir)
                dirty = False
                for name, img_hash in computed:
                    lower = name.lower()
                    stat_sig = to_hash_stats.get(lower)
                    if not stat_sig:
                        continue
                    bucket = index.setdefault("hashes", {}).setdefault(img_hash, [])
                    if name not in bucket:
                        bucket.append(name)
                        dirty = True
                    files = index.setdefault("files", {})
                    new_entry = {
                        "hash": img_hash,
                        "size": stat_sig[0],
                        "mtime_ns": stat_sig[1],
                        "name": name,
                    }
                    if files.get(lower) != new_entry:
                        files[lower] = new_entry
                        dirty = True
                if dirty:
                    self._save_hash_index(index_path, index)
        return results

    def _build_name_hash_map(self, index: dict) -> dict:
        name_map = {}
        files = index.get("files", {})
        if isinstance(files, dict):
            for lower, entry in files.items():
                if isinstance(lower, str) and isinstance(entry, dict):
                    img_hash = entry.get("hash")
                    if isinstance(img_hash, str) and img_hash:
                        name_map[lower] = img_hash
        hashes = index.get("hashes", {})
        if isinstance(hashes, dict):
            for img_hash, names in hashes.items():
                if not isinstance(names, list):
                    continue
                for name in names:
                    if isinstance(name, str) and name:
                        name_map.setdefault(name.lower(), img_hash)
        return name_map

    def _sync_hash_index_for_gallery(self, gallery_dir: str, index_path: str, index: dict, gallery_names) -> tuple:
        name_map = self._build_name_hash_map(index)
        dirty = False
        if not gallery_names:
            return index, name_map

        for name in gallery_names:
            if not name:
                continue
            lower = name.lower()
            if lower in name_map:
                continue
            if not self._is_image_file(lower):
                continue
            file_path = os.path.join(gallery_dir, name)
            if not os.path.isfile(file_path):
                continue
            try:
                stat_sig = self._stat_signature(file_path)
                img_hash = self._hash_file_streamed(file_path)
                bucket = index.setdefault("hashes", {}).setdefault(img_hash, [])
                if name not in bucket:
                    bucket.append(name)
                name_map[lower] = img_hash
                files = index.setdefault("files", {})
                files[lower] = {
                    "hash": img_hash,
                    "size": stat_sig[0],
                    "mtime_ns": stat_sig[1],
                    "name": name,
                }
                dirty = True
            except Exception:
                continue

        if dirty:
            self._save_hash_index(index_path, index)
        return index, name_map

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "positive_prompt": ("STRING", {"default": "", "multiline": True}),
                "negative_prompt": ("STRING", {"default": "", "multiline": True}),
                "image_list": ("STRING", {"default": "[]", "multiline": False}),
                "current_image": ("STRING", {"default": "", "multiline": False}),
                "gallery_settings": ("STRING", {"default": "", "multiline": False}),
            },
        }

    RETURN_TYPES = (
        "IMAGE",
        "STRING",
        "STRING",
    )
    RETURN_NAMES = (
        "IMAGE",
        "positive_prompt",
        "negative_prompt",
    )
    FUNCTION = "output_data"
    CATEGORY = "utils"

    def output_data(
        self,
        positive_prompt,
        negative_prompt,
        image_list,
        current_image,
        gallery_settings,
    ):
        img_out = None

        if current_image and current_image.strip() != "":
            try:
                data = json.loads(current_image)
                filename = data.get("name")
                subfolder = data.get("subfolder", "")

                input_dir = folder_paths.get_input_directory()

                image_path = os.path.join(input_dir, subfolder, filename)

                if not os.path.exists(image_path):
                    image_path = os.path.join(input_dir, filename)

                if os.path.exists(image_path):
                    try:
                        with open(image_path, "rb") as f:
                            file_bytes = f.read()

                        if len(file_bytes) == 0:
                            raise ValueError("File is empty (0 bytes)")

                        buff = io.BytesIO(file_bytes)
                        i = Image.open(buff)

                        i.load()

                        i = ImageOps.exif_transpose(i)

                        if i.mode == "I":
                            i = i.point(lambda i: i * (1 / 255))

                        image = i.convert("RGB")
                        image = np.array(image).astype(np.float32) / 255.0
                        img_out = torch.from_numpy(image)[None,]

                    except Exception as e:
                        logger.error(f"Failed to decode image '{filename}'. Error: {e}")
                        img_out = None
                else:
                    logger.warning(f"Image file not found at {image_path}")

            except Exception as e:
                logger.error(f"General error loading image: {e}")

        if img_out is None:
            img_out = torch.zeros((1, 64, 64, 3), dtype=torch.float32)

        return (
            img_out,
            positive_prompt,
            negative_prompt,
        )
