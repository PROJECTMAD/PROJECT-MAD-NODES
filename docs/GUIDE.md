# GUIDE.md
*Still work in progress.*

## Multi Scheduled LoRA Loader

### 1. Connection & Setup (Required)
This node outputs **HOOKS**, which must be applied to your CLIP model using ComfyUI's internal hook system.

**Steps:**
1.  Add a **Set CLIP Hooks** node to your workflow.
2.  Connect your source `CLIP` (e.g., from *Load Checkpoint*) to the `clip` input.
3.  Connect the `HOOKS` output from the **Multi Scheduled LoRA Loader** to the `hooks` input.
4.  Connect the resulting `CLIP` output to your **CLIP Text Encode (Prompt)** nodes.

*> **Note:** If you are not using a CLIP encoder, you can utilize the `HOOKS` output with any compatible model patcher that accepts hooks.*

### 2. Configuration (Important)
To ensure your curves actually affect the generation, you must configure the **Set CLIP Hooks** node correctly:

*   **apply_to_conds (on Set CLIP Hooks):** Must be `True`. This enables the Model strength scheduling.
*   **schedule_clip (on Set CLIP Hooks):** Set to `True` if you want the CLIP strength to change over time. If `False`, it may ignore the CLIP curve or use a static value.

<details>
<summary><strong>Connection Preview</strong></summary>
<a href="../assets/multi_scheduled_lora_loader_image_001.png"><img src="../assets/multi_scheduled_lora_loader_image_001.png" width="1920"></a>
</details>

<br>

### 3. Using the Curve Editor
1.  Click **"Open Multi-LoRA Editor"** to launch the visual interface.
2.  **Add LoRAs:** Add as many LoRAs as needed; the editor handles them in a unified timeline.
3.  **Draw Curves:**
    *   **Left Click:** Add keyframe / Drag point.
    *   **Double Click:** Add keyframe.
    *   **Right Click / Drag:** Pan the view.
    *   **Shift + Drag:** Toggle snapping (default is snap-to-grid).
4.  **Model vs CLIP:** The curve represents both strengths visually, but you can set independent values in the sidebar.
5.  **History:** Use Undo/Redo (Ctrl+Z/Ctrl+Y) or the History button to revert changes.

<br>

### 4. Advanced: External String Syntax
If you prefer to bypass the visual editor or generate schedules programmatically, you can input a string into the `schedule_string` input.

**Format:**
```text
<lora:filename.safetensors:model_strength:clip_strength:keyframe_data>
```

**Examples:**
*   **Simple (Static):** `<lora:my_style.safetensors:0.8:1.0>`
*   **With Keyframes:** `<lora:my_style.safetensors:1.0:1.0:0.0,0.0;0.5,1.0;1.0,0.0>`
    *   *Format:* `percent,strength;percent,strength`

*> **Note:** If a valid string is detected in `schedule_string` and the internal editor has no active LoRAs, the node switches to **External Mode** and ignores the internal editor configuration. Otherwise it will prompt you to optionally import the schedule.*

<br>

### 5. Troubleshooting
*   **Gray/Empty output image:**
    *   Ensure `schedule_clip` is `True` on the **Set CLIP Hooks** node.
    *   Ensure you have at least one active LoRA.
    *   Check if your curves are set to 0 strength for the entire duration.
*   **Import overwrote the schedule:** If you connect an external string, the node may ask to import it. You can Undo (Ctrl+Z) inside the editor if you accidentally overwrite your work.

<br>

---

## Visual Prompt Gallery (EXIF)

A visual container for your prompt inspiration.

**How it works:**
1.  **Drag & Drop:** Drag images from your computer onto the gallery area.
2.  **Storage:** Images are saved to `ComfyUI/input/visual_gallery/`.
3.  **Load Prompts:** **Left-Click** an image to select it and run workflow to instantly populate the `positive_prompt` and `negative_prompt` outputs with metadata extracted from the image.
4.  **Context Menu:** **Right-Click** an image to:
    *   View Fullscreen.
    *   Remove the image from the gallery.

<details>
<summary><strong>Preview</strong></summary>
<a href="../assets/visual_prompt_gallery_(exif)_image_001.png"><img src="../assets/visual_prompt_gallery_(exif)_image_001.png" width="1920"></a>
</details>

<br>

> Go back to the **[README](../readme.md)**.