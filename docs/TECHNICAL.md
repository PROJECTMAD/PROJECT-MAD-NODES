# Technical Reference

This page describes implementation-level behavior for the Multi Scheduled LoRA Loader node. It intentionally focuses on internal logic, parsing rules, and edge cases.

For a user-facing overview and editor usage, see [Multi Scheduled LoRA Loader](./MULTI_SCHEDULED_LORA_LOADER.md).

---

## Node I/O

### Inputs

- `schedule_config` (required, hidden): JSON string produced by the UI.
  - Can be a legacy list of LoRA items, or a profiles object. See [Schedule config format](#schedule-config-format).
- `model` (optional): MODEL to register the combined hook group onto.
- `previous_hooks` (optional): HOOKS to forward/merge with this node’s hooks.
- `schedule_string` (optional, forceInput, multiline): external schedule definition. See [External schedule string parsing](#external-schedule-string-parsing).

### Outputs

- `MODEL`: clone of the input model with hooks registered, or `None` if no model was provided.
- `HOOKS`: combined hook group.
- `schedule_string`: concatenation of any forwarded schedule string plus this node’s serialized internal schedule.
- `trigger_words`: unique, comma-separated triggers aggregated from LoRA metadata JSON files.

---

## Hook construction and scheduling

This section describes the runtime behavior of the node’s `process(...)` method.

For each active LoRA item, the node:

1. Resolves the LoRA file path (`LoraOps.resolve_path(lora_name)`).
2. Extracts trigger words (metadata-only) via `LoraOps.extract_triggers(Path(path))`.
3. Loads the LoRA weights (`comfy.utils.load_torch_file(path, safe_load=True)`).
4. Determines architecture:
   - use item-provided `arch` if not `UNKNOWN`
   - otherwise compute via `inspect_lora_architecture(Path(path))`
5. Expands presets (if present) into vectors:
   - Compute stats (cached) via `analyze_lora_weights(Path(path), arch=arch)`.
   - Call `LoraOps.get_vectors_for_preset(arch, preset, available_blocks, meta)`.
   - Merge explicit vectors on top: `preset_vectors.update(vectors)` (explicit wins).
6. Applies vectors (if any) by scaling tensors: `LoraOps.apply_lbw(lora, arch, lora_name, vectors)`.
7. Skips the LoRA entirely if both `strength_model` and `strength_clip` are effectively zero.
8. Builds a LoRA hook (`comfy.hooks.create_hook_lora(lora, strength_model, strength_clip)`).
9. If `points` exist, pads them (see [Curve padding (backend)](#curve-padding-backend)), then converts to `HookKeyframeGroup`:
   - `start_percent` = point `x`
   - `strength` = point `y`

### Curve padding (backend)

Before converting points to keyframes, the backend enforces “outside range = 0” behavior:

- Points are sorted by `x`.
- If first point `x > 0`, it prepends:
  - `{x: 0.0, y: 0.0}`
  - plus an optional `{x: first_x - 0.001, y: 0.0}` when `first_x > 0.001`
- If last point `x < 1.0`, it appends:
  - an optional `{x: last_x + 0.001, y: 0.0}` when `last_x < 0.999`
  - `{x: 1.0, y: 0.0}`

The frontend preview uses a similar “flooring” rule when displaying values: outside `[first_x, last_x]` it returns 0.

---

## Operation modes

The node selects a mode based on which inputs are present. This state machine determines what gets applied and what gets forwarded.

| Mode | Internal UI | String Input | Hooks Input | Description & Logic |
| :--- | :---: | :---: | :---: | :--- |
| **STANDARD** | ✅ Active | — | Optional | **Default.** Internal schedule is applied. `previous_hooks` (if any) are prepended. `schedule_string` output contains only the internal serialized schedule. |
| **OVERRIDE** | ✅ Active | ✅ Connected | ✅ Connected | **Injector.** Internal schedule + `previous_hooks` are applied. <br>_Note:_ The upstream `schedule_string` is **prepended** to the output string for triggers/debug, but is **NOT** applied as hooks (only `previous_hooks` are used). |
| **EXTERNAL A** | ❌ Empty | ✅ Connected | — | **Driver.** Parsed `schedule_string` is applied as hooks. `schedule_string` output is a re-serialization of the parsed external input. |
| **EXTERNAL B** | ❌ Empty | — | ✅ Connected | **Passthrough.** Only `previous_hooks` are applied. `schedule_string` output is empty. |
| **BRIDGE** | ❌ Empty | ✅ Connected | ✅ Connected | **Chainer.** Only `previous_hooks` are applied. <br>_Note:_ `schedule_string` is passed through unchanged for trigger extraction downstream. |

**Key Definitions:**
*   **Internal UI:** `schedule_config` contains at least one enabled LoRA.
*   **String Input:** `schedule_string` input is provided and non-empty.
*   **Hooks Input:** `previous_hooks` input is provided.

### `previous_hooks` merge order

Internally, the implementation stores the `previous_hooks` input in a local variable and (when present) inserts it at the start of the hook list before combining:

- `hooks.insert(0, previous_hooks)`

This means **upstream hooks run before** the hooks created by this node.

---

## Schedule config format

The hidden `schedule_config` input is JSON. The backend supports:

### 1) Legacy list

A JSON list of LoRA items:

```json
[
  {
    "lora_name": "example.safetensors",
    "strength_model": 1.0,
    "strength_clip": 1.0,
    "points": [{"x": 0.0, "y": 1.0}, {"x": 1.0, "y": 1.0}],
    "enabled": true,
    "arch": "UNKNOWN",
    "vectors": {}
  }
]
```

### 2) Profiles object

```json
{
  "active_profile": "Default",
  "profiles": {
    "Default": {
      "loras": [ /* list of LoRA items */ ],
      "settings": { "snap": 0.05 }
    }
  }
}
```

The backend extracts the active profile and uses `profile["loras"]` as the effective list.

---

## External schedule string parsing

Parsing is implemented by `LoraOps.parse_external_string`.

### Important constraints / gotchas

- The parser only considers lines that both start with `<lora:` and end with `>`.
- LoRA names are treated as identifiers and later resolved via `LoraOps.resolve_path(...)`.
- The backend serializes schedules back to strings using `Path(lora_name).stem` (the filename without extension), which means:
  - If you referenced a LoRA by a name with extension, the output string may not include the extension.
  - Resolution still occurs against the actual `lora_name` stored in schedule items.

### Accepted forms

1) JSON list: if the string begins with `[`, the node attempts `json.loads(...)` and returns that list.

2) One LoRA per line, lines of the form:

```text
<lora:NAME[:MODEL][:CLIP][:...additional parts...]>
```

Only lines starting with `<lora:` and ending with `>` are parsed. Everything else is ignored.

### Defaults

- Missing/invalid `MODEL` or `CLIP` values are ignored and default to 1.0.
- If no points are parsed, points default to a flat line:
  - `{x: 0.0, y: 1.0}`, `{x: 1.0, y: 1.0}`

### Modern (flexible) format

After `NAME:MODEL:CLIP`, any remaining `:`-separated parts may appear in any order:

- `preset=SOME_NAME`
- `vectors=block=value;block=value`
  - `block:value` is also accepted as a separator in addition to `block=value`.
- `x,y;x,y;...` (keyframes)

Example:

```text
<lora:MyLora:1:1:0,0;0.5,1;1,0:preset=STYLE_FOCUSED:vectors=output_6=1.2>
```

### Legacy (positional) format

To preserve backwards compatibility, a specific 9-part positional format is recognized when:

- the line has at least 9 `:`-separated parts, and
- the 4th part (index 3) is a pure float (no `,`, `;`, or `=`)

Format:

```text
<lora:NAME:MODEL:CLIP:START_STRENGTH:END_STRENGTH:PRINT_IDX:START_PCT:END_PCT:COUNT>
```

The parser generates `COUNT` points between `(START_PCT, START_STRENGTH)` and `(END_PCT, END_STRENGTH)`.

---

## Architecture Detection

Architecture detection is used for:

- Display badges in the editor (e.g. `SDXL`, `FLUX.1`, `SD3`).
- Decide which block mapping configuration to use for stats/presets.
- Provide checkpoint/LoRA compatibility hints.

Detection is implemented by `LoRAInspector.detect(path)` and cached in `_LORA_CACHE[path]["arch"]`.

### Detection order

1. **Sidecar metadata JSON (preferred)**
   - If `<stem>.metadata.json` or `<stem>.json` exists, the inspector attempts to map known metadata fields to an architecture.
   - It checks (in order) CivitAI tags, then base model fields (`baseModel`, `base_model`, `sd_version`, `modelspec.architecture`, `civitai.baseModel`).

2. **SafeTensors header inspection** (only for `.safetensors`)
   - Reads the SafeTensors header and checks `__metadata__` (e.g. `ss_base_model_version`).
   - If metadata is inconclusive, it classifies by tensor key patterns:
     - `double_blocks` / `img_in` → `FLUX.1`
     - `joint_blocks` → `SD3`
     - `input_blocks` → `SDXL`
     - `down_blocks` → `SD15`
     - certain transformer key patterns (`layers.0`, `model.layers.0`) → `AURA` / `LUMINA` / `QWEN` (heuristic)
   - Fallback: infers from common projection dimensions (e.g. 320 → `SD15`, 768/1024/1280 → `SD21`, 640 → `SDXL`).

If nothing matches, returns `UNKNOWN`.

### SDXL lineage refinement (stats-based)

When `inspect-lora` computes stats and the detected architecture is `SDXL`, the server may refine to an SDXL lineage subtype based on ratios in `stats`:

- `SDXL_PONY`
- `SDXL_NOOBAI`
- `SDXL_ILLUSTRIOUS`
- `SDXL_REALISM`

This refinement is performed by `LoRAInspector.classify_sdxl_lineage_from_stats(stats)`.

---

## API Endpoints

This extension registers HTTP routes on ComfyUI’s `PromptServer` (see `__init__.py`). The frontend editor uses these endpoints for configuration, analysis, compatibility hints, and preview streaming.

All endpoints below are `GET`.

### `GET /mad-nodes/config`

Returns Python-defined UI configuration so the frontend and backend stay aligned.

Used by: frontend on editor startup (`RequestManager.fetchConfig()`), then `updateConstants(config)`.

Response: `200 application/json`

```json
{
  "ARCH_BLOCK_MAPPINGS": { "SDXL": { /* ... */ } },
  "PRESET_COMPATIBLE_ARCHS": ["SDXL", "SD1", "SD2", "FLUX"],
  "PRESET_STRATEGIES": { "STYLE_FOCUSED": { /* ... */ } },
  "BLOCK_ORDER": ["input_0", "input_1", "..."],
  "BLOCK_GROUPS": [
    {"id": "input", "name": "Structure / Input", "blocks": ["input_0", "input_1"]}
  ]
}
```

Notes:

- Exact keys/values are produced by `LoraOps.get_ui_config()`.
- The frontend treats this as the source of truth for preset labels and block layout.

---

### `GET /mad-nodes/inspect-lora`

Inspects a LoRA file to determine architecture and (optionally) compute weight statistics used by the block-weight editor.

Query parameters:

- `lora_name` (string, required unless clearing cache): LoRA filename as known to ComfyUI’s `loras` folder.
- `refresh` (bool, optional): if truthy (`true`, `1`, `yes`), bypasses `_LORA_CACHE` and recomputes.
- `clear_cache_all` (bool, optional): if `true`, clears the backend global `_LORA_CACHE` and returns early.

Caching semantics:

- Architecture detection (`arch`) is cached in `_LORA_CACHE[path]["arch"]`.
- Weight stats (`stats`) are cached in `_LORA_CACHE[path]["stats"]`.
- `refresh=true` recomputes both.
- `clear_cache_all=true` wipes the entire cache for all LoRAs.

Response (cache clear): `200 application/json`

```json
{"status": "cleared", "message": "Global LoRA cache cleared."}
```

Response (normal): `200 application/json`

```json
{
  "arch": "SDXL",
  "stats": {
    "energy_distribution": {"input_0": 0.12, "output_6": 0.18},
    "block_metadata": {"output_6": {"label": "Style"}},
    "output_ratio": 0.57,
    "mid_ratio": 0.22,
    "input_ratio": 0.21,
    "sparsity": 0.19,
    "balance": -0.10
  }
}
```

Notes:

- `arch` is computed synchronously via `MultiScheduledLoraLoader.inspect_lora_architecture()`.
- `stats` may be omitted if analysis fails.
- Stats computation is run in a background thread via `asyncio.get_event_loop().run_in_executor(executor, ...)` where `executor = ThreadPoolExecutor(max_workers=2)`.
- If `arch == "SDXL"` and stats are present, the server may refine the returned `arch` into a lineage subtype (e.g. `SDXL_PONY`, `SDXL_NOOBAI`) based on stats.

Error behavior:

- Missing `lora_name` returns `{ "arch": "UNKNOWN" }`.
- Unresolvable file returns `{ "arch": "UNKNOWN", "error": "File not found" }`.
- Exceptions return `{ "arch": "UNKNOWN", "error": "<exception message>" }`.

---

### `GET /mad-nodes/check-compatibility`

Compares the base architecture of a checkpoint vs a LoRA.

Query parameters:

- `ckpt_name` (string, required): checkpoint filename as known to ComfyUI’s `checkpoints` folder.
- `lora_name` (string, optional): LoRA filename.

Response: `200 application/json`

```json
{
  "status": "ok",
  "ckpt_arch": "SDXL",
  "lora_arch": "SDXL_PONY",
  "compatible": true,
  "message": ""
}
```

Notes:

- `ckpt_arch` is always attempted (checkpoint must exist).
- `lora_arch` is only attempted if the LoRA can be resolved.
- Comparison is done on normalized “base” families:
  - anything containing `SDXL` is treated as `SDXL`
  - anything containing `FLUX` is treated as `FLUX`
  - anything containing `SD1` is treated as `SD15`
  - anything containing `SD2` is treated as `SD21`

Error behavior:

- If `ckpt_name` cannot be resolved, returns `{ "status": "error", "message": "Checkpoint not found" }`.
- If either arch is `UNKNOWN`, `compatible` is `false` with an explanatory `message`.

Frontend interaction:

- The frontend caches compatibility results (`compat:<ckpt>:<lora>`) in IndexedDB.
- The compatibility response can “prime” the inspect cache for that LoRA’s `arch` (without stats), reducing redundant inspect calls.

---

### `GET /mad-nodes/lora-preview`

Serves a preview image/video file located alongside the LoRA.

Query parameters:

- `lora_name` (string, required)

Response:

- `200` with a binary payload (via `aiohttp.web.FileResponse`) if a candidate file exists.
- `404` if `lora_name` is missing, the LoRA path cannot be resolved, or no preview sidecar exists.

Lookup rules:

Given a LoRA at `.../loras/MyLora.safetensors`, the server checks for files in this priority order:

1. `MyLora.preview.png`
2. `MyLora.preview.jpg`
3. `MyLora.preview.webp`
4. `MyLora.png`
5. `MyLora.jpg`
6. `MyLora.jpeg`
7. `MyLora.webp`
8. `MyLora.mp4`
9. `MyLora.webm`

This endpoint is what the editor preview pane uses.

---

## Block Mappings

Block weights require mapping “raw tensor keys” in the LoRA state dict into a smaller set of logical block IDs that users can control.

This extension maintains mapping configuration in Python (served to JS via `/mad-nodes/config`) and uses it in two places:

1. **Stats computation** (`LoraOps.compute_stats(file_path, arch)`): groups tensor energy into blocks such as `input_0`, `middle_0`, `output_6`, etc.
2. **Vector application** (`LoraOps.apply_lbw(lora, arch, lora_name, vectors)`): scales tensors that belong to a given block ID by the user-selected multiplier.

### Conceptual model

- A *block ID* is a string key used in `vectors`, e.g. `output_6`.
- Each tensor key in the LoRA is assigned to exactly one block ID (or a fallback bucket).
- Applying a vector multiplies the tensor values:
  - `tensor = tensor * vectors.get(block_id, 1.0)`

### Architecture dependence

Block ID naming and how tensor keys map into them depends on the detected `arch`.

- For UNet-style SD models this typically corresponds to input/middle/output blocks.
- For transformer-style models (FLUX/SD3/etc.) blocks may correspond to layer ranges.

The authoritative list/order/grouping of blocks is provided by `LoraOps.get_ui_config()`:

- `ARCH_BLOCK_MAPPINGS`
- `BLOCK_ORDER`
- `BLOCK_GROUPS`

The UI renders sliders using these structures; the backend uses the same config for mapping and preset expansion.

---

## Block-weight vectors and presets

- If a LoRA item contains `preset`, the backend attempts to compute LoRA stats (if not cached) and maps the preset onto detected blocks.
- Explicit `vectors` always override preset values for the same block.
- Vector application is implemented as a per-tensor scalar multiply based on a mapped block id.

Presets are defined in `modules/lora_ops.py` under `UI_CONFIG["PRESET_STRATEGIES"]`.

### Preset Logic Table

| Preset | Target Effect | Logic |
| :--- | :--- | :--- |
| **Linear** | Standard | All blocks set to 1.0. |
| **Style Focused** | Art Style Transfer | Reduces structure (Pose) influence to let the style bleed through. Good for changing art styles without changing the composition. |
| **Balanced** | General Purpose | Slight boost to style and details while keeping structure firm. |
| **Heavy Style** | Abstract/Artistic | Aggressive style transfer. May break anatomy but produces strong artistic effects. |
| **Realism** | Texture/Lighting | Subtle boost to texture and lighting blocks. Great for photography LoRAs. |

### Semantic Mapping Guide

The backend maps these presets to specific block IDs based on the detected architecture:

*   🟩 **POSE (Structure):** Input Blocks / Double Blocks (Early).
*   🟧 **IDENTITY (Concept):** Middle Blocks.
*   🟪 **STYLE (Art):** Output Blocks (Early/Mid).
*   🟦 **DETAILS (Texture):** Output Blocks (Late).

---

## Sidecar File Integration

This node does not depend on external APIs, but it is designed to consume standard sidecar files located alongside LoRA models.

The popular **[LoRA Manager](https://github.com/willmiao/ComfyUI-Lora-Manager)** extension is the most common tool for generating these files via its **Fetch** action. When these files are present, the backend utilizes them:

1.  **Previews:** The `/mad-nodes/lora-preview` endpoint looks for `MyLora.preview.png`, `MyLora.mp4`, etc.
2.  **Metadata:** The architecture detector and trigger word extractor look for `MyLora.metadata.json` or `MyLora.json`.
3.  **Fallback:** If sidecar files are missing, the node falls back to raw tensor analysis (slower and strictly heuristic).

---

## Trigger words (`trigger_words` output)

Trigger extraction is metadata-file based:

- For each resolved LoRA path, the backend checks for adjacent JSON files:
  - `<stem>.metadata.json`
  - `<stem>.json`
- It reads `trainedWords` or `civitai.trainedWords` when present (must be a list).

The final output:

- flattens and deduplicates
- sorts
- joins with `", "`

If no metadata file exists, no triggers are produced for that LoRA.

---

## Schedule string serialization

The node always emits a `schedule_string` output, even for UI-driven schedules. This is primarily for debugging and chaining.

### Format

Each active LoRA item is serialized as:

```text
<lora:NAME:MODEL:CLIP[:POINTS][:preset=PRESET_NAME | :vectors=... ]>
```

Where:

- `NAME` is `Path(lora_name).stem`.
- `MODEL` / `CLIP` are formatted to 4 decimals and then trimmed.
- `POINTS` is `x,y;x,y;...` if points exist (after backend padding).
- Extra payload:
  - If `item.preset` exists and is not `CUSTOM`, the node emits `:preset=...`.
  - Otherwise, if `vectors` exists, the node emits `:vectors=...`.

### Interaction with modes

Final output is:

- `"\n".join(filter(None, [str_prepend, "\n".join(text_out)]))`

Meaning:

- In `BRIDGE`, output is exactly the input `schedule_string` (no internal serialized lines).
- In `OVERRIDE`, output is `schedule_string` (input) + newline + internal serialized schedule.
- In `STANDARD`, output is only the internal serialized schedule.
- In `EXTERNAL_A`, output is a re-serialization of the parsed external input.
- In `EXTERNAL_B`, output is empty.

---

## Caching

Caching exists at two layers: backend Python process memory and frontend browser storage.

### Backend (Python): `_LORA_CACHE`

A module-global dictionary in `multi_scheduled_lora_loader.py` keyed by **resolved absolute LoRA file path**.

Stored entries:

- `arch`: result of `LoRAInspector.detect(...)`.
- `stats`: result of `LoraOps.compute_stats(...)`.

When caches are used:

- `inspect_lora_architecture(..., force_refresh=False)` returns cached `arch` when present.
- `analyze_lora_weights(..., force_refresh=False)` returns cached `stats` when present.

How to invalidate:

- `GET /mad-nodes/inspect-lora?refresh=true&lora_name=...` recomputes (for that LoRA).
- `GET /mad-nodes/inspect-lora?clear_cache_all=true` wipes the entire cache.

Operational notes:

- This cache is **per ComfyUI process**. Restarting ComfyUI clears it.
- Stats computation can be expensive; it is executed via a `ThreadPoolExecutor(max_workers=2)`.

### Frontend (browser): IndexedDB + in-memory mirror

The editor caches API results to avoid repeated inspections:

- Storage backend: IndexedDB database `MadNodesDB`, object store `cache`.
- In-memory mirror: `RequestManager.storageCache` for synchronous reads.
- Legacy migration: if IndexedDB is empty, it may import JSON from localStorage key `MAD_NODES_LORA_METADATA_V1`.

Cache keys:

- `inspect:<lora_name>` → response from `/mad-nodes/inspect-lora`
- `compat:<ckpt_name>:<lora_name>` → response from `/mad-nodes/check-compatibility`

Clear action:

The editor’s **Clear Metadata Cache** clears:

- browser cache (IndexedDB + in-memory mirror), and
- backend `_LORA_CACHE` via `/mad-nodes/inspect-lora?clear_cache_all=true`.

---

## Related Documentation

- [Multi Scheduled LoRA Loader](./MULTI_SCHEDULED_LORA_LOADER.md)
- [Back to Main Documentation](../readme.md)