import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

/*
 * ============================================================================
 * STYLES INJECTION
 * ============================================================================
 */
const MAD_STYLES = `
    .mad-overlay {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.85); z-index: 10000;
        display: flex; justify-content: center; align-items: center;
        font-family: "Segoe UI", Roboto, Helvetica, sans-serif;
        backdrop-filter: blur(4px);
        opacity: 0; transition: opacity 0.2s ease;
    }
    .mad-overlay.visible { opacity: 1; }

    .mad-modal {
        position: relative;
        background: #1e1e1e; border: 1px solid #333; border-radius: 6px;
        height: 85vh; width: calc(85vh + 350px);
        min-width: 850px; min-height: 550px;
        display: flex; overflow: hidden; 
        box-shadow: 0 30px 60px rgba(0,0,0,0.8);
        resize: both;
        opacity: 0;
        transform: scale(0.98) translateY(10px);
        transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .mad-modal.visible { opacity: 1; transform: scale(1) translateY(0); }

    .mad-sidebar {
        width: 300px; background: #252525; border-right: 1px solid #333; 
        display: flex; flex-direction: column; padding: 12px; gap: 10px; 
        overflow-y: auto; flex-shrink: 0;
    }
    .mad-panel {
        background: #1a1a1a; padding: 8px; border-radius: 4px; border: 1px solid #333; margin-bottom: 5px;
    }
    .mad-settings-panel {
        border-top: 1px solid #333; padding-top: 10px; margin-top: auto; 
        display: none; flex-direction: column; gap: 8px;
    }
    .mad-title { margin: 0 0 10px 0; color: #eee; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }

    .mad-content { flex: 1; display: flex; flex-direction: column; min-width: 0; background: #111; }
    
    .mad-header {
        height: 44px; background: #2a2a2a; border-bottom: 1px solid #333;
        display: flex; justify-content: space-between; align-items: center;
        padding: 0 15px; flex-shrink: 0;
    }
    .mad-header-group { display: flex; gap: 8px; align-items: center; }

    .mad-canvas-wrap { flex: 1; position: relative; overflow: hidden; cursor: crosshair; }
    .mad-canvas { display: block; width: 100%; height: 100%; outline: none; }

    .mad-status-bar {
        height: 24px; background: #1a1a1a; border-top: 1px solid #333;
        display: flex; justify-content: space-between; align-items: center;
        padding: 0 10px; font-size: 11px; color: #666; flex-shrink: 0;
    }

    .mad-row { display: flex; align-items: center; justify-content: space-between; }
    .mad-row-mb { margin-bottom: 5px; }
    .mad-label { color: #ccc; font-size: 12px; display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; }
    .mad-label-sm { color: #999; font-size: 11px; }
    .mad-input { background: #111; color: #ddd; border: 1px solid #444; padding-top: 4px; padding-bottom: 4px; border-radius: 3px; font-size: 12px; text-align: center; }
    .mad-input:focus { border-color: #2196F3; outline: none; }
    .mad-input-num { width: 50px; }
    .mad-input-select { width: 100%; cursor: pointer; }
    .mad-input:disabled { color: #999; }

    .mad-btn { 
        padding: 5px 12px; border-radius: 3px; cursor: pointer; border: none; 
        color: #ddd; transition: all 0.15s; font-size: 12px; font-weight: 500;
        display: inline-flex; align-items: center; justify-content: center; gap: 6px;
        background: #383838; border: 1px solid #4a4a4a;
    }
    .mad-btn:hover { background: #454545; color: #fff; border-color: #555; }
    .mad-btn:active { transform: translateY(1px); }
    .mad-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
    
    .mad-btn-primary { background: #2196F3; border-color: #1976D2; color: white; }
    .mad-btn-primary:hover { background: #42A5F5; border-color: #2196F3; }
    
    .mad-btn-danger { background: #d32f2f; border-color: #b71c1c; color: white; }
    .mad-btn-danger:hover { background: #e53935; border-color: #c62828; }

    .mad-btn-icon { padding: 5px; width: 32px; height: 30px; }
    .mad-btn-add { background: #2e7d32; border-color: #1b5e20; width: 100%; margin-bottom: 5px; padding: 8px; }
    .mad-btn-add:hover { background: #388e3c; }

    .mad-btn-reset { width: 100%; font-size: 11px; padding: 4px; background: transparent; border: 1px solid #444; color: #888; }
    .mad-btn-reset:hover { border-color: #d32f2f; color: #d32f2f; background: rgba(211, 47, 47, 0.1); }

    .mad-list-container { flex: 1; display: flex; flex-direction: column; gap: 4px; overflow-y: auto; min-height: 100px; padding-right: 2px; }
    .mad-list-item {
        padding: 6px 8px; background: #2a2a2a; border-radius: 3px; cursor: pointer; 
        display: flex; align-items: center; gap: 8px;
        transition: background 0.1s; border-left: 3px solid transparent;
        user-select: none;
    }
    .mad-list-item:hover { background: #333; }
    .mad-list-item.active { background: #383838; }
    .mad-list-item.disabled { opacity: 0.5; }
    
    .mad-list-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #ddd; font-size: 12px; }
    
    .mad-icon-btn { color: #666; font-size: 14px; padding: 2px; transition: color 0.2s; display: flex; align-items: center; }
    .mad-icon-btn:hover { color: #fff; }
    .mad-icon-del:hover { color: #ff5252; }

    .mad-history-popover {
        position: absolute; top: 40px; left: inherit; width: 220px; max-height: 300px; margin: 10px 8px;
        background: #252525; border: 1px solid #444; border-radius: 4px;
        display: none; flex-direction: column; overflow-y: auto; z-index: 200;
        box-shadow: 0 10px 20px rgba(0,0,0,0.5);
    }
    .mad-history-popover.visible { display: flex; }
    .mad-history-item { padding: 8px 12px; border-bottom: 1px solid #333; cursor: pointer; color: #aaa; font-size: 11px; display: flex; justify-content: space-between; }
    .mad-history-item:hover { background: #333; color: #fff; }
    .mad-history-item.current { background: #1976D2; color: #fff; }

    .mad-stats { margin-top: 10px; padding: 8px; background: #151515; border: 1px solid #333; border-radius: 4px; flex-shrink: 0; }
    .mad-kf-control { margin-top: 8px; padding-top: 8px; border-top: 1px dashed #333; display: flex; flex-direction: column; gap: 6px; }
    .mad-kf-row { display: flex; gap: 5px; }

    .mad-confirm-box {
        width: 380px; height: auto; min-height: auto; min-width: auto;
        padding: 20px; display: flex; flex-direction: column; gap: 15px;
        transform: scale(0.95); transition: transform 0.2s; background: #252525;
    }
    .mad-confirm-box.visible { transform: scale(1); }
`;

if (!document.getElementById('mad-nodes-css')) {
    const style = document.createElement('style');
    style.id = 'mad-nodes-css';
    style.innerHTML = MAD_STYLES;
    document.head.appendChild(style);
}

const LORA_COLORS = [
    "#9e9e9e", "#8d6e63", "#66bb6a", "#d4e157", "#7e57c2",
    "#3f51b5", "#26a69a", "#ab47bc", "#ef5350", "#ffa726",
    "#ffca28", "#9ccc65", "#5c6bc0", "#29b6f6", "#26c6da",
    "#42a5f5", "#5c6bc0", "#ff7043", "#ec407a", "#78909c"
];

const ICONS = {
    undo: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/></svg>`,
    redo: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7"/></svg>`,
    history: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    fit: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`,
    eye: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
    eyeOff: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
    trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
    check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
};

function areConfigsEqual(internal, imported) {
    if (!internal || !imported) return false;
    if (internal.length !== imported.length) return false;

    const cleanName = (name) => {
        if (!name) return "";
        return name.split(/[/\\]/).pop().replace(/\.[^/.]+$/, "").trim();
    };

    const isClose = (a, b) => Math.abs(a - b) < 0.0001;

    const isItemEqual = (a, b) => {
        if (cleanName(a.lora_name) !== cleanName(b.lora_name)) return false;
        if (a.enabled !== b.enabled) return false;
        if (!isClose(a.strength_model ?? 1.0, b.strength_model ?? 1.0)) return false;
        if (!isClose(a.strength_clip ?? 1.0, b.strength_clip ?? 1.0)) return false;
        if (!a.points || !b.points || a.points.length !== b.points.length) return false;

        for (let j = 0; j < a.points.length; j++) {
            if (!isClose(a.points[j].x, b.points[j].x)) return false;
            if (!isClose(a.points[j].y, b.points[j].y)) return false;
        }
        return true;
    };

    let availableMatches = [...imported];
    for (const internalItem of internal) {
        const matchIndex = availableMatches.findIndex(importedItem => isItemEqual(internalItem, importedItem));
        if (matchIndex === -1) return false;
        availableMatches.splice(matchIndex, 1);
    }
    return true;
}

function showCustomConfirm(title, message, onConfirm, onCancel = null, confirmText = "Confirm", confirmColor = "#2196F3") {
    const overlay = document.createElement("div");
    overlay.className = "mad-overlay";
    overlay.dataset.madConfirm = "true";

    const box = document.createElement("div");
    box.className = "mad-modal mad-confirm-box";

    box.innerHTML = `
        <h3 style="margin: 0; color: #fff; font-size: 16px;">${title}</h3>
        <p style="margin: 0; color: #ccc; font-size: 13px; line-height: 1.5;">${message}</p>
        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;">
            <button class="mad-btn">Cancel</button>
            <button class="mad-btn" style="background: ${confirmColor}; border-color: ${confirmColor}; color: white;">${confirmText}</button>
        </div>
    `;

    const handleKey = (e) => {
        if (e.key === "Escape") {
            e.stopPropagation();
            e.preventDefault();
            close();
            if (onCancel) onCancel();
        }
    };

    const close = () => {
        overlay.classList.remove("visible");
        box.classList.remove("visible");
        setTimeout(() => {
            if (document.body.contains(overlay)) document.body.removeChild(overlay);
        }, 200);

        document.removeEventListener("keydown", handleKey, { capture: true });
    };

    document.addEventListener("keydown", handleKey, { capture: true });

    const btns = box.querySelectorAll("button");
    btns[0].onclick = () => { close(); if (onCancel) onCancel(); };
    btns[1].onclick = () => { close(); onConfirm(); };

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
        overlay.classList.add("visible");
        box.classList.add("visible");
    });
}

function getWidget(node, name) { return node.widgets.find((w) => w.name === name); }
function setWidgetValue(node, name, value) {
    const widget = getWidget(node, name);
    if (widget) {
        widget.value = value;
        if (widget.callback) widget.callback(value, app.canvas, node, node.pos, {});
    }
}

// --- Interpolation Functions ---
const Easing = {
    linear: (t) => t,
    easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    cubic: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    step: (t) => t < 0.99 ? 0 : 1
};

function lerp(a, b, t) { return a * (1 - t) + b * t; }

function parseScheduleString(input) {
    if (!input || typeof input !== 'string') return [];
    input = input.trim();
    if (input === "") return [];

    if (input.startsWith("[")) {
        try { return JSON.parse(input); } catch (e) { console.warn("JSON parse failed"); }
    }

    const loraList = [];
    const lines = input.split("\n");

    for (let line of lines) {
        line = line.trim();
        if (!line.startsWith("<lora:") || !line.endsWith(">")) continue;

        const content = line.substring(6, line.length - 1);
        const parts = content.split(":");

        if (parts.length < 3) continue;

        const item = {
            lora_name: parts[0],
            strength_model: parseFloat(parts[1] || 1.0),
            strength_clip: parseFloat(parts[2] || 1.0),
            points: [],
            color: LORA_COLORS[loraList.length % LORA_COLORS.length],
            enabled: true
        };

        if (parts.length === 4) {
            const pairs = parts[3].split(";");
            for (let pair of pairs) {
                if (pair.includes(",")) {
                    const [px, py] = pair.split(",");
                    item.points.push({ x: parseFloat(px), y: parseFloat(py) });
                }
            }
        }
        else if (parts.length >= 9) {
            const [s_start, s_end, p_start, p_end, count] = [parseFloat(parts[3]), parseFloat(parts[4]), parseFloat(parts[6]), parseFloat(parts[7]), parseInt(parts[8])];
            for (let i = 0; i < count; i++) {
                const t = count > 1 ? i / (count - 1) : 0.0;
                item.points.push({
                    x: parseFloat((p_start + (p_end - p_start) * t).toFixed(4)),
                    y: parseFloat((s_start + (s_end - s_start) * t).toFixed(4))
                });
            }
        }

        item.points.sort((a, b) => a.x - b.x);
        if (item.points.length === 0) {
            item.points.push({ x: 0.0, y: 1.0 });
            item.points.push({ x: 1.0, y: 1.0 });
        }

        loraList.push(item);
    }
    return loraList;
}

/*
 * ============================================================================
 * MAIN EDITOR CLASS
 * ============================================================================
 */

class MultiCurveEditorDialog {
    constructor(node, currentConfig, importConfig, onUpdate) {
        this.node = node;

        const sanitize = (list) => list.map(i => ({ ...i, enabled: i.enabled !== undefined ? i.enabled : true }));

        this.config = JSON.parse(JSON.stringify(sanitize(currentConfig || [])));
        this.initialConfig = JSON.parse(JSON.stringify(sanitize(currentConfig || [])));
        this.importConfig = importConfig ? JSON.parse(JSON.stringify(sanitize(importConfig))) : null;
        this.onUpdate = onUpdate;

        this.history = [];
        this.historyStep = -1;

        this.activeLoraIndex = this.config.length > 0 ? 0 : -1;
        this.availableLoras = [];

        this.isModalOpen = false;
        this.isDraggingPoint = false;
        this.isPanning = false;
        this.selectedPoint = null;
        this.hoveredPoint = null;
        this.lastMousePos = { x: 0, y: 0 };

        this.snapEnabled = true;
        this.snapInterval = 0.05;
        this.transform = { x: 60, y: 60, k: 300 };

        this.init();
    }

    pushState(actionName = "Change") {
        if (this.historyStep < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyStep + 1);
        }

        const state = {
            config: JSON.parse(JSON.stringify(this.config)),
            activeLoraIndex: this.activeLoraIndex,
            timestamp: new Date(),
            action: actionName
        };

        this.history.push(state);
        this.historyStep++;

        if (this.history.length > 50) {
            this.history.shift();
            this.historyStep--;
        }

        this.updateHistoryUI();
    }

    undo() {
        if (this.historyStep > 0) {
            this.historyStep--;
            this.restoreState(this.history[this.historyStep]);
        }
    }

    redo() {
        if (this.historyStep < this.history.length - 1) {
            this.historyStep++;
            this.restoreState(this.history[this.historyStep]);
        }
    }

    restoreState(state) {
        this.config = JSON.parse(JSON.stringify(state.config));
        this.activeLoraIndex = state.activeLoraIndex;

        if (this.activeLoraIndex >= this.config.length) {
            this.activeLoraIndex = this.config.length - 1;
        }

        this.updateSidebar();
        this.draw();
        this.updateButtonStates();
        this.updateHistoryUI();
    }

    jumpToHistory(index) {
        if (index >= 0 && index < this.history.length) {
            this.historyStep = index;
            this.restoreState(this.history[index]);
        }
    }

    resolveLoraName(inputName) {
        if (!inputName) return "";
        if (this.availableLoras.includes(inputName)) return inputName;
        const cleanInput = inputName.split(/[/\\]/).pop().replace(/\.[^/.]+$/, "");
        const match = this.availableLoras.find(avail => avail.split(/[/\\]/).pop().replace(/\.[^/.]+$/, "") === cleanInput);
        return match || inputName;
    }

    async init() {
        try {
            const response = await api.fetchApi("/object_info/LoraLoader");
            const data = await response.json();
            if (data?.LoraLoader?.input?.required?.lora_name?.[0]) {
                this.availableLoras = data.LoraLoader.input.required.lora_name[0];
            }
        } catch (e) {
            console.error("Failed to fetch LoRAs:", e);
            this.availableLoras = ["Error: Could not fetch LoRA list"];
        }

        this.createDialog();
        this.setupCanvas();
        this.updateSidebar();

        this.pushState("Initial State");

        setTimeout(() => this.fitView(), 50);

        if (this.importConfig && this.importConfig.length > 0) {
            this.importConfig.forEach(item => item.lora_name = this.resolveLoraName(item.lora_name));

            if (!areConfigsEqual(this.config, this.importConfig)) {
                setTimeout(() => {
                    showCustomConfirm(
                        "Import Detected",
                        "An input string connection was detected.\n\nDo you want to IMPORT it and OVERWRITE your current internal schedule?",
                        () => {

                            this.config = this.importConfig;

                            this.activeLoraIndex = this.config.length > 0 ? 0 : -1;
                            this.pushState("Import External");
                            this.updateSidebar();
                            this.draw();
                            this.updateButtonStates();
                        },
                        () => {

                            this.updateButtonStates();
                        },
                        "Import & Overwrite",
                        "#2196F3"
                    );
                }, 300);
            } else {
                this.updateButtonStates();
            }
        } else {
            this.updateButtonStates();
        }
    }

    createDialog() {
        this.overlay = document.createElement("div");
        this.overlay.className = "mad-overlay";

        this.mouseDownOnOverlay = false;
        this.overlay.onmousedown = (e) => { this.mouseDownOnOverlay = (e.target === this.overlay); };
        this.overlay.onclick = (e) => {
            if (e.target === this.overlay && this.mouseDownOnOverlay) this.close();
            this.mouseDownOnOverlay = false;
        };

        this.boundHandleKeyDown = (e) => {
            if (!this.isModalOpen) return;

            if (document.querySelector('.mad-overlay[data-mad-confirm="true"]')) return;

            if (e.key === "Escape") this.close();

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) this.redo();
                else this.undo();
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                this.redo();
            }
        };
        document.addEventListener("keydown", this.boundHandleKeyDown);

        this.dialog = document.createElement("div");
        this.dialog.className = "mad-modal";

        this.sidebar = document.createElement("div");
        this.sidebar.className = "mad-sidebar";

        const title = document.createElement("h3");
        title.textContent = "Multi-LoRA Scheduler";
        title.className = "mad-title";
        this.sidebar.appendChild(title);

        const globalSettings = document.createElement("div");
        globalSettings.className = "mad-panel";

        const snapRow = document.createElement("div");
        snapRow.className = "mad-row mad-row-mb";

        const snapLabel = document.createElement("label");
        snapLabel.className = "mad-label";
        const snapCheck = document.createElement("input");
        snapCheck.type = "checkbox";
        snapCheck.checked = this.snapEnabled;
        snapCheck.onchange = (e) => { this.snapEnabled = e.target.checked; this.draw(); };
        snapLabel.appendChild(snapCheck);
        snapLabel.appendChild(document.createTextNode("Enable Grid Snapping"));
        snapRow.appendChild(snapLabel);
        globalSettings.appendChild(snapRow);

        const intervalRow = document.createElement("div");
        intervalRow.className = "mad-row";
        const intLabel = document.createElement("span");
        intLabel.className = "mad-label-sm";
        intLabel.textContent = "Snap Interval:";

        const intInput = document.createElement("input");
        intInput.type = "number";
        intInput.step = "0.01";
        intInput.min = "0.01";
        intInput.value = this.snapInterval;
        intInput.className = "mad-input mad-input-num";
        intInput.onchange = (e) => {
            let val = parseFloat(e.target.value);
            if (isNaN(val) || val <= 0) val = 0.05;
            this.snapInterval = val;
            this.draw();
        };

        intervalRow.appendChild(intLabel);
        intervalRow.appendChild(intInput);
        globalSettings.appendChild(intervalRow);
        this.sidebar.appendChild(globalSettings);

        const addBtn = document.createElement("button");
        addBtn.textContent = "+ Add LoRA";
        addBtn.className = "mad-btn mad-btn-add";
        addBtn.onclick = () => this.addLora();
        this.sidebar.appendChild(addBtn);

        this.btnReset = document.createElement("button");
        this.btnReset.textContent = "Reset All";
        this.btnReset.className = "mad-btn mad-btn-reset";
        this.btnReset.onclick = () => {
            showCustomConfirm(
                "Reset All?",
                "This will remove ALL LoRAs from the schedule.",
                () => {
                    this.config = [];
                    this.activeLoraIndex = -1;
                    this.pushState("Reset All");
                    this.updateSidebar();
                    this.draw();
                    this.updateButtonStates();
                },
                null, "Reset All", "#d32f2f"
            );
        };
        this.sidebar.appendChild(this.btnReset);

        this.listContainer = document.createElement("div");
        this.listContainer.className = "mad-list-container";
        this.sidebar.appendChild(this.listContainer);

        this.settingsPanel = document.createElement("div");
        this.settingsPanel.className = "mad-settings-panel";
        this.sidebar.appendChild(this.settingsPanel);

        this.statsPanel = document.createElement("div");
        this.statsPanel.className = "mad-stats";
        this.statsContainer = document.createElement("div");
        this.statsPanel.appendChild(this.statsContainer);
        this.sidebar.appendChild(this.statsPanel);

        const contentArea = document.createElement("div");
        contentArea.className = "mad-content";

        const header = document.createElement("div");
        header.className = "mad-header";

        const leftGroup = document.createElement("div");
        leftGroup.className = "mad-header-group";

        this.btnUndo = document.createElement("button");
        this.btnUndo.innerHTML = ICONS.undo;
        this.btnUndo.className = "mad-btn mad-btn-icon";
        this.btnUndo.title = "Undo (Ctrl+Z)";
        this.btnUndo.onclick = () => this.undo();

        this.btnRedo = document.createElement("button");
        this.btnRedo.innerHTML = ICONS.redo;
        this.btnRedo.className = "mad-btn mad-btn-icon";
        this.btnRedo.title = "Redo (Ctrl+Y)";
        this.btnRedo.onclick = () => this.redo();

        this.btnHistory = document.createElement("button");
        this.btnHistory.innerHTML = ICONS.history;
        this.btnHistory.className = "mad-btn mad-btn-icon";
        this.btnHistory.title = "History";
        this.btnHistory.style.position = "relative";
        this.btnHistory.onclick = (e) => {
            e.stopPropagation();
            this.historyPopover.classList.toggle("visible");
        };

        this.historyPopover = document.createElement("div");
        this.historyPopover.className = "mad-history-popover";
        window.addEventListener("click", (e) => {
            if (!this.btnHistory.contains(e.target) && !this.historyPopover.contains(e.target)) {
                this.historyPopover.classList.remove("visible");
            }
        });

        contentArea.appendChild(this.historyPopover);

        leftGroup.appendChild(this.btnUndo);
        leftGroup.appendChild(this.btnRedo);
        leftGroup.appendChild(this.btnHistory);

        const rightGroup = document.createElement("div");
        rightGroup.className = "mad-header-group";

        const fitBtn = document.createElement("button");
        fitBtn.innerHTML = ICONS.fit + `<span style="margin-left:4px">Fit</span>`;
        fitBtn.className = "mad-btn";
        fitBtn.onclick = () => this.fitView();

        this.btnCancel = document.createElement("button");
        this.btnCancel.textContent = "Discard";
        this.btnCancel.className = "mad-btn mad-btn-danger";
        this.btnCancel.onclick = () => {
            showCustomConfirm(
                "Discard Changes?",
                "This will revert all changes made in this session.",
                () => {
                    this.config = JSON.parse(JSON.stringify(this.initialConfig));
                    this.activeLoraIndex = this.config.length > 0 ? 0 : -1;
                    this.pushState("Discard Changes");
                    this.updateSidebar();
                    this.draw();
                    this.updateButtonStates();
                },
                null, "Discard", "#d32f2f"
            );
        };

        this.btnSave = document.createElement("button");
        this.btnSave.innerHTML = ICONS.check + `<span style="margin-left:4px">Save</span>`;
        this.btnSave.className = "mad-btn mad-btn-primary";
        this.btnSave.onclick = () => this.apply();

        rightGroup.appendChild(fitBtn);
        rightGroup.appendChild(this.btnCancel);
        rightGroup.appendChild(this.btnSave);

        header.appendChild(leftGroup);
        header.appendChild(rightGroup);

        this.canvasContainer = document.createElement("div");
        this.canvasContainer.className = "mad-canvas-wrap";

        this.canvas = document.createElement("canvas");
        this.canvas.className = "mad-canvas";
        this.canvasContainer.appendChild(this.canvas);

        const statusBar = document.createElement("div");
        statusBar.className = "mad-status-bar";
        statusBar.innerHTML = `
            <span>Drag to Pan | Double-Click to Add Point | <b>Shift</b> toggles snap</span>
            <span style="opacity:0.6">MAD Nodes</span>
        `;

        contentArea.appendChild(header);
        contentArea.appendChild(this.canvasContainer);
        contentArea.appendChild(statusBar);

        this.dialog.appendChild(this.sidebar);
        this.dialog.appendChild(contentArea);
        this.overlay.appendChild(this.dialog);
        document.body.appendChild(this.overlay);

        requestAnimationFrame(() => {
            this.overlay.classList.add("visible");
            this.dialog.classList.add("visible");
            this.isModalOpen = true;
        });
    }

    updateHistoryUI() {
        if (!this.btnUndo || !this.btnRedo) return;

        this.btnUndo.disabled = this.historyStep <= 0;
        this.btnRedo.disabled = this.historyStep >= this.history.length - 1;

        if (this.historyPopover) {
            this.historyPopover.innerHTML = "";
            [...this.history].reverse().forEach((state, reverseIndex) => {
                const realIndex = this.history.length - 1 - reverseIndex;
                const item = document.createElement("div");
                item.className = `mad-history-item ${realIndex === this.historyStep ? 'current' : ''}`;

                const timeStr = state.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                item.innerHTML = `<span>${state.action}</span><span style="opacity:0.5; font-size:10px">${timeStr}</span>`;
                item.onclick = () => {
                    this.jumpToHistory(realIndex);
                    this.historyPopover.classList.remove("visible");
                };
                this.historyPopover.appendChild(item);
            });
        }
    }

    setupCanvas() {
        this.ctx = this.canvas.getContext("2d");

        this.boundOnMouseDown = this.onMouseDown.bind(this);
        this.boundOnMouseMove = this.onMouseMove.bind(this);
        this.boundOnMouseUp = this.onMouseUp.bind(this);
        this.boundOnMouseWheel = this.onMouseWheel.bind(this);

        this.canvas.addEventListener("mousedown", this.boundOnMouseDown);
        window.addEventListener("mousemove", this.boundOnMouseMove);
        window.addEventListener("mouseup", this.boundOnMouseUp);
        this.canvas.addEventListener("wheel", this.boundOnMouseWheel);
        this.canvas.addEventListener("contextmenu", e => e.preventDefault());

        this.canvas.addEventListener("dblclick", (e) => {
            if (this.activeLoraIndex === -1) return;
            const activeConfig = this.config[this.activeLoraIndex];
            if (!activeConfig.enabled) return;

            const rect = this.canvas.getBoundingClientRect();
            const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            const world = this.screenToWorld(pos.x, pos.y);

            if (world.x < 0 || world.x > 1) return;

            const activePoints = activeConfig.points;
            const newPoint = {
                x: parseFloat(Math.max(0, Math.min(1, world.x)).toFixed(4)),
                y: parseFloat(world.y.toFixed(4))
            };

            activePoints.push(newPoint);
            activePoints.sort((a, b) => a.x - b.x);

            this.pushState("Add Keyframe");
            this.draw();
            this.updateButtonStates();
        });

        this.resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                this.canvas.width = width;
                this.canvas.height = height;
                this.draw();
            }
        });
        this.resizeObserver.observe(this.canvasContainer);
    }

    addLora() {
        const usedColors = new Set(this.config.map(c => c.color));
        let color = LORA_COLORS.find(c => !usedColors.has(c));
        if (!color) color = LORA_COLORS[this.config.length % LORA_COLORS.length];

        const newLora = {
            lora_name: this.availableLoras[0] || "",
            strength_model: 1.0,
            strength_clip: 1.0,
            color: color,
            enabled: true,
            points: [{ x: 0, y: 0 }, { x: 1, y: 1 }]
        };
        this.config.push(newLora);
        this.activeLoraIndex = this.config.length - 1;

        this.pushState("Add LoRA");
        this.updateSidebar();
        this.draw();
        this.updateButtonStates();
    }

    removeLora(index, e) {
        e.stopPropagation();
        showCustomConfirm(
            "Remove LoRA?",
            "Are you sure you want to remove this LoRA schedule?",
            () => {
                this.config.splice(index, 1);
                if (this.activeLoraIndex >= this.config.length) {
                    this.activeLoraIndex = this.config.length - 1;
                }
                this.pushState("Remove LoRA");
                this.updateSidebar();
                this.draw();
                this.updateButtonStates();
            },
            null, "Remove", "#d32f2f"
        );
    }

    toggleLora(index, e) {
        e.stopPropagation();
        this.config[index].enabled = !this.config[index].enabled;
        this.pushState(this.config[index].enabled ? "Enable LoRA" : "Disable LoRA");
        this.updateSidebar();
        this.draw();
        this.updateButtonStates();
    }

    setActive(index) {
        this.activeLoraIndex = index;
        this.updateSidebar();
        this.draw();
    }

    updateButtonStates() {
        if (!this.btnSave || !this.btnReset || !this.btnCancel) return;
        const hasChanges = !areConfigsEqual(this.config, this.initialConfig);
        const isEmpty = this.config.length === 0;

        this.btnReset.disabled = isEmpty;

        if (hasChanges) {
            this.btnSave.innerHTML = ICONS.check + `<span style="margin-left:4px">Save</span>`;
            this.btnCancel.disabled = false;
            this.btnCancel.style.display = "inline-flex";
        } else {
            this.btnSave.innerHTML = `<span style="margin:0 4px">Close</span>`;
            this.btnCancel.disabled = true;
            this.btnCancel.style.display = "none";
        }
    }

    updateSidebar() {
        this.listContainer.innerHTML = "";
        this.config.forEach((item, idx) => {
            const row = document.createElement("div");
            const isActive = idx === this.activeLoraIndex;
            const isEnabled = item.enabled !== false;

            row.className = `mad-list-item ${isActive ? 'active' : ''} ${!isEnabled ? 'disabled' : ''}`;
            row.style.borderLeftColor = item.color;

            const nameSpan = document.createElement("span");
            nameSpan.textContent = item.lora_name.split(/[/\\]/).pop() || "Select LoRA...";
            nameSpan.className = "mad-list-name";

            const toggleBtn = document.createElement("span");
            toggleBtn.innerHTML = isEnabled ? ICONS.eye : ICONS.eyeOff;
            toggleBtn.className = "mad-icon-btn";
            toggleBtn.title = isEnabled ? "Disable" : "Enable";
            toggleBtn.onclick = (e) => this.toggleLora(idx, e);

            const delBtn = document.createElement("span");
            delBtn.innerHTML = ICONS.trash;
            delBtn.className = "mad-icon-btn mad-icon-del";
            delBtn.title = "Remove";
            delBtn.onclick = (e) => this.removeLora(idx, e);

            row.onclick = () => this.setActive(idx);
            row.appendChild(nameSpan);
            row.appendChild(toggleBtn);
            row.appendChild(delBtn);
            this.listContainer.appendChild(row);
        });

        if (this.activeLoraIndex > -1) {
            this.settingsPanel.style.display = "flex";
            this.settingsPanel.innerHTML = "";
            const item = this.config[this.activeLoraIndex];

            const label = document.createElement("label");
            label.textContent = "LoRA Model:";
            label.className = "mad-label-sm";

            const select = document.createElement("select");
            select.className = "mad-input mad-input-select";
            select.disabled = !item.enabled;

            this.availableLoras.forEach(opt => {
                const option = document.createElement("option");
                option.value = opt;
                option.textContent = opt;
                if (opt === item.lora_name) option.selected = true;
                select.appendChild(option);
            });
            select.onchange = (e) => {
                item.lora_name = e.target.value;
                this.pushState("Change LoRA Model");
                this.updateSidebar();
                this.updateButtonStates();
            };

            const createFloatInput = (lbl, key) => {
                const wrap = document.createElement("div");
                wrap.className = "mad-row";
                const l = document.createElement("span");
                l.textContent = lbl;
                l.className = "mad-label-sm";
                const inp = document.createElement("input");
                inp.type = "number";
                inp.step = "0.1";
                inp.value = item[key];
                inp.className = "mad-input mad-input-num";
                inp.disabled = !item.enabled;
                inp.onchange = (e) => {
                    item[key] = parseFloat(e.target.value);
                    this.pushState(`Change ${key.replace('strength_', '')}`);
                    this.draw();
                    this.updateButtonStates();
                };
                wrap.appendChild(l);
                wrap.appendChild(inp);
                return wrap;
            };

            this.settingsPanel.appendChild(label);
            this.settingsPanel.appendChild(select);
            this.settingsPanel.appendChild(createFloatInput("Model Strength:", "strength_model"));
            this.settingsPanel.appendChild(createFloatInput("Clip Strength:", "strength_clip"));

            const keyframeControl = document.createElement("div");
            keyframeControl.className = "mad-kf-control";

            const kfLabel = document.createElement("span");
            kfLabel.textContent = "Resample Curve (Destructive)";
            kfLabel.className = "mad-label-sm";

            const kfRow = document.createElement("div");
            kfRow.className = "mad-kf-row";

            const kfInput = document.createElement("input");
            kfInput.type = "number";
            kfInput.min = "2";
            kfInput.value = "5";
            kfInput.className = "mad-input";
            kfInput.style.width = "40px";
            kfInput.disabled = !item.enabled;

            const modeSelect = document.createElement("select");
            modeSelect.className = "mad-input";
            modeSelect.style.flex = "1";
            modeSelect.disabled = !item.enabled;
            ["Linear", "Ease In/Out", "Cubic", "Step"].forEach(m => {
                const opt = document.createElement("option");
                opt.value = m;
                opt.textContent = m;
                modeSelect.appendChild(opt);
            });

            const kfBtn = document.createElement("button");
            kfBtn.textContent = "Apply";
            kfBtn.className = "mad-btn";
            kfBtn.disabled = !item.enabled;
            kfBtn.onclick = () => {
                const count = parseInt(kfInput.value) || 5;
                if (count < 2) return;

                const newPoints = [];
                const firstY = item.points[0].y;
                const lastY = item.points[item.points.length - 1].y;

                let easeFunc = Easing.linear;
                if (modeSelect.value === "Ease In/Out") easeFunc = Easing.easeInOutSine;
                else if (modeSelect.value === "Cubic") easeFunc = Easing.cubic;
                else if (modeSelect.value === "Step") easeFunc = Easing.step;

                for (let i = 0; i < count; i++) {
                    const t = i / (count - 1);
                    const easedT = easeFunc(t);
                    newPoints.push({
                        x: parseFloat(t.toFixed(4)),
                        y: parseFloat(lerp(firstY, lastY, easedT).toFixed(4))
                    });
                }
                item.points = newPoints;
                this.pushState(`Resample (${modeSelect.value})`);
                this.draw();
                this.updateButtonStates();
            };

            kfRow.appendChild(kfInput);
            kfRow.appendChild(modeSelect);
            kfRow.appendChild(kfBtn);

            keyframeControl.appendChild(kfLabel);
            keyframeControl.appendChild(kfRow);
            this.settingsPanel.appendChild(keyframeControl);
        } else {
            this.settingsPanel.style.display = "none";
        }
        this.updateStats();
    }

    getValueAtTime(points, t) {
        if (t <= points[0].x) return points[0].y;
        if (t >= points[points.length - 1].x) return points[points.length - 1].y;
        for (let i = 0; i < points.length - 1; i++) {
            if (t >= points[i].x && t <= points[i + 1].x) {
                const p1 = points[i];
                const p2 = points[i + 1];
                const range = p2.x - p1.x;
                if (range === 0) return p1.y;
                const localT = (t - p1.x) / range;
                return p1.y * (1 - localT) + p2.y * localT;
            }
        }
        return 0;
    }

    updateStats() {
        if (!this.statsContainer) return;
        let maxModel = -Infinity, minModel = Infinity;
        let maxClip = -Infinity, minClip = Infinity;

        const enabledLoras = this.config.filter(c => c.enabled !== false);

        for (let i = 0; i <= 100; i++) {
            const t = i / 100;
            let currentModelSum = 0;
            let currentClipSum = 0;

            enabledLoras.forEach(lora => {
                const y = this.getValueAtTime(lora.points, t);

                currentModelSum += y * (lora.strength_model ?? 1.0);
                currentClipSum += y * (lora.strength_clip ?? 1.0);
            });

            if (currentModelSum > maxModel) maxModel = currentModelSum;
            if (currentModelSum < minModel) minModel = currentModelSum;
            if (currentClipSum > maxClip) maxClip = currentClipSum;
            if (currentClipSum < minClip) minClip = currentClipSum;
        }

        if (enabledLoras.length === 0) { maxModel = 0; minModel = 0; maxClip = 0; minClip = 0; }

        this.statsContainer.innerHTML = `
            <div style="font-size:11px; color:#aaa; margin-bottom:4px; border-bottom:1px solid #444; padding-bottom:2px;">Combined Peak Strengths (Active)</div>
            <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:2px;">
                <span style="color:#82caff">Model:</span>
                <span style="color:#ddd">Min: ${minModel.toFixed(2)} / Max: ${maxModel.toFixed(2)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:11px;">
                <span style="color:#ffd700">CLIP*:</span>
                <span style="color:#ddd">Min: ${minClip.toFixed(2)} / Max: ${maxClip.toFixed(2)}</span>
            </div>
            <div style="font-size:9px; color:#666; text-align:right; margin-top:2px;">*Requires schedule_clip=True downstream</div>
        `;
    }

    fitView() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const padding = 60;
        const availW = w - padding * 2;
        const availH = h - padding * 2;
        const scale = Math.min(availW, availH);
        this.transform.k = scale;
        this.transform.x = (w - scale) / 2;
        this.transform.y = (h - scale) / 2;
        this.draw();
    }

    screenToWorld(sx, sy) {
        const { x, y, k } = this.transform;
        return { x: (sx - x) / k, y: (this.canvas.height - sy - y) / k };
    }

    worldToScreen(wx, wy) {
        const { x, y, k } = this.transform;
        return { x: wx * k + x, y: this.canvas.height - (wy * k + y) };
    }

    draw() {
        this.updateStats();
        if (!this.ctx) return;
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, w, h);

        const bl = this.worldToScreen(0, 0);
        const tr = this.worldToScreen(1, 1);

        ctx.fillStyle = "#1a1a1a";
        const zoneX = bl.x;
        const zoneY = tr.y;
        const zoneW = tr.x - bl.x;
        const zoneH = bl.y - tr.y;

        ctx.fillRect(zoneX, zoneY, zoneW, zoneH);
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 2;
        ctx.strokeRect(zoneX, zoneY, zoneW, zoneH);

        ctx.lineWidth = 1;
        ctx.font = "10px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const pixelsPerUnit = this.transform.k;
        const targetPixelStep = 80;
        const rawStep = targetPixelStep / pixelsPerUnit;
        const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
        const normalizedStep = rawStep / magnitude;

        let step;
        if (normalizedStep < 2) step = 1 * magnitude;
        else if (normalizedStep < 5) step = 2 * magnitude;
        else step = 5 * magnitude;
        if (step < 0.0001) step = 0.0001;

        const tlWorld = this.screenToWorld(0, 0);
        const brWorld = this.screenToWorld(w, h);

        const startX = Math.floor(tlWorld.x / step) * step;
        const endX = Math.ceil(brWorld.x / step) * step;
        const startY = Math.floor(brWorld.y / step) * step;
        const endY = Math.ceil(tlWorld.y / step) * step;

        ctx.strokeStyle = "#2a2a2a";
        ctx.fillStyle = "#666";

        const origin = this.worldToScreen(0, 0);
        let labelY = origin.y;
        if (labelY > h - 20) labelY = h - 20;
        if (labelY < 20) labelY = 20;
        let labelX = origin.x;
        if (labelX < 30) labelX = 30;
        if (labelX > w - 30) labelX = w - 30;

        for (let v = startX; v <= endX + step / 2; v += step) {
            const x = this.worldToScreen(v, 0).x;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
            if (x > -20 && x < w + 20) {
                ctx.fillText(v.toFixed(10).replace(/\.?0+$/, ""), x, labelY + 12);
            }
        }

        ctx.textAlign = "right";
        for (let v = startY; v <= endY + step / 2; v += step) {
            const y = this.worldToScreen(0, v).y;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
            if (y > -10 && y < h + 10) {
                ctx.fillText(v.toFixed(10).replace(/\.?0+$/, ""), labelX - 8, y);
            }
        }

        ctx.strokeStyle = "#444";
        ctx.lineWidth = 2;
        if (origin.x >= 0 && origin.x <= w) {
            ctx.beginPath(); ctx.moveTo(origin.x, 0); ctx.lineTo(origin.x, h); ctx.stroke();
        }
        if (origin.y >= 0 && origin.y <= h) {
            ctx.beginPath(); ctx.moveTo(0, origin.y); ctx.lineTo(w, origin.y); ctx.stroke();
        }

        this.config.forEach((item, idx) => {
            if (idx === this.activeLoraIndex) return;
            this.drawCurve(ctx, item.points, item.color, false, item.enabled);
        });

        if (this.activeLoraIndex > -1) {
            const item = this.config[this.activeLoraIndex];
            this.drawCurve(ctx, item.points, item.color, true, item.enabled);
            if (item.enabled !== false) {
                this.drawPoints(ctx, item.points, item.color);
            }
        }

        if (this.isDraggingPoint && this.selectedPoint) {
            const activeConfig = this.config[this.activeLoraIndex];
            const p = activeConfig.points[this.selectedPoint.index];
            this.drawTooltip(ctx, p, this.selectedPoint.index, activeConfig);
        }
    }

    drawTooltip(ctx, point, index, loraConfig) {
        const pos = this.worldToScreen(point.x, point.y);
        const sModel = loraConfig.strength_model ?? 1.0;
        const sClip = loraConfig.strength_clip ?? 1.0;

        const lines = [
            `Keyframe: ${index + 1}`,
            `Model: ${(point.y * sModel).toFixed(3)}`,
            `CLIP: ${(point.y * sClip).toFixed(3)}`,
            `Progress: ${(point.x * 100).toFixed(1)}%`
        ];

        ctx.font = "12px monospace";
        const lineHeight = 15;
        const pad = 8;
        let maxWidth = 0;
        lines.forEach(line => {
            const w = ctx.measureText(line).width;
            if (w > maxWidth) maxWidth = w;
        });

        const boxW = maxWidth + (pad * 2);
        const boxH = (lines.length * lineHeight) + (pad * 2);
        const offset = 15;
        let tx = pos.x + offset;
        let ty = pos.y - (boxH / 2);

        if (tx + boxW > this.canvas.width) tx = pos.x - boxW - offset;
        if (ty < 0) ty = 0;
        if (ty + boxH > this.canvas.height) ty = this.canvas.height - boxH;

        ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
        ctx.strokeStyle = "#666";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(Math.round(tx), Math.round(ty), boxW, boxH, 4);
        ctx.fill();
        ctx.stroke();

        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        lines.forEach((line, i) => {
            if (line.startsWith("Model")) ctx.fillStyle = "#82caff";
            else if (line.startsWith("CLIP")) ctx.fillStyle = "#ffd700";
            else ctx.fillStyle = "#ccc";
            ctx.fillText(line, Math.round(tx + pad), Math.round(ty + pad + (i * lineHeight)));
        });
    }

    drawCurve(ctx, points, color, isActive, isEnabled) {
        if (points.length < 2) return;
        ctx.beginPath();
        const start = this.worldToScreen(points[0].x, points[0].y);
        ctx.moveTo(start.x, start.y);
        for (let i = 1; i < points.length; i++) {
            const p = this.worldToScreen(points[i].x, points[i].y);
            ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = isActive ? 4 : 2;

        if (isEnabled === false) {
            ctx.setLineDash([5, 5]);
            ctx.globalAlpha = isActive ? 0.5 : 0.2;
        } else {
            ctx.setLineDash([]);
            ctx.globalAlpha = isActive ? 1.0 : 0.4;
        }

        ctx.stroke();
        ctx.globalAlpha = 1.0;
        ctx.setLineDash([]);
    }

    drawPoints(ctx, points, color) {
        points.forEach((p, i) => {
            const pos = this.worldToScreen(p.x, p.y);
            const isHover = this.hoveredPoint && this.hoveredPoint.index === i;
            const isSel = this.selectedPoint && this.selectedPoint.index === i;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, isHover || isSel ? 8 : 5, 0, Math.PI * 2);
            ctx.fillStyle = isSel ? "#fff" : color;
            ctx.fill();
            ctx.strokeStyle = "#000";
            ctx.lineWidth = 1;
            ctx.stroke();
        });
    }

    getPointAt(screenPos) {
        if (this.activeLoraIndex === -1) return null;

        if (this.config[this.activeLoraIndex].enabled === false) return null;

        const points = this.config[this.activeLoraIndex].points;
        for (let i = 0; i < points.length; i++) {
            const sPos = this.worldToScreen(points[i].x, points[i].y);
            const dist = Math.sqrt((screenPos.x - sPos.x) ** 2 + (screenPos.y - sPos.y) ** 2);
            if (dist < 12) return { index: i };
        }
        return null;
    }

    onMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        this.lastMousePos = pos;
        const hit = this.getPointAt(pos);

        if (e.button === 0) {
            if (hit) {
                this.isDraggingPoint = true;
                this.selectedPoint = hit;
                this.draw();
            } else {
                this.isPanning = true;
                this.canvas.style.cursor = "grabbing";
                this.selectedPoint = null;
                this.draw();
            }
        } else if (e.button === 1) {
            this.isPanning = true;
            this.canvas.style.cursor = "grabbing";
        }
    }

    onMouseMove(e) {
        if (!document.body.contains(this.dialog)) return;
        const rect = this.canvas.getBoundingClientRect();
        const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const dx = pos.x - this.lastMousePos.x;
        const dy = pos.y - this.lastMousePos.y;
        this.lastMousePos = pos;

        if (this.isPanning) {
            this.transform.x += dx;
            this.transform.y -= dy;
            this.draw();
            return;
        }

        if (this.isDraggingPoint && this.selectedPoint) {
            const points = this.config[this.activeLoraIndex].points;
            const p = points[this.selectedPoint.index];
            const worldPos = this.screenToWorld(pos.x, pos.y);

            let nx = worldPos.x;
            let ny = worldPos.y;

            const shouldSnap = this.snapEnabled ? !e.shiftKey : e.shiftKey;
            if (shouldSnap) {
                const interval = this.snapInterval || 0.05;
                nx = Math.round(nx / interval) * interval;
                ny = Math.round(ny / interval) * interval;
            }

            nx = Math.max(0, Math.min(1, nx));
            if (this.selectedPoint.index > 0) {
                const prev = points[this.selectedPoint.index - 1];
                nx = Math.max(nx, prev.x + 0.001);
            }
            if (this.selectedPoint.index < points.length - 1) {
                const next = points[this.selectedPoint.index + 1];
                nx = Math.min(nx, next.x - 0.001);
            }

            p.x = parseFloat(nx.toFixed(4));
            p.y = parseFloat(ny.toFixed(4));
            this.draw();
        } else {
            if (e.target === this.canvas) {
                const hit = this.getPointAt(pos);
                if (JSON.stringify(hit) !== JSON.stringify(this.hoveredPoint)) {
                    this.hoveredPoint = hit;
                    this.canvas.style.cursor = hit ? "pointer" : "default";
                    this.draw();
                }
            }
        }
    }

    onMouseUp(e) {
        if (this.isDraggingPoint) {
            this.pushState("Move Keyframe");
            this.updateButtonStates();
        }
        this.isDraggingPoint = false;
        this.isPanning = false;
        this.canvas.style.cursor = "default";
        this.draw();
    }

    onMouseWheel(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldPos = this.screenToWorld(mouseX, mouseY);

        const zoomIntensity = 0.1;
        const wheel = e.deltaY < 0 ? 1 : -1;
        const zoomFactor = Math.exp(wheel * zoomIntensity);

        const newScale = this.transform.k * zoomFactor;
        if (newScale < 20 || newScale > 10000) return;

        this.transform.k = newScale;
        this.transform.x = mouseX - worldPos.x * this.transform.k;
        this.transform.y = this.canvas.height - mouseY - worldPos.y * this.transform.k;
        this.draw();
    }

    apply() {
        if (!areConfigsEqual(this.config, this.initialConfig)) {
            this.onUpdate(this.config);
        }
        this.close();
    }

    close() {
        this.isModalOpen = false;
        if (this.resizeObserver) this.resizeObserver.disconnect();
        window.removeEventListener("mousemove", this.boundOnMouseMove);
        window.removeEventListener("mouseup", this.boundOnMouseUp);
        if (this.boundHandleKeyDown) document.removeEventListener("keydown", this.boundHandleKeyDown);

        if (this.overlay) {
            this.overlay.classList.remove("visible");
            if (this.dialog) this.dialog.classList.remove("visible");
            setTimeout(() => {
                if (document.body.contains(this.overlay)) document.body.removeChild(this.overlay);
            }, 300);
        }
    }
}

app.registerExtension({
    name: "Comfy._MultiScheduledLoraLoader",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "MultiScheduledLoraLoader") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                onNodeCreated?.apply(this, arguments);
                this.color = "#222222";
                this.bgcolor = "#000000";

                const configWidget = this.widgets.find(w => w.name === "schedule_config");
                if (configWidget) {
                    configWidget.type = "hidden";
                    configWidget.computeSize = () => [0, -4];
                }

                const getExternalText = () => {
                    const inputIndex = this.findInputSlot("schedule_string");
                    if (inputIndex !== -1 && this.inputs[inputIndex].link) {
                        const link = app.graph.links[this.inputs[inputIndex].link];
                        if (link) {
                            const originNode = app.graph.getNodeById(link.origin_id);
                            if (originNode) {
                                if (originNode.mode === 2 || originNode.mode === 4) return null;

                                if (originNode.widgets) {
                                    const textWidget = originNode.widgets.find(w => typeof w.value === 'string');
                                    if (textWidget) return textWidget.value;
                                }
                            }
                        }
                    }
                    return null;
                };

                const openEditor = () => {
                    const widget = getWidget(this, "schedule_config");
                    let internalData = [];
                    try { internalData = widget.value ? JSON.parse(widget.value) : []; } catch (e) { internalData = []; }

                    let importData = null;
                    const externalText = getExternalText();
                    if (externalText && typeof externalText === 'string' && externalText.trim().length > 0) {
                        importData = parseScheduleString(externalText);
                    }

                    new MultiCurveEditorDialog(this, internalData, importData, (newConfig) => {
                        setWidgetValue(this, "schedule_config", JSON.stringify(newConfig));
                        this.triggerTitleUpdate();
                    });
                };

                this.triggerTitleUpdate = (forceExternalValue = null) => {
                    if (this._titleTimer) clearTimeout(this._titleTimer);
                    this._titleTimer = setTimeout(() => updateNodeTitle(forceExternalValue), 50);
                };

                this.hijackUpstreamWidget = () => {
                    const inputIndex = this.findInputSlot("schedule_string");
                    if (inputIndex === -1 || !this.inputs[inputIndex].link) {
                        this._hookedWidget = null;
                        return;
                    }
                    const linkId = this.inputs[inputIndex].link;
                    const link = app.graph.links[linkId];
                    if (!link) return;
                    const originNode = app.graph.getNodeById(link.origin_id);
                    if (!originNode || !originNode.widgets) return;
                    const widget = originNode.widgets.find(w => typeof w.value === 'string' || w.type === 'text' || w.type === 'customtext');
                    if (!widget || this._hookedWidget === widget) return;

                    const originalCallback = widget.callback;
                    widget.callback = (v, ...args) => {
                        if (originalCallback) originalCallback.call(widget, v, ...args);
                        if (app.graph.getNodeById(this.id)) this.triggerTitleUpdate(v);
                    };
                    this._hookedWidget = widget;
                };

                let lastTitle = null;
                const updateNodeTitle = (forceExternalValue = null) => {
                    const configWidget = getWidget(this, "schedule_config");
                    let currentInternalConfig = [];
                    try { currentInternalConfig = JSON.parse(configWidget.value || "[]"); } catch (e) { }

                    const enabledCount = currentInternalConfig.filter(i => i.enabled !== false).length;

                    let currentExternalInput = forceExternalValue ?? getExternalText();
                    let newTitle = "Multi Scheduled LoRA Loader";

                    if (enabledCount > 0) {
                        newTitle = `Multi Scheduled LoRA Loader (${enabledCount} active)`;
                    } else if (currentExternalInput && typeof currentExternalInput === 'string') {
                        const parsedExternal = parseScheduleString(currentExternalInput);
                        newTitle = parsedExternal.length > 0 ?
                            `Multi Scheduled LoRA Loader (External: ${parsedExternal.length} active)` :
                            "Multi Scheduled LoRA Loader (External Input)";
                    }

                    if (newTitle !== lastTitle) {
                        this.title = newTitle;
                        lastTitle = newTitle;
                        this.setDirtyCanvas(true, true);
                    }
                };

                this.triggerTitleUpdate();

                const originalOnExecuted = this.onExecuted;
                this.onExecuted = function () {
                    this.triggerTitleUpdate();
                    if (originalOnExecuted) originalOnExecuted.apply(this, arguments);
                };

                const scheduleConfigWidget = getWidget(this, "schedule_config");
                if (scheduleConfigWidget) {
                    const originalCallback = scheduleConfigWidget.callback;
                    scheduleConfigWidget.callback = function (value) {
                        if (originalCallback) originalCallback.apply(this, arguments);
                        this.triggerTitleUpdate();
                    }.bind(this);
                }

                const originalOnConnectionsChange = this.onConnectionsChange;
                this.onConnectionsChange = function (type, index, connected, link_info, ...args) {
                    if (originalOnConnectionsChange) originalOnConnectionsChange.apply(this, [type, index, connected, link_info, ...args]);
                    this.hijackUpstreamWidget();
                    this.triggerTitleUpdate();
                };

                const originalOnDrawForeground = this.onDrawForeground;
                this.onDrawForeground = function (ctx) {
                    if (originalOnDrawForeground) originalOnDrawForeground.apply(this, arguments);

                    if (this.inputs) {
                        const inputIndex = this.findInputSlot("schedule_string");
                        if (inputIndex !== -1 && this.inputs[inputIndex].link) {
                            const link = app.graph.links[this.inputs[inputIndex].link];
                            if (link) {
                                const originNode = app.graph.getNodeById(link.origin_id);
                                if (originNode) {

                                    if (this._lastKnownUpstreamMode !== originNode.mode) {
                                        this._lastKnownUpstreamMode = originNode.mode;
                                        this.triggerTitleUpdate();
                                    }
                                }
                            }
                        } else {
                            this._lastKnownUpstreamMode = undefined;
                        }
                    }
                };

                this.addWidget("button", "Open Multi-LoRA Editor", null, openEditor);
            };
        }
    },
});