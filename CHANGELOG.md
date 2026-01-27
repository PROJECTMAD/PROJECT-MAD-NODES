# Changelog

All major and minor version changes will be documented in this file.

## [1.2.2] - 2026-01-27
### Fixed
- **Multi Scheduled LoRA Loader:**
  - **Zero-Strength Optimization:** Implemented a monkey-patch for `patch_hook_weight_to_device` to explicitly skip LoRA calculations when strength is 0.0. This prevents floating-point inaccuracies from slightly altering generation when a LoRA is supposed to be completely inactive at specific keyframes.

## [1.2.1] - 2026-01-22
### Changed
- **Visual Prompt Gallery:**
  - Made tooltips more readable by adding custom CSS.

### Fixed
- **Visual Prompt Gallery:**
  - Fixed issue where metadata extraction failed for some messy JSON strings.

## [1.2.0] - 2026-01-14
### Added
- **Multi Scheduled LoRA Loader:**
  - **Block Weight System (LBW):**
    - Integrated **Block Weight Editor** with sliders for individual blocks.
    - Added **Semantic Presets** (Linear, Style Focused, Balanced, Heavy Style, Realism) to automatically adjust weights based on block function.
    - Added **Group Controls** to sync related blocks (e.g., Input, Middle, Output).
  - **LoRA Analysis & Inspection:**
    - Added **Architecture Detection** supporting SDXL, FLUX, SD1.5, SD3, Pony, Illustrious, and more.
    - Added **Weight Distribution Heatmaps** to visualize where a LoRA focuses its weight distribution.
    - Added **Stability & Influence Metrics** (Sparsity/Concentration and Bias).
  - **Profile Management:**
    - Added ability to **Create, Duplicate, Rename, and Delete** profiles within the node.
    - Node title now dynamically updates to show the active profile name.
  - **Preview System:**
    - Added **Media Preview Pane** that displays images/videos when hovering over a LoRA (requires sidecar files/LoRA Manager).
  - **Compatibility Checking:**
    - Added automatic checks between the connected Checkpoint and selected LoRAs to warn about architecture mismatches.
  - **New Outputs:**
    - Added `trigger_words` output string (extracted from LoRA metadata/LoRA Manager).
  - **Backend Optimizations:**
    - Implemented **SafeTensors Streaming** to analyze LoRA headers and weights without loading the full file into RAM.
    - Added **IndexedDB Caching** (browser) and Python-side caching for instant re-opening of the editor.

### Changed
- **Multi Scheduled LoRA Loader:**
  - Refactored `schedule_config` to support the new Profile data structure while maintaining backward compatibility with legacy lists.
  - Updated the **Curve Editor UI** with a new sidebar layout, collapsible panels, and improved badges.
  - Improved **External Schedule String** parsing to support flexible formats, including inline block vectors and presets.
  - Moved heavy logic into modular files (subfolder `/modules` and `/js`) for better maintainability.
- **Visual Prompt Gallery:**
  - Improved tooltip handling for metadata display.

### Fixed
- **Multi Scheduled LoRA Loader:**
  - Fixed edge cases in curve ramp generation (ensuring 0.0 strength outside defined keyframes).
  - Fixed potential memory leaks in tooltip generation.

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