import torch
import numpy as np
from PIL import Image, ImageOps, ImageFile
import folder_paths
import json
import os
import logging
import io

ImageFile.LOAD_TRUNCATED_IMAGES = True

logger = logging.getLogger("VisualPromptGallery")


class VisualPromptGallery:
    def __init__(self):
        pass

    """
    ============================================================================
    NODE DEFINITION
    ============================================================================
    Defines the ComfyUI node interface for the Visual Prompt Gallery.
    It accepts hidden string inputs for prompt data and image lists, which are
    managed entirely by the custom JavaScript UI.
    """

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

    """
    ============================================================================
    MAIN EXECUTION LOGIC
    ============================================================================
    Processes the selected image from the gallery.
    1. Decodes the JSON string identifying the current image.
    2. Locates the file in the input directory.
    3. Loads and converts the image to a torch tensor.
    4. Returns the image tensor along with the stored prompts.
    """

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
                        logger.error(
                            f"VisualPromptGallery: Failed to decode image '{filename}'. Error: {e}"
                        )
                        img_out = None
                else:
                    logger.warning(
                        f"VisualPromptGallery: Image file not found at {image_path}"
                    )

            except Exception as e:
                logger.error(f"VisualPromptGallery: General error loading image: {e}")

        if img_out is None:
            img_out = torch.zeros((1, 64, 64, 3), dtype=torch.float32)

        return (
            img_out,
            positive_prompt,
            negative_prompt,
        )
