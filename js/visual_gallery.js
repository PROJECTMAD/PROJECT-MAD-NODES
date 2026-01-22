const app = window.comfyAPI.app.app;
const api = window.comfyAPI.api.api;

import { LOG_PREFIX } from "./components/Constants.js";

/*
 * ============================================================================
 * LIBRARY INITIALIZATION
 * ============================================================================
 */

if (!window.ExifReaderScriptLoaded) {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/exifreader@4.32.0/dist/exif-reader.min.js";
    script.onload = () => {
        window.ExifReaderScriptLoaded = true;
    };
    document.head.appendChild(script);
}

function attachDynamicTooltip(element, textGetter) {
    element.addEventListener("mouseenter", (e) => {
        const text = textGetter();
        if (!text) return;

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

app.registerExtension({
    name: "Comfy.VisualPromptGallery",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "VisualPromptGallery") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

                const logError = (msg, err) => console.error(`${LOG_PREFIX} ${msg}`, err);

                this.color = "#222222";
                this.bgcolor = "#000000";

                this.setSize([400, 500]);
                this.storedImages = [];
                this.metadataCache = new Map();

                this.galleryState = {
                    ratio: "square",
                };

                const VIEW_MODES = {
                    square: {
                        id: "square",
                        label: "1:1",
                        name: "SQUARE",
                        minWidth: "clamp(120px, 25%, 300px)",
                        ratio: "1 / 1",
                    },
                    landscape: {
                        id: "landscape",
                        label: "1.46:1",
                        name: "LANDSCAPE",
                        minWidth: "clamp(140px, 33%, 450px)",
                        ratio: "1.46 / 1",
                    },
                    portrait: {
                        id: "portrait",
                        label: "0.68:1",
                        name: "PORTRAIT",
                        minWidth: "clamp(90px, 25%, 250px)",
                        ratio: "0.68 / 1",
                    },
                };

                const widgetNames = ["positive_prompt", "negative_prompt", "image_list", "current_image", "gallery_settings"];

                const hideWidget = (w) => {
                    w.type = "hidden";
                    w.computeSize = () => [0, -4];
                    w.visible = false;
                };

                widgetNames.forEach((name) => {
                    const w = this.widgets.find((x) => x.name === name);
                    if (w) hideWidget(w);
                });

                /*
                 * ============================================================================
                 * UI CONSTRUCTION
                 * ============================================================================
                 */

                const container = document.createElement("div");
                container.className = "mad-gallery-container";
                this.galleryDiv = container;
                document.body.appendChild(container);

                const toolbar = document.createElement("div");
                toolbar.className = "mad-gallery-toolbar";
                toolbar.innerHTML = `<span class="mad-gallery-title">GALLERY</span>`;
                container.appendChild(toolbar);

                const ratioGroup = document.createElement("div");
                ratioGroup.className = "mad-gallery-ratio-group";

                this.ratioButtons = {};

                Object.values(VIEW_MODES).forEach((mode) => {
                    const btn = document.createElement("button");
                    btn.className = "mad-gallery-ratio-btn";
                    btn.innerText = mode.name;

                    btn.onclick = () => this.setAspectRatio(mode.id);

                    this.ratioButtons[mode.id] = btn;
                    ratioGroup.appendChild(btn);
                });
                toolbar.appendChild(ratioGroup);

                const clearBtn = document.createElement("button");
                clearBtn.className = "mad-gallery-clear-btn";
                clearBtn.innerText = "CLEAR";

                clearBtn.onclick = () => {
                    this.galleryGrid.innerHTML = "";
                    this.storedImages = [];
                    this.metadataCache.clear();
                    this.updateWidgets({}, null);
                    this.saveState();
                    this.showPlaceholder(true);
                };
                toolbar.appendChild(clearBtn);
                container.appendChild(toolbar);

                const gridWrapper = document.createElement("div");
                gridWrapper.className = "mad-gallery-grid-wrapper";
                container.appendChild(gridWrapper);

                const grid = document.createElement("div");
                this.galleryGrid = grid;
                grid.className = "mad-gallery-grid";
                gridWrapper.appendChild(grid);

                this.placeholder = document.createElement("div");
                this.placeholder.className = "mad-gallery-placeholder";

                this.placeholder.innerHTML = `
                    <div class="mad-gallery-placeholder-icon">📂</div>
                    <div class="mad-gallery-placeholder-title">Drag & Drop Images</div>
                    <div class="mad-gallery-placeholder-subtitle">(Saved to input/visual_gallery)</div>
                `;
                gridWrapper.appendChild(this.placeholder);

                this.showPlaceholder = (show) => {
                    this.placeholder.style.display = show ? "flex" : "none";
                };

                this.setAspectRatio = (modeId) => {
                    this.galleryState.ratio = modeId;
                    const config = VIEW_MODES[modeId];

                    Object.values(this.ratioButtons).forEach((b) => {
                        b.classList.remove("active");
                    });
                    const active = this.ratioButtons[modeId];
                    if (active) {
                        active.classList.add("active");
                    }

                    if (config) {
                        this.galleryGrid.style.setProperty("--min-col", config.minWidth);
                        this.galleryGrid.style.setProperty("--item-ratio", config.ratio);
                    }

                    this.saveState();
                };

                const originalOnDrawForeground = this.onDrawForeground;
                this.onDrawForeground = function (ctx) {
                    if (originalOnDrawForeground) originalOnDrawForeground.apply(this, arguments);
                    if (!this.galleryDiv) return;
                    if (!this.graph || this.flags.collapsed) {
                        this.galleryDiv.style.display = "none";
                        return;
                    }

                    const ds = app.canvas.ds;
                    const headerHeight = 65;

                    const screenX = (this.pos[0] + ds.offset[0]) * ds.scale;
                    const screenY = (this.pos[1] + ds.offset[1]) * ds.scale + headerHeight * ds.scale;

                    if (screenX < -this.size[0] * ds.scale || screenX > document.body.clientWidth || screenY < -this.size[1] * ds.scale || screenY > document.body.clientHeight) {
                        this.galleryDiv.style.display = "none";
                        return;
                    }

                    this.galleryDiv.style.display = "flex";
                    this.galleryDiv.style.width = `${this.size[0] - 3}px`;
                    this.galleryDiv.style.height = `${this.size[1] - headerHeight - 1}px`;
                    this.galleryDiv.style.transform = `scale(${ds.scale - 0.01})`;
                    this.galleryDiv.style.left = `${screenX + 4}px`;
                    this.galleryDiv.style.top = `${screenY}px`;
                };

                const originalOnRemoved = this.onRemoved;
                this.onRemoved = function () {
                    if (originalOnRemoved) originalOnRemoved.apply(this, arguments);
                    if (this.galleryDiv) {
                        this.galleryDiv.remove();
                        this.galleryDiv = null;
                    }
                };

                /*
                 * ============================================================================
                 * FILE HANDLING & UPLOAD
                 * ============================================================================
                 */

                container.addEventListener("dragover", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    gridWrapper.classList.add("mad-gallery-grid-wrapper-dragover");
                });
                container.addEventListener("dragleave", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    gridWrapper.classList.remove("mad-gallery-grid-wrapper-dragover");
                });
                container.addEventListener("drop", async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    gridWrapper.classList.remove("mad-gallery-grid-wrapper-dragover");
                    this.showPlaceholder(false);

                    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
                    if (files.length > 0) this.uploadAndProcessFiles(files);
                });

                this.uploadAndProcessFiles = async (files) => {
                    for (const file of files) {
                        try {
                            const formData = new FormData();
                            formData.append("image", file);
                            formData.append("overwrite", "false");
                            formData.append("subfolder", "visual_gallery");
                            formData.append("type", "input");

                            const resp = await api.fetchApi("/upload/image", {
                                method: "POST",
                                body: formData,
                            });

                            if (resp.status === 200) {
                                const data = await resp.json();
                                this.storedImages.push(data);
                                this.addThumbnail(data);
                            }
                        } catch (err) {
                            logError("Upload failed:", err);
                        }
                    }
                    this.saveState();
                };

                /*
                 * ============================================================================
                 * METADATA EXTRACTION
                 * ============================================================================
                 */

                const isLikelyMojibake = (str) => {
                    if (!str) return true;
                    if (str.trim().startsWith("{") || str.trim().startsWith("[")) return false;
                    let nonAscii = 0;
                    for (let i = 0; i < str.length; i++) {
                        if (str.charCodeAt(i) > 127) nonAscii++;
                    }
                    return (nonAscii / str.length) > 0.3;
                };

                const looksLikeJson = (str) => {
                    if (typeof str !== 'string') return false;
                    const s = str.trim();
                    if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
                        if (s.includes('"') || s.includes(':') || s.includes(',')) return true;
                    }
                    return false;
                };

                const sanitizePrompt = (text) => {
                    if (typeof text !== "string") return "";
                    if (looksLikeJson(text)) return "";

                    let clean = text;
                    const garbageRegex = /^[\s,.;:!?]+|[\s,.;:!?]+$/g;
                    const breakRegex = /^BREAK\b|\bBREAK$/gi;

                    while (true) {
                        const previous = clean;
                        clean = clean.replace(garbageRegex, "");
                        clean = clean.replace(breakRegex, "");
                        if (clean === previous) break;
                    }
                    
                    return clean;
                };

                const smartDecode = (tag) => {
                    if (!tag) return "";
                    
                    if (typeof tag.description === "string" && 
                        tag.description !== "[Unicode encoded text]" && 
                        !tag.description.startsWith("binary comment")) {
                        return tag.description.replace(/\0/g, "").trim();
                    }

                    if (tag.value && (Array.isArray(tag.value) || tag.value instanceof Uint8Array)) {
                        const bytes = new Uint8Array(tag.value);
                        if (bytes.length === 0) return "";

                        const decoderUtf8 = new TextDecoder("utf-8");
                        const decoderUtf16 = new TextDecoder("utf-16le");

                        let payload = bytes;
                        let hasUnicodeHeader = false;

                        if (bytes.length >= 8) {
                            const header = String.fromCharCode(...bytes.slice(0, 8));
                            if (header.startsWith("UNICODE")) {
                                payload = bytes.slice(8);
                                hasUnicodeHeader = true;
                            } else if (header.startsWith("ASCII")) {
                                payload = bytes.slice(8);
                            }
                        }

                        let candidates = [];

                        if (hasUnicodeHeader) {
                            try {
                                const str16 = decoderUtf16.decode(payload).replace(/\0/g, "").trim();
                                candidates.push({ str: str16, type: 'utf16' });
                            } catch(e) {}
                        }

                        try {
                            const str8 = decoderUtf8.decode(payload).replace(/\0/g, "").trim();
                            candidates.push({ str: str8, type: 'utf8' });
                        } catch(e) {}

                        for (const cand of candidates) {
                            if (cand.str.startsWith("{") || cand.str.startsWith("[")) {
                                try {
                                    JSON.parse(cand.str);
                                    return cand.str; 
                                } catch(e) {}
                            }
                        }

                        const cleanest = candidates.find(c => !isLikelyMojibake(c.str));
                        return cleanest ? cleanest.str : (candidates[0]?.str || "");
                    }

                    return "";
                };

                const parseGenerationText = (text, metadata) => {
                    if (!text) return;
                    
                    if (text.length < 10) return;

                    let posEnd = text.length;
                    const negIdx = text.indexOf("Negative prompt:");
                    const stepsIdx = text.search(/Steps:\s*\d+/);
                    
                    if (negIdx !== -1) posEnd = negIdx;
                    else if (stepsIdx !== -1) posEnd = stepsIdx;
                    
                    const pos = text.substring(0, posEnd).trim();
                    
                    if (pos && pos.length > 2 && !metadata.positive_prompt) {
                        metadata.positive_prompt = sanitizePrompt(pos);
                    }
                    
                    if (negIdx !== -1) {
                        let negEnd = stepsIdx !== -1 ? stepsIdx : text.length;
                        const neg = text.substring(negIdx + 16, negEnd).trim();
                        if (neg) metadata.negative_prompt = sanitizePrompt(neg);
                    }
                };

                const parseComfyGraph = (graph, metadata) => {
                    if (!graph) return false;
                    let isApi = false;
                    
                    if (graph.nodes && Array.isArray(graph.nodes)) {
                        isApi = false;
                    } else if (typeof graph === 'object' && Object.values(graph).some(n => n.class_type)) {
                        isApi = true;
                    } else {
                        return false;
                    }

                    const findNode = (id) => (isApi ? graph[id] : graph.nodes.find((n) => n.id == id));

                    const traceText = (nodeId) => {
                        const node = findNode(nodeId);
                        if (!node) return "";
                        
                        const type = node.class_type;
                        
                        if (node.widgets_values) {
                            const w = node.widgets_values;
                            const val = Array.isArray(w) ? w.find(x => typeof x === 'string') : w;
                            if (typeof val === "string" && val.length > 0) {
                                if (looksLikeJson(val)) return "";
                                return val;
                            }
                        }

                        return traceInput(node, "text") || traceInput(node, "string") || traceInput(node, "value");
                    };

                    const traceInput = (node, inputName) => {
                        if (!node) return "";
                        
                        if (isApi && node.inputs) {
                             const val = node.inputs[inputName];
                             if (Array.isArray(val)) return traceText(val[0]);
                             if (typeof val === "string") return val;
                        } 
                        else if (!isApi && node.inputs && Array.isArray(node.inputs)) {
                             const inp = node.inputs.find(i => i.name === inputName);
                             if (inp && inp.link && graph.links) {
                                 const link = graph.links.find(l => l[0] === inp.link);
                                 if (link) return traceText(link[1]);
                             }
                        }
                        
                        if (node.widgets_values) {
                             const w = node.widgets_values;
                             const val = Array.isArray(w) ? w[0] : w;
                             if (typeof val === "string") return val;
                        }
                        return "";
                    };

                    const nodes = isApi ? Object.values(graph) : graph.nodes;
                    const samplers = nodes.filter(n => n.class_type && n.class_type.toLowerCase().includes("sampler"));

                    let bestPos = "", bestNeg = "";
                    samplers.forEach(s => {
                        const pos = traceInput(s, "positive");
                        const neg = traceInput(s, "negative");
                        if (pos && pos.length > bestPos.length) bestPos = pos;
                        if (neg && neg.length > bestNeg.length) bestNeg = neg;
                    });

                    let found = false;
                    if (bestPos && !metadata.positive_prompt) {
                        metadata.positive_prompt = sanitizePrompt(bestPos);
                        found = true;
                    }
                    if (bestNeg && !metadata.negative_prompt) {
                        metadata.negative_prompt = sanitizePrompt(bestNeg);
                        found = true;
                    }
                    return found;
                };

                const extractPromptsFromJSON = (jsonObj, metadata) => {
                    if (!jsonObj || typeof jsonObj !== "object") return false;

                    const isComfyGraph = parseComfyGraph(jsonObj, metadata);
                    if (isComfyGraph) return true;

                    if (jsonObj.sui_image_params) {
                        const sui = jsonObj.sui_image_params;
                        if (sui.prompt && !metadata.positive_prompt) metadata.positive_prompt = sanitizePrompt(sui.prompt);
                        if (sui.negativeprompt && !metadata.negative_prompt) metadata.negative_prompt = sanitizePrompt(sui.negativeprompt);
                        return true;
                    }

                    let root = jsonObj;
                    if (jsonObj.extraMetadata) {
                        try {
                            root = typeof jsonObj.extraMetadata === "string" ? JSON.parse(jsonObj.extraMetadata) : jsonObj.extraMetadata;
                        } catch (e) {}
                    }

                    if (root.prompt && !metadata.positive_prompt && typeof root.prompt === 'string') metadata.positive_prompt = sanitizePrompt(root.prompt);
                    if (root.negativePrompt && !metadata.negative_prompt) metadata.negative_prompt = sanitizePrompt(root.negativePrompt);
                    if (root.negative_prompt && !metadata.negative_prompt) metadata.negative_prompt = sanitizePrompt(root.negative_prompt);

                    if (metadata.positive_prompt && metadata.negative_prompt) return true;

                    const candidates = { positive: [], negative: [] };
                    const isNegativeKey = (k) => /negative/i.test(k);
                    const isPositiveKey = (k) => (/prompt|positive|caption|text/i.test(k)) && !isNegativeKey(k);
                    
                    const walk = (node, depth = 0) => {
                        if (depth > 8 || !node || typeof node !== 'object') return;

                        for (const [key, val] of Object.entries(node)) {
                            if (typeof val === "string" && val.length > 2) {
                                if (looksLikeJson(val)) continue;

                                const cleanKey = key.toLowerCase().replace(/[^a-z]/g, "");
                                
                                if (isNegativeKey(cleanKey)) {
                                    candidates.negative.push({ val, score: val.length });
                                } else if (isPositiveKey(cleanKey)) {
                                    let score = val.length;
                                    
                                    if (cleanKey === "prompt" || cleanKey === "positive") score += 50; 
                                    
                                    candidates.positive.push({ val, score });
                                }
                            } else if (typeof val === "object") {
                                walk(val, depth + 1);
                            }
                        }
                    };

                    walk(root);

                    candidates.positive.sort((a, b) => b.score - a.score);
                    candidates.negative.sort((a, b) => b.score - a.score);

                    if (!metadata.positive_prompt && candidates.positive.length > 0) {
                        metadata.positive_prompt = sanitizePrompt(candidates.positive[0].val);
                    }
                    if (!metadata.negative_prompt && candidates.negative.length > 0) {
                        metadata.negative_prompt = sanitizePrompt(candidates.negative[0].val);
                    }

                    return !!(metadata.positive_prompt || metadata.negative_prompt);
                };

                const processRawMetadataString = (text, metadata) => {
                    if (!text || typeof text !== 'string') return;
                    text = text.trim();
                    
                    if (text.startsWith('{') || text.startsWith('[')) {
                        try {
                            const json = JSON.parse(text);
                            const found = extractPromptsFromJSON(json, metadata);
                            if (found) return; 
                        } catch (e) {}
                    }
                    parseGenerationText(text, metadata);
                };

                this.fetchMetadata = async (imgInfo) => {
                    const cacheKey = imgInfo.name;
                    if (this.metadataCache.has(cacheKey)) return this.metadataCache.get(cacheKey);

                    const params = new URLSearchParams({
                        filename: imgInfo.name,
                        subfolder: imgInfo.subfolder,
                        type: imgInfo.type,
                    });
                    const url = `/view?${params.toString()}`;

                    try {
                        const response = await fetch(url);
                        const buffer = await response.arrayBuffer();
                        if (!window.ExifReader) return {};

                        const tags = ExifReader.load(buffer);
                        let metadata = { positive_prompt: "", negative_prompt: "" };

                        const allowRegex = /^(parameters|workflow|prompt|usercomment|description|comment|sd-metadata)$/i;

                        for (const [key, tag] of Object.entries(tags)) {
                            if (!allowRegex.test(key)) continue;

                            const text = smartDecode(tag);
                            if (!text || text.length < 2) continue;

                            processRawMetadataString(text, metadata);
                        }

                        let comfyJson = null;
                        
                        if (tags.prompt && tags.prompt.description) {
                            comfyJson = tags.prompt.description;
                        } else if (tags.workflow && tags.workflow.description) {
                            comfyJson = tags.workflow.description;
                        }

                        if (comfyJson && (!metadata.positive_prompt || !metadata.negative_prompt)) {
                            try {
                                const graph = JSON.parse(comfyJson);
                                parseComfyGraph(graph, metadata);
                            } catch (e) {}
                        }

                        this.metadataCache.set(cacheKey, metadata);
                        return metadata;
                    } catch (e) {
                        return {};
                    }
                };

                /*
                 * ============================================================================
                 * CONTEXT MENU & ACTIONS
                 * ============================================================================
                 */

                this.viewFullscreen = (imgInfo) => {
                    const params = new URLSearchParams({
                        filename: imgInfo.name,
                        subfolder: imgInfo.subfolder,
                        type: imgInfo.type,
                    });
                    const url = `/view?${params.toString()}`;

                    const overlay = document.createElement("div");
                    overlay.className = "mad-gallery-overlay";

                    const img = document.createElement("img");
                    img.src = url;
                    img.className = "mad-gallery-fullscreen-img";
                    img.onclick = (e) => e.stopPropagation();

                    const closeBtn = document.createElement("div");
                    closeBtn.className = "mad-gallery-close-btn";
                    closeBtn.innerHTML = "&#10005;";

                    closeBtn.onmouseover = () => closeBtn.classList.add("mad-gallery-close-btn-hover");
                    closeBtn.onmouseout = () => closeBtn.classList.remove("mad-gallery-close-btn-hover");

                    const closeViewer = () => {
                        document.removeEventListener("keydown", onKeyDown);
                        overlay.remove();
                    };

                    const onKeyDown = (e) => {
                        if (e.key === "Escape") {
                            e.preventDefault();
                            closeViewer();
                        }
                    };

                    closeBtn.onclick = (e) => {
                        e.stopPropagation();
                        closeViewer();
                    };

                    overlay.onclick = (e) => {
                        if (e.target === overlay) closeViewer();
                    };

                    document.addEventListener("keydown", onKeyDown);

                    overlay.appendChild(img);
                    overlay.appendChild(closeBtn);
                    document.body.appendChild(overlay);
                };

                this.removeImage = (imgInfo, element) => {
                    this.storedImages = this.storedImages.filter((i) => i.name !== imgInfo.name);

                    if (element) element.remove();

                    const currentImgW = this.widgets.find((x) => x.name === "current_image");
                    if (currentImgW && currentImgW.value) {
                        try {
                            const current = JSON.parse(currentImgW.value);
                            if (current.name === imgInfo.name) {
                                currentImgW.value = "";
                                this.updateWidgets({}, null);
                            }
                        } catch (e) {}
                    }

                    if (this.storedImages.length === 0) {
                        this.showPlaceholder(true);
                    }

                    this.saveState();
                };

                this.createContextMenu = (e, imgInfo, element) => {
                    e.preventDefault();

                    const existing = document.getElementById("vpg-context-menu");
                    if (existing) existing.remove();

                    const menu = document.createElement("div");
                    menu.id = "vpg-context-menu";
                    menu.className = "mad-gallery-context-menu";

                    menu.style.setProperty("--ctx-x", `${e.clientX}px`);
                    menu.style.setProperty("--ctx-y", `${e.clientY}px`);

                    const createItem = (label, onClick, isDestructive = false) => {
                        const item = document.createElement("div");
                        item.className = "mad-gallery-context-item" + (isDestructive ? " mad-gallery-context-item-danger" : "");
                        item.innerText = label;
                        item.onclick = (evt) => {
                            evt.stopPropagation();
                            onClick();
                            menu.remove();
                        };
                        return item;
                    };

                    menu.appendChild(createItem("View Fullscreen", () => this.viewFullscreen(imgInfo)));
                    menu.appendChild(createItem("Remove Image", () => this.removeImage(imgInfo, element), true));

                    document.body.appendChild(menu);

                    const closeMenu = () => {
                        menu.remove();
                        document.removeEventListener("click", closeMenu);
                        document.removeEventListener("contextmenu", closeMenu);
                    };

                    setTimeout(() => {
                        document.addEventListener("click", closeMenu);
                        document.addEventListener("contextmenu", closeMenu);
                    }, 10);
                };

                /*
                 * ============================================================================
                 * THUMBNAIL & SELECTION LOGIC
                 * ============================================================================
                 */

                this.addThumbnail = (imgInfo) => {
                    const params = new URLSearchParams({
                        filename: imgInfo.name,
                        subfolder: imgInfo.subfolder,
                        type: imgInfo.type,
                    });

                    const url = `/view?${params.toString()}`;
                    const item = document.createElement("div");
                    item.className = "mad-gallery-item";
                    item.dataset.name = imgInfo.name;

                    item.style.backgroundImage = `url(${url})`;

                    item.dataset.tooltipText = "Status:\nClick to load Metadata";

                    attachDynamicTooltip(item, () => item.dataset.tooltipText);

                    item.onclick = async () => {
                        this.selectImage(item, imgInfo);
                    };

                    const handleContextMenu = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        this.createContextMenu(e, imgInfo, item);
                        return false;
                    };

                    item.addEventListener("contextmenu", handleContextMenu);
                    item.addEventListener("pointerdown", (e) => {
                        if (e.button === 2) {
                            e.stopPropagation();
                        }
                    });

                    this.galleryGrid.appendChild(item);
                };

                this.selectImage = async (itemElement, imgInfo) => {
                    if (itemElement.classList.contains("selected")) return;

                    Array.from(this.galleryGrid.children).forEach((c) => {
                        c.classList.remove("selected");
                    });

                    itemElement.classList.add("selected");

                    const metadata = await this.fetchMetadata(imgInfo);

                    const escapeHtml = (unsafe) => {
                        if (unsafe == null) return "";
                        return new Option(String(unsafe)).innerHTML;
                    };

                    const pos = metadata.positive_prompt;
                    const neg = metadata.negative_prompt;
                    const hasPos = pos && pos.length > 0;
                    const hasNeg = neg && neg.length > 0;

                    let tooltipText = "";

                    if (!hasPos && !hasNeg) {
                        tooltipText = "Status:\nNo prompt Metadata detected.";
                    } 
                    else {
                        const format = (txt) => escapeHtml(txt).replace(/\n/g, "<br>");

                        if (hasPos) {
                            tooltipText += `<span style="color: #6f6; font-weight: bold;">Prompt:</span> ${format(pos)}`;
                        }
                        
                        if (hasPos && hasNeg) {
                            tooltipText += `<br><br>`;
                        }

                        if (hasNeg) {
                            tooltipText += `<span style="color: #f66; font-weight: bold;">Negative:</span> ${format(neg)}`;
                        }
                    }

                    itemElement.dataset.tooltipText = tooltipText;

                    const activeTooltip = document.querySelector(".mad-tooltip.visible");
                    if (activeTooltip && itemElement.matches(":hover")) {
                        if (tooltipText.includes("<")) {
                            activeTooltip.innerHTML = tooltipText;
                        } else {
                            const parts = tooltipText.split("\n");
                            const title = parts[0] ?? "";
                            const body = parts.slice(1).join("\n");
                            activeTooltip.innerHTML = `<strong>${title}</strong>${body}`;
                        }
                    }

                    this.updateWidgets(metadata, imgInfo);
                };

                this.updateWidgets = (meta, imgInfo) => {
                    const map = {
                        positive_prompt: meta.positive_prompt || "",
                        negative_prompt: meta.negative_prompt || "",
                    };

                    for (const [key, val] of Object.entries(map)) {
                        const w = this.widgets.find((x) => x.name === key);
                        if (w) w.value = val;
                    }

                    const imgW = this.widgets.find((x) => x.name === "current_image");
                    if (imgW) {
                        imgW.value = imgInfo ? JSON.stringify({ name: imgInfo.name, subfolder: imgInfo.subfolder }) : "";
                    }

                    app.graph.setDirtyCanvas(true, true);
                };

                /*
                 * ============================================================================
                 * STATE MANAGEMENT
                 * ============================================================================
                 */

                this.saveState = () => {
                    const listW = this.widgets.find((x) => x.name === "image_list");
                    if (listW) listW.value = JSON.stringify(this.storedImages);

                    const settingsW = this.widgets.find((x) => x.name === "gallery_settings");
                    if (settingsW) settingsW.value = JSON.stringify(this.galleryState);
                };

                setTimeout(() => {
                    const listW = this.widgets.find((x) => x.name === "image_list");
                    if (listW && listW.value && listW.value !== "[]") {
                        try {
                            const saved = JSON.parse(listW.value);
                            if (Array.isArray(saved) && saved.length > 0) {
                                this.storedImages = saved;
                                this.showPlaceholder(false);
                                saved.forEach((imgInfo) => this.addThumbnail(imgInfo));
                            }
                        } catch (e) {
                            logError("Failed to restore gallery images", e);
                        }
                    }

                    const settingsW = this.widgets.find((x) => x.name === "gallery_settings");
                    if (settingsW && settingsW.value) {
                        try {
                            const settings = JSON.parse(settingsW.value);
                            if (settings.ratio) {
                                this.setAspectRatio(settings.ratio);
                            } else {
                                this.setAspectRatio("square");
                            }
                        } catch (e) {
                            this.setAspectRatio("square");
                        }
                    } else {
                        this.setAspectRatio("square");
                    }

                    const currentImgW = this.widgets.find((x) => x.name === "current_image");
                    if (currentImgW && currentImgW.value) {
                        try {
                            const currentData = JSON.parse(currentImgW.value);
                            if (currentData && currentData.name) {
                                const items = Array.from(this.galleryGrid.children);
                                const match = items.find((el) => el.dataset.name === currentData.name);
                                if (match) {
                                    const imgInfo = this.storedImages.find((i) => i.name === currentData.name);
                                    if (imgInfo) {
                                        this.selectImage(match, imgInfo);
                                        match.scrollIntoView({ block: "nearest", behavior: "smooth" });
                                    }
                                }
                            }
                        } catch (e) {}
                    }
                }, 100);

                return r;
            };
        }
    },
});
