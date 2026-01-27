const pathParts = import.meta.url.split("/");
const jsIndex = pathParts.indexOf("js");
export const NODE_NAME = jsIndex >= 0 ? pathParts[jsIndex - 1] : "MAD-Nodes";

export const LOG_PREFIX = `[${NODE_NAME}]`;

export const CACHE_KEY = "MAD_NODES_LORA_METADATA_V1";

export const LORA_COLORS = ["#9e9e9e", "#8d6e63", "#66bb6a", "#d4e157", "#7e57c2", "#3f51b5", "#26a69a", "#ab47bc", "#ef5350", "#ffa726", "#ffca28", "#9ccc65", "#5c6bc0", "#29b6f6", "#26c6da", "#42a5f5", "#5c6bc0", "#ff7043", "#ec407a", "#78909c"];
export const SEMANTIC_COLORS = {
    POSE: "#66bb6a",
    IDENTITY: "#ffa726",
    STYLE: "#ab47bc",
    DETAILS: "#29b6f6",
    CLIP: "#7e57c2",
    OTHER: "#9e9e9e",
};

export const SLIDER_COLORS = {
    DEFAULT: "#6366f1",
    SAFE: "#66bb6a",
    WARN: "#ffa726",
    DANGER: "#e6253a",
};
export const CANVAS_COLORS = {
    BG: "#121215",
    ZONE_BG: "#18181b",
    ZONE_BORDER: "#2a2a30",
    GRID_MAJOR: "#2a2a30",
    GRID_MINOR: "#2a2a30",
    TEXT: "#6b6b78",
    AXIS: "#484554",
    TOOLTIP_BG: "rgba(18, 18, 21, 0.95)",
    TOOLTIP_BORDER: "#484554",
    MODEL: "#82caff",
    CLIP: "#ffd700",
    DEFAULT: "#ada9bb",
    SELECTED: "#fff",
};
export const CANVAS_FONTS = {
    axis: "10px monospace",
    tooltip: "12px monospace",
};

export const CONFIRM_BUTTON_COLORS = {
    PRIMARY: "#6366f1",
    DANGER: "#e6253a",
};

export const API_ENDPOINTS = {
    CONFIG: "/mad-nodes/config",
    LORA_LIST: "/object_info/LoraLoader",
    INSPECT: "/mad-nodes/inspect-lora",
    COMPAT: "/mad-nodes/check-compatibility",
    PREVIEW: "/mad-nodes/lora-preview",
};

export const WIDGET_NAMES = {
    CONFIG: "schedule_config",
    MODEL: "model",
    HOOKS: "previous_hooks",
    STRING: "schedule_string",
};

export const NODE_COLORS = {
    BG: "#000000",
    TITLE_BG: "#222222",
};
export const HISTORY_ACTIONS = {
    INITIAL: "Initial State",
    IMPORT: "Import External",
    ENABLE_ALL: "Enable All",
    DISABLE_ALL: "Disable All",
    CLEAR_ALL: "Clear All",
    DISCARD: "Discard Changes",
    ADD_KEYFRAME: "Add Keyframe",
    ADD_LORA: "Add LoRA",
    REMOVE_LORA: "Remove LoRA",
    ENABLE_LORA: "Enable LoRA",
    DISABLE_LORA: "Disable LoRA",
    RENAME_PROFILE: "Rename Profile",
    RESET_PROFILE: "Reset Profile",
    DELETE_PROFILE: "Delete Profile",
    SWITCH_PROFILE: "Switch Profile",
    NEW_PROFILE: "Create New Profile",
    DUP_PROFILE: "Duplicate Profile",
    UPDATE_VECTORS: "Update Block Vectors",
    CLEAR_VECTORS: "Clear Block Vectors",
    RESAMPLE: "Resample",
    CHANGE_STRENGTH: "Strength",
    CHANGE_CLIP: "CLIP",
    MOVE_KEYFRAME: "Move Keyframe",
    CHANGE_LORA: "Change LoRA Model",
    RESET_PARAMS: "Reset Parameters",
};
export let PRESET_COMPATIBLE_ARCHS = ["SDXL", "SD1", "SD2", "1.5", "FLUX"];
export let ARCH_BLOCK_MAPPINGS = {};
export let PRESET_STRATEGIES = {};
export let BLOCK_ORDER = [];
export let BLOCK_GROUPS = [];

export function updateConstants(config) {
    if (config.ARCH_BLOCK_MAPPINGS) ARCH_BLOCK_MAPPINGS = config.ARCH_BLOCK_MAPPINGS;
    if (config.PRESET_COMPATIBLE_ARCHS) PRESET_COMPATIBLE_ARCHS = config.PRESET_COMPATIBLE_ARCHS;
    if (config.PRESET_STRATEGIES) PRESET_STRATEGIES = config.PRESET_STRATEGIES;
    if (config.BLOCK_ORDER) BLOCK_ORDER = config.BLOCK_ORDER;
    if (config.BLOCK_GROUPS) BLOCK_GROUPS = config.BLOCK_GROUPS;
}

export const SLIDER_DESCRIPTIONS = {
    model: "Overall intensity.\nScales the entire LoRA weight matrix.",
    clip: "Prompt intensity.\nScales the Text Encoder/CLIP weights.",
    resample: "Number of points to generate for the curve.",
    snap: "Grid Snapping & Precision\nEnables snapping points to the grid.\nAlso defines the step size (precision) for all sliders.",
};

export const ANALYSIS_TEXT = {
    titleHtml: "<strong>LoRA Analysis</strong> <span class='mad-text-tiny-muted'>(Experimental)</span>",
    metrics: {
        concentration: "Concentration",
        bias: "Bias",
    },
    energyTooltip: "<strong>{key}</strong>\nWeight concentration: {percentage}%",
    placeholder: {
        title: "Analysis Data Unavailable",
        subtitle: "Click the refresh button above to scan this LoRA.",
    },
    stability: {
        label: "Stability:",
        desc: "Stability Metric\nMeasures how 'spiky' the weights are.",
        high: "High Sensitivity",
        highDesc: "Weights are highly concentrated in few layers. Prone to artifacts.",
        mod: "Moderate",
        modDesc: "Weights are somewhat concentrated.",
        safe: "Balanced",
        safeDesc: "Weights are evenly distributed.",
    },
    influence: {
        label: "Influence:",
        desc: "Influence Metric\nTarget blocks (Early vs Late).",
        style: "Style Bias",
        styleDesc: "Heavier weights in output/style layers.",
        struct: "Struct Bias",
        structDesc: "Heavier weights in input/structure layers.",
        neutral: "Neutral",
        neutralDesc: "Balanced between structure and style.",
    },
    mapLabel: "Visual map of where the LoRA's parameters are located.",
};

export const TEMPLATES = {
    confirmBox: `
        <h3 class="mad-confirm-title">%s</h3>
        <p class="mad-confirm-text">%s</p>
        <div class="mad-confirm-actions">
            <button class="mad-btn">%s</button>
            <button class="mad-btn mad-confirm-btn-primary" style="background: %s; border-color: %s;">%s</button>
        </div>
    `,
    dangerBox: `
        <div class="mad-danger-header">
            <div class="mad-danger-icon">%s</div>
            <div class="mad-danger-title">%s</div>
        </div>
        <div class="mad-danger-body">
            <div class="mad-danger-text">%s</div>
            <div class="mad-danger-warning">
                <div>
                    <strong>%s</strong><br>
                    %s
                </div>
            </div>
        </div>
        <div class="mad-danger-footer">
            <button class="mad-btn" id="mad-block-cancel">%s</button>
            <button class="mad-btn mad-btn-danger mad-btn-danger-solid" id="mad-block-confirm">%s</button>
        </div>
    `,
    loader: `<span class="mad-loader-spinner mad-spinner-white"></span>`,
    loaderWithText: `<span class="mad-loader-spinner"></span><span>%s</span>`,
    statsBox: `
        <div class="mad-stats-header">%s</div>
        <div class="mad-stats-row">
            <span class="mad-stats-label-model">%s</span>
            <span class="mad-stats-val">%s</span>
        </div>
        <div class="mad-stats-row">
            <span class="mad-stats-label-clip">%s</span>
            <span class="mad-stats-val">%s</span>
        </div>
        <div class="mad-stats-note">%s</div>
    `,
};

export const TEXT = {
    openEditorButton: "Open Multi-LoRA Editor",
    editorTitle: "Multi-LoRA Scheduler",
    enableAll: "Enable All",
    disableAll: "Disable All",
    enableAllAndReset: "Enable All (Reset)",
    enableAllTitle: "Activate all LoRAs in the list",
    disableAllTitle: "Deactivate all LoRAs in the list",
    addLora: "+ Add LoRA",
    clearAll: "Clear All",
    selectLora: "Select LoRA...",
    checking: "Checking...",
    checkFailed: "Check failed.",
    noModel: "Could not determine upstream model.",
    unknownError: "Unknown error",
    match: "MATCH",
    compat: {
        match: "MATCH",
        checking: "Checking...",
        checkFailed: "Check failed.",
        noModel: "Could not determine upstream model.",
        unknownError: "Unknown error",
        compatibleTitle: "Compatible Architecture",
        incompatibleTitle: "Incompatible Architecture",
        compatibleDesc: "<strong>Compatible Architecture</strong>\nDetected: {arch}\nThis LoRA should work correctly.",
        incompatibleDesc: "<strong>Incompatible Architecture</strong>\n{message}",
    },
    fullPath: "<strong>Full Path:</strong>\n{path}",
    forceRefreshTooltip: "<strong>Force Refresh Analysis</strong>\nRe-scans the file structure and recalculates weight statistics.\nUse this if the analysis data seems incorrect or outdated.",
    resetParamsTooltip: "Reset all parameters to default",
    scanningTensorStructure: "Scanning Tensor Structure...",
    gridSnapping: "Snap to Grid",
    blockWeights: "Block Weights",
    resampleCurve: "Resample Curve",
    sliders: {
        model: "Model Strength",
        clip: "CLIP Strength",
        target: "Target Points",
    },
    canvas: {
        tooltip: {
            keyframe: "Keyframe: %s",
            model: "Model: %s",
            clip: "CLIP: %s",
            progress: "Progress: %s%",
        },
    },
    clearCacheBtn: "Clear Metadata Cache",
    cacheCleared: "Cache Cleared",
    undoTitle: "Undo (Ctrl+Z)",
    redoTitle: "Redo (Ctrl+Y)",
    historyTitle: "History",
    reportBug: "Report a Bug",
    fit: "Fit",
    discard: "Discard",
    save: "Save",
    close: "Close",
    statusHelp: "Drag to Pan | Double-Click to Add Point | <b>Shift</b> toggles snap",
    statusBrand: "MAD Nodes",
    pickerSearchPlaceholder: "Search LoRAs...",
    blockEditor: {
        title: "Block Weight Editor",
        subtitle: "%s",
        presetLabel: "Semantic Strategy",
        presetShortLabels: {
            LINEAR: "Linear",
            STYLE_FOCUSED: "Style",
            BALANCED: "Balanced",
            HEAVY_STYLE: "Heavy",
            REALISM: "Realism",
        },
        reset: "Reset All",
        clear: "Zero All (0.0)",
        presets: "Presets",
        custom: "Custom Configuration",
        clipMaster: "Master",
        cancel: "Cancel",
        apply: "Apply",
        scanning: "Scanning blocks...",
        manageVectors: "Block Weights",
        vectorsActive: "Active",
        vectorsDefault: "Default",
        blocksModified: "{count} / {total} blocks active",
        modifiedBlocks: "Modified blocks: {count} / {total}",
        globalActive: "Active Blocks: {count} / {total}",
        groupCount: "{name} <span class='mad-group-counter-inner'>— {count} blocks</span>",
        masterGroup: "Group Master",
        masterGroupDesc: "Controlling {count} blocks",
        synced: "Synced",
        split: "Split",
        syncedTooltip: "<strong>Synced Mode</strong>\nOne slider controls all CLIP blocks.",
        splitTooltip: "<strong>Split Mode</strong>\nControl CLIP blocks individually.",
        setZeroTooltip: "Set all blocks to 0.0 (Disable)",
        setOneTooltip: "Reset all blocks to 1.0 (Default)",
        expandAll: "Expand All",
        collapseAll: "Collapse All",
        strategyTooltip: "<strong>Semantic Strategy</strong>\nPresets boost or balance specific aspects (Pose, Style, etc.).\n\n<span class='mad-text-italic-muted'>Note: Presets cannot create features not present in the training data. They only emphasize existing weights.</span>",
        metadataMissing: "Metadata Missing",
        metadataMissingMsg: "Block metadata is unavailable. Please re-scan the LoRA to enable the editor.",
        distributionMap: "Weight Distribution Map",
        legendStruct: "Structure",
        legendConcept: "Concept",
        legendStyle: "Style",
        legendDetail: "Detail",
    },
    blockTooltips: {
        blockInfo: "<strong>Distribution</strong>\nWeight concentration in this block: {ratio}%",
        blockControl: "<strong>{key}</strong>\nMultiplier relative to the weight concentration (VALUE × {ratio}%)",
        archDescriptions: {
            FLUX: {
                pose: "Double Blocks (0-10)\nStructure & Composition",
                identity: "Double Blocks (11+)\nSubject Likeness",
                style: "Single Blocks (0-20)\nArtistic Flow",
                details: "Single Blocks (21+)\nFine Texture",
            },
            SD15: {
                pose: "Input (0-8)\nCoarse Structure",
                identity: "Input(9+) / Mid / Output(0-2)\nMain Subject",
                style: "Output (3-8)\nLighting & Style",
                details: "Output (9+)\nPixel Details",
            },
            SD3: {
                pose: "Joint Blocks (Early)\nSpatial Structure",
                identity: "Joint Blocks (Mid)\nSubject Features",
                style: "Joint Blocks (Late)\nArtistic Rendering",
                details: "Joint Blocks (Final)\nOutput Refinement",
            },
            LINEAR: {
                pose: "Layers (0-30%)\nEarly Processing",
                identity: "Layers (30-60%)\nMiddle Processing",
                style: "Layers (60-80%)\nLate Processing",
                details: "Layers (80-100%)\nFinal Refinement",
            },
            SDXL: {
                pose: "Input Blocks\nComposition & Structure",
                identity: "Middle & Output(0-2)\nEntity & Concept",
                style: "Output Blocks (3-5)\nLighting & Art Style",
                details: "Output Blocks (6-8)\nTexture & Details",
            },
            DEFAULT: "Controls specific block weights.",
        },
    },
    profileManager: {
        label: "Active Profile",
        newProfile: "New Profile",
        dupProfile: "Duplicate Profile",
        rename: "Rename Profile",
        delete: "Delete Profile",
        newPlaceholder: "Enter profile name...",
        defaultNameTemplate: "Profile %s",
        importedDefault: "Imported",
        confirmDelete: "Delete profile '{name}'?",
        errorExists: "A profile with this name already exists.",
        errorLast: "Cannot delete the last profile.",
        dialogTitleNew: "Create New Profile",
        dialogTitleDup: "Duplicate Profile",
        dialogTitleRen: "Rename Profile",
    },
    currentModel: "Current Model",
    swap: "Swap File",
    disabledOverlay: {
        message: "This LoRA is currently <strong>disabled</strong>.<br>Enable it to edit settings.",
        enableBtn: "Enable LoRA",
    },
    nodeTitle: "Multi Scheduled LoRA Loader",
    error: {
        fetchFailed: "Error: Could not fetch LoRA list",
    },
    validation: {
        nameEmpty: "Name cannot be empty.",
    },
    tooltips: {
        enable: "Enable",
        disable: "Disable",
        remove: "Remove",
    },
    stats: {
        combinedPeakStrengths: "Combined Peak Strengths",
        modelLabel: "Model:",
        clipLabel: "CLIP*:",
        min: "Min",
        max: "Max",
        note: "*Requires schedule_clip=True downstream",
    },
    fallbackBlockGroups: {
        clip: "Text Encoder / CLIP",
        input: "Structure / Input",
        middle: "Concept / Middle",
        output: "Style / Output",
        layers: "Transformer Layers",
        aux: "Embeddings / Aux",
    },
    confirm: {
        importDetectedTitle: "Import Detected",
        importDetectedMsg: "Import external schedule?",
        clearAllTitle: "Clear All?",
        clearAllMsg: "Remove ALL LoRAs from the schedule?",
        discardTitle: "Discard Changes?",
        discardMsg: "Revert all changes?",
        removeLoraTitle: "Remove LoRA?",
        removeLoraMsg: "Remove this LoRA schedule?",
        clearCacheTitle: "Clear Global Metadata Cache?",
        clearCacheMsg: "Are you sure you want to delete all cached data? This affects both the browser cache and the server-side Python cache.",
        wipeDataTitle: "Irreversible Action:",
        wipeDataMsg: "This will wipe all analyzed data (Architecture, Weights, Compatibility) from memory. All LoRAs will be re-scanned.",
        wipeConfirmBtn: "Yes, Clear Everything",
        cancel: "Cancel",
        confirm: "Confirm",
        buttons: {
            importNew: "Import as New Profile",
            clear: "Clear All",
            discard: "Discard",
            remove: "Remove",
            reset: "Reset",
            delete: "Delete",
        },
    },
};

export const KEYFRAME_TOOLTIPS = {
    linear: "Linear Interpolation",
    ease: "Ease In/Out (Sine)",
    cubic: "Cubic Bezier",
    step: "Step Function",
};

export const BADGE_CONFIG = [
    { key: "ZIMAGETURBO", code: "ZIT", color: "#7e57c2" },
    { key: "LUMINA", code: "L", color: "#5c6bc0" },
    { key: "HIDREAM", code: "HID", color: "#42a5f5" },
    { key: "CHROMA", code: "CHR", color: "#26c6da" },
    { key: "QWEN", code: "QWEN", color: "#5c47d2" },
    { key: "AURA", code: "AURA", color: "#ff7043" },
    { key: "HYVID", code: "HY", color: "#8d6e63" },
    { key: "FLUX", code: "FLUX", color: "#26a69a" },
    { key: "PONY", code: "PONY", color: "#ab47bc" },
    { key: "NOOB", code: "NAI", color: "#e91e63" },
    { key: "ILLUSTRIOUS", code: "IL", color: "#29b6f6" },
    { key: "REALISM", code: "REAL", color: "#66bb6a" },
    { key: "REALVIS", code: "REAL", color: "#66bb6a" },
    { key: "SDXL", code: "XL", color: "#ada9bb" },
    { key: "SD3", code: "SD3", color: "#ec407a" },
    { key: "SD1", code: "SD1", color: "#ffca28" },
    { key: "1.5", code: "SD1", color: "#ffca28" },
    { key: "SD2", code: "SD2", color: "#ffa726" },
    { key: "2.1", code: "SD2", color: "#ffa726" },
];
