import torch
import numpy as np
from PIL import Image, ImageOps, ImageFile
import folder_paths
import json
import os
import sqlite3
import logging
import io
from pathlib import Path
import hashlib

ImageFile.LOAD_TRUNCATED_IMAGES = True


NODE_DIR_NAME = Path(__file__).parent.name
logger = logging.getLogger(NODE_DIR_NAME)


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

    @staticmethod
    def _hash_image_pixels(path: str) -> str:
        try:
            with Image.open(path) as img:
                img = ImageOps.exif_transpose(img)
                if img.mode != "RGBA":
                    img = img.convert("RGBA")
                arr = np.array(img, dtype=np.uint8)
                if arr.ndim != 3 or arr.shape[2] != 4:
                    return None
                rgb = arr[:, :, :3].astype(np.float32)
                alpha = (arr[:, :, 3:4].astype(np.float32)) / 255.0
                rgb = np.floor(rgb * alpha + 0.5).astype(np.uint8)
                h = hashlib.sha256()
                h.update(rgb.tobytes())
                return h.hexdigest()
        except Exception:
            return None

    @staticmethod
    def _stat_signature(path: str):
        st = os.stat(path)
        return st.st_size, st.st_mtime_ns

    @staticmethod
    def _chunked(values, size: int):
        for i in range(0, len(values), size):
            yield values[i : i + size]

    def _open_hash_db(self, gallery_dir: str):
        db_path = os.path.join(gallery_dir, ".vpg_hash_index.sqlite")
        conn = sqlite3.connect(db_path, timeout=2.5)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA busy_timeout=2500")
        conn.execute("PRAGMA temp_store=MEMORY")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS file_hashes (
                name_lower TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                hash TEXT NOT NULL,
                pixel_hash TEXT,
                size INTEGER NOT NULL,
                mtime_ns INTEGER NOT NULL
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_file_hashes_hash ON file_hashes(hash)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_file_hashes_pixel_hash ON file_hashes(pixel_hash)")
        cols = {row["name"] for row in conn.execute("PRAGMA table_info(file_hashes)")}
        if "pixel_hash" not in cols:
            conn.execute("ALTER TABLE file_hashes ADD COLUMN pixel_hash TEXT")
        return conn

    def _fetch_cached_rows(self, conn, name_lowers):
        if not name_lowers:
            return {}
        cached = {}
        for chunk in self._chunked(name_lowers, 200):
            placeholders = ",".join("?" for _ in chunk)
            query = f"SELECT name_lower, hash, pixel_hash, size, mtime_ns FROM file_hashes WHERE name_lower IN ({placeholders})"
            for row in conn.execute(query, chunk):
                cached[row["name_lower"]] = row
        return cached

    def update_hash_index_for_file(self, gallery_dir: str, filename: str, pixel_hash: str = None) -> tuple:
        if not filename or not self._is_image_file(filename):
            return None, False
        file_path = os.path.join(gallery_dir, filename)
        if not os.path.isfile(file_path):
            return None, False
        try:
            stat_sig = self._stat_signature(file_path)
        except Exception:
            return None, False
        lower = filename.lower()
        cached_row = None
        try:
            with self._open_hash_db(gallery_dir) as conn:
                cached_row = conn.execute(
                    "SELECT hash, pixel_hash, size, mtime_ns FROM file_hashes WHERE name_lower = ?",
                    (lower,),
                ).fetchone()
        except Exception:
            cached_row = None

        if (
            cached_row
            and cached_row["size"] == stat_sig[0]
            and cached_row["mtime_ns"] == stat_sig[1]
            and cached_row["hash"]
        ):
            if pixel_hash and cached_row["pixel_hash"] != pixel_hash:
                try:
                    with self._open_hash_db(gallery_dir) as conn:
                        conn.execute("BEGIN IMMEDIATE")
                        conn.execute(
                            "UPDATE file_hashes SET pixel_hash = ? WHERE name_lower = ?",
                            (pixel_hash, lower),
                        )
                        conn.commit()
                except Exception:
                    pass
                return cached_row["hash"], True
            return cached_row["hash"], False

        try:
            img_hash = self._hash_file_streamed(file_path)
        except Exception:
            return None, False
        if not pixel_hash:
            pixel_hash = self._hash_image_pixels(file_path)
        added = cached_row is None or cached_row["hash"] != img_hash
        try:
            with self._open_hash_db(gallery_dir) as conn:
                conn.execute("BEGIN IMMEDIATE")
                conn.execute(
                    """
                    INSERT INTO file_hashes (name_lower, name, hash, pixel_hash, size, mtime_ns)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(name_lower) DO UPDATE SET
                        name = excluded.name,
                        hash = excluded.hash,
                        pixel_hash = excluded.pixel_hash,
                        size = excluded.size,
                        mtime_ns = excluded.mtime_ns
                    """,
                    (lower, filename, img_hash, pixel_hash, stat_sig[0], stat_sig[1]),
                )
                conn.commit()
        except Exception:
            return img_hash, False
        return img_hash, added

    def get_hashes_for_files(self, gallery_dir: str, filenames) -> dict:
        if not filenames:
            return {}
        results = {}
        candidates = []
        for name in filenames:
            if not isinstance(name, str) or not name:
                continue
            lower = name.lower()
            if not self._is_image_file(lower):
                continue
            file_path = os.path.join(gallery_dir, name)
            if not os.path.isfile(file_path):
                continue
            try:
                stat_sig = self._stat_signature(file_path)
            except Exception:
                continue
            candidates.append((name, lower, file_path, stat_sig))

        if not candidates:
            return results

        cached_rows = {}
        try:
            with self._open_hash_db(gallery_dir) as conn:
                cached_rows = self._fetch_cached_rows(conn, [c[1] for c in candidates])
        except Exception:
            cached_rows = {}

        to_hash = []
        to_pixel = []
        for name, lower, file_path, stat_sig in candidates:
            row = cached_rows.get(lower)
            if (
                row
                and row["size"] == stat_sig[0]
                and row["mtime_ns"] == stat_sig[1]
                and row["hash"]
            ):
                results[name] = {"file_hash": row["hash"], "pixel_hash": row["pixel_hash"]}
                if not row["pixel_hash"]:
                    to_pixel.append((name, lower, file_path, stat_sig, row["hash"]))
            else:
                to_hash.append((name, lower, file_path, stat_sig))

        updates = []
        for name, lower, file_path, stat_sig in to_hash:
            try:
                img_hash = self._hash_file_streamed(file_path)
                pixel_hash = self._hash_image_pixels(file_path)
                results[name] = {"file_hash": img_hash, "pixel_hash": pixel_hash}
                updates.append((lower, name, img_hash, pixel_hash, stat_sig[0], stat_sig[1]))
            except Exception:
                continue

        pixel_updates = []
        for name, lower, file_path, stat_sig, img_hash in to_pixel:
            try:
                pixel_hash = self._hash_image_pixels(file_path)
                if not pixel_hash:
                    continue
                results[name] = {"file_hash": img_hash, "pixel_hash": pixel_hash}
                pixel_updates.append((pixel_hash, lower))
            except Exception:
                continue

        if updates:
            try:
                with self._open_hash_db(gallery_dir) as conn:
                    for chunk in self._chunked(updates, 200):
                        conn.execute("BEGIN IMMEDIATE")
                        conn.executemany(
                            """
                            INSERT INTO file_hashes (name_lower, name, hash, pixel_hash, size, mtime_ns)
                            VALUES (?, ?, ?, ?, ?, ?)
                            ON CONFLICT(name_lower) DO UPDATE SET
                                name = excluded.name,
                                hash = excluded.hash,
                                pixel_hash = excluded.pixel_hash,
                                size = excluded.size,
                                mtime_ns = excluded.mtime_ns
                            """,
                            chunk,
                        )
                        conn.commit()
            except Exception:
                pass
        if pixel_updates:
            try:
                with self._open_hash_db(gallery_dir) as conn:
                    for chunk in self._chunked(pixel_updates, 200):
                        conn.execute("BEGIN IMMEDIATE")
                        conn.executemany(
                            "UPDATE file_hashes SET pixel_hash = ? WHERE name_lower = ?",
                            chunk,
                        )
                        conn.commit()
            except Exception:
                pass
        return results

    def get_hashes_for_file_hashes(self, gallery_dir: str, file_hashes) -> dict:
        if not file_hashes:
            return {}
        safe_hashes = []
        for value in file_hashes:
            if not isinstance(value, str) or not value:
                continue
            safe_hashes.append(value)
        if not safe_hashes:
            return {}
        results = {}
        try:
            with self._open_hash_db(gallery_dir) as conn:
                for chunk in self._chunked(safe_hashes, 200):
                    placeholders = ",".join("?" for _ in chunk)
                    query = f"SELECT hash, pixel_hash, name FROM file_hashes WHERE hash IN ({placeholders})"
                    for row in conn.execute(query, chunk):
                        img_hash = row["hash"]
                        if not img_hash:
                            continue
                        entry = results.get(img_hash)
                        if not entry:
                            entry = {"pixel_hash": row["pixel_hash"], "names": []}
                            results[img_hash] = entry
                        if row["pixel_hash"] and not entry.get("pixel_hash"):
                            entry["pixel_hash"] = row["pixel_hash"]
                        name = row["name"]
                        if name and name not in entry["names"]:
                            entry["names"].append(name)
        except Exception:
            return results
        return results

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
