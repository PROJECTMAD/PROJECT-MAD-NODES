import { LOG_PREFIX, LORA_COLORS, SEMANTIC_COLORS, ARCH_BLOCK_MAPPINGS, BADGE_CONFIG, BLOCK_ORDER, PRESET_STRATEGIES, TEXT } from "./Constants.js";
import { ICONS } from "./Icons.js";

export const Easing = {
    linear: (t) => t,
    easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    cubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    step: (t) => (t < 0.99 ? 0 : 1),
};

export function normalizeFloat(num) {
    return Math.round((num + Number.EPSILON) * 10000) / 10000;
}

export function lerp(a, b, t) {
    return a * (1 - t) + b * t;
}

export function attachMadTooltip(element, text) {
    if (!text) return;

    element.addEventListener("mouseenter", (e) => {
        const tip = document.createElement("div");
        tip.className = "mad-tooltip";

        if (text.includes("<")) {
            tip.innerHTML = text;
        } else {
            const parts = String(text).split("\n");
            const title = parts[0] ?? "";
            const body = parts.slice(1).join("\n");
            tip.innerHTML = `<strong>${title}</strong>${body}`;
        }

        const updatePos = (clientX, clientY) => {
            const x = clientX + 15;
            const y = clientY + 15;

            if (!document.body.contains(tip)) {
                tip.style.opacity = "0";
                document.body.appendChild(tip);
            }

            const rect = tip.getBoundingClientRect();
            const winW = window.innerWidth;
            const winH = window.innerHeight;

            tip.style.left = (x + rect.width > winW ? x - rect.width - 15 : x) + "px";
            tip.style.top = (y + rect.height > winH ? y - rect.height - 15 : y) + "px";
        };

        updatePos(e.clientX, e.clientY);

        requestAnimationFrame(() => {
            tip.style.opacity = "";
            tip.classList.add("visible");
        });

        const moveHandler = (evt) => updatePos(evt.clientX, evt.clientY);

        const leaveHandler = () => {
            tip.classList.remove("visible");
            setTimeout(() => {
                if (document.body.contains(tip)) tip.remove();
            }, 150);
            element.removeEventListener("mousemove", moveHandler);
            element.removeEventListener("mouseleave", leaveHandler);
        };

        element.addEventListener("mousemove", moveHandler);
        element.addEventListener("mouseleave", leaveHandler);
    });
}

export function getBlockTooltip(arch, key, presetName) {
    let cleanArch = "SDXL";
    const upper = (arch || "UNKNOWN").toUpperCase();

    if (upper.includes("FLUX")) cleanArch = "FLUX";
    else if (upper.includes("SD1") || upper.includes("1.5") || upper.includes("SD2")) cleanArch = "SD15";
    else if (upper.includes("SD3")) cleanArch = "SD3";
    else if (upper.includes("QWEN") || upper.includes("LLM") || upper.includes("AURA") || upper.includes("LINEAR")) cleanArch = "LINEAR";
    const mapping = TEXT.blockTooltips.archDescriptions[cleanArch] || TEXT.blockTooltips.archDescriptions["SDXL"];
    const fallbackMapping = ARCH_BLOCK_MAPPINGS[cleanArch] || ARCH_BLOCK_MAPPINGS["SDXL"];

    const targetDesc = (mapping && mapping[key]) || (fallbackMapping && fallbackMapping[key]) || TEXT.blockTooltips.archDescriptions.DEFAULT;

    let tip = `<strong>${key.charAt(0).toUpperCase() + key.slice(1)} Weight</strong>`;
    tip += `\nTarget: ${targetDesc}`;

    if (arch && arch !== "UNKNOWN") {
        tip += `\n<span class="mad-text-tiny-muted">Detected Arch: ${arch}</span>`;
    }

    return tip;
}

export function sortBlocks(keys) {
    const order = BLOCK_ORDER && BLOCK_ORDER.length > 0 ? BLOCK_ORDER : ["clip", "input", "down", "double", "middle", "mid", "joint", "layers", "single", "up", "output", "specialized"];

    return keys.sort((a, b) => {
        const aLow = a.toLowerCase();
        const bLow = b.toLowerCase();

        const getRank = (s) => {
            for (let i = 0; i < order.length; i++) {
                if (s.startsWith(order[i])) return i;
            }
            return 99;
        };

        const rankA = getRank(aLow);
        const rankB = getRank(bLow);

        if (rankA !== rankB) return rankA - rankB;
        const numA = parseInt(aLow.match(/\d+/)) || 0;
        const numB = parseInt(bLow.match(/\d+/)) || 0;
        if (numA !== numB) return numA - numB;

        return aLow.localeCompare(bLow);
    });
}

export function getAnalysisColor(weight, tag = "OTHER") {
    const baseColor = SEMANTIC_COLORS[tag] || SEMANTIC_COLORS["OTHER"];
    const normalized = Math.max(0, Math.min(1, weight / 2));

    const opacity = 0.2 + normalized * 0.8;
    const r = parseInt(baseColor.slice(1, 3), 16);
    const g = parseInt(baseColor.slice(3, 5), 16);
    const b = parseInt(baseColor.slice(5, 7), 16);

    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function createAnalysisLegend() {
    const legend = el("div", { className: "mad-analysis-legend" });
    const items = [
        { l: TEXT.blockEditor.legendStruct, tag: "POSE" },
        { l: TEXT.blockEditor.legendConcept, tag: "IDENTITY" },
        { l: TEXT.blockEditor.legendStyle, tag: "STYLE" },
        { l: TEXT.blockEditor.legendDetail, tag: "DETAILS" },
    ];

    items.forEach((i) => {
        const dot = el("div", {
            className: "mad-legend-dot",
            style: { background: SEMANTIC_COLORS[i.tag] },
        });
        const label = el("span", {}, i.l);
        legend.appendChild(el("div", { className: "mad-legend-item" }, dot, label));
    });

    return legend;
}

export function resolveBadgeStyle(archStr) {
    if (!archStr || archStr === "UNKNOWN") return { code: "???", color: "#666666" };
    const s = archStr.toUpperCase();

    if (s.includes("FLUX")) {
        return { code: s.includes(".2") ? "F2" : "F1", color: "#26a69a" };
    }

    for (const badge of BADGE_CONFIG) {
        if (s.includes(badge.key)) return badge;
    }

    const clean = s.replace("SDXL_", "").replace("SD_", "");
    return { code: clean.substring(0, 4), color: "#ada9bb" };
}

export function areConfigsEqual(internal, imported) {
    if (!internal || !imported) return false;
    if (internal.length !== imported.length) return false;

    const cleanName = (name) => {
        if (!name) return "";
        return name
            .split(/[/\\]/)
            .pop()
            .replace(/\.[^/.]+$/, "")
            .trim();
    };

    const isClose = (a, b) => Math.abs(normalizeFloat(a) - normalizeFloat(b)) < 0.0001;

    const isItemEqual = (a, b) => {
        if (cleanName(a.lora_name) !== cleanName(b.lora_name)) return false;
        if (a.enabled !== b.enabled) return false;
        if (!isClose(a.strength_model || 1.0, b.strength_model || 1.0)) return false;
        if (!isClose(a.strength_clip || 1.0, b.strength_clip || 1.0)) return false;
        if (a.preset !== b.preset) return false;

        const aVec = a.vectors || {};
        const bVec = b.vectors || {};
        const aKeys = Object.keys(aVec);
        const bKeys = Object.keys(bVec);

        if (aKeys.length !== bKeys.length) return false;
        for (const k of aKeys) {
            if (bVec[k] === undefined) return false;
            if (!isClose(aVec[k], bVec[k])) return false;
        }

        if (!a.points || !b.points || a.points.length !== b.points.length) return false;
        for (let j = 0; j < a.points.length; j++) {
            if (!isClose(a.points[j].x, b.points[j].x)) return false;
            if (!isClose(a.points[j].y, b.points[j].y)) return false;
        }
        return true;
    };

    let availableMatches = [...imported];
    for (const internalItem of internal) {
        const matchIndex = availableMatches.findIndex((importedItem) => isItemEqual(internalItem, importedItem));
        if (matchIndex === -1) return false;
        availableMatches.splice(matchIndex, 1);
    }
    return true;
}

export function parseScheduleString(input) {
    if (!input || typeof input !== "string") return [];
    input = input.trim();
    if (input === "") return [];

    if (input.startsWith("[")) {
        try {
            return JSON.parse(input);
        } catch (e) {
            console.warn(`${LOG_PREFIX} JSON parse failed`);
        }
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
            vectors: {},
            color: LORA_COLORS[loraList.length % LORA_COLORS.length],
            enabled: true,
            arch: "UNKNOWN",
            stats: null,
            statsLoaded: false,
        };
        let isLegacy = false;
        if (parts.length >= 9) {
            const p3 = parts[3].trim();

            if (!isNaN(parseFloat(p3)) && !p3.includes(",") && !p3.includes("=") && !p3.includes(";")) {
                isLegacy = true;
            }
        }

        if (isLegacy) {
            const [s_start, s_end, p_start, p_end, count] = [parseFloat(parts[3]), parseFloat(parts[4]), parseFloat(parts[6]), parseFloat(parts[7]), parseInt(parts[8])];
            if (!isNaN(s_start) && !isNaN(count)) {
                for (let j = 0; j < count; j++) {
                    const t = count > 1 ? j / (count - 1) : 0.0;
                    item.points.push({
                        x: parseFloat((p_start + (p_end - p_start) * t).toFixed(4)),
                        y: parseFloat((s_start + (s_end - s_start) * t).toFixed(4)),
                    });
                }
            }
        } else {
            for (let i = 3; i < parts.length; i++) {
                const part = parts[i].trim();
                if (!part) continue;

                if (part.startsWith("vectors=")) {
                    const vecStr = part.substring(8);
                    vecStr.split(";").forEach((pair) => {
                        let k, v;
                        if (pair.includes("=")) [k, v] = pair.split("=");
                        else if (pair.includes(":")) [k, v] = pair.split(":");

                        if (k && v) item.vectors[k.trim()] = parseFloat(v.trim());
                    });
                } else if (part.startsWith("preset=")) {
                    item.preset = part.substring(7).trim();
                } else if (part.includes(",")) {
                    const pairs = part.split(";");
                    for (let pair of pairs) {
                        if (pair.includes(",")) {
                            const [px, py] = pair.split(",");
                            const x = parseFloat(px);
                            const y = parseFloat(py);
                            if (!isNaN(x) && !isNaN(y)) {
                                item.points.push({ x, y });
                            }
                        }
                    }
                }
            }
        }
        if (item.points.length === 0) {
            item.points.push({ x: 0.0, y: 1.0 });
            item.points.push({ x: 1.0, y: 1.0 });
        }

        item.points.sort((a, b) => a.x - b.x);
        loraList.push(item);
    }

    return loraList;
}

export function el(tag, props = {}, ...children) {
    const element = document.createElement(tag);

    if (props) {
        for (const [key, val] of Object.entries(props)) {
            if (key === "style" && typeof val === "object") {
                Object.assign(element.style, val);
            } else if (key === "dataset" && typeof val === "object") {
                Object.assign(element.dataset, val);
            } else if (key.startsWith("on") && typeof val === "function") {
                element[key.toLowerCase()] = val;
            } else if (key === "className") {
                element.className = val;
            } else if (key === "html") {
                element.innerHTML = val;
            } else if (val !== undefined && val !== null) {
                element.setAttribute(key, val);
            }
        }
    }

    if (children.length > 0 && typeof children[0] === "string" && children[0].includes("%s")) {
        let template = children.shift();
        const formattedText = template.replace(/%s/g, () => {
            const arg = children.shift();
            return arg !== undefined ? String(arg) : "%s";
        });
        element.appendChild(document.createTextNode(formattedText));
    }

    for (const child of children) {
        if (child instanceof Node) {
            element.appendChild(child);
        } else if (child !== null && child !== undefined && child !== false) {
            element.appendChild(document.createTextNode(String(child)));
        }
    }

    return element;
}

export function classifyBlock(key, arch) {
    const k = key.toLowerCase();

    if (k.match(/(te_|text_model|text_encoder|clip|t5|encoder)/)) return "CLIP";

    const getIdx = (str) => {
        const m = str.match(/_(\d+)$/);
        return m ? parseInt(m[1]) : -1;
    };

    if (!arch || arch.includes("SDXL")) {
        if (k.includes("input")) return "POSE";
        if (k.includes("middle")) return "IDENTITY";
        if (k.includes("output")) {
            const idx = getIdx(k);
            if (idx === -1) return "STYLE";
            if (idx <= 2) return "IDENTITY";
            if (idx <= 5) return "STYLE";
            return "DETAILS";
        }
    }

    if (arch && arch.includes("FLUX")) {
        if (k.includes("double")) {
            const idx = getIdx(k);
            return idx !== -1 && idx <= 10 ? "POSE" : "IDENTITY";
        }
        if (k.includes("single")) {
            const idx = getIdx(k);
            return idx !== -1 && idx <= 20 ? "STYLE" : "DETAILS";
        }
    }

    if (arch && arch.includes("SD3")) {
        if (k.includes("joint")) {
            const idx = getIdx(k);
            if (idx < 6) return "POSE";
            if (idx < 12) return "IDENTITY";
            if (idx < 18) return "STYLE";
            return "DETAILS";
        }
    }

    if (k.match(/(input|down)/)) return "POSE";
    if (k.match(/(middle|mid)/)) return "IDENTITY";
    if (k.match(/(output|up)/)) return "STYLE";

    return "OTHER";
}

export function createCustomSelect(options, selectedValue, onChange, disabled) {
    const container = document.createElement("div");
    container.className = "mad-custom-select";
    const trigger = document.createElement("div");
    trigger.className = "mad-select-trigger";
    if (disabled) {
        trigger.classList.add("mad-disabled-half");
    }

    const selectedOption = options.find((o) => o.val === selectedValue) || options[0];
    trigger.innerHTML = `<span>${selectedOption.txt}</span><span class="mad-icon-caret">${ICONS.caretDown}</span>`;

    const dropdown = document.createElement("div");
    dropdown.className = "mad-select-dropdown";

    options.forEach((opt) => {
        const item = document.createElement("div");
        item.className = `mad-select-item ${opt.val === selectedValue ? "selected" : ""}`;
        item.innerHTML = `<span class="mad-select-item-title">${opt.txt}</span>${opt.desc ? `<span class="mad-select-item-desc">${opt.desc}</span>` : ""}`;
        item.onclick = (e) => {
            e.stopPropagation();
            onChange(opt.val);
            dropdown.classList.remove("visible");
            trigger.innerHTML = `<span>${opt.txt}</span><span class="mad-icon-caret">${ICONS.caretDown}</span>`;

            const span = trigger.querySelector("span");
            if (span) span.textContent = opt.txt;
        };
        dropdown.appendChild(item);
    });

    trigger.onclick = (e) => {
        e.stopPropagation();

        document.querySelectorAll(".mad-select-dropdown.visible").forEach((d) => {
            if (d !== dropdown) d.classList.remove("visible");
        });

        dropdown.classList.toggle("visible");
        if (dropdown.classList.contains("visible")) {
            const selectedItem = dropdown.querySelector(".mad-select-item.selected");
            if (selectedItem) {
                setTimeout(() => {
                    selectedItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
                }, 0);
            }
        }
    };
    document.addEventListener("click", (e) => {
        if (!container.contains(e.target)) dropdown.classList.remove("visible");
    });
    container.appendChild(trigger);
    container.appendChild(dropdown);
    return container;
}

export function createTextInputDialog(title, initialValue, placeholder, onConfirm) {
    const overlay = el("div", { className: "mad-overlay" });
    const modal = el("div", { className: "mad-input-modal" });

    const titleEl = el("div", { className: "mad-input-title" }, title);

    const input = el("input", {
        className: "mad-input mad-input-full",
        value: initialValue || "",
        placeholder: placeholder || "",
    });

    const errorMsg = el("div", {
        className: "mad-input-error",
    });

    const btnCancel = el("button", { className: "mad-btn" }, TEXT.close);
    const btnConfirm = el("button", { className: "mad-btn mad-btn-primary" }, TEXT.confirm.confirm);

    const close = () => {
        overlay.classList.remove("visible");
        setTimeout(() => {
            if (document.body.contains(overlay)) document.body.removeChild(overlay);
        }, 200);

        document.removeEventListener("keydown", handleKey);
    };
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            close();
        }
    };
    const handleKey = (e) => {
        if (e.key === "Escape") {
            e.stopPropagation();
            e.stopImmediatePropagation();
            close();
        }
        if (e.key === "Enter") {
            e.stopPropagation();
            submit();
        }
    };
    document.addEventListener("keydown", handleKey);

    btnCancel.onclick = close;

    const submit = () => {
        const val = input.value.trim();
        if (!val) {
            errorMsg.textContent = TEXT.validation.nameEmpty;
            errorMsg.classList.add("mad-display-block");
            return;
        }
        const result = onConfirm(val);
        if (result === false) {
            errorMsg.textContent = TEXT.profileManager.errorExists;
            errorMsg.classList.add("mad-display-block");
        } else {
            close();
        }
    };

    btnConfirm.onclick = submit;
    input.onkeydown = (e) => {
        errorMsg.classList.remove("mad-display-block");
    };

    const actions = el("div", { className: "mad-input-actions" }, btnCancel, btnConfirm);

    modal.appendChild(titleEl);
    modal.appendChild(input);
    modal.appendChild(errorMsg);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
        overlay.classList.add("visible");
        modal.classList.add("visible");
        input.focus();
        input.select();
    });
}
export function detectPreset(vectors, stats, arch) {
    const allBlocks = Object.keys(stats.energy_distribution || {});
    if (allBlocks.length === 0) return null;
    if (!vectors || Object.keys(vectors).length === 0) return "LINEAR";

    for (const [key, strat] of Object.entries(PRESET_STRATEGIES)) {
        const isMatch = allBlocks.every((blockKey) => {
            const meta = stats.block_metadata ? stats.block_metadata[blockKey] : null;
            const type = meta ? meta.tag : classifyBlock(blockKey, arch);

            const targetVal = normalizeFloat(strat.weights[type] !== undefined ? strat.weights[type] : 1.0);
            const currentVal = normalizeFloat(vectors && vectors[blockKey] !== undefined ? vectors[blockKey] : 1.0);

            return Math.abs(currentVal - targetVal) < 0.001;
        });
        if (isMatch) return key;
    }
    return "CUSTOM";
}
export function getVectorsForPreset(presetKey, stats, arch) {
    const strategy = PRESET_STRATEGIES[presetKey];
    if (!strategy) return {};

    const newVectors = {};
    const allBlocks = Object.keys(stats.energy_distribution || {});

    allBlocks.forEach((key) => {
        const meta = stats.block_metadata ? stats.block_metadata[key] : null;
        const type = meta ? meta.tag : classifyBlock(key, arch);

        const val = normalizeFloat(strategy.weights[type] !== undefined ? strategy.weights[type] : 1.0);
        if (Math.abs(val - 1.0) > 0.001) {
            newVectors[key] = val;
        }
    });

    return newVectors;
}
