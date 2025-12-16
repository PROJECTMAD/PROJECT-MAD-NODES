import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

/*
 * ============================================================================
 * UTILITIES AND HELPERS
 * ============================================================================
 * Contains the color palette for the UI, a robust deep-comparison function
 * to detect changes between configuration states (ignoring array order),
 * and a custom modal generator for confirmation dialogs.
 */

const LORA_COLORS = [
    "#808080", "#8b4513", "#2e8b57", "#808000", "#483d8b",
    "#000080", "#9acd32", "#8b008b", "#ff0000", "#ffa500",
    "#ffff00", "#7fff00", "#8a2be2", "#00ff7f", "#00ffff",
    "#00bfff", "#0000ff", "#ff7f50", "#ff00ff", "#1e90ff",
    "#db7093", "#f0e68c", "#ff1493", "#ee82ee", "#e6e6fa"
];

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

        const a_sm = a.strength_model !== undefined ? a.strength_model : 1.0;
        const b_sm = b.strength_model !== undefined ? b.strength_model : 1.0;
        const a_sc = a.strength_clip !== undefined ? a.strength_clip : 1.0;
        const b_sc = b.strength_clip !== undefined ? b.strength_clip : 1.0;

        if (!isClose(a_sm, b_sm)) return false;
        if (!isClose(a_sc, b_sc)) return false;

        if (!a.points || !b.points) return false;
        if (a.points.length !== b.points.length) return false;

        for (let j = 0; j < a.points.length; j++) {
            if (!isClose(a.points[j].x, b.points[j].x)) return false;
            if (!isClose(a.points[j].y, b.points[j].y)) return false;
        }
        return true;
    };

    let availableMatches = [...imported];

    for (const internalItem of internal) {
        const matchIndex = availableMatches.findIndex(importedItem =>
            isItemEqual(internalItem, importedItem)
        );

        if (matchIndex === -1) {
            return false;
        }

        availableMatches.splice(matchIndex, 1);
    }

    return true;
}

function showCustomConfirm(title, message, onConfirm, onCancel = null, confirmText = "Confirm", confirmColor = "#4caf50") {
    const overlay = document.createElement("div");
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.6); z-index: 20000;
        display: flex; justify-content: center; align-items: center;
        font-family: sans-serif; opacity: 0; transition: opacity 0.2s;
    `;

    const box = document.createElement("div");
    box.style.cssText = `
        background: #2a2a2a; border: 1px solid #444; border-radius: 8px;
        padding: 20px; width: 400px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        transform: scale(0.9); transition: transform 0.2s;
        display: flex; flex-direction: column; gap: 15px;
    `;

    const h3 = document.createElement("h3");
    h3.textContent = title;
    h3.style.cssText = "margin: 0; color: #fff; font-size: 18px;";

    const p = document.createElement("p");
    p.textContent = message;
    p.style.cssText = "margin: 0; color: #ccc; font-size: 14px; line-height: 1.4;";

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;";

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.cssText = "padding: 8px 16px; background: #444; color: white; border: none; border-radius: 4px; cursor: pointer;";
    
    const okBtn = document.createElement("button");
    okBtn.textContent = confirmText;
    okBtn.style.cssText = `padding: 8px 16px; background: ${confirmColor}; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;`;

    const close = () => {
        overlay.style.opacity = "0";
        box.style.transform = "scale(0.9)";
        setTimeout(() => document.body.removeChild(overlay), 200);
    };

    cancelBtn.onclick = () => { close(); if (onCancel) onCancel(); };
    okBtn.onclick = () => { close(); onConfirm(); };

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(okBtn);
    box.appendChild(h3);
    box.appendChild(p);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
        overlay.style.opacity = "1";
        box.style.transform = "scale(1)";
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

function lerp(a, b, t) { return a * (1 - t) + b * t; }

/*
 * ============================================================================
 * SCHEDULE STRING PARSER
 * ============================================================================
 * Parses the input string format (e.g., <lora:name:1.0:1.0:points>) into the
 * internal JSON object structure used by the editor. It handles both explicit
 * point lists and procedural keyframe definitions.
 */

function parseScheduleString(input) {
    if (!input || typeof input !== 'string') return [];
    input = input.trim();
    if (input === "") return [];

    if (input.startsWith("[")) {
        try {
            return JSON.parse(input);
        } catch (e) {
            console.warn("[MultiScheduledLoraLoader] JSON parse failed, attempting string format parsing.");
        }
    }

    const loraList = [];
    const lines = input.split("\n");

    for (let line of lines) {
        line = line.trim();
        if (!line.startsWith("<lora:") || !line.endsWith(">")) continue;

        const content = line.substring(6, line.length - 1);
        const parts = content.split(":");

        if (parts.length < 4) continue;

        const item = {
            lora_name: parts[0],
            strength_model: parseFloat(parts[1]),
            strength_clip: parseFloat(parts[2]),
            points: [],
            color: LORA_COLORS[loraList.length % LORA_COLORS.length]
        };

        if (parts.length === 4) {
            const pointsStr = parts[3];
            const pairs = pointsStr.split(";");
            for (let pair of pairs) {
                if (pair.includes(",")) {
                    const [px, py] = pair.split(",");
                    item.points.push({ x: parseFloat(px), y: parseFloat(py) });
                }
            }
        }
        else if (parts.length === 9) {
            const s_start = parseFloat(parts[3]);
            const s_end = parseFloat(parts[4]);
            const p_start = parseFloat(parts[6]);
            const p_end = parseFloat(parts[7]);
            const count = parseInt(parts[8]);

            for (let i = 0; i < count; i++) {
                const t = count > 1 ? i / (count - 1) : 0.0;
                const x = p_start + (p_end - p_start) * t;
                const y = s_start + (s_end - s_start) * t
                item.points.push({
                    x: parseFloat(x.toFixed(4)),
                    y: parseFloat(y.toFixed(4))
                });
            }
        }

        item.points.sort((a, b) => a.x - b.x);

        if (item.points.length > 0) {
            loraList.push(item);
        }
    }

    return loraList;
}

/*
 * ============================================================================
 * MAIN EDITOR CLASS
 * ============================================================================
 * Manages the entire lifecycle of the popup editor window. This includes
 * initializing state, fetching available LoRAs from the API, detecting
 * external imports, and building the DOM elements.
 */

class MultiCurveEditorDialog {
    constructor(node, currentConfig, importConfig, onUpdate) {
        this.node = node;
        this.config = JSON.parse(JSON.stringify(currentConfig || []));
        this.initialConfig = JSON.parse(JSON.stringify(currentConfig || []));
        this.importConfig = importConfig ? JSON.parse(JSON.stringify(importConfig)) : null;
        this.onUpdate = onUpdate;
        
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

    resolveLoraName(inputName) {
        if (!inputName) return "";
        if (this.availableLoras.includes(inputName)) return inputName;
        
        
        const cleanInput = inputName.split(/[/\\]/).pop().replace(/\.[^/.]+$/, "");
        
        const match = this.availableLoras.find(avail => {
            const cleanAvail = avail.split(/[/\\]/).pop().replace(/\.[^/.]+$/, "");
            return cleanAvail === cleanInput;
        });

        return match || inputName;
    }

    async init() {
        try {
            const response = await api.fetchApi("/object_info/LoraLoader");
            const data = await response.json();
            if (data && data.LoraLoader && data.LoraLoader.input && data.LoraLoader.input.required) {
                this.availableLoras = data.LoraLoader.input.required.lora_name[0];
            } else {
                throw new Error("Unexpected API response structure");
            }
        } catch (e) {
            console.error("[MultiScheduledLoraLoader] Failed to fetch LoRAs:", e);
            this.availableLoras = ["Error: Could not fetch LoRA list"];
        }

        this.createDialog();
        this.setupCanvas();
        this.updateSidebar();
        
        setTimeout(() => this.fitView(), 50);

        
        if (this.importConfig && this.importConfig.length > 0) {
            this.importConfig.forEach(item => {
                item.lora_name = this.resolveLoraName(item.lora_name);
            });

            if (!areConfigsEqual(this.config, this.importConfig)) {
                setTimeout(() => {
                    this.isModalOpen = true;
                    showCustomConfirm(
                        "Import Detected",
                        "An input string connection was detected.\n\nDo you want to IMPORT it and OVERWRITE your current internal schedule?",
                        () => {
                            this.config = this.importConfig;
                            
                            this.onUpdate(this.config);
                            
                            this.initialConfig = JSON.parse(JSON.stringify(this.config));
                            
                            this.activeLoraIndex = this.config.length > 0 ? 0 : -1;
                            this.updateSidebar();
                            this.draw();
                            this.updateButtonStates();
                            this.isModalOpen = false;
                        },
                        () => {
                            this.isModalOpen = false;
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

    /*
     * ============================================================================
     * UI CONSTRUCTION
     * ============================================================================
     * Builds the modal overlay, the sidebar (containing LoRA list, settings,
     * and stats), the main canvas area, and the footer controls.
     */

    createDialog() {
        this.overlay = document.createElement("div");
        this.overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.8); z-index: 10000;
            display: flex; justify-content: center; align-items: center;
            font-family: sans-serif;
            backdrop-filter: blur(5px);
            opacity: 0; transition: opacity 0.3s ease;
        `;
        
        this.mouseDownOnOverlay = false;

        this.overlay.onmousedown = (e) => {
            if (e.target === this.overlay) {
                this.mouseDownOnOverlay = true;
            } else {
                this.mouseDownOnOverlay = false;
            }
        };

        this.overlay.onclick = (e) => { 
            if (e.target === this.overlay && this.mouseDownOnOverlay) {
                this.close(); 
            }
            this.mouseDownOnOverlay = false;
        };

        this.boundHandleKeyDown = (e) => { if (e.key === "Escape" && !this.isModalOpen) this.close(); };
        document.addEventListener("keydown", this.boundHandleKeyDown);
        
        this.dialog = document.createElement("div");
        this.dialog.style.cssText = `
            position: relative;
            background: #2a2a2a; border: 1px solid #444; border-radius: 8px;
            height: 85vh; width: calc(85vh + 320px);
            min-width: 700px; min-height: 500px;
            display: flex; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.7);
            resize: both;
            opacity: 0;
            transform: scale(0.95) translateY(20px);
            transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        `;

        const closeX = document.createElement("button");
        closeX.innerHTML = "&times;";
        closeX.style.cssText = `
            position: absolute; top: 0; right: 0;
            background: transparent; border: none; color: #888;
            font-size: 22px; cursor: pointer; line-height: 1;
            z-index: 100; transition: color 0.2s;
        `;
        closeX.onmouseenter = () => closeX.style.color = "#fff";
        closeX.onmouseleave = () => closeX.style.color = "#888";
        closeX.onclick = () => this.close();
        this.dialog.appendChild(closeX);

        this.sidebar = document.createElement("div");
        this.sidebar.style.cssText = `
            width: 320px; background: #222; border-right: 1px solid #444; 
            display: flex; flex-direction: column; padding: 15px; gap: 10px; 
            overflow-y: auto; flex-shrink: 0;
        `;
        
        const title = document.createElement("h3");
        title.textContent = "Multi-LoRA Scheduler";
        title.style.cssText = "margin: 0 0 10px 0; color: #fff; font-size: 16px;";
        this.sidebar.appendChild(title);

        const globalSettings = document.createElement("div");
        globalSettings.style.cssText = "background: #1a1a1a; padding: 10px; border-radius: 4px; border: 1px solid #333; margin-bottom: 10px;";
        
        const snapRow = document.createElement("div");
        snapRow.style.cssText = "display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px;";
        
        const snapLabel = document.createElement("label");
        snapLabel.style.cssText = "color: #ccc; font-size: 12px; display: flex; align-items: center; gap: 5px; cursor: pointer;";
        const snapCheck = document.createElement("input");
        snapCheck.type = "checkbox";
        snapCheck.checked = this.snapEnabled;
        snapCheck.onchange = (e) => { 
            this.snapEnabled = e.target.checked; 
            this.draw(); 
        };
        snapLabel.appendChild(snapCheck);
        snapLabel.appendChild(document.createTextNode("Enable Grid Snapping"));
        
        snapRow.appendChild(snapLabel);
        globalSettings.appendChild(snapRow);

        const intervalRow = document.createElement("div");
        intervalRow.style.cssText = "display: flex; align-items: center; justify-content: space-between;";
        const intLabel = document.createElement("span");
        intLabel.textContent = "Snap Interval:";
        intLabel.style.cssText = "color: #aaa; font-size: 12px;";
        
        const intInput = document.createElement("input");
        intInput.type = "number";
        intInput.step = "0.01";
        intInput.min = "0.01";
        intInput.value = this.snapInterval;
        intInput.style.cssText = "width: 60px; background: #111; color: #fff; border: 1px solid #444; padding: 2px 5px;";
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
        addBtn.style.cssText = `background: #4a90e2; color: white; border: none; padding: 8px; border-radius: 4px; cursor: pointer; width: 100%; margin-bottom: 10px;`;
        addBtn.onclick = () => this.addLora();
        this.sidebar.appendChild(addBtn);

        this.btnReset = document.createElement("button");
        this.btnReset.textContent = "Reset";
        this.btnReset.style.cssText = `
            background: #dc3545; color: white; border: 1px solid #c82333;
            padding: 8px; border-radius: 4px; cursor: pointer; width: 100%;
            margin-bottom: 10px; font-size: 12px; font-weight: bold;
            transition: opacity 0.2s;
        `;
        this.btnReset.onclick = () => {
            showCustomConfirm(
                "Reset All?",
                "This will remove ALL LoRAs from the schedule.",
                () => {
                    this.config = [];
                    this.activeLoraIndex = -1;
                    this.updateSidebar();
                    this.draw();
                    this.updateButtonStates();
                },
                null, "Reset All", "#ff6b6b"
            );
        };
        this.sidebar.appendChild(this.btnReset);

        this.listContainer = document.createElement("div");
        this.listContainer.style.cssText = `flex: 1; display: flex; flex-direction: column; gap: 5px; overflow-y: auto;`;
        this.sidebar.appendChild(this.listContainer);

        this.settingsPanel = document.createElement("div");
        this.settingsPanel.style.cssText = `border-top: 1px solid #444; padding-top: 15px; margin-top: auto; display: none; flex-direction: column; gap: 8px;`;
        this.sidebar.appendChild(this.settingsPanel);

        this.statsPanel = document.createElement("div");
        this.statsPanel.style.cssText = `
            margin-top: 10px; padding: 10px; background: #151515; 
            border: 1px solid #333; border-radius: 4px; flex-shrink: 0;
        `;
        this.statsContainer = document.createElement("div");
        this.statsPanel.appendChild(this.statsContainer);
        this.sidebar.appendChild(this.statsPanel);

        const contentArea = document.createElement("div");
        contentArea.style.cssText = `flex: 1; display: flex; flex-direction: column; padding: 20px; position: relative; min-width: 0;`;

        this.canvasContainer = document.createElement("div");
        this.canvasContainer.style.cssText = `flex: 1; position: relative; background: #111; border: 1px solid #444; overflow: hidden;`;

        this.canvas = document.createElement("canvas");
        this.canvas.style.cssText = `display: block; width: 100%; height: 100%; cursor: crosshair;`;
        this.canvasContainer.appendChild(this.canvas);

        const footer = document.createElement("div");
        footer.style.cssText = `display: flex; justify-content: space-between; margin-top: 10px; color: #888; font-size: 12px; flex-shrink: 0;`;
        footer.innerHTML = `<span>Left-Click Drag to Pan | Double-Click to Create Point | Drag points to edit | <b>Shift</b> toggles snapping</span>`;
        
        const btnGroup = document.createElement("div");
        btnGroup.style.cssText = "display: flex; gap: 10px; align-items: center;";
        
        const fitBtn = document.createElement("button");
        fitBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 3 21 3 21 9"></polyline>
                <polyline points="9 21 3 21 3 15"></polyline>
                <line x1="21" y1="3" x2="14" y2="10"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
            </svg>
            <span style="margin-left:6px">Fit View</span>`;
        fitBtn.style.cssText = `
            display: flex; align-items: center; padding: 6px 12px;
            background: #444; color: white; border: 1px solid #555;
            border-radius: 4px; cursor: pointer; font-size: 12px;
        `;
        fitBtn.onclick = () => this.fitView();

        this.btnCancel = document.createElement("button");
        this.btnCancel.textContent = "Discard Changes";
        this.btnCancel.style.cssText = `
            padding: 6px 15px; background: #dc3545; color: white;
            border: 1px solid #c82333; border-radius: 4px; cursor: pointer;
            font-weight: bold; transition: opacity 0.2s;
        `;
        this.btnCancel.onclick = () => {
            showCustomConfirm(
                "Discard Changes?",
                "This will revert all changes made in this session to the state when you opened the editor.",
                () => {
                    this.config = JSON.parse(JSON.stringify(this.initialConfig));
                    this.activeLoraIndex = this.config.length > 0 ? 0 : -1;
                    this.updateSidebar();
                    this.draw();
                    this.updateButtonStates();
                },
                null, "Discard", "#dc3545"
            );
        };

        this.btnSave = document.createElement("button");
        this.btnSave.textContent = "Save Schedule";
        this.btnSave.style.cssText = `
            padding: 6px 20px; background: #2196F3; color: white;
            border: none; border-radius: 4px; cursor: pointer;
            font-weight: bold; transition: opacity 0.2s;
        `;
        this.btnSave.onclick = () => this.apply();

        btnGroup.appendChild(fitBtn);
        btnGroup.appendChild(this.btnCancel);
        btnGroup.appendChild(this.btnSave);
        footer.appendChild(btnGroup);

        contentArea.appendChild(this.canvasContainer);
        contentArea.appendChild(footer);

        this.dialog.appendChild(this.sidebar);
        this.dialog.appendChild(contentArea);
        this.overlay.appendChild(this.dialog);
        document.body.appendChild(this.overlay);

        requestAnimationFrame(() => {
            this.overlay.style.opacity = "1";
            this.dialog.style.opacity = "1";
            this.dialog.style.transform = "scale(1) translateY(0)";
        });
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
            
            const rect = this.canvas.getBoundingClientRect();
            const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            const world = this.screenToWorld(pos.x, pos.y);

            if (world.x < 0 || world.x > 1) return;

            const activePoints = this.config[this.activeLoraIndex].points;
            
            const newPoint = {
                x: parseFloat(Math.max(0, Math.min(1, world.x)).toFixed(4)),
                y: parseFloat(world.y.toFixed(4))
            };

            activePoints.push(newPoint);
            activePoints.sort((a, b) => a.x - b.x);

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

    /*
     * ============================================================================
     * STATE MANAGEMENT & SIDEBAR
     * ============================================================================
     * Handles the logic for adding, removing, and selecting LoRAs. It also
     * updates the sidebar UI to reflect the current selection, populates
     * the settings panel (strength, clip, resampling), and calculates statistics.
     */

    addLora() {
        const usedColors = new Set(this.config.map(c => c.color));
        
        let color = LORA_COLORS.find(c => !usedColors.has(c));
        
        if (!color) {
            color = LORA_COLORS[this.config.length % LORA_COLORS.length];
        }
        
        const newLora = {
            lora_name: this.availableLoras[0] || "",
            strength_model: 1.0,
            strength_clip: 1.0,
            color: color,
            points: [{x: 0, y: 0}, {x: 1, y: 1}]
        };
        this.config.push(newLora);
        this.activeLoraIndex = this.config.length - 1;
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
                this.updateSidebar();
                this.draw();
                this.updateButtonStates();
            },
            null,
            "Remove",
            "#ff6b6b"
        );
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
        this.btnReset.style.opacity = isEmpty ? "0.5" : "1";
        this.btnReset.style.cursor = isEmpty ? "not-allowed" : "pointer";

        if (hasChanges) {
            this.btnSave.textContent = "Save Schedule";
            this.btnSave.disabled = false;
            this.btnSave.style.opacity = "1";
            this.btnSave.style.cursor = "pointer";

            this.btnCancel.disabled = false;
            this.btnCancel.style.opacity = "1";
            this.btnCancel.style.cursor = "pointer";
            this.btnCancel.style.display = "inline-block";
        } else {
            this.btnSave.textContent = "Close";
            this.btnSave.disabled = false;
            this.btnSave.style.opacity = "1";
            this.btnSave.style.cursor = "pointer";

            this.btnCancel.disabled = true;
            this.btnCancel.style.display = "none";
        }
    }

    updateSidebar() {
        this.listContainer.innerHTML = "";
        
        this.config.forEach((item, idx) => {
            const row = document.createElement("div");
            const isActive = idx === this.activeLoraIndex;
            row.style.cssText = `padding: 8px; background: ${isActive ? '#3a3a3a' : '#2a2a2a'}; border-left: 4px solid ${item.color}; border-radius: 2px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background 0.2s;`;
            
            const nameSpan = document.createElement("span");
            nameSpan.textContent = item.lora_name.split(/[/\\]/).pop() || "Select LoRA...";
            nameSpan.style.cssText = `white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; color: #ddd; font-size: 13px;`;
            
            const delBtn = document.createElement("span");
            delBtn.innerHTML = "&times;";
            delBtn.style.cssText = "color: #ff6b6b; font-weight: bold; padding: 0 5px; font-size: 18px;";
            delBtn.onclick = (e) => this.removeLora(idx, e);

            row.onclick = () => this.setActive(idx);
            row.appendChild(nameSpan);
            row.appendChild(delBtn);
            this.listContainer.appendChild(row);
        });

        if (this.activeLoraIndex > -1) {
            this.settingsPanel.style.display = "flex";
            this.settingsPanel.innerHTML = "";
            const item = this.config[this.activeLoraIndex];

            const label = document.createElement("label");
            label.textContent = "LoRA Model:";
            label.style.cssText = "color: #aaa; font-size: 12px;";
            
            const select = document.createElement("select");
            select.style.cssText = "background: #111; color: #fff; border: 1px solid #444; padding: 4px; width: 100%;";
            
            this.availableLoras.forEach(opt => {
                const option = document.createElement("option");
                option.value = opt;
                option.textContent = opt;
                if (opt === item.lora_name) option.selected = true;
                select.appendChild(option);
            });
            select.onchange = (e) => {
                item.lora_name = e.target.value;
                this.updateSidebar();
                this.updateButtonStates();
            };

            const createFloatInput = (lbl, key) => {
                const wrap = document.createElement("div");
                wrap.style.cssText = "display: flex; justify-content: space-between; align-items: center;";
                const l = document.createElement("span");
                l.textContent = lbl;
                l.style.cssText = "color: #ccc; font-size: 12px;";
                const inp = document.createElement("input");
                inp.type = "number";
                inp.step = "0.1";
                inp.value = item[key];
                inp.style.cssText = "width: 60px; background: #111; color: #fff; border: 1px solid #444;";
                inp.onchange = (e) => {
                    item[key] = parseFloat(e.target.value);
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
            keyframeControl.style.cssText = "margin-top: 5px; padding-top: 5px; border-top: 1px dashed #444; display: flex; gap: 5px; align-items: center;";
            
            const kfInput = document.createElement("input");
            kfInput.type = "number";
            kfInput.min = "2";
            kfInput.value = "5";
            kfInput.style.cssText = "width: 40px; background: #111; color: #fff; border: 1px solid #444; padding: 4px;";
            
            const kfBtn = document.createElement("button");
            kfBtn.textContent = "Resample";
            kfBtn.style.cssText = "flex: 1; background: #333; color: #ccc; border: none; padding: 4px; cursor: pointer; font-size: 11px;";
            kfBtn.onclick = () => {
                const count = parseInt(kfInput.value) || 5;
                if (count < 2) return;
                
                const newPoints = [];
                const firstY = item.points[0].y;
                const lastY = item.points[item.points.length-1].y;
                
                for(let i=0; i<count; i++) {
                    const t = i / (count - 1);
                    newPoints.push({
                        x: parseFloat(t.toFixed(4)),
                        y: parseFloat(lerp(firstY, lastY, t).toFixed(4))
                    });
                }
                item.points = newPoints;
                this.draw();
                this.updateButtonStates();
            };
            
            keyframeControl.appendChild(kfInput);
            keyframeControl.appendChild(kfBtn);
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

        for (let i = 0; i <= 100; i++) {
            const t = i / 100;
            let currentModelSum = 0;
            let currentClipSum = 0;

            this.config.forEach(lora => {
                const y = this.getValueAtTime(lora.points, t);
                currentModelSum += y * (lora.strength_model !== undefined ? lora.strength_model : 1.0);
                currentClipSum += y * (lora.strength_clip !== undefined ? lora.strength_clip : 1.0);
            });

            if (currentModelSum > maxModel) maxModel = currentModelSum;
            if (currentModelSum < minModel) minModel = currentModelSum;
            if (currentClipSum > maxClip) maxClip = currentClipSum;
            if (currentClipSum < minClip) minClip = currentClipSum;
        }

        if (this.config.length === 0) {
            maxModel = 0; minModel = 0; maxClip = 0; minClip = 0;
        }

        this.statsContainer.innerHTML = `
            <div style="font-size:12px; color:#aaa; margin-bottom:4px; border-bottom:1px solid #444; padding-bottom:2px;">Combined Peak Strengths</div>
            <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:2px;">
                <span style="color:#82caff">Model:</span>
                <span style="color:#ddd">Min: ${minModel.toFixed(2)} / Max: ${maxModel.toFixed(2)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:11px;">
                <span style="color:#ffd700">CLIP:</span>
                <span style="color:#ddd">Min: ${minClip.toFixed(2)} / Max: ${maxClip.toFixed(2)}</span>
            </div>
        `;
    }

    /*
     * ============================================================================
     * COORDINATE SYSTEM & RENDERING
     * ============================================================================
     * Handles the visual representation of the schedule. Includes functions for
     * converting between screen pixels and world coordinates, fitting the view
     * to the canvas, and the main draw loop which renders the grid, axes,
     * curves, keyframes, and tooltips.
     */

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
        const wx = (sx - x) / k;
        const wy = (this.canvas.height - sy - y) / k;
        return { x: wx, y: wy };
    }

    worldToScreen(wx, wy) {
        const { x, y, k } = this.transform;
        const sx = wx * k + x;
        const sy = this.canvas.height - (wy * k + y);
        return { x: sx, y: sy };
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

        for (let v = startX; v <= endX + step/2; v += step) {
            const x = this.worldToScreen(v, 0).x;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
            if (x > -20 && x < w + 20) {
                ctx.fillText(v.toFixed(10).replace(/\.?0+$/, ""), x, labelY + 12);
            }
        }

        ctx.textAlign = "right";
        for (let v = startY; v <= endY + step/2; v += step) {
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
            this.drawCurve(ctx, item.points, item.color, false);
        });

        if (this.activeLoraIndex > -1) {
            const item = this.config[this.activeLoraIndex];
            this.drawCurve(ctx, item.points, item.color, true);
            this.drawPoints(ctx, item.points, item.color);
        }

        if (this.isDraggingPoint && this.selectedPoint) {
            const activeConfig = this.config[this.activeLoraIndex];
            const p = activeConfig.points[this.selectedPoint.index];
            this.drawTooltip(ctx, p, this.selectedPoint.index, activeConfig);
        }
    }

    drawTooltip(ctx, point, index, loraConfig) {
        const pos = this.worldToScreen(point.x, point.y);
        
        const sModel = loraConfig.strength_model !== undefined ? loraConfig.strength_model : 1.0;
        const sClip = loraConfig.strength_clip !== undefined ? loraConfig.strength_clip : 1.0;

        const valModel = point.y * sModel;
        const valClip = point.y * sClip;
        const progress = point.x * 100;

        const txtModel = parseFloat(valModel.toFixed(3));
        const txtClip = parseFloat(valClip.toFixed(3));
        const txtProgress = parseFloat(progress.toFixed(1));

        const lines = [
            `Keyframe: ${index + 1}`,
            `Model: ${txtModel}`,
            `CLIP: ${txtClip}`,
            `Progress: ${txtProgress}%`
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
        
        const canvasW = this.canvas.width;
        const canvasH = this.canvas.height;
        const offset = 15;

        let tx = pos.x + offset;
        let ty = pos.y - (boxH / 2);

        if (tx + boxW > canvasW) {
            tx = pos.x - boxW - offset;
        }

        if (ty < 0) ty = 0;
        if (ty + boxH > canvasH) ty = canvasH - boxH;

        tx = Math.round(tx);
        ty = Math.round(ty);

        ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
        ctx.strokeStyle = "#666";
        ctx.lineWidth = 1;
        
        ctx.beginPath();
        ctx.roundRect(tx, ty, boxW, boxH, 4);
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = "#fff";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        
        lines.forEach((line, i) => {
            if (line.startsWith("Model")) ctx.fillStyle = "#82caff";
            else if (line.startsWith("CLIP")) ctx.fillStyle = "#ffd700";
            else ctx.fillStyle = "#ccc";

            ctx.fillText(line, tx + pad, Math.round(ty + pad + (i * lineHeight)));
        });
    }

    drawCurve(ctx, points, color, isActive) {
        if (points.length < 2) return;
        
        ctx.beginPath();
        const start = this.worldToScreen(points[0].x, points[0].y);
        ctx.moveTo(start.x, start.y);
        
        for (let i = 1; i < points.length; i++) {
            const p = this.worldToScreen(points[i].x, points[i].y);
            ctx.lineTo(p.x, p.y);
        }
        
        ctx.strokeStyle = color;
        ctx.lineWidth = isActive ? 6 : 5;
        ctx.globalAlpha = isActive ? 1.0 : 0.4;
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }

    drawPoints(ctx, points, color) {
        points.forEach((p, i) => {
            const pos = this.worldToScreen(p.x, p.y);
            const isHover = this.hoveredPoint && this.hoveredPoint.index === i;
            const isSel = this.selectedPoint && this.selectedPoint.index === i;
            
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, isHover || isSel ? 10 : 8, 0, Math.PI * 2);
            ctx.fillStyle = isSel ? "#fff" : color;
            ctx.fill();
            ctx.strokeStyle = "#000";
            ctx.lineWidth = 1;
            ctx.stroke();
        });
    }

    /*
     * ============================================================================
     * USER INTERACTION
     * ============================================================================
     * Manages mouse events for the canvas. Handles selecting and dragging keyframes,
     * panning the view, zooming via scroll wheel, and snapping points to the grid.
     */

    getPointAt(screenPos) {
        if (this.activeLoraIndex === -1) return null;
        const points = this.config[this.activeLoraIndex].points;
        
        for (let i = 0; i < points.length; i++) {
            const sPos = this.worldToScreen(points[i].x, points[i].y);
            const dist = Math.sqrt((screenPos.x - sPos.x)**2 + (screenPos.y - sPos.y)**2);
            if (dist < 15) return { index: i };
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
        }
        else if (e.button === 1) {
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
        if (this.resizeObserver) this.resizeObserver.disconnect();
        window.removeEventListener("mousemove", this.boundOnMouseMove);
        window.removeEventListener("mouseup", this.boundOnMouseUp);
        
        if (this.boundHandleKeyDown) {
            document.removeEventListener("keydown", this.boundHandleKeyDown);
        }

        document.body.removeChild(this.overlay);
    }
}

/*
 * ============================================================================
 * EXTENSION REGISTRATION
 * ============================================================================
 * Registers the extension with ComfyUI. It modifies the node definition to
 * hide the raw JSON widget, adds a button to open the custom editor, and
 * implements logic to dynamically update the node's title based on whether
 * it is using internal configuration or external input.
 */

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
                            if (originNode && originNode.widgets) {
                                const textWidget = originNode.widgets.find(w => typeof w.value === 'string');
                                if (textWidget) return textWidget.value;
                            }
                        }
                    }
                    return null;
                };

                const openEditor = () => {
                    const widget = getWidget(this, "schedule_config");
                    
                    let internalData = [];
                    try {
                        internalData = widget.value ? JSON.parse(widget.value) : [];
                    } catch(e) { internalData = []; }
                    
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
                    if (inputIndex === -1) return;
                    
                    if (!this.inputs[inputIndex].link) {
                        this._hookedWidget = null;
                        return;
                    }

                    const linkId = this.inputs[inputIndex].link;
                    const link = app.graph.links[linkId];
                    if (!link) return;

                    const originNode = app.graph.getNodeById(link.origin_id);
                    if (!originNode || !originNode.widgets) return;

                    const widget = originNode.widgets.find(w => typeof w.value === 'string' || w.type === 'text' || w.type === 'customtext');
                    if (!widget) return;

                    if (this._hookedWidget === widget) return;

                    const originalCallback = widget.callback;
                    
                    widget.callback = (v, ...args) => {
                        if (originalCallback) {
                            originalCallback.call(widget, v, ...args);
                        }
                        if (app.graph.getNodeById(this.id)) {
                            this.triggerTitleUpdate(v);
                        }
                    };
                    
                    this._hookedWidget = widget;
                };

                let lastTitle = null;
                
                const updateNodeTitle = (forceExternalValue = null) => {
                    const configWidget = getWidget(this, "schedule_config");
                    
                    let currentInternalConfig = "[]";
                    let currentExternalInput = forceExternalValue;
                    
                    try {
                        currentInternalConfig = configWidget.value || "[]";
                    } catch(e) {
                        currentInternalConfig = "[]";
                    }
                    
                    if (currentExternalInput === null) {
                        currentExternalInput = getExternalText();
                    }
                    
                    let newTitle = "Multi Scheduled LoRA Loader";
                    
                    let internalCount = 0;
                    try {
                        const internalData = JSON.parse(currentInternalConfig);
                        internalCount = internalData.length;
                    } catch(e) {}

                    if (internalCount > 0) {
                        newTitle = `Multi Scheduled LoRA Loader (${internalCount} active)`;
                    } else if (currentExternalInput !== null && typeof currentExternalInput === 'string') {
                        const parsedExternal = parseScheduleString(currentExternalInput);
                        if (parsedExternal.length > 0) {
                            newTitle = `Multi Scheduled LoRA Loader (External: ${parsedExternal.length} active)`;
                        } else {
                            newTitle = "Multi Scheduled LoRA Loader (External Input)";
                        }
                    }
                    
                    if (newTitle !== lastTitle) {
                        this.title = newTitle;
                        lastTitle = newTitle;
                        this.setDirtyCanvas(true, true); 
                    }
                };

                this.triggerTitleUpdate();
                
                const originalOnExecuted = this.onExecuted;
                this.onExecuted = function() {
                    this.triggerTitleUpdate();
                    if (originalOnExecuted) {
                        originalOnExecuted.apply(this, arguments);
                    }
                };
                
                const scheduleConfigWidget = getWidget(this, "schedule_config");
                if (scheduleConfigWidget) {
                    const originalCallback = scheduleConfigWidget.callback;
                    scheduleConfigWidget.callback = function(value) {
                        if (originalCallback) {
                            originalCallback.apply(this, arguments);
                        }
                        this.triggerTitleUpdate();
                    }.bind(this);
                }
                
                const originalOnConnectionsChange = this.onConnectionsChange;
                this.onConnectionsChange = function(type, index, connected, link_info, ...args) {
                    if (originalOnConnectionsChange) {
                        originalOnConnectionsChange.apply(this, [type, index, connected, link_info, ...args]);
                    }
                    this.hijackUpstreamWidget();
                    this.triggerTitleUpdate();
                };

                this.addWidget("button", "Open Multi-LoRA Editor", null, openEditor);
            };
        }
    },
});