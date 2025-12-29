# Changelog

All major and minor version changes will be documented in this file.

## [1.1.0] - 2025-12-29
### Added
- **Multi Scheduled LoRA Loader:**
  - Added **Undo/Redo** system with visual history stack.
  - Added **Enable/Disable** toggles for individual LoRAs (affects generation and stats).
  - Added new **Resampling Modes**: Linear, Ease In/Out, Cubic, and Step.
- **Visual Prompt Gallery:**
  - Added **Context Menu** (Right-Click) support.
  - Added **Fullscreen Viewer** for gallery images.
  - Added ability to **Remove Images** directly from the gallery.

### Changed
- **Multi Scheduled LoRA Loader:**
  - Complete UI overhaul with injected CSS for better dark mode integration.
  - Refactored internal hook processing to support new ComfyUI Beta features.
  - Improved logic for switching between internal editor configuration and external schedule strings.
- **Visual Prompt Gallery:**
  - Improved image scaling logic for better visual quality.
  - Image tooltip now shows "Click to load Metadata" when appropriate.

### Fixed
- **Multi Scheduled LoRA Loader:**
  - Fixed issue where LoRA files located in subdirectories were not being resolved correctly.

## [1.0.0] - 2024-12-16
### Added
- Initial release of Multi Scheduled LoRA Loader.
- Initial release of Visual Prompt Gallery.