const app = window.comfyAPI.app.app;
const api = window.comfyAPI.api.api;
import { ICONS } from "./Icons.js";
import { TEXT, LORA_COLORS, PRESET_STRATEGIES, ARCH_BLOCK_MAPPINGS, LOG_PREFIX, SLIDER_DESCRIPTIONS, ANALYSIS_TEXT, updateConstants, CANVAS_COLORS, HISTORY_ACTIONS, TEMPLATES, CONFIRM_BUTTON_COLORS, CANVAS_FONTS, API_ENDPOINTS } from "./Constants.js";
import { attachMadTooltip, getAnalysisColor, sortBlocks, classifyBlock, createCustomSelect, areConfigsEqual, lerp, Easing, getBlockTooltip, el, detectPreset, getVectorsForPreset, normalizeFloat } from "./Utils.js";
import { createTitanSlider } from "./TitanSlider.js";
import { LoRAPickerDialog } from "./LoraPicker.js";
import { BlockEditorDialog } from "./BlockEditor.js";
import { requestManager } from "./RequestManager.js";
import { AnalysisPanel } from "./AnalysisPanel.js";

function showCustomConfirm(title, message, onConfirm, onCancel = null, confirmText = TEXT.confirm.confirm, confirmColor = CONFIRM_BUTTON_COLORS.PRIMARY) {
    const overlay = document.createElement("div");
    overlay.className = "mad-overlay";
    overlay.dataset.madConfirm = "true";

    const box = document.createElement("div");
    box.className = "mad-modal mad-confirm-box";
    let html = TEMPLATES.confirmBox;

    html = html.replace("%s", title).replace("%s", message).replace("%s", TEXT.confirm.cancel).replace("%s", confirmColor).replace("%s", confirmColor).replace("%s", confirmText);

    box.innerHTML = html;

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
    btns[0].onclick = () => {
        close();
        if (onCancel) onCancel();
    };
    btns[1].onclick = () => {
        close();
        onConfirm();
    };

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
        overlay.classList.add("visible");
        box.classList.add("visible");
    });
}

function showBlockingConfirm(title, message, onConfirm) {
    const overlay = document.createElement("div");
    overlay.className = "mad-overlay mad-overlay-blocking";

    const box = document.createElement("div");
    box.className = "mad-modal mad-confirm-danger";
    let html = TEMPLATES.dangerBox;
    html = html.replace("%s", ICONS.alert).replace("%s", title).replace("%s", message).replace("%s", TEXT.confirm.wipeDataTitle).replace("%s", TEXT.confirm.wipeDataMsg).replace("%s", TEXT.confirm.cancel).replace("%s", TEXT.confirm.wipeConfirmBtn);

    box.innerHTML = html;

    const close = () => {
        overlay.classList.remove("visible");
        box.classList.remove("visible");
        setTimeout(() => {
            if (document.body.contains(overlay)) document.body.removeChild(overlay);
        }, 200);
        document.removeEventListener("keydown", handleKey, { capture: true });
    };

    const handleKey = (e) => {
        if (e.key === "Escape") {
            e.stopPropagation();
            close();
        }
    };

    document.addEventListener("keydown", handleKey, { capture: true });

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const btnCancel = box.querySelector("#mad-block-cancel");
    const btnConfirm = box.querySelector("#mad-block-confirm");

    btnCancel.onclick = close;
    btnConfirm.onclick = () => {
        close();
        onConfirm();
    };

    void overlay.offsetWidth;

    requestAnimationFrame(() => {
        overlay.classList.add("visible");
        box.classList.add("visible");
        btnCancel.focus();
    });
}

export class MultiCurveEditor {
    constructor(node, currentConfig, importConfig, onUpdate) {
        this.node = node;
        const rawInput = currentConfig ? JSON.parse(JSON.stringify(currentConfig)) : null;
        let rawProfiles;
        if (Array.isArray(rawInput)) {
            rawProfiles = { Default: rawInput };
        } else if (rawInput && rawInput.profiles) {
            rawProfiles = rawInput.profiles;
        } else {
            rawProfiles = { Default: [] };
        }

        this.profiles = {};

        Object.entries(rawProfiles).forEach(([name, data]) => {
            if (Array.isArray(data)) {
                this.profiles[name] = {
                    loras: this.sanitizeConfig(data),
                    settings: { snap: 0.05 },
                };
            } else {
                this.profiles[name] = {
                    loras: this.sanitizeConfig(data.loras),
                    settings: data.settings || { snap: 0.05 },
                };
            }
        });

        this.activeProfileName = rawInput?.active_profile || "Default";
        if (!this.profiles[this.activeProfileName]) {
            this.profiles[this.activeProfileName] = {
                loras: [],
                settings: { snap: 0.05 },
            };
        }
        this.config = this.profiles[this.activeProfileName].loras;
        this.snapInterval = this.profiles[this.activeProfileName].settings.snap;
        this.initialState = this.getSnapshot();

        this.importConfig = importConfig ? this.sanitizeConfig(JSON.parse(JSON.stringify(importConfig))) : null;
        this.onUpdate = onUpdate;

        this.history = [];
        this.historyStep = -1;
        this.activeLoraIndex = -1;
        this.availableLoras = [];
        this.isModalOpen = false;
        this.snapEnabled = true;

        this.transform = { x: 60, y: 60, k: 300 };
        this.lastMousePos = { x: 0, y: 0 };
        this._expandedLBW = new Set();

        this._sidebarUpdateTimer = null;

        this.init();
    }

    pushState(actionName = "Change") {
        if (this.historyStep < this.history.length - 1) this.history = this.history.slice(0, this.historyStep + 1);
        const state = {
            profiles: JSON.parse(JSON.stringify(this.profiles)),
            activeProfileName: this.activeProfileName,
            activeLoraIndex: this.activeLoraIndex,
            timestamp: new Date(),
            action: actionName,
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
        this.profiles = JSON.parse(JSON.stringify(state.profiles));
        this.activeProfileName = state.activeProfileName;
        const activeProfile = this.profiles[this.activeProfileName];
        this.config = activeProfile.loras;
        this.snapInterval = activeProfile.settings.snap;

        this.activeLoraIndex = state.activeLoraIndex;
        if (this.activeLoraIndex >= this.config.length) this.activeLoraIndex = -1;
        if (this.snapSliderEl) {
            this.snapSliderEl.updateValue(this.snapInterval);
        }
        document.querySelectorAll(".mad-dynamic-step").forEach((el) => (el.dataset.step = this.snapInterval));

        this.updateSidebar();
        this.draw();
        this.updateButtonStates();
        this.updateHistoryUI();
        this.updatePreview(this.activeLoraIndex > -1 ? this.config[this.activeLoraIndex].lora_name : null);
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
        const cleanInput = inputName
            .split(/[/\\]/)
            .pop()
            .replace(/\.[^/.]+$/, "");
        const match = this.availableLoras.find(
            (avail) =>
                avail
                    .split(/[/\\]/)
                    .pop()
                    .replace(/\.[^/.]+$/, "") === cleanInput,
        );
        return match || inputName;
    }

    getUpstreamModelName() {
        if (!this.node || !Array.isArray(this.node.inputs)) return null;
        const startInput = this.node.inputs.find((i) => i?.link && (i?.type === "MODEL" || i?.name === "model" || String(i?.type || "").toUpperCase() === "MODEL")) || this.node.inputs.find((i) => i?.link);
        if (!startInput?.link) return null;

        const modelExts = [".safetensors", ".ckpt", ".gguf", ".pt", ".pth", ".bin"];
        const widgetNameCandidates = new Set(["ckpt_name", "checkpoint", "checkpoint_name", "model_name", "model", "base_model", "filename", "file", "path", "weight", "weights"]);

        const isRerouteLike = (node) => {
            const t = String(node?.type || "");
            const title = String(node?.title || "");
            return t.toLowerCase().includes("reroute") || title.toLowerCase().includes("reroute");
        };
        const looksLikeFilename = (s) => {
            if (!s || typeof s !== "string") return false;
            const v = s.toLowerCase().trim();
            return modelExts.some((ext) => v.endsWith(ext));
        };
        const sanitizeModelName = (s) => {
            if (!s || typeof s !== "string") return null;
            const trimmed = s.trim();
            return trimmed.length ? trimmed : null;
        };

        const scoreCandidate = (node, widget, value) => {
            let score = 0;
            const name = String(widget?.name || "").toLowerCase();
            const v = String(value || "");
            const vLow = v.toLowerCase();
            if (looksLikeFilename(v)) score += 100;
            if (vLow.includes("/") || vLow.includes("\\")) score += 10;
            if (widgetNameCandidates.has(name)) score += 15;
            if (
                String(node?.type || "")
                    .toLowerCase()
                    .includes("checkpoint")
            )
                score += 10;
            if (
                String(node?.type || "")
                    .toLowerCase()
                    .includes("loader")
            )
                score += 5;
            if (v.length > 300) score -= 20;
            if (/^\d+(\.\d+)?$/.test(v.trim())) score -= 50;
            return score;
        };

        const bestWidgetFilenameFromNode = (node) => {
            if (!node?.widgets) return null;
            let best = null;
            for (const w of node.widgets) {
                const val = w?.value;
                if (typeof val !== "string") continue;
                const candidate = sanitizeModelName(val);
                if (!candidate) continue;
                const s = scoreCandidate(node, w, candidate);
                if (!best || s > best.score) {
                    best = { value: candidate, score: s, widgetName: w?.name };
                }
            }
            if (best && best.score >= 30) return best.value;
            return null;
        };

        const queue = [startInput.link];
        const seenLinks = new Set();
        const seenNodes = new Set();
        while (queue.length) {
            const linkId = queue.shift();
            if (!linkId || seenLinks.has(linkId)) continue;
            seenLinks.add(linkId);
            const link = app.graph?.links?.[linkId];
            if (!link) continue;
            const node = app.graph.getNodeById(link.origin_id);
            if (!node) continue;
            if (seenNodes.has(node.id)) continue;
            seenNodes.add(node.id);
            const found = bestWidgetFilenameFromNode(node);
            if (found) return found;
            if (!Array.isArray(node.inputs)) continue;
            if (isRerouteLike(node)) {
                const in0 = node.inputs[0];
                if (in0?.link) queue.push(in0.link);
                continue;
            }
            for (const inp of node.inputs) {
                if (!inp?.link) continue;
                const t = String(inp?.type || "").toUpperCase();
                const n = String(inp?.name || "").toLowerCase();
                if (t === "MODEL" || n === "model" || n.includes("model")) {
                    queue.push(inp.link);
                }
            }
            if (queue.length === 0) {
                for (const inp of node.inputs) {
                    if (inp?.link) queue.push(inp.link);
                }
            }
        }
        return null;
    }

    async init() {
        const uiConfig = await requestManager.fetchConfig();
        updateConstants(uiConfig);

        try {
            const loras = await requestManager.fetchLoraList();
            if (loras && loras.length > 0) {
                this.availableLoras = loras;
            }
        } catch (e) {
            this.availableLoras = [TEXT.error.fetchFailed];
        }

        this.createDialog();
        this.setupCanvas();

        this.pushState(HISTORY_ACTIONS.INITIAL);

        if (this.importConfig && this.importConfig.length > 0) {
            this.importConfig.forEach((item) => (item.lora_name = this.resolveLoraName(item.lora_name)));

            if (!areConfigsEqual(this.config, this.importConfig)) {
                setTimeout(() => {
                    showCustomConfirm(
                        TEXT.confirm.importDetectedTitle,
                        TEXT.confirm.importDetectedMsg,
                        () => {
                            let baseName = TEXT.profileManager.importedDefault;
                            let newName = baseName;
                            let counter = 1;
                            while (this.profiles[newName]) {
                                newName = `${baseName} ${counter++}`;
                            }
                            this.profiles[newName] = {
                                loras: JSON.parse(JSON.stringify(this.importConfig)),
                                settings: { snap: 0.05 },
                            };
                            this.activeProfileName = newName;
                            this.config = this.profiles[newName].loras;
                            this.snapInterval = 0.05;
                            this.activeLoraIndex = -1;
                            if (this.snapSliderEl) {
                                this.snapSliderEl.updateValue(this.snapInterval);
                            }
                            document.querySelectorAll(".mad-dynamic-step").forEach((el) => (el.dataset.step = this.snapInterval));

                            this.pushState(HISTORY_ACTIONS.IMPORT);
                            this.updateSidebar();
                            this.draw();
                            this.updateButtonStates();
                            this.updatePreview(null);
                        },
                        () => {
                            this.updateButtonStates();
                        },
                        TEXT.confirm.buttons.importNew,
                        CONFIRM_BUTTON_COLORS.PRIMARY,
                    );
                }, 300);
            }
        }

        this.updateSidebar();
        this.initialState = this.getSnapshot();

        this.updateButtonStates();
        this.updatePreview(this.activeLoraIndex > -1 ? this.config[this.activeLoraIndex].lora_name : null);

        setTimeout(() => this.fitView(), 50);
    }

    createDialog() {
        this.overlay = document.createElement("div");
        this.overlay.className = "mad-overlay";
        this.mouseDownOnOverlay = false;

        this.overlay.onmousedown = (e) => {
            this.mouseDownOnOverlay = e.target === this.overlay;
        };
        this.overlay.onclick = (e) => {
            if (e.target === this.overlay && this.mouseDownOnOverlay) this.close();
            this.mouseDownOnOverlay = false;
        };

        this.boundHandleKeyDown = (e) => {
            if (!this.isModalOpen) return;
            if (document.querySelector('.mad-overlay[data-mad-confirm="true"]')) return;
            if (document.querySelector(".mad-picker-modal.visible")) return;

            if (document.querySelector(".mad-block-editor-modal.visible")) return;

            if (document.querySelector(".mad-input-modal.visible")) return;

            if (e.key === "Escape") this.close();
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
                e.preventDefault();
                if (e.shiftKey) this.redo();
                else this.undo();
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
                e.preventDefault();
                this.redo();
            }
        };
        document.addEventListener("keydown", this.boundHandleKeyDown);

        this.layoutWrapper = document.createElement("div");
        this.layoutWrapper.className = "mad-layout-wrapper";
        this.dialog = document.createElement("div");
        this.dialog.className = "mad-modal";
        this.previewPane = document.createElement("div");
        this.previewPane.className = "mad-preview-pane";
        this.overlayEnableBtn = el("button", { className: "mad-btn mad-btn-primary" }, el("span", { html: ICONS.eye }), ` ${TEXT.disabledOverlay.enableBtn}`);

        this.disabledOverlay = el(
            "div",
            { className: "mad-disabled-overlay" },
            el("div", { className: "mad-disabled-icon-large", html: ICONS.eyeOff }),
            el("div", {
                className: "mad-disabled-text",
                html: TEXT.disabledOverlay.message,
            }),
            this.overlayEnableBtn,
        );

        this.previewPane.appendChild(this.disabledOverlay);

        this.previewPane.addEventListener("mouseenter", () => {
            this.isMouseOverPreview = true;
            if (this.revertIntentTimer) clearTimeout(this.revertIntentTimer);
        });
        this.previewPane.addEventListener("mouseleave", () => {
            this.isMouseOverPreview = false;
            this.schedulePreviewUpdate(-1);
        });
        this.previewViewport = document.createElement("div");
        this.previewViewport.className = "mad-preview-viewport";
        this.settingsPanel = document.createElement("div");
        this.settingsPanel.className = "mad-settings-scroll-area";

        this.previewPane.appendChild(this.previewViewport);
        this.previewPane.appendChild(this.settingsPanel);
        this.layoutWrapper.appendChild(this.previewPane);
        this.layoutWrapper.appendChild(this.dialog);
        this.overlay.appendChild(this.layoutWrapper);
        this.sidebar = document.createElement("div");
        this.sidebar.className = "mad-sidebar";
        const title = document.createElement("h3");
        title.textContent = TEXT.editorTitle;
        title.className = "mad-title";
        this.sidebar.appendChild(title);
        this.renderProfileManager();
        const globalSettings = document.createElement("div");
        globalSettings.className = "mad-panel";
        const snapRow = document.createElement("div");
        snapRow.className = "mad-row mad-row-mb";
        const snapLabel = document.createElement("label");
        snapLabel.className = "mad-label";
        attachMadTooltip(snapLabel, SLIDER_DESCRIPTIONS.snap);
        const snapCheck = document.createElement("input");
        snapCheck.type = "checkbox";
        snapCheck.checked = this.snapEnabled;
        snapCheck.onchange = (e) => {
            this.snapEnabled = e.target.checked;
            this.draw();
        };
        snapLabel.appendChild(snapCheck);
        snapLabel.appendChild(document.createTextNode(TEXT.gridSnapping));
        snapRow.appendChild(snapLabel);
        globalSettings.appendChild(snapRow);
        this.snapSliderEl = createTitanSlider(
            TEXT.sliders.snap,
            0.01,
            0.2,
            0.01,
            this.snapInterval,
            (val) => {
                this.snapInterval = val;
                this.profiles[this.activeProfileName].settings.snap = val;

                this.draw();
                this.updateButtonStates();
                document.querySelectorAll(".mad-dynamic-step").forEach((el) => (el.dataset.step = val));
            },
            false,
            false,
            "",
            () => {
                this.isUIInteraction = true;
            },
            () => {
                this.isUIInteraction = false;
            },
        );
        globalSettings.appendChild(this.snapSliderEl);
        const cacheRow = document.createElement("div");
        cacheRow.className = "mad-cache-row";

        const clearBtn = document.createElement("button");
        clearBtn.className = "mad-btn mad-btn-reset";
        clearBtn.innerHTML = `${ICONS.trash} ${TEXT.clearCacheBtn}`;
        clearBtn.onclick = () => {
            showBlockingConfirm(TEXT.confirm.clearCacheTitle, TEXT.confirm.clearCacheMsg, async () => {
                requestManager.clearStorage();
                await requestManager.clearBackendCache();
                this.config.forEach((item) => {
                    delete item.stats;
                    delete item.arch;
                    item.statsLoaded = false;
                    item.isFetching = false;
                    delete item.compatibility;
                });
                this.renderedSettingsIndex = null;
                this.updateSidebar();
                this.renderSettings(this.activeLoraIndex);
                clearBtn.textContent = TEXT.cacheCleared;
                setTimeout(() => (clearBtn.innerHTML = `${ICONS.trash} ${TEXT.clearCacheBtn}`), 1500);
            });
        };

        cacheRow.appendChild(clearBtn);
        globalSettings.appendChild(cacheRow);
        this.sidebar.appendChild(globalSettings);
        const controlGroup = document.createElement("div");
        controlGroup.className = "mad-control-group";
        const row1 = document.createElement("div");
        row1.className = "mad-btn-row";

        const btnEnableAll = document.createElement("button");
        btnEnableAll.textContent = TEXT.enableAll;
        btnEnableAll.className = "mad-btn";
        attachMadTooltip(btnEnableAll, TEXT.enableAllTitle);
        btnEnableAll.onclick = () => {
            this.config.forEach((c) => (c.enabled = true));
            this.pushState(HISTORY_ACTIONS.ENABLE_ALL);
            this.updateSidebar();
            this.draw();
            this.updateButtonStates();
        };

        const btnDisableAll = document.createElement("button");
        btnDisableAll.textContent = TEXT.disableAll;
        btnDisableAll.className = "mad-btn";
        attachMadTooltip(btnDisableAll, TEXT.disableAllTitle);
        btnDisableAll.onclick = () => {
            this.config.forEach((c) => (c.enabled = false));
            this.pushState(HISTORY_ACTIONS.DISABLE_ALL);
            this.updateSidebar();
            this.draw();
            this.updateButtonStates();
        };

        row1.appendChild(btnEnableAll);
        row1.appendChild(btnDisableAll);

        const addBtn = document.createElement("button");
        addBtn.textContent = TEXT.addLora;
        addBtn.className = "mad-btn mad-btn-add";
        addBtn.onclick = () => this.addLora();

        this.btnReset = document.createElement("button");
        this.btnReset.textContent = TEXT.clearAll;
        this.btnReset.className = "mad-btn mad-btn-reset";
        this.btnReset.onclick = () => {
            showCustomConfirm(
                TEXT.confirm.clearAllTitle,
                TEXT.confirm.clearAllMsg,
                () => {
                    this.config = [];
                    this.activeLoraIndex = -1;
                    this.pushState(HISTORY_ACTIONS.CLEAR_ALL);
                    this.updateSidebar();
                    this.draw();
                    this.updateButtonStates();
                    this.updatePreview(null);
                },
                null,
                TEXT.confirm.buttons.clear,
                CONFIRM_BUTTON_COLORS.DANGER,
            );
        };

        controlGroup.appendChild(row1);
        controlGroup.appendChild(addBtn);
        controlGroup.appendChild(this.btnReset);
        this.sidebar.appendChild(controlGroup);

        this.listContainer = document.createElement("div");
        this.listContainer.className = "mad-list-container";
        this.sidebar.appendChild(this.listContainer);
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
        attachMadTooltip(this.btnUndo, TEXT.undoTitle);
        this.btnUndo.onclick = () => this.undo();
        this.btnRedo = document.createElement("button");
        this.btnRedo.innerHTML = ICONS.redo;
        this.btnRedo.className = "mad-btn mad-btn-icon";
        attachMadTooltip(this.btnRedo, TEXT.redoTitle);
        this.btnRedo.onclick = () => this.redo();
        this.btnHistory = document.createElement("button");
        this.btnHistory.innerHTML = ICONS.history;
        this.btnHistory.className = "mad-btn mad-btn-icon mad-relative";
        attachMadTooltip(this.btnHistory, TEXT.historyTitle);
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
        header.appendChild(leftGroup);

        const rightGroup = document.createElement("div");
        rightGroup.className = "mad-header-group";
        const fitBtn = document.createElement("button");
        fitBtn.innerHTML = ICONS.fit + `<span class="mad-ml-4">${TEXT.fit}</span>`;
        fitBtn.className = "mad-btn";
        fitBtn.onclick = () => this.fitView();

        this.btnCancel = document.createElement("button");
        this.btnCancel.textContent = TEXT.discard;
        this.btnCancel.className = "mad-btn mad-btn-danger";
        this.btnCancel.onclick = () => {
            showCustomConfirm(
                TEXT.confirm.discardTitle,
                TEXT.confirm.discardMsg,
                () => {
                    this.profiles = JSON.parse(JSON.stringify(this.initialState.profiles));
                    this.activeProfileName = this.initialState.active_profile;
                    const activeProfile = this.profiles[this.activeProfileName];
                    this.config = activeProfile.loras;
                    this.snapInterval = activeProfile.settings.snap;

                    if (this.snapSliderEl) {
                        this.snapSliderEl.updateValue(this.snapInterval);
                    }
                    document.querySelectorAll(".mad-dynamic-step").forEach((el) => (el.dataset.step = this.snapInterval));

                    this.activeLoraIndex = -1;
                    this.pushState(HISTORY_ACTIONS.DISCARD);
                    this.updateSidebar();
                    this.draw();
                    this.updateButtonStates();
                    this.updatePreview(null);
                },
                null,
                TEXT.confirm.buttons.discard,
                CONFIRM_BUTTON_COLORS.DANGER,
            );
        };

        this.btnSave = document.createElement("button");
        this.btnSave.innerHTML = ICONS.check + `<span class="mad-ml-4">${TEXT.save}</span>`;
        this.btnSave.className = "mad-btn mad-btn-primary";
        this.btnSave.onclick = () => this.apply();
        rightGroup.appendChild(fitBtn);
        rightGroup.appendChild(this.btnCancel);
        rightGroup.appendChild(this.btnSave);
        header.appendChild(rightGroup);

        this.canvasContainer = document.createElement("div");
        this.canvasContainer.className = "mad-canvas-wrap";
        this.canvas = document.createElement("canvas");
        this.canvas.className = "mad-canvas";
        this.canvasContainer.appendChild(this.canvas);

        const statusBar = document.createElement("div");
        statusBar.className = "mad-status-bar";

        const statusLeft = document.createElement("span");
        statusLeft.innerHTML = TEXT.statusHelp;

        const statusRight = document.createElement("div");
        statusRight.className = "mad-status-right";

        const reportBtn = document.createElement("div");
        reportBtn.className = "mad-report-btn";
        reportBtn.innerHTML = ICONS.github;
        attachMadTooltip(reportBtn, TEXT.reportBug);
        reportBtn.onclick = () => window.open("https://github.com/PROJECTMAD/PROJECT-MAD-NODES/issues", "_blank");

        const brandSpan = document.createElement("span");
        brandSpan.className = "mad-opacity-60";
        brandSpan.textContent = TEXT.statusBrand;

        statusRight.appendChild(reportBtn);
        statusRight.appendChild(brandSpan);

        statusBar.appendChild(statusLeft);
        statusBar.appendChild(statusRight);

        contentArea.appendChild(header);
        contentArea.appendChild(this.canvasContainer);
        contentArea.appendChild(statusBar);
        this.dialog.appendChild(this.sidebar);
        this.dialog.appendChild(contentArea);
        document.body.appendChild(this.overlay);
        requestAnimationFrame(() => {
            this.overlay.classList.add("visible");
            this.dialog.classList.add("visible");
            this.isModalOpen = true;
        });
    }

    async updatePreview(loraName) {
        this.lastRequestedPreview = loraName;
        if (!loraName) {
            this.previewPane.classList.remove("visible");
            this.currentDisplayedLora = null;
            setTimeout(() => {
                if (!this.previewPane.classList.contains("visible")) this.previewViewport.innerHTML = "";
            }, 300);
            return;
        }
        if (this.currentDisplayedLora === loraName) {
            this.previewPane.classList.add("visible");
            return;
        }

        let loader = this.previewViewport.querySelector(".mad-preview-loading-overlay");
        if (!loader) {
            loader = document.createElement("div");
            loader.className = "mad-preview-loading-overlay";
            loader.innerHTML = TEMPLATES.loader;
            this.previewViewport.appendChild(loader);
        }

        const url = api.apiURL(`${API_ENDPOINTS.PREVIEW}?lora_name=` + encodeURIComponent(loraName));
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error("No preview found");
            if (this.lastRequestedPreview !== loraName) return;
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            let newMedia;
            if (blob.type.startsWith("video")) {
                newMedia = document.createElement("video");
                newMedia.autoplay = true;
                newMedia.loop = true;
                newMedia.muted = true;
            } else {
                newMedia = document.createElement("img");
            }
            newMedia.className = "mad-preview-media";
            newMedia.src = blobUrl;
            this.previewViewport.innerHTML = "";
            this.previewViewport.appendChild(newMedia);
            newMedia.offsetHeight;
            newMedia.classList.add("active");
            this.currentDisplayedLora = loraName;
            this.previewPane.classList.add("visible");
        } catch (e) {
            if (this.lastRequestedPreview === loraName) {
                this.previewViewport.innerHTML = "";
                let placeholder = document.createElement("div");
                placeholder.className = "mad-preview-media mad-preview-placeholder";
                placeholder.innerHTML = ICONS.image;
                this.previewViewport.appendChild(placeholder);
                placeholder.offsetHeight;
                placeholder.classList.add("active");
                this.currentDisplayedLora = loraName;
                this.previewPane.classList.add("visible");
            }
        }
    }

    schedulePreviewUpdate(indexToShow) {
        if (this.hoverIntentTimer) clearTimeout(this.hoverIntentTimer);
        if (indexToShow > -1 && indexToShow < this.config.length) {
            if (this.hoveredLoraIndex === indexToShow && this.currentDisplayedLora === this.config[indexToShow].lora_name) {
                return;
            }

            this.hoveredLoraIndex = indexToShow;

            this.hoverIntentTimer = setTimeout(() => {
                if (this.isUIInteraction) return;
                if (this.hoveredLoraIndex === indexToShow) {
                    this.updatePreview(this.config[indexToShow].lora_name);
                    this.renderSettings(indexToShow);
                }
            }, 150);
        } else {
            if (this.isMouseOverPreview) return;
            this.hoveredLoraIndex = -1;
            if (!this.revertIntentTimer) {
                this.revertIntentTimer = setTimeout(() => {
                    if (this.isUIInteraction) return;
                    if (this.isMouseOverPreview) return;
                    if (this.hoveredLoraIndex === -1) {
                        if (this.activeLoraIndex > -1) {
                            this.updatePreview(this.config[this.activeLoraIndex].lora_name);
                            this.renderSettings(this.activeLoraIndex);
                        } else {
                            this.updatePreview(null);
                            this.renderSettings(-1);
                        }
                    }
                    this.revertIntentTimer = null;
                }, 200);
            }
        }
    }

    setupSidebarMouseEvents() {
        if (this.listContainer) {
            this.listContainer.addEventListener("mouseenter", () => {
                this.isMouseOverSidebar = true;
                if (this.hoveredLoraIndex > -1) this.schedulePreviewUpdate(this.hoveredLoraIndex);
                this.sidebarMouseLeaveHandled = false;
            });
            this.listContainer.addEventListener("mouseleave", () => {
                this.isMouseOverSidebar = false;
                if (!this.sidebarMouseLeaveHandled && this.hoveredLoraIndex === -1) {
                    this.schedulePreviewUpdate(-1);
                    this.sidebarMouseLeaveHandled = true;
                }
            });
        }
    }
    attachRowEvents(row, idx) {
        row.onmouseenter = () => {
            if (this.isUIInteraction) return;
            if (this.revertIntentTimer) {
                clearTimeout(this.revertIntentTimer);
                this.revertIntentTimer = null;
            }

            if (idx === this.ignoreHoverIndex) {
                this.ignoreHoverIndex = -1;
                return;
            }

            this.schedulePreviewUpdate(idx);
        };

        row.onmouseleave = () => {
            if (this.isUIInteraction) return;

            if (idx === this.ignoreHoverIndex) {
                this.ignoreHoverIndex = -1;
                return;
            }

            this.schedulePreviewUpdate(-1);
        };
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
                item.className = `mad-history-item ${realIndex === this.historyStep ? "current" : ""}`;
                const timeStr = state.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                });
                item.innerHTML = `<span>${state.action}</span><span class="mad-history-time">${timeStr}</span>`;
                item.onclick = () => {
                    this.jumpToHistory(realIndex);
                    this.historyPopover.classList.remove("visible");
                };
                this.historyPopover.appendChild(item);
            });
        }
    }

    getSnapshot() {
        const cleanList = (list) =>
            (list || []).map((i) => {
                const out = {
                    lora_name: i?.lora_name,
                    enabled: i?.enabled !== undefined ? i.enabled : true,
                    strength_model: i?.strength_model,
                    strength_clip: i?.strength_clip,
                    points: Array.isArray(i?.points) ? i.points.map((p) => ({ x: p.x, y: p.y })) : undefined,
                    color: i?.color,
                    vectors: i?.vectors ? { ...i.vectors } : undefined,
                    preset: i?.preset,
                };
                if (out.vectors && Object.keys(out.vectors).length === 0) delete out.vectors;

                return out;
            });

        const outputProfiles = {};
        Object.keys(this.profiles).forEach((key) => {
            outputProfiles[key] = {
                loras: cleanList(this.profiles[key].loras),
                settings: this.profiles[key].settings,
            };
        });

        return {
            profiles: outputProfiles,
            active_profile: this.activeProfileName,

            snap_interval: this.snapInterval,
        };
    }
    sanitizeConfig(configList) {
        if (!Array.isArray(configList)) return [];

        const ramp = 0.001;

        return configList.map((item) => {
            if (!item.points) item.points = [];
            let pts = [...item.points].sort((a, b) => a.x - b.x);
            if (pts.length === 0) {
                pts = [
                    { x: 0, y: 1 },
                    { x: 1, y: 1 },
                ];
            }
            if (pts[0].x > 0) {
                const newStart = Math.max(0, pts[0].x - ramp);
                const prefix = [{ x: 0.0, y: 0.0 }];
                if (newStart > 0.0001) {
                    prefix.push({ x: normalizeFloat(newStart), y: 0.0 });
                }
                pts = [...prefix, ...pts];
            }
            const last = pts[pts.length - 1];
            if (last.x < 1.0) {
                const newEnd = Math.min(1.0, last.x + ramp);
                if (newEnd < 0.9999) {
                    pts.push({ x: normalizeFloat(newEnd), y: 0.0 });
                }
                pts.push({ x: 1.0, y: 0.0 });
            }
            const uniquePts = [];
            if (pts.length > 0) uniquePts.push(pts[0]);
            for (let i = 1; i < pts.length; i++) {
                if (Math.abs(pts[i].x - uniquePts[uniquePts.length - 1].x) > 0.0001) {
                    uniquePts.push(pts[i]);
                }
            }

            item.points = uniquePts;
            return item;
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
        this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

        this.canvas.addEventListener("dblclick", (e) => {
            if (this.activeLoraIndex === -1) return;
            const activeConfig = this.config[this.activeLoraIndex];
            if (!activeConfig.enabled) return;

            const rect = this.canvas.getBoundingClientRect();
            const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            const world = this.screenToWorld(pos.x, pos.y);

            if (world.x < 0 || world.x > 1) return;

            activeConfig.points.push({
                x: parseFloat(Math.max(0, Math.min(1, world.x)).toFixed(4)),
                y: parseFloat(world.y.toFixed(4)),
            });
            activeConfig.points.sort((a, b) => a.x - b.x);

            this.pushState(HISTORY_ACTIONS.ADD_KEYFRAME);
            this.updateSidebar();
            this.draw();
            this.updateButtonStates();
        });
        this._hasFitted = false;
        this.resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
                const w = entry.contentRect.width;
                const h = entry.contentRect.height;

                if (w > 0 && h > 0) {
                    this.canvas.width = w;
                    this.canvas.height = h;
                    if (!this._hasFitted) {
                        this.fitView();
                        this._hasFitted = true;
                    } else {
                        this.draw();
                    }
                }
            }
        });
        this.resizeObserver.observe(this.canvasContainer);
    }

    fitView() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        if (w <= 0 || h <= 0) return;

        const padding = 60;
        const availW = w - padding * 2;
        const availH = h - padding * 2;
        const scale = Math.max(10, Math.min(availW, availH));

        this.transform.k = scale;
        this.transform.x = (w - scale) / 2;
        this.transform.y = (h - scale) / 2;

        this.draw();
    }

    addLora() {
        new LoRAPickerDialog(this.availableLoras, (selectedName) => {
            const usedColors = new Set(this.config.map((c) => c.color));
            let color = LORA_COLORS.find((c) => !usedColors.has(c));
            if (!color) color = LORA_COLORS[this.config.length % LORA_COLORS.length];
            let newLora = {
                lora_name: selectedName,
                strength_model: 1.0,
                strength_clip: 1.0,
                color: color,
                enabled: true,
                points: [
                    { x: 0, y: 0 },
                    { x: 1, y: 1 },
                ],
                vectors: {},
            };

            newLora = this.sanitizeConfig([newLora])[0];

            this.config.push(newLora);
            this.activeLoraIndex = this.config.length - 1;
            this.pushState(HISTORY_ACTIONS.ADD_LORA);
            this.updateSidebar();
            setTimeout(() => {
                if (this.listContainer && this.listContainer.lastElementChild)
                    this.listContainer.lastElementChild.scrollIntoView({
                        behavior: "smooth",
                        block: "nearest",
                    });
            }, 50);
            this.draw();
            this.updateButtonStates();
            this.updatePreview(newLora.lora_name);
        });
    }

    removeLora(index, e) {
        e.stopPropagation();
        showCustomConfirm(
            TEXT.confirm.removeLoraTitle,
            TEXT.confirm.removeLoraMsg,
            () => {
                this.config.splice(index, 1);
                if (this.activeLoraIndex >= this.config.length) this.activeLoraIndex = this.config.length - 1;
                if (this.config.length === 0) this.activeLoraIndex = -1;
                this.pushState(HISTORY_ACTIONS.REMOVE_LORA);
                this.updateSidebar();
                this.draw();
                this.updateButtonStates();
                this.updatePreview(this.activeLoraIndex > -1 ? this.config[this.activeLoraIndex].lora_name : null);
            },
            null,
            TEXT.confirm.buttons.remove,
            CONFIRM_BUTTON_COLORS.DANGER,
        );
    }

    toggleLora(index, e) {
        e.stopPropagation();
        this.activeLoraIndex = index;

        this.config[index].enabled = !this.config[index].enabled;
        this.pushState(this.config[index].enabled ? HISTORY_ACTIONS.ENABLE_LORA : HISTORY_ACTIONS.DISABLE_LORA);

        this.updateSidebar();
        this.draw();
        this.updateButtonStates();
        this.updatePreview(this.config[index].lora_name);
    }

    setActive(index) {
        const wasActive = this.activeLoraIndex === index;
        if (wasActive) {
            this.activeLoraIndex = -1;
            this.ignoreHoverIndex = index;
            this.hoveredLoraIndex = -1;
            this.updatePreview(null);
        } else {
            this.activeLoraIndex = index;
            this.ignoreHoverIndex = -1;
            this.hoveredLoraIndex = index;
            this.updatePreview(this.config[index].lora_name);
        }
        this.updateSidebar();
        this.draw();
        this.updateButtonStates();
    }

    updateButtonStates() {
        if (!this.btnSave || !this.btnReset || !this.btnCancel) return;
        const currentSnapshot = this.getSnapshot();
        const hasChanges = JSON.stringify(currentSnapshot) !== JSON.stringify(this.initialState);

        const isEmpty = this.config.length === 0;
        this.btnReset.disabled = isEmpty;
        if (hasChanges) {
            this.btnSave.innerHTML = ICONS.check + `<span class="mad-ml-4">${TEXT.save}</span>`;
            this.btnCancel.disabled = false;
            this.btnCancel.classList.remove("mad-hidden");
        } else {
            this.btnSave.innerHTML = `<span class="mad-mx-4">${TEXT.close}</span>`;
            this.btnCancel.disabled = true;
            this.btnCancel.classList.add("mad-hidden");
        }
    }

    renderProfileManager() {
        const existing = this.sidebar.querySelector(".mad-profile-manager");
        if (existing) existing.remove();

        const container = el("div", { className: "mad-panel mad-profile-manager" });
        const label = el("div", { className: "mad-label-sm mad-no-events" }, TEXT.profileManager.label);

        const actions = el("div", { className: "mad-profile-actions" });
        const btnRename = el("button", {
            className: "mad-profile-action-btn",
            html: ICONS.edit,
        });
        attachMadTooltip(btnRename, TEXT.profileManager.rename);
        btnRename.onclick = () => {
            import("./Utils.js").then(({ createTextInputDialog }) => {
                createTextInputDialog(TEXT.profileManager.dialogTitleRen, this.activeProfileName, TEXT.profileManager.newPlaceholder, (newName) => {
                    if (newName === this.activeProfileName) return true;
                    if (this.profiles[newName]) return false;
                    this.profiles[newName] = this.profiles[this.activeProfileName];
                    delete this.profiles[this.activeProfileName];
                    this.activeProfileName = newName;
                    this.config = this.profiles[this.activeProfileName].loras;
                    this.snapInterval = this.profiles[this.activeProfileName].settings.snap;
                    if (this.snapSliderEl) this.snapSliderEl.updateValue(this.snapInterval);
                    document.querySelectorAll(".mad-dynamic-step").forEach((el) => (el.dataset.step = this.snapInterval));

                    this.pushState(HISTORY_ACTIONS.RENAME_PROFILE);
                    this.updateSidebar();
                    this.updateButtonStates();

                    return true;
                });
            });
        };
        const btnDelete = el("button", {
            className: "mad-profile-action-btn danger",
            html: ICONS.trash,
        });
        attachMadTooltip(btnDelete, TEXT.profileManager.delete);
        btnDelete.onclick = () => {
            const keys = Object.keys(this.profiles);
            const isLast = keys.length <= 1;

            const title = isLast ? "Reset Profile?" : TEXT.profileManager.delete;
            const msg = isLast ? "This is the last profile. It will be reset to 'Default' and cleared." : TEXT.profileManager.confirmDelete.replace("{name}", this.activeProfileName);
            const btnText = isLast ? TEXT.confirm.buttons.reset : TEXT.confirm.buttons.delete;

            showCustomConfirm(
                title,
                msg,
                () => {
                    if (isLast) {
                        this.profiles = { Default: { loras: [], settings: { snap: 0.05 } } };
                        this.activeProfileName = "Default";
                    } else {
                        delete this.profiles[this.activeProfileName];
                        this.activeProfileName = Object.keys(this.profiles)[0];
                    }
                    this.config = this.profiles[this.activeProfileName].loras;
                    this.snapInterval = this.profiles[this.activeProfileName].settings.snap;
                    this.activeLoraIndex = -1;
                    if (this.snapSliderEl) this.snapSliderEl.updateValue(this.snapInterval);
                    document.querySelectorAll(".mad-dynamic-step").forEach((el) => (el.dataset.step = this.snapInterval));

                    this.pushState(isLast ? HISTORY_ACTIONS.RESET_PROFILE : HISTORY_ACTIONS.DELETE_PROFILE);
                    this.updateSidebar();
                    this.draw();
                    this.updateButtonStates();
                },
                null,
                btnText,
                CONFIRM_BUTTON_COLORS.DANGER,
            );
        };

        actions.appendChild(btnRename);
        actions.appendChild(btnDelete);

        const header = el("div", { className: "mad-profile-header" }, label, actions);
        const controls = el("div", { className: "mad-profile-controls" });
        const options = Object.keys(this.profiles)
            .sort()
            .map((name) => ({
                val: name,
                txt: name,
                desc: `${this.profiles[name].loras.filter((x) => x.enabled !== false).length} Active`,
            }));

        const dropdown = createCustomSelect(
            options,
            this.activeProfileName,
            (val) => {
                this.activeProfileName = val;
                this.config = this.profiles[this.activeProfileName].loras;
                this.snapInterval = this.profiles[this.activeProfileName].settings.snap;
                this.activeLoraIndex = -1;
                if (this.snapSliderEl) this.snapSliderEl.updateValue(this.snapInterval);
                document.querySelectorAll(".mad-dynamic-step").forEach((el) => (el.dataset.step = this.snapInterval));

                this.pushState(HISTORY_ACTIONS.SWITCH_PROFILE);
                this.updateSidebar();
                this.draw();
                this.updateButtonStates();
                this.updatePreview(null);
            },
            false,
        );
        const btnNew = el("button", {
            className: "mad-profile-btn",
            html: ICONS.plus,
        });
        attachMadTooltip(btnNew, TEXT.profileManager.newProfile);
        btnNew.onclick = () => {
            import("./Utils.js").then(({ createTextInputDialog }) => {
                const defaultName = TEXT.profileManager.defaultNameTemplate.replace("%s", Object.keys(this.profiles).length + 1);
                createTextInputDialog(TEXT.profileManager.dialogTitleNew, defaultName, TEXT.profileManager.newPlaceholder, (name) => {
                    if (this.profiles[name]) return false;
                    this.profiles[name] = {
                        loras: [],
                        settings: { snap: 0.05 },
                    };

                    this.activeProfileName = name;
                    this.config = this.profiles[name].loras;
                    this.snapInterval = 0.05;
                    this.activeLoraIndex = -1;
                    if (this.snapSliderEl) this.snapSliderEl.updateValue(0.05);
                    document.querySelectorAll(".mad-dynamic-step").forEach((el) => (el.dataset.step = 0.05));

                    this.pushState(HISTORY_ACTIONS.NEW_PROFILE);
                    this.updateSidebar();
                    this.draw();
                    this.updateButtonStates();
                    return true;
                });
            });
        };
        const btnDup = el("button", {
            className: "mad-profile-btn",
            html: ICONS.copy,
        });
        attachMadTooltip(btnDup, TEXT.profileManager.dupProfile);
        btnDup.onclick = () => {
            import("./Utils.js").then(({ createTextInputDialog }) => {
                createTextInputDialog(TEXT.profileManager.dialogTitleDup, `${this.activeProfileName} Copy`, TEXT.profileManager.newPlaceholder, (name) => {
                    if (this.profiles[name]) return false;
                    this.profiles[name] = JSON.parse(JSON.stringify(this.profiles[this.activeProfileName]));

                    this.activeProfileName = name;
                    this.config = this.profiles[name].loras;
                    this.snapInterval = this.profiles[name].settings.snap;
                    this.activeLoraIndex = -1;
                    if (this.snapSliderEl) this.snapSliderEl.updateValue(this.snapInterval);
                    document.querySelectorAll(".mad-dynamic-step").forEach((el) => (el.dataset.step = this.snapInterval));

                    this.pushState(HISTORY_ACTIONS.DUP_PROFILE);
                    this.updateSidebar();
                    this.updateButtonStates();
                    return true;
                });
            });
        };

        controls.appendChild(dropdown);
        controls.appendChild(btnNew);
        controls.appendChild(btnDup);

        container.appendChild(header);
        container.appendChild(controls);
        this.sidebar.insertBefore(container, this.sidebar.firstChild.nextSibling);
    }

    updateSidebar() {
        this.renderProfileManager();

        this.renderedSettingsIndex = null;
        this.listContainer.innerHTML = "";

        let currentModel = this.getUpstreamModelName();
        if (currentModel) this._cachedModelName = currentModel;
        if (!currentModel && this._cachedModelName) currentModel = this._cachedModelName;

        const prevModel = this._lastCompatModel;
        if (prevModel !== undefined && currentModel && prevModel !== currentModel) {
            this._lastCompatModel = currentModel;
            for (const it of this.config) if (it?.compatibility) delete it.compatibility;
        } else if (this._lastCompatModel === undefined) {
            this._lastCompatModel = currentModel;
        }

        this.config.forEach((item, idx) => {
            const row = document.createElement("div");
            const isActive = idx === this.activeLoraIndex;
            const isEnabled = item.enabled !== false;

            row.className = `mad-list-item ${isActive ? "active" : ""} ${!isEnabled ? "disabled" : ""}`;
            row.style.borderLeftColor = item.color;
            if (!currentModel && item.lora_name && item.compatibility === undefined) {
                item.compatibility = {
                    compatible: false,
                    ckpt_arch: "UNKNOWN",
                    lora_arch: item.arch || "UNKNOWN",
                    message: TEXT.compat.noModel,
                    _reason: "NO_MODEL_NAME",
                };
            }
            if (currentModel && item.compatibility && item.compatibility._reason === "NO_MODEL_NAME") {
                delete item.compatibility;
            }
            if (currentModel && item.lora_name && item.compatibility === undefined) {
                item.compatibility = "checking";

                requestManager
                    .checkCompatibility(currentModel, item.lora_name)
                    .then((data) => {
                        item.compatibility = data;
                        if (data.lora_arch && data.lora_arch !== "UNKNOWN") {
                            item.arch = data.lora_arch;

                            requestManager.primeInspectCache(item.lora_name, data.lora_arch);
                        }
                        if (this.isModalOpen) {
                            if (this._sidebarUpdateTimer) clearTimeout(this._sidebarUpdateTimer);
                            this._sidebarUpdateTimer = setTimeout(() => this.updateSidebar(), 100);
                        }
                    })
                    .catch(() => {
                        item.compatibility = {
                            compatible: false,
                            message: TEXT.compat.checkFailed,
                        };
                        this.updateSidebar();
                    });
            }

            const nameSpan = document.createElement("span");
            nameSpan.textContent = item.lora_name.split(/[/\\]/).pop() || TEXT.selectLora;
            nameSpan.className = "mad-list-name";

            if (item.compatibility && item.compatibility.compatible === false) {
                const warn = document.createElement("span");
                warn.innerHTML = `${ICONS.danger}`;
                warn.className = "mad-compat-error mad-compat-icon";
                row.appendChild(warn);
            }

            const toggleBtn = document.createElement("span");
            toggleBtn.innerHTML = isEnabled ? ICONS.eye : ICONS.eyeOff;
            toggleBtn.className = "mad-icon-btn";
            attachMadTooltip(toggleBtn, isEnabled ? TEXT.tooltips.disable : TEXT.tooltips.enable);
            toggleBtn.onclick = (e) => this.toggleLora(idx, e);

            const delBtn = document.createElement("span");
            delBtn.innerHTML = ICONS.trash;
            delBtn.className = "mad-icon-btn mad-icon-del";
            attachMadTooltip(delBtn, TEXT.tooltips.remove);
            delBtn.onclick = (e) => this.removeLora(idx, e);

            row.onclick = () => this.setActive(idx);
            this.attachRowEvents(row, idx);

            row.appendChild(nameSpan);
            row.appendChild(toggleBtn);
            row.appendChild(delBtn);
            this.listContainer.appendChild(row);
        });
        this.renderSettings(this.activeLoraIndex);
        this.updateStats();
    }

    createSegmentedControl(options, onSelect, disabled) {
        const container = document.createElement("div");
        container.className = "mad-seg-control";
        if (disabled) {
            container.classList.add("mad-disabled-half");
        }

        options.forEach((opt) => {
            const btn = document.createElement("div");
            btn.className = "mad-seg-btn";
            btn.innerHTML = opt.icon;
            if (opt.tooltip) attachMadTooltip(btn, opt.tooltip);
            btn.onclick = () => {
                container.querySelectorAll(".mad-seg-btn").forEach((b) => b.classList.remove("active"));
                btn.classList.add("active");
                setTimeout(() => btn.classList.remove("active"), 200);
                onSelect(opt.val);
            };
            container.appendChild(btn);
        });
        return container;
    }

    renderSettings(index) {
        if (this.disabledOverlay) {
            if (index > -1 && index < this.config.length) {
                const item = this.config[index];

                if (!item.enabled) {
                    this.disabledOverlay.classList.add("visible");

                    this.overlayEnableBtn.onclick = (e) => {
                        this.toggleLora(index, e);
                        this.renderedSettingsIndex = null;
                        this.renderSettings(index);
                    };
                } else {
                    this.disabledOverlay.classList.remove("visible");
                }
            } else {
                this.disabledOverlay.classList.remove("visible");
            }
        }
        if (this.renderedSettingsIndex === index) return;

        this.renderedSettingsIndex = index;
        document.querySelectorAll(".mad-tooltip").forEach((el) => el.remove());
        this.settingsPanel.innerHTML = "";

        if (index > -1 && index < this.config.length) {
            const item = this.config[index];
            const isReadonly = index !== this.activeLoraIndex;
            const isDisabled = !item.enabled || isReadonly;
            const cached = requestManager.getCached(`inspect:${item.lora_name}`);

            if (cached && cached.stats) {
                item.arch = cached.arch;
                item.stats = cached.stats;
                item.statsLoaded = true;
                if (item.preset) {
                    const base = getVectorsForPreset(item.preset, item.stats, item.arch);
                    item.vectors = { ...base, ...(item.vectors || {}) };
                    delete item.preset;
                }
            } else if (!item.isFetching && !item.statsLoaded && item.lora_name) {
                item.isFetching = true;

                requestManager
                    .inspectLora(item.lora_name, false, true)
                    .then((data) => {
                        item.arch = data.arch;
                        item.stats = data.stats;
                    })
                    .finally(() => {
                        item.isFetching = false;
                        item.statsLoaded = true;
                        if (item.stats && item.preset) {
                            const base = getVectorsForPreset(item.preset, item.stats, item.arch);
                            item.vectors = { ...base, ...(item.vectors || {}) };
                            delete item.preset;
                        }
                        if (this.renderedSettingsIndex === index) {
                            this.renderedSettingsIndex = null;
                            this.renderSettings(index);
                        }
                    });
            }
            const header = document.createElement("div");
            header.className = "mad-setting-header";

            if (isDisabled) {
                header.classList.add("mad-disabled-content");
            }

            const hTitle = document.createElement("div");
            hTitle.className = "mad-setting-title";
            hTitle.textContent = TEXT.currentModel;
            const hRow = document.createElement("div");
            hRow.className = "mad-setting-value-row";
            const nameContainer = document.createElement("div");
            nameContainer.className = "mad-name-box";

            const modelName = document.createElement("span");
            modelName.className = "mad-model-name";
            modelName.textContent = item.lora_name.split(/[/\\]/).pop();
            attachMadTooltip(modelName, TEXT.fullPath.replace("{path}", item.lora_name));
            nameContainer.appendChild(modelName);

            if (item.compatibility) {
                const badge = document.createElement("span");
                badge.className = "mad-compat-badge";

                if (item.compatibility === "checking") {
                    badge.classList.add("mad-compat-checking");
                    badge.textContent = TEXT.compat.checking;
                } else if (item.compatibility.compatible) {
                    badge.classList.add("mad-compat-success");

                    let archName = item.compatibility.lora_arch && item.compatibility.lora_arch !== "UNKNOWN" ? item.compatibility.lora_arch.replace(/_/g, " ") : TEXT.compat.match;
                    badge.innerHTML = `${ICONS.check}`;
                    attachMadTooltip(badge, TEXT.compat.compatibleDesc.replace("{arch}", archName));
                } else {
                    badge.classList.add("mad-compat-error");
                    badge.innerHTML = `${ICONS.danger}`;
                    attachMadTooltip(badge, TEXT.compat.incompatibleDesc.replace("{message}", item.compatibility.message || TEXT.compat.unknownError));
                }
                nameContainer.appendChild(badge);
            }
            const btnContainer = document.createElement("div");
            btnContainer.className = "mad-btn-group-sm";
            const refreshBtn = document.createElement("button");
            refreshBtn.className = "mad-btn mad-btn-reset mad-btn-square-sm";
            refreshBtn.innerHTML = ICONS.refresh;
            attachMadTooltip(refreshBtn, TEXT.forceRefreshTooltip);

            refreshBtn.onclick = () => {
                requestManager.clearStorage(`inspect:${item.lora_name}`);
                const currentModel = this.getUpstreamModelName();
                if (currentModel) {
                    requestManager.clearStorage(`compat:${currentModel}:${item.lora_name}`);
                }

                item.stats = null;
                item.statsLoaded = false;
                item.isFetching = true;
                delete item.compatibility;

                requestManager
                    .inspectLora(item.lora_name, true, true)
                    .then((data) => {
                        item.arch = data.arch;
                        item.stats = data.stats;
                    })
                    .finally(() => {
                        item.isFetching = false;
                        item.statsLoaded = true;
                        this.renderedSettingsIndex = null;
                        this.renderSettings(index);
                    });

                this.updateSidebar();
                this.renderedSettingsIndex = null;
                this.renderSettings(index);
            };
            const resetBtn = document.createElement("button");
            resetBtn.className = "mad-btn mad-btn-reset mad-btn-square-sm";
            resetBtn.innerHTML = ICONS.reset;
            attachMadTooltip(resetBtn, TEXT.resetParamsTooltip);

            resetBtn.onclick = () => {
                item.strength_model = 1.0;
                item.strength_clip = 1.0;
                item.vectors = {};
                this.pushState(HISTORY_ACTIONS.RESET_PARAMS);
                this.renderedSettingsIndex = null;
                this.renderSettings(index);
                this.updateButtonStates();
            };

            const swapBtn = document.createElement("button");
            swapBtn.className = "mad-btn-swap";
            swapBtn.innerHTML = `${ICONS.edit} ${TEXT.swap}`;
            swapBtn.disabled = isDisabled;
            swapBtn.onclick = () => {
                const currentPath = item.lora_name || "";
                const lastSlash = Math.max(currentPath.lastIndexOf("/"), currentPath.lastIndexOf("\\"));
                const initialSearch = lastSlash > -1 ? currentPath.substring(0, lastSlash + 1) : "";

                new LoRAPickerDialog(
                    this.availableLoras,
                    (newName) => {
                        item.lora_name = newName;
                        delete item.compatibility;
                        delete item.arch;
                        delete item.stats;
                        delete item.statsLoaded;
                        delete item.isFetching;
                        this.pushState(HISTORY_ACTIONS.CHANGE_LORA);
                        this.renderedSettingsIndex = null;
                        this.updateSidebar();
                        this.updateButtonStates();
                        this.updatePreview(newName);
                    },
                    initialSearch,
                );
            };

            btnContainer.appendChild(refreshBtn);
            btnContainer.appendChild(resetBtn);
            btnContainer.appendChild(swapBtn);

            hRow.appendChild(nameContainer);
            hRow.appendChild(btnContainer);

            header.appendChild(hTitle);
            header.appendChild(hRow);
            this.settingsPanel.appendChild(header);

            if (item.stats) {
                const analysisPanel = AnalysisPanel.create(item.stats, item.arch);

                if (isDisabled) {
                    analysisPanel.classList.add("mad-disabled-content");
                }

                this.settingsPanel.appendChild(analysisPanel);
            } else if (item.isFetching || (!item.statsLoaded && item.lora_name)) {
                const loader = document.createElement("div");
                loader.className = "mad-loader-box";
                loader.innerHTML = TEMPLATES.loaderWithText.replace("%s", TEXT.scanningTensorStructure);
                this.settingsPanel.appendChild(loader);
            }
            this.settingsPanel.appendChild(
                createTitanSlider(
                    TEXT.sliders.model,
                    -15,
                    15,
                    this.snapInterval,
                    item.strength_model,
                    (v, c) => {
                        item.strength_model = v;
                        if (c) this.pushState(HISTORY_ACTIONS.CHANGE_STRENGTH);
                        this.draw();
                        this.updateButtonStates();
                    },
                    isDisabled,
                    true,
                    SLIDER_DESCRIPTIONS.model,
                    () => {
                        this.isUIInteraction = true;
                    },
                    () => {
                        this.isUIInteraction = false;
                    },
                    true,
                ),
            );
            this.settingsPanel.appendChild(
                createTitanSlider(
                    TEXT.sliders.clip,
                    -15,
                    15,
                    this.snapInterval,
                    item.strength_clip,
                    (v, c) => {
                        item.strength_clip = v;
                        if (c) this.pushState(HISTORY_ACTIONS.CHANGE_CLIP);
                        this.updateButtonStates();
                    },
                    isDisabled,
                    true,
                    SLIDER_DESCRIPTIONS.clip,
                    () => {
                        this.isUIInteraction = true;
                    },
                    () => {
                        this.isUIInteraction = false;
                    },
                    true,
                ),
            );
            const hasVectors = item.vectors && Object.keys(item.vectors).length > 0;
            let activeCount = 0;
            let totalBlocks = 0;

            if (item.stats && item.stats.energy_distribution) {
                const keys = Object.keys(item.stats.energy_distribution);
                totalBlocks = keys.length;
                keys.forEach((k) => {
                    const val = item.vectors && item.vectors[k] !== undefined ? item.vectors[k] : 1.0;
                    if (val > 0.001) activeCount++;
                });
            }

            const btnEditVectors = document.createElement("button");
            btnEditVectors.className = "mad-btn-swap mad-btn-vectors";
            if (isDisabled) {
                btnEditVectors.classList.add("mad-disabled-content");
            }
            let presetBadgeHtml = "";
            if (item.stats && item.stats.energy_distribution) {
                const detected = detectPreset(item.vectors, item.stats, item.arch);
                if (detected && detected !== "CUSTOM" && detected !== "LINEAR") {
                    const label = PRESET_STRATEGIES[detected]?.label || detected;

                    const shortLabel = label.replace(" (Default)", "").replace(" Distribution", "").replace(" Focused", "");
                    presetBadgeHtml = `<span class="mad-preset-badge">${shortLabel}</span>`;
                }
            }
            const isModified = hasVectors || activeCount !== totalBlocks;

            const statusText = isModified ? `<span class="mad-text-accent">${TEXT.blockEditor.vectorsActive} (${activeCount}/${totalBlocks})</span>` : `<span class="mad-opacity-70">${TEXT.blockEditor.vectorsDefault}</span>`;
            btnEditVectors.innerHTML = `<span>${TEXT.blockEditor.manageVectors}${presetBadgeHtml}</span>${statusText}`;

            if (!item.stats) {
                btnEditVectors.disabled = true;
                btnEditVectors.innerHTML = `<span>${TEXT.blockEditor.manageVectors}</span><span>${TEXT.blockEditor.scanning}</span>`;
                btnEditVectors.classList.add("mad-dimmed");
            }

            btnEditVectors.onclick = () => {
                new BlockEditorDialog(item.lora_name, item.arch, item.stats, item.vectors, this.snapInterval, (newVectors) => {
                    delete item.preset;

                    if (newVectors) {
                        item.vectors = newVectors;
                        this.pushState(HISTORY_ACTIONS.UPDATE_VECTORS);
                    } else {
                        delete item.vectors;
                        this.pushState(HISTORY_ACTIONS.CLEAR_VECTORS);
                    }
                    this.renderedSettingsIndex = null;
                    this.renderSettings(index);
                    this.updateButtonStates();
                });
            };

            this.settingsPanel.appendChild(btnEditVectors);

            const keyframeControl = document.createElement("div");
            keyframeControl.className = "mad-kf-control";
            const kfLabel = document.createElement("span");
            kfLabel.textContent = TEXT.resampleCurve;
            kfLabel.className = "mad-label-sm";
            if (isDisabled) {
                kfLabel.classList.add("mad-disabled-content");
            }
            const kfRow = document.createElement("div");
            kfRow.className = "mad-kf-row mad-flex-col";

            let resampleCount = Math.max(2, item.points.length);

            const resampleSlider = createTitanSlider(
                TEXT.sliders.target,
                2,
                100,
                1,
                resampleCount,
                (val) => {
                    resampleCount = val;
                },
                isDisabled,
                false,
                SLIDER_DESCRIPTIONS.resample,
                () => {
                    this.isUIInteraction = true;
                },
                () => {
                    this.isUIInteraction = false;
                },
            );

            const applyResample = (mode) => {
                const count = parseInt(resampleCount) || 5;
                if (count < 2) return;
                const newPoints = [];
                const startX = item.points[0].x;
                const endX = item.points[item.points.length - 1].x;

                const firstY = item.points[0].y;
                const lastY = item.points[item.points.length - 1].y;

                let easeFunc = Easing.linear;
                if (mode === "ease") easeFunc = Easing.easeInOutSine;
                else if (mode === "cubic") easeFunc = Easing.cubic;
                else if (mode === "step") easeFunc = Easing.step;

                for (let i = 0; i < count; i++) {
                    const t = i / (count - 1);
                    const mappedX = startX + (endX - startX) * t;
                    const mappedY = lerp(firstY, lastY, easeFunc(t));

                    newPoints.push({
                        x: parseFloat(mappedX.toFixed(4)),
                        y: parseFloat(mappedY.toFixed(4)),
                    });
                }
                item.points = newPoints;
                this.pushState(`${HISTORY_ACTIONS.RESAMPLE} (${mode})`);
                this.draw();
                this.updateButtonStates();
            };

            const segControl = this.createSegmentedControl(
                [
                    {
                        val: "linear",
                        icon: ICONS.linear,
                        tooltip: "Linear Interpolation",
                    },
                    { val: "ease", icon: ICONS.ease, tooltip: "Ease In/Out (Sine)" },
                    { val: "cubic", icon: ICONS.cubic, tooltip: "Cubic Bezier" },
                    { val: "step", icon: ICONS.step, tooltip: "Step Function" },
                ],
                applyResample,
                isDisabled,
            );

            kfRow.appendChild(resampleSlider);
            kfRow.appendChild(segControl);
            keyframeControl.appendChild(kfLabel);
            keyframeControl.appendChild(kfRow);
            this.settingsPanel.appendChild(keyframeControl);
        } else {
            if (!this.hoveredLoraName) this.updatePreview(null);
        }
    }

    getValueAtTime(points, t) {
        if (!points || points.length === 0) return 0;

        if (t < points[0].x || t > points[points.length - 1].x) return 0;

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
        let maxModel = -Infinity,
            minModel = Infinity,
            maxClip = -Infinity,
            minClip = Infinity;
        const enabledLoras = this.config.filter((c) => c.enabled !== false);
        for (let i = 0; i <= 100; i++) {
            const t = i / 100;
            let currentModelSum = 0;
            let currentClipSum = 0;
            enabledLoras.forEach((lora) => {
                const y = this.getValueAtTime(lora.points, t);
                currentModelSum += y * (lora.strength_model ?? 1.0);
                currentClipSum += y * (lora.strength_clip ?? 1.0);
            });
            if (currentModelSum > maxModel) maxModel = currentModelSum;
            if (currentModelSum < minModel) minModel = currentModelSum;
            if (currentClipSum > maxClip) maxClip = currentClipSum;
            if (currentClipSum < minClip) minClip = currentClipSum;
        }
        if (enabledLoras.length === 0) {
            maxModel = 0;
            minModel = 0;
            maxClip = 0;
            minClip = 0;
        }

        const modelVal = `${TEXT.stats.min}: ${minModel.toFixed(2)} / ${TEXT.stats.max}: ${maxModel.toFixed(2)}`;
        const clipVal = `${TEXT.stats.min}: ${minClip.toFixed(2)} / ${TEXT.stats.max}: ${maxClip.toFixed(2)}`;

        let html = TEMPLATES.statsBox;
        html = html.replace("%s", TEXT.stats.combinedPeakStrengths).replace("%s", TEXT.stats.modelLabel).replace("%s", modelVal).replace("%s", TEXT.stats.clipLabel).replace("%s", clipVal).replace("%s", TEXT.stats.note);

        this.statsContainer.innerHTML = html;
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
        ctx.fillStyle = CANVAS_COLORS.BG;
        ctx.fillRect(0, 0, w, h);
        const bl = this.worldToScreen(0, 0);
        const tr = this.worldToScreen(1, 1);
        ctx.fillStyle = CANVAS_COLORS.ZONE_BG;
        const zoneX = bl.x;
        const zoneY = tr.y;
        const zoneW = tr.x - bl.x;
        const zoneH = bl.y - tr.y;
        ctx.fillRect(zoneX, zoneY, zoneW, zoneH);
        ctx.strokeStyle = CANVAS_COLORS.ZONE_BORDER;
        ctx.lineWidth = 2;
        ctx.strokeRect(zoneX, zoneY, zoneW, zoneH);
        ctx.lineWidth = 1;
        ctx.font = CANVAS_FONTS.axis;
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
        ctx.strokeStyle = CANVAS_COLORS.GRID_MAJOR;
        ctx.fillStyle = CANVAS_COLORS.TEXT;
        const origin = this.worldToScreen(0, 0);
        let labelY = origin.y;
        if (labelY > h - 20) labelY = h - 20;
        if (labelY < 20) labelY = 20;
        let labelX = origin.x;
        if (labelX < 30) labelX = 30;
        if (labelX > w - 30) labelX = w - 30;
        for (let v = startX; v <= endX + step / 2; v += step) {
            const x = this.worldToScreen(v, 0).x;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
            if (x > -20 && x < w + 20) ctx.fillText(v.toFixed(10).replace(/\.?0+$/, ""), x, labelY + 12);
        }
        ctx.textAlign = "right";
        for (let v = startY; v <= endY + step / 2; v += step) {
            const y = this.worldToScreen(0, v).y;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
            if (y > -10 && y < h + 10) ctx.fillText(v.toFixed(10).replace(/\.?0+$/, ""), labelX - 8, y);
        }
        ctx.strokeStyle = CANVAS_COLORS.AXIS;
        ctx.lineWidth = 2;
        if (origin.x >= 0 && origin.x <= w) {
            ctx.beginPath();
            ctx.moveTo(origin.x, 0);
            ctx.lineTo(origin.x, h);
            ctx.stroke();
        }
        if (origin.y >= 0 && origin.y <= h) {
            ctx.beginPath();
            ctx.moveTo(0, origin.y);
            ctx.lineTo(w, origin.y);
            ctx.stroke();
        }
        this.config.forEach((item, idx) => {
            if (idx === this.activeLoraIndex) return;
            this.drawCurve(ctx, item.points, item.color, false, item.enabled);
        });
        if (this.activeLoraIndex > -1) {
            const item = this.config[this.activeLoraIndex];
            this.drawCurve(ctx, item.points, item.color, true, item.enabled);
            if (item.enabled !== false) this.drawPoints(ctx, item.points, item.color);
        }
        if (this.isDraggingPoint && this.selectedPoint && this.activeLoraIndex > -1) {
            const activeConfig = this.config[this.activeLoraIndex];
            const p = activeConfig.points[this.selectedPoint.index];
            this.drawTooltip(ctx, p, this.selectedPoint.index, activeConfig);
        }
    }

    drawTooltip(ctx, point, index, loraConfig) {
        const pos = this.worldToScreen(point.x, point.y);
        const sModel = loraConfig.strength_model ?? 1.0;
        const sClip = loraConfig.strength_clip ?? 1.0;

        const lines = [TEXT.canvas.tooltip.keyframe.replace("%s", index + 1), TEXT.canvas.tooltip.model.replace("%s", (point.y * sModel).toFixed(3)), TEXT.canvas.tooltip.clip.replace("%s", (point.y * sClip).toFixed(3)), TEXT.canvas.tooltip.progress.replace("%s", (point.x * 100).toFixed(1))];

        ctx.font = CANVAS_FONTS.tooltip;
        const lineHeight = 15;
        const pad = 8;
        let maxWidth = 0;
        lines.forEach((line) => {
            const w = ctx.measureText(line).width;
            if (w > maxWidth) maxWidth = w;
        });
        const boxW = maxWidth + pad * 2;
        const boxH = lines.length * lineHeight + pad * 2;
        const offset = 15;
        let tx = pos.x + offset;
        let ty = pos.y - boxH / 2;
        if (tx + boxW > this.canvas.width) tx = pos.x - boxW - offset;
        if (ty < 0) ty = 0;
        if (ty + boxH > this.canvas.height) ty = this.canvas.height - boxH;
        ctx.fillStyle = CANVAS_COLORS.TOOLTIP_BG;
        ctx.strokeStyle = CANVAS_COLORS.TOOLTIP_BORDER;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(Math.round(tx), Math.round(ty), boxW, boxH, 4);
        ctx.fill();
        ctx.stroke();
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        lines.forEach((line, i) => {
            if (line.startsWith("Model")) ctx.fillStyle = CANVAS_COLORS.MODEL;
            else if (line.startsWith("CLIP")) ctx.fillStyle = CANVAS_COLORS.CLIP;
            else ctx.fillStyle = CANVAS_COLORS.DEFAULT;
            ctx.fillText(line, Math.round(tx + pad), Math.round(ty + pad + i * lineHeight));
        });
    }

    drawCurve(ctx, points, color, isActive, isEnabled) {
        if (!points || points.length === 0) return;

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
        if (!points || !Array.isArray(points)) return;

        points.forEach((p, i) => {
            const pos = this.worldToScreen(p.x, p.y);
            const isHover = this.hoveredPoint && this.hoveredPoint.index === i;
            const isSel = this.selectedPoint && this.selectedPoint.index === i;

            ctx.beginPath();
            ctx.arc(pos.x, pos.y, isHover || isSel ? 8 : 5, 0, Math.PI * 2);

            ctx.fillStyle = isSel ? CANVAS_COLORS.SELECTED : color || CANVAS_COLORS.DEFAULT;
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
        if (this.isDraggingPoint && this.selectedPoint && this.activeLoraIndex > -1) {
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
            this.pushState(HISTORY_ACTIONS.MOVE_KEYFRAME);
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
        const snapshot = this.getSnapshot();
        Object.keys(this.profiles).forEach((profileName) => {
            const liveProfile = this.profiles[profileName];
            const outProfile = snapshot.profiles[profileName];
            const liveList = liveProfile.loras;
            const outList = outProfile.loras;

            liveList.forEach((liveItem, idx) => {
                const outItem = outList[idx];
                if (!outItem) return;
                if (liveItem.stats && liveItem.stats.energy_distribution) {
                    const detected = detectPreset(liveItem.vectors, liveItem.stats, liveItem.arch);
                    if (detected && detected !== "CUSTOM" && detected !== "LINEAR") {
                        outItem.preset = detected;

                        delete outItem.vectors;
                    }
                }
            });
        });
        if (JSON.stringify(snapshot) !== JSON.stringify(this.initialState)) {
            this.onUpdate(snapshot);
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
