<div align="center">

# Troubleshooting Guide

**Common Issues, Solutions, and Performance Tips**

[Multi Scheduled LoRA Loader](#multi-scheduled-lora-loader) | [Visual Prompt Gallery](#visual-prompt-gallery) | [Error Reference](#error-messages-reference)

---

</div>
<br>

<div align="center">

# Multi Scheduled LoRA Loader
**Core Node, Curve Editor, and Block Weight Manager**

</div>

---

## Generation Issues

### Gray or Empty Output Image

> **Symptom:** Output is a solid gray image or completely empty/black.

**Causes**
1. CLIP hooks not properly applied.
2. All curves set to 0.0 strength.
3. No LoRAs enabled.
4. Hook scheduling disabled on Set CLIP Hooks node.
5. All block weights set to 0.0 in Block Weight Editor.

**Solutions**
*   **Check Set CLIP Hooks settings:**
    *   `apply_to_conds` must be **True**.
    *   `schedule_clip` must be **True**.
*   **Verify at least one LoRA is enabled** (green toggle in sidebar).
*   **Check your curves** - ensure they're not at 0.0 for the entire duration.
*   **Verify HOOKS output** is connected to Set CLIP Hooks node.
*   **Check Block Weight Editor** - ensure at least some blocks have weight > 0.0.

### Curves Not Affecting Generation

> **Symptom:** LoRA appears to use static strength regardless of curve shape.

**Causes**
1. Hook application misconfigured.
2. Sampler doesn't support hook scheduling.
3. Wrong output connected.
4. CLIP hooks not enabled downstream.
5. Block weights overriding curve effect.

**Solutions**
*   **Verify connection chain:**
    ```
    Multi Scheduled LoRA Loader (HOOKS) 
        → Set CLIP Hooks (hooks)
        → CLIP Text Encode
    ```
*   **Check MODEL output** is also connected if using model-side hooks.
*   **Try different sampler** - some custom samplers may not support hooks.
*   **Verify downstream nodes** have `apply_to_conds=True` and `schedule_clip=True`.
*   **Check Block Weight Editor** - ensure blocks aren't set to 0.0.

### No Output from HOOKS Port

> **Symptom:** HOOKS output doesn't seem to pass through when no LoRAs are configured.

**Causes**
1. No LoRAs configured in active profile.
2. All LoRAs disabled.
3. Node in wrong operational mode.

**Solutions**
*   **Check active profile** - ensure it contains enabled LoRAs.
*   **Verify node title** shows active profile status (e.g., "[Default] (0 Active)").
*   **Check connection** - HOOKS output always passes through `previous_hooks` input when in EXTERNAL_B or BRIDGE mode.
*   **Enable at least one LoRA** if you need the node to generate new hooks.

## Loading & Resources

### LoRA Not Found

> **Symptom:** Error message: "LoRA not found" or LoRA doesn't appear in picker.

**Causes**
1. File not in ComfyUI's LoRA directory.
2. Special characters in filename.
3. Subdirectory path not resolved.
4. LoRA not in ComfyUI's cached list.

**Solutions**
*   **Verify file location:** `ComfyUI/models/loras/your_lora.safetensors`
*   **For subdirectories**, ensure full relative path is used: `subfolder/your_lora.safetensors`
*   **Avoid special characters** in filenames (parentheses, brackets, etc.).
*   **Refresh ComfyUI** if you recently added the file.
*   **Check ComfyUI cache** - some installations require a full restart after adding new files.

### Architecture Mismatch Warning

> **Symptom:** Warning badge shows incompatible architecture (e.g., FLUX LoRA with SDXL checkpoint).

**Causes**
*   LoRA was trained for a different base model architecture.

**Solutions**
*   **Use matching architectures** - SDXL LoRAs with SDXL checkpoints.
*   **Note:** The warning is advisory. Some cross-architecture use may partially work, but results are unpredictable.
*   **Check LoRA source** (CivitAI, etc.) for base model information.

## Editor & UI Issues

### Import Overwrote My Schedule

> **Symptom:** Connected an external string and it replaced your carefully crafted curves.

**Solutions**
*   **Immediate recovery:** Press `Ctrl+Z` in the editor.
*   **Prevention:** Click "Cancel" on import dialog when it appears.
*   **Alternative:** Disconnect or mute the upstream string source before opening editor.
*   **Profile protection:** Import creates a new profile, leaving existing profiles untouched.

### Canvas Shows No Curves

> **Symptom:** Editor opens but canvas is empty despite having LoRAs in sidebar.

**Causes**
1. Visibility toggles are off.
2. View is panned/zoomed away from curves.
3. Canvas failed to initialize.
4. All LoRAs disabled.

**Solutions**
*   **Check visibility toggles** (eye icon) in sidebar - ensure at least one LoRA is enabled.
*   **Click "Fit View"** button to reset zoom and pan.
*   **Close and reopen** the editor if canvas seems stuck.
*   **Check curve points** - ensure at least some points have Y > 0.0.
*   **Verify active LoRA** - select a LoRA row to see its curve.

### Points Not Snapping to Grid

> **Symptom:** Keyframes don't align to grid even with snap enabled.

**Solutions**
*   **Verify snap is enabled** (toggle button in toolbar).
*   **Check grid precision** - smaller values = finer snapping.
*   **Use Resample** function to regenerate curve with aligned points.
*   **Note:** Holding Shift while dragging temporarily toggles snap mode.
*   **Check snap interval** in global settings - may be too large for desired precision.

### Editor Won't Open

> **Symptom:** Clicking "Open Multi-LoRA Editor" does nothing or shows error.

**Causes**
1. JavaScript/CSS not loaded.
2. Node configuration malformed.
3. Browser console errors.
4. ComfyUI API not available.

**Solutions**
*   **Check browser console** (F12) for errors.
*   **Verify node installation** - files in correct `ComfyUI/custom_nodes` directory.
*   **Clear browser cache** and reload ComfyUI.
*   **Check ComfyUI version** - requires recent version with proper extension support.
*   **Try different browser** if issues persist.

### Profile Not Saving

> **Symptom:** Profile changes lost after closing editor or reloading workflow.

**Solutions**
*   **Always click "Save"** not "Close" when done editing.
*   **Save workflow** (Ctrl+S) after editor closes.
*   **Check node title** - should show active profile name.
*   **Use "Discard" cautiously** - reverts all changes since opening editor.

## Block Weight Editor Issues

### Metadata Missing Error

> **Symptom:** Block Weight Editor shows "Metadata Missing" error.

**Causes**
1. LoRA not yet analyzed.
2. Analysis failed or Cache corrupted.
3. LoRA file inaccessible.

**Solutions**
*   **Click refresh button** in settings panel to re-analyze LoRA.
*   **Clear metadata cache** and re-analyze.
*   **Verify file permissions** - ComfyUI must be able to read the LoRA file.
*   **Check file format** - supported: .safetensors, .ckpt, .pt.
*   **Wait for analysis** - large LoRAs (especially FLUX) take longer.

### Presets Not Working

> **Symptom:** Semantic strategy presets don't change block weights or show "Unsupported Architecture".

**Causes**
1. Architecture not detected or not in compatible list.
2. LoRA not yet analyzed.
3. Custom vectors override preset.

**Solutions**
*   **Wait for analysis completion** - check settings panel for "Scanning Tensor Structure".
*   **Verify architecture detection** - badge should show arch code (SDXL, FLUX, etc.).
*   **Check compatibility** - presets work with SDXL, SD1, SD2, 1.5, FLUX, SD3.
*   **Clear custom vectors first** - presets only apply when no custom vectors exist.

### Group Sync Issues

> **Symptom:** Group master slider doesn't control all blocks or sync state resets.

**Causes**
1. Individual block modified after sync.
2. UI state not persisted.

**Solutions**
*   **Use group master slider** only when group is synced (blue indicator).
*   **Reset group** by toggling sync off/on.
*   **Apply preset** to reset all vectors to known state.
*   **Save and re-open editor** to reset UI state.
*   **Note:** Modifying individual blocks automatically exits sync mode.

### Heatmap Not Showing

> **Symptom:** Analysis panel heatmap shows no color or "Analysis Data Unavailable".

**Causes**
1. LoRA not analyzed.
2. Energy distribution data missing.
3. Arch detection failed.

**Solutions**
*   **Wait for analysis** - large LoRAs can take 10-30 seconds.
*   **Click refresh button** to force re-analysis.
*   **Clear metadata cache** if data seems corrupted.
*   **Verify LoRA is valid** - try loading it in standard LoraLoader first.

## Performance Optimization

### Slow LoRA Analysis

> **Symptom:** Long delay when selecting large LoRAs (especially FLUX models).

**Solutions**
*   **Wait for caching** - subsequent loads are instant.
*   **Cache locations:** Browser (IndexedDB) and Server (In-memory Python dictionary).
*   **Clear cache** if data seems incorrect (Use "Clear Metadata Cache" button in editor).
*   **Use streaming analysis** - enabled for .safetensors files.
*   **Avoid re-analysis** - don't force refresh unless necessary.

### High Memory Usage

> **Symptom:** Memory spikes when working with many LoRAs or large models.

**Solutions**
*   **Streaming analysis** - the system uses streaming for SafeTensors when possible.
*   **Disable unused LoRAs** - disabled LoRAs don't consume generation resources.
*   **Use profiles** - switch between configurations instead of loading everything.
*   **Restart ComfyUI** periodically to clear accumulated caches.
*   **Close editor when not in use** - canvas rendering consumes GPU memory.

### Editor Lag

> **Symptom:** Curve editor feels sluggish when dragging points or with many LoRAs.

**Solutions**
*   **Reduce visible curves** - toggle off LoRAs you're not actively editing.
*   **Simplify curves** - use Resample to reduce point count.
*   **Hardware acceleration** - ensure browser has GPU acceleration enabled.
*   **Close other tabs** - canvas rendering is CPU/GPU intensive.
*   **Disable preview pane** - hides automatically when not hovering LoRA.

<br>
<br>

<div align="center">

# Visual Prompt Gallery
**Image Management and Metadata Extraction**

</div>

---

## Gallery Issues

### Images Not Importing

> **Symptom:** Drag and drop doesn't add images to gallery.

**Causes**
1. Unsupported file format.
2. Permission issues with input directory.
3. Browser drag/drop not working.
4. Gallery not focused.

**Solutions**
*   **Supported formats:** PNG, JPEG, WebP.
*   **Check directory permissions:** `ComfyUI/input/visual_gallery/`
*   **Try different browser** if drag/drop seems broken.
*   **Manually copy** files to the gallery directory as workaround.
*   **Click gallery first** to ensure it has focus before dragging.

### Metadata Not Extracted

> **Symptom:** Image loads but prompt fields remain empty.

**Causes**
1. Image has no embedded metadata.
2. Metadata format not recognized.
3. ExifReader library not loaded.
4. Corrupted metadata.

**Solutions**
*   **Verify image has metadata** - check with external tool like ExifTool.
*   **PNG recommended** - best metadata preservation.
*   **Check browser console** for ExifReader loading errors.
*   **Ensure internet access** on first load (library needs to download once).
*   **Supported formats:** ComfyUI PNG, A1111/Forge, CivitAI, EXIF UserComment.

### Gallery Not Persisting

> **Symptom:** Images disappear after reloading ComfyUI.

**Causes**
1. Workflow not saved after adding images.
2. Image list stored in node state.
3. Input directory cleared.

**Solutions**
*   **Save your workflow** after adding images to gallery.
*   **Images are stored** in `input/visual_gallery/` - they persist, but the gallery list is part of node state.
*   **Check input directory** - ensure files weren't manually deleted.
*   **Export gallery list** if you need to preserve between workflows.

### Gallery Not Appearing

> **Symptom:** Gallery panel doesn't show up when node is selected.

**Causes**
1. JavaScript/CSS not loaded.
2. Node not properly installed.
3. Browser cache issues.
4. **ComfyUI "Nodes 2.0" is enabled.**

**Solutions**
*   **Check browser console** for errors.
*   **Verify installation** - ensure all files are in correct custom_nodes directory.
*   **Clear browser cache** and hard reload (`Ctrl+Shift+R`).
*   **Check ComfyUI logs** for extension loading errors.
*   **Disable Nodes 2.0:** Go to ComfyUI Settings (gear icon) and ensure the experimental new frontend is disabled. The Gallery relies on LiteGraph and does not yet support the Vue-based renderer.

## Performance

### Gallery Loading Slow

> **Symptom:** Gallery takes long time to load with many images.

**Causes**
1. Large number of images in directory.
2. High-resolution thumbnails.
3. Metadata extraction for each image.
4. Browser memory limits.

**Solutions**
*   **Limit image count** - keep gallery directory under 50 images.
*   **Use lower resolution** - images are displayed as thumbnails anyway.
*   **Pre-extract metadata** - if using same images frequently.
*   **Clear unused images** - remove old or test images.
*   **Use subdirectories** - organize images into themed folders.

<br>
<br>

# Error Messages Reference

| Node | Error | Meaning | Action |
| :--- | :--- | :--- | :--- |
| 🔵 **Multi Scheduled LoRA Loader** | `LoRA not found: {name}` | File doesn't exist in models/loras | Check path and filename |
| 🔵 **Multi Scheduled LoRA Loader** | `Architecture mismatch` | LoRA/checkpoint incompatible | Use matching architectures or ignore warning |
| 🔵 **Multi Scheduled LoRA Loader** | `Invalid keyframe data` | Malformed string syntax | Check syntax format in external schedule |
| 🔵 **Multi Scheduled LoRA Loader** | `Hook application failed` | CLIP hooks not connected | Verify node connections |
| 🔵 **Multi Scheduled LoRA Loader** | `Analysis Data Unavailable` | LoRA not analyzed | Click refresh button in settings |
| 🔵 **Multi Scheduled LoRA Loader** | `Metadata Missing` | Block metadata not loaded | Re-analyze LoRA or clear cache |
| 🟣 **Visual Prompt Gallery** | `Image not found` | File missing from input directory | Check file exists in visual_gallery folder |
| 🟣 **Visual Prompt Gallery** | `Metadata extraction failed` | EXIF data corrupted or missing | Try different image format |
| 🟣 **Visual Prompt Gallery** | `Gallery initialization error` | JavaScript/CSS not loaded | Check console and reload |

---

## Getting Help

If your issue isn't covered here:

1.  **Check the Console** - Browser DevTools (F12) may show relevant JavaScript errors.
2.  **Check ComfyUI Logs** - Server-side errors appear in terminal.
3.  **Reproduce Minimally** - Create simplest workflow that shows the issue.
4.  **Check Node Version** - Ensure you have latest version of MAD Nodes.
5.  **Verify Dependencies** - Ensure `safetensors` library is installed.
6.  **Specify Node Name** - When asking for help, mention whether issue is with Multi Scheduled LoRA Loader or Visual Prompt Gallery.

---

## Related Documentation

- [Multi Scheduled LoRA Loader](./MULTI_SCHEDULED_LORA_LOADER.md)
- [Back to Main Documentation](../readme.md)