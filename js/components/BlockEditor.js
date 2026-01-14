import { TEXT, PRESET_STRATEGIES, PRESET_COMPATIBLE_ARCHS, BLOCK_GROUPS, SEMANTIC_COLORS } from "./Constants.js";
import { ICONS } from "./Icons.js";
import { createTitanSlider } from "./TitanSlider.js";
import { sortBlocks, getAnalysisColor, attachMadTooltip, classifyBlock, el, detectPreset, getVectorsForPreset, createAnalysisLegend, normalizeFloat } from "./Utils.js";

export class BlockEditorDialog {
    constructor(loraName, arch, stats, currentVectors, snapInterval, onSave) {
        this.loraName = loraName;
        this.arch = arch;
        this.stats = stats || { energy_distribution: {}, block_metadata: {} };
        this.vectors = currentVectors ? { ...currentVectors } : {};
        this.snapInterval = snapInterval || 0.05;
        this.onSave = onSave;
        this.groupCounters = {};
        this.groupKeys = {};
        this.groupStates = {};
        this.presetButtons = {};
        this.maxEnergy = 0;
        Object.values(this.stats.energy_distribution || {}).forEach((v) => (this.maxEnergy = Math.max(this.maxEnergy, v)));

        this.groupSyncModes = {};
        this._boundKeyHandler = this.handleKey.bind(this);
        if (!this.stats.block_metadata || Object.keys(this.stats.block_metadata).length === 0) {
            this.renderError();
        } else {
            this.render();
        }

        document.body.appendChild(this.overlay);
        void this.overlay.offsetWidth;

        requestAnimationFrame(() => {
            this.overlay.classList.add("visible");
            this.modal.classList.add("visible");
        });

        document.addEventListener("keydown", this._boundKeyHandler);
    }

    detectSynced(keys) {
        if (!keys || keys.length < 2) return false;
        const firstVal = this.getVal(keys[0]);
        return keys.every((k) => Math.abs(this.getVal(k) - firstVal) < 0.001);
    }

    renderError() {
        this.modal = el(
            "div",
            { className: "mad-modal mad-block-editor-modal mad-error-state" },
            el("div", { className: "mad-error-icon", html: TEXT.blockEditor.metadataMissing }),
            el("div", { className: "mad-error-text" }, TEXT.blockEditor.metadataMissingMsg),
            el(
                "button",
                {
                    className: "mad-btn",
                    onclick: () => this.close(),
                },
                TEXT.close,
            ),
        );

        this.overlay = el(
            "div",
            {
                className: "mad-overlay",
                onclick: (e) => {
                    if (e.target === this.overlay) this.close();
                },
            },
            this.modal,
        );
    }

    render() {
        this.globalCounter = el("div", { className: "mad-label-sm mad-global-counter" });
        const btnClear = el(
            "button",
            {
                className: "mad-btn mad-btn-reset",
                onclick: () => this.bulkSet(0.0),
            },
            TEXT.blockEditor.clear,
        );
        attachMadTooltip(btnClear, TEXT.blockEditor.setZeroTooltip);

        const btnReset = el(
            "button",
            {
                className: "mad-btn mad-btn-reset",
                onclick: () => this.bulkSet(1.0),
            },
            TEXT.blockEditor.reset,
        );
        attachMadTooltip(btnReset, TEXT.blockEditor.setOneTooltip);
        const header = el(
            "div",
            { className: "mad-block-header" },

            el("div", {}, el("div", { className: "mad-block-title" }, TEXT.blockEditor.title), el("div", { className: "mad-block-subtitle" }, TEXT.blockEditor.subtitle, this.loraName.split(/[/\\]/).pop(), el("span", { className: "mad-arch-tag" }, this.arch || "UNKNOWN")), this.globalCounter),

            el("div", { className: "mad-block-actions" }, btnClear, btnReset),
        );
        this.content = el("div", { className: "mad-block-content" });
        this.presetWrapper = el("div", { className: "mad-block-preset-wrapper" });

        const archUpper = (this.arch || "").toUpperCase();
        const isSupported = PRESET_COMPATIBLE_ARCHS.some((prefix) => archUpper.includes(prefix));

        if (!isSupported) {
            this.presetWrapper.classList.add("mad-disabled-content");
        }
        const toolbar = el(
            "div",
            { className: "mad-block-toolbar" },
            el(
                "button",
                {
                    className: "mad-text-action",
                    onclick: () => this.toggleAllGroups(true),
                },
                TEXT.blockEditor.expandAll,
            ),
            el(
                "button",
                {
                    className: "mad-text-action",
                    onclick: () => this.toggleAllGroups(false),
                },
                TEXT.blockEditor.collapseAll,
            ),
        );
        const stickyHeader = el("div", { className: "mad-block-sticky-header" }, this.presetWrapper, toolbar);
        this.renderPresetBar(isSupported);
        this.listContainer = el("div", { className: "mad-block-list-container" });
        this.content.appendChild(this.listContainer);

        this.renderList();
        this.updateGlobalCounter();
        const footerLegend = el("div", { className: "mad-block-footer-legend mad-scale-12" }, createAnalysisLegend());
        const footer = el(
            "div",
            { className: "mad-block-footer" },
            footerLegend,
            el(
                "div",
                { className: "mad-block-footer-actions" },
                el(
                    "button",
                    {
                        className: "mad-btn",
                        onclick: () => this.close(),
                    },
                    TEXT.blockEditor.cancel,
                ),
                el(
                    "button",
                    {
                        className: "mad-btn mad-btn-primary",
                        onclick: () => {
                            const cleaned = {};
                            let count = 0;
                            for (const [k, v] of Object.entries(this.vectors)) {
                                if (Math.abs(v - 1.0) > 0.001) {
                                    cleaned[k] = v;
                                    count++;
                                }
                            }
                            const payload = count > 0 ? cleaned : null;
                            this.onSave(payload);
                            this.close();
                        },
                    },
                    TEXT.blockEditor.apply,
                ),
            ),
        );

        this.modal = el("div", { className: "mad-modal mad-block-editor-modal" }, header, stickyHeader, this.content, footer);

        this.overlay = el(
            "div",
            {
                className: "mad-overlay",
                onmousedown: (e) => {
                    this.mouseDownOnOverlay = e.target === this.overlay;
                },
                onclick: (e) => {
                    if (e.target === this.overlay && this.mouseDownOnOverlay) this.close();
                    this.mouseDownOnOverlay = false;
                },
            },
            this.modal,
        );
    }

    renderPresetBar(isEnabled = true) {
        this.presetWrapper.innerHTML = "";
        this.presetButtons = {};

        const labelText = isEnabled ? TEXT.blockEditor.presetLabel : `${TEXT.blockEditor.presetLabel} (Unsupported Architecture)`;

        const label = el("div", { className: "mad-label-sm mad-cursor-help" }, labelText);
        attachMadTooltip(label, TEXT.blockEditor.strategyTooltip);

        const container = el("div", { className: "mad-seg-control" });

        const shortLabels = TEXT.blockEditor.presetShortLabels;

        const currentPreset = this.detectPreset();

        Object.entries(PRESET_STRATEGIES).forEach(([key, strat]) => {
            const btn = el(
                "div",
                {
                    className: `mad-seg-btn mad-seg-text-btn ${currentPreset === key ? "active" : ""}`,
                    onclick: () => this.applyPreset(key),
                },
                shortLabels[key] || strat.label,
            );

            let tooltipHtml = `<strong>${strat.label}</strong><br/>${strat.desc}`;
            attachMadTooltip(btn, tooltipHtml);

            this.presetButtons[key] = btn;
            container.appendChild(btn);
        });

        this.presetWrapper.appendChild(label);
        this.presetWrapper.appendChild(container);
    }

    updatePresetUI() {
        const current = this.detectPreset();
        Object.entries(this.presetButtons).forEach(([key, btn]) => {
            if (key === current) btn.classList.add("active");
            else btn.classList.remove("active");
        });
    }

    toggleAllGroups(expand) {
        Object.keys(this.groupStates).forEach((k) => {
            this.groupStates[k] = expand;
        });
        this.renderList();
    }
    detectPreset() {
        return detectPreset(this.vectors, this.stats, this.arch);
    }

    getVal(key) {
        return this.vectors[key] !== undefined ? normalizeFloat(this.vectors[key]) : 1.0;
    }
    getBlockBaseColor(key) {
        const meta = this.stats.block_metadata[key];
        const tag = meta ? meta.tag : classifyBlock(key, this.arch);
        return SEMANTIC_COLORS[tag] || SEMANTIC_COLORS["OTHER"];
    }
    applyPreset(presetKey) {
        const newVectors = getVectorsForPreset(presetKey, this.stats, this.arch);
        this.vectors = { ...newVectors };
        this.groupSyncModes = {};
        this.renderList();
        this.updatePresetUI();
        this.updateGlobalCounter();
    }

    bulkSet(val) {
        const allBlocks = Object.keys(this.stats.energy_distribution || {});
        allBlocks.forEach((key) => {
            if (Math.abs(val - 1.0) < 0.001) delete this.vectors[key];
            else this.vectors[key] = val;
        });
        this.groupSyncModes = {};
        this.renderList();
        this.updatePresetUI();
        this.updateGlobalCounter();
    }

    updateGlobalCounter() {
        if (!this.globalCounter) return;

        const allBlocks = Object.keys(this.stats.energy_distribution || {});
        const total = allBlocks.length;
        let active = 0;

        allBlocks.forEach((k) => {
            if (this.getVal(k) > 0.0) active++;
        });

        this.globalCounter.textContent = TEXT.blockEditor.globalActive.replace("{count}", active).replace("{total}", total);

        this.globalCounter.style.opacity = active > 0 ? "1" : "0.5";
    }

    renderList() {
        document.querySelectorAll(".mad-tooltip").forEach((el) => el.remove());

        this.listContainer.innerHTML = "";
        this.groupCounters = {};
        this.groupKeys = {};

        const allBlocks = Object.keys(this.stats.energy_distribution || {});
        const sortedBlocks = sortBlocks(allBlocks);
        const groups = {};
        if (BLOCK_GROUPS && BLOCK_GROUPS.length > 0) {
            BLOCK_GROUPS.forEach((g) => (groups[g.label] = []));
        } else {
            groups[TEXT.fallbackBlockGroups.clip] = [];
            groups[TEXT.fallbackBlockGroups.input] = [];
            groups[TEXT.fallbackBlockGroups.middle] = [];
            groups[TEXT.fallbackBlockGroups.output] = [];
            groups[TEXT.fallbackBlockGroups.layers] = [];
            groups[TEXT.fallbackBlockGroups.aux] = [];
        }

        sortedBlocks.forEach((key) => {
            const meta = this.stats.block_metadata[key];
            if (meta && meta.group) {
                const groupDef = BLOCK_GROUPS.find((g) => g.id === meta.group);
                const label = groupDef ? groupDef.label : TEXT.fallbackBlockGroups.aux;
                if (!groups[label]) groups[label] = [];
                groups[label].push(key);
            } else {
                const k = key.toLowerCase();
                if (k.startsWith("clip") || k.startsWith("te_")) groups[TEXT.fallbackBlockGroups.clip].push(key);
                else if (k.match(/(?:^|_)(input|down|double)/i)) groups[TEXT.fallbackBlockGroups.input].push(key);
                else if (k.match(/(?:^|_)(middle|mid|joint)/i)) groups[TEXT.fallbackBlockGroups.middle].push(key);
                else if (k.match(/(?:^|_)(output|up|single)/i)) groups[TEXT.fallbackBlockGroups.output].push(key);
                else if (k.startsWith("layers")) groups[TEXT.fallbackBlockGroups.layers].push(key);
                else groups[TEXT.fallbackBlockGroups.aux].push(key);
            }
        });

        Object.entries(groups).forEach(([groupName, keys]) => {
            if (keys.length === 0) return;

            this.groupKeys[groupName] = keys;

            if (this.groupStates[groupName] === undefined) {
                this.groupStates[groupName] = true;
            }
            const groupColor = keys.length > 0 ? this.getBlockBaseColor(keys[0]) : "#9e9e9e";

            const arrow = el("span", {
                className: "mad-arrow-icon",
                html: this.groupStates[groupName] ? ICONS.arrowDown : ICONS.arrowRight,
            });
            const colorDot = el("span", {
                className: "mad-group-dot",
                style: { backgroundColor: groupColor },
            });

            const counter = el("span", { className: "mad-group-counter" }, "...");
            this.groupCounters[groupName] = counter;

            const headerContent = [colorDot, arrow, groupName, counter];
            const canSync = keys.length > 1;
            if (canSync && this.groupSyncModes[groupName] === undefined) {
                this.groupSyncModes[groupName] = this.detectSynced(keys);
            }

            const isSynced = canSync && this.groupSyncModes[groupName];

            if (canSync) {
                const syncBtn = el("button", {
                    className: "mad-btn mad-btn-reset mad-sync-btn",
                    style: {
                        color: isSynced ? "var(--accent)" : "var(--text-muted)",
                        borderColor: isSynced ? "var(--accent)" : "transparent",
                        display: this.groupStates[groupName] ? "inline-flex" : "none",
                    },
                    onclick: (e) => {
                        e.stopPropagation();

                        const newState = !this.groupSyncModes[groupName];
                        this.groupSyncModes[groupName] = newState;
                        if (newState) {
                            const alignVal = this.getVal(keys[0]);
                            keys.forEach((k) => {
                                if (Math.abs(alignVal - 1.0) < 0.001) delete this.vectors[k];
                                else this.vectors[k] = alignVal;
                            });
                            this.updateGlobalCounter();
                            this.updatePresetUI();
                        }

                        this.renderList();
                    },
                    html: isSynced ? `${ICONS.arrowRight} ${TEXT.blockEditor.synced}` : `${TEXT.blockEditor.split} ${ICONS.arrowDown}`,
                });

                attachMadTooltip(syncBtn, isSynced ? TEXT.blockEditor.syncedTooltip : TEXT.blockEditor.splitTooltip);

                headerContent.push(syncBtn);
            }

            const header = el(
                "div",
                {
                    className: "mad-block-group-header",
                },
                ...headerContent,
            );

            const rowContainer = el("div", {
                style: { display: this.groupStates[groupName] ? "block" : "none" },
            });

            header.onclick = (e) => {
                if (e.target.tagName === "BUTTON") return;
                const isExpanded = !this.groupStates[groupName];
                this.groupStates[groupName] = isExpanded;
                rowContainer.style.display = isExpanded ? "block" : "none";
                arrow.innerHTML = isExpanded ? ICONS.arrowDown : ICONS.arrowRight;
                const syncBtn = header.querySelector(".mad-btn-reset");
                if (syncBtn) {
                    syncBtn.style.display = isExpanded ? "inline-flex" : "none";
                }
            };

            this.listContainer.appendChild(header);
            this.listContainer.appendChild(rowContainer);
            if (isSynced) {
                const commonVal = this.getVal(keys[0]);
                rowContainer.appendChild(this.createMasterRow(groupName, keys, commonVal));
            } else {
                keys.forEach((key) => {
                    rowContainer.appendChild(this.createBlockRow(key));
                });
            }

            this.updateGroupCounter(groupName, keys);
        });
    }

    updateGroupCounter(groupName, keys) {
        const counterEl = this.groupCounters[groupName];
        if (counterEl) {
            const gTotal = keys.length;
            let gActive = 0;

            keys.forEach((k) => {
                const val = this.getVal(k);
                if (val > 0.0) gActive++;
            });

            let html = TEXT.blockEditor.groupCount.replace("{name}", "").replace("{count}", `${gActive} / ${gTotal}`);

            counterEl.innerHTML = html;

            const opacity = gActive > 0 ? "1" : "0.5";
            counterEl.style.opacity = opacity;

            if (counterEl.firstElementChild) {
                counterEl.firstElementChild.style.opacity = opacity;
            }
        }
    }

    createMasterRow(groupName, keys, currentVal) {
        const groupColor = keys.length > 0 ? this.getBlockBaseColor(keys[0]) : "#9e9e9e";
        const colorWithOpacity = getAnalysisColor(currentVal, this.stats.block_metadata[keys[0]]?.tag || classifyBlock(keys[0], this.arch));

        const info = el(
            "div",
            { className: "mad-block-info" },
            el(
                "span",
                {
                    className: "mad-block-label",
                    style: { borderLeft: `3px solid ${colorWithOpacity}` },
                },
                TEXT.blockEditor.masterGroup,
            ),
            el("div", { className: "mad-desc-text" }, TEXT.blockEditor.masterGroupDesc.replace("{count}", keys.length)),
        );

        const slider = createTitanSlider(
            "",
            0.0,
            2.0,
            this.snapInterval,
            currentVal,
            (val) => {
                const normVal = normalizeFloat(val);
                keys.forEach((k) => {
                    if (Math.abs(normVal - 1.0) < 0.001) delete this.vectors[k];
                    else this.vectors[k] = normVal;
                });
                this.updateGroupCounter(groupName, keys);
                this.updatePresetUI();
                this.updateGlobalCounter();

                if (val === 0) row.style.opacity = "0.5";
                else row.style.opacity = "1";
            },
            false,
            false,
            TEXT.blockEditor.masterGroup,
            null,
            null,
            true,
        );

        const row = el(
            "div",
            {
                className: "mad-block-row",
                style: {
                    borderLeft: `3px solid ${colorWithOpacity}`,
                    marginLeft: "2px",
                },
            },
            info,
            el("div", { className: "mad-block-control" }, slider),
        );

        if (currentVal === 0) row.classList.add("mad-dimmed");
        return row;
    }

    createBlockRow(key) {
        const energyVal = this.stats.energy_distribution[key] || 0;
        const energyRatio = this.maxEnergy > 0 ? energyVal / this.maxEnergy : 0;
        const currentVal = this.getVal(key);
        const meta = this.stats.block_metadata[key];
        const tag = meta ? meta.tag : classifyBlock(key, this.arch);
        const color = getAnalysisColor(currentVal, tag);

        const info = el(
            "div",
            { className: "mad-block-info" },
            el(
                "span",
                {
                    className: "mad-block-label",
                    style: { borderLeft: `3px solid ${color}` },
                },
                key,
            ),
            el(
                "div",
                { className: "mad-block-energy-bar" },
                el("div", {
                    className: "mad-block-energy-fill",
                    style: {
                        width: `${Math.max(5, energyRatio * 100)}%`,
                        backgroundColor: color,
                    },
                }),
            ),
        );

        attachMadTooltip(info, TEXT.blockTooltips.blockInfo.replace("{ratio}", (energyRatio * 100).toFixed(1)));

        const sliderTip = TEXT.blockTooltips.blockControl.replace("{key}", key).replace("{ratio}", (energyRatio * 100).toFixed(1));

        const slider = createTitanSlider(
            "",
            0.0,
            2.0,
            this.snapInterval,
            currentVal,
            (val) => {
                const normVal = normalizeFloat(val);
                if (Math.abs(normVal - 1.0) < 0.001) delete this.vectors[key];
                else this.vectors[key] = normVal;
                for (const [gName, gKeys] of Object.entries(this.groupKeys)) {
                    if (gKeys.includes(key)) {
                        this.updateGroupCounter(gName, gKeys);
                        break;
                    }
                }

                this.updatePresetUI();
                this.updateGlobalCounter();

                if (val === 0) row.style.opacity = "0.5";
                else row.style.opacity = "1";
            },
            false,
            false,
            sliderTip,
            null,
            null,
            true,
        );

        const row = el(
            "div",
            {
                className: "mad-block-row",
                style: {
                    borderLeft: `3px solid ${color}`,
                    marginLeft: "2px",
                },
            },
            info,
            el("div", { className: "mad-block-control" }, slider),
        );
        if (currentVal === 0) row.classList.add("mad-dimmed");
        else row.classList.remove("mad-dimmed");

        return row;
    }

    handleKey(e) {
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            this.close();
        }
    }

    close() {
        document.querySelectorAll(".mad-tooltip").forEach((el) => el.remove());
        this.overlay.style.pointerEvents = "none";
        this.overlay.classList.remove("visible");
        this.modal.classList.remove("visible");

        setTimeout(() => {
            if (document.body.contains(this.overlay)) document.body.removeChild(this.overlay);
        }, 300);

        document.removeEventListener("keydown", this._boundKeyHandler);
    }
}
