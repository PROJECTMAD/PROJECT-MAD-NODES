from .multi_scheduled_lora_loader import MultiScheduledLoraLoader
from .visual_prompt_gallery import VisualPromptGallery


NODE_CLASS_MAPPINGS = {
    "MultiScheduledLoraLoader": MultiScheduledLoraLoader,
    "VisualPromptGallery": VisualPromptGallery,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "MultiScheduledLoraLoader": "Multi Scheduled Lora Loader",
    "VisualPromptGallery": "Visual Prompt Gallery (EXIF)",
}

PACKAGE_NAME = "PROJECT-MAD-NODES"
WEB_DIRECTORY = "./js"
VERSION = "1.1.0"
