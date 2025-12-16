import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

/*
 * ============================================================================
 * LIBRARY INITIALIZATION
 * ============================================================================
 * Dynamically loads the ExifReader library from a CDN if it's not already
 * present. This library is essential for extracting metadata from images.
 */

if (!window.ExifReaderScriptLoaded) {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/exifreader@4.32.0/dist/exif-reader.min.js";
    script.onload = () => { window.ExifReaderScriptLoaded = true; };
    document.head.appendChild(script);
}

app.registerExtension({
    name: "Comfy.VisualPromptGallery",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "VisualPromptGallery") {

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

                this.color = "#222222";
                this.bgcolor = "#000000";

                this.setSize([400, 500]);
                this.storedImages = []; 
                this.metadataCache = new Map();
                
                this.galleryState = {
                    ratio: "square",
                };

                const widgetNames = [
                   "positive_prompt", "negative_prompt",
                   "image_list", "current_image", "gallery_settings"
                ];
                 
                const hideWidget = (w) => {
                    w.type = "hidden"; 
                    w.computeSize = () => [0, -4];
                    w.visible = false;
                };

                widgetNames.forEach(name => {
                    const w = this.widgets.find(x => x.name === name);
                    if(w) hideWidget(w);
                });

                /*
                 * ============================================================================
                 * UI CONSTRUCTION
                 * ============================================================================
                 * Builds the floating gallery window. This includes the main container,
                 * the toolbar (with aspect ratio controls and clear button), the grid
                 * area for thumbnails, and the empty state placeholder.
                 */

                const container = document.createElement("div");
                Object.assign(container.style, {
                    position: "absolute",
                    display: "none",
                    flexDirection: "column",
                    backgroundColor: "#000",
                    border: "1px solid #333",
                    boxSizing: "border-box",
                    overflow: "hidden",
                    borderRadius: "0 0 4px 4px",
                    fontFamily: "sans-serif",
                    transformOrigin: "0 0",
                    zIndex: "800",
                });
                this.galleryDiv = container;
                document.body.appendChild(container);

                const toolbar = document.createElement("div");
                Object.assign(toolbar.style, {
                    padding: "4px 8px",
                    borderBottom: "1px solid #222",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    backgroundColor: "#151515",
                    fontSize: "10px",
                    color: "#888",
                    height: "28px",
                    flexShrink: "0",
                    gap: "10px"
                });
                 
                const title = document.createElement("span");
                title.innerText = "GALLERY";
                title.style.fontWeight = "bold";
                toolbar.appendChild(title);

                const ratioGroup = document.createElement("div");
                Object.assign(ratioGroup.style, {
                    display: "flex",
                    gap: "2px",
                    flex: "1",
                    justifyContent: "center"
                });

                const ratios = [
                    { name: "SQUARE", id: "square", label: "1:1" },
                    { name: "LANDSCAPE", id: "landscape", label: "1.46:1" },
                    { name: "PORTRAIT", id: "portrait", label: "0.68:1" }
                ];

                this.ratioButtons = {};

                ratios.forEach(r => {
                    const btn = document.createElement("button");
                    btn.innerText = r.name;
                    Object.assign(btn.style, {
                        background: "#222",
                        color: "#888",
                        border: "1px solid #333",
                        borderRadius: "2px",
                        padding: "2px 6px",
                        fontSize: "9px",
                        cursor: "pointer",
                        minWidth: "50px"
                    });
                    
                    btn.onclick = () => this.setAspectRatio(r.id);
                    
                    this.ratioButtons[r.id] = btn;
                    ratioGroup.appendChild(btn);
                });
                toolbar.appendChild(ratioGroup);

                const clearBtn = document.createElement("button");
                clearBtn.innerText = "CLEAR";
                Object.assign(clearBtn.style, {
                    background: "#333",
                    color: "#fff",
                    border: "none",
                    borderRadius: "2px",
                    padding: "2px 6px",
                    fontSize: "9px",
                    cursor: "pointer"
                });
                clearBtn.onmouseover = () => clearBtn.style.background = "#444";
                clearBtn.onmouseout = () => clearBtn.style.background = "#333";
                 
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
                Object.assign(gridWrapper.style, {
                    position: "relative",
                    flex: "1",
                    overflowY: "auto",
                    backgroundColor: "#0a0a0a"
                });
                container.appendChild(gridWrapper);

                const grid = document.createElement("div");
                this.galleryGrid = grid;
                Object.assign(grid.style, {
                    display: "grid",
                    gap: "6px",
                    padding: "8px",
                    width: "100%",
                    boxSizing: "border-box"
                });
                gridWrapper.appendChild(grid);

                this.placeholder = document.createElement("div");
                Object.assign(this.placeholder.style, {
                    position: "absolute",
                    top: "0", left: "0", width: "100%", height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    color: "#444",
                    pointerEvents: "none",
                    textAlign: "center",
                    lineHeight: "1.5"
                });
                 
                this.placeholder.innerHTML = `
                    <div style="font-size: 24px; margin-bottom: 10px;">📂</div>
                    <div style="font-size: 12px; font-weight: bold;">Drag & Drop Images</div>
                    <div style="font-size: 10px;">(Saved to input/visual_gallery)</div>
                `;
                gridWrapper.appendChild(this.placeholder);

                this.showPlaceholder = (show) => {
                    this.placeholder.style.display = show ? "flex" : "none";
                };

                this.setAspectRatio = (mode) => {
                    this.galleryState.ratio = mode;
                    
                    Object.values(this.ratioButtons).forEach(b => {
                        b.style.background = "#222";
                        b.style.color = "#888";
                        b.style.borderColor = "#333";
                    });
                    const active = this.ratioButtons[mode];
                    if(active) {
                        active.style.background = "#444";
                        active.style.color = "#fff";
                        active.style.borderColor = "#666";
                    }

                    let minColWidth = "120px";
                    let aspectRatio = "1 / 1";

                    if (mode === "square") {
                        minColWidth = "120px";
                        aspectRatio = "1 / 1";
                    } else if (mode === "landscape") {
                        minColWidth = "140px";
                        aspectRatio = "1.46 / 1";
                    } else if (mode === "portrait") {
                        minColWidth = "90px";
                        aspectRatio = "0.68 / 1";
                    }

                    this.galleryGrid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${minColWidth}, 1fr))`;
                    
                    Array.from(this.galleryGrid.children).forEach(child => {
                        child.style.aspectRatio = aspectRatio;
                    });

                    this.saveState();
                };

                const originalOnDrawForeground = this.onDrawForeground;
                this.onDrawForeground = function(ctx) {
                    if (originalOnDrawForeground) originalOnDrawForeground.apply(this, arguments);
                    if (!this.galleryDiv) return;
                    if (!this.graph || this.flags.collapsed) {
                        this.galleryDiv.style.display = "none";
                        return;
                    }

                    const ds = app.canvas.ds;
                    const headerHeight = 65; 
                     
                    const screenX = (this.pos[0] + ds.offset[0]) * ds.scale;
                    const screenY = (this.pos[1] + ds.offset[1]) * ds.scale + (headerHeight * ds.scale);
                     
                    if (screenX < -this.size[0]*ds.scale || screenX > document.body.clientWidth || 
                        screenY < -this.size[1]*ds.scale || screenY > document.body.clientHeight) {
                        this.galleryDiv.style.display = "none";
                        return;
                    }

                    this.galleryDiv.style.display = "flex";
                    this.galleryDiv.style.width = `${this.size[0]}px`;
                    this.galleryDiv.style.height = `${this.size[1] - headerHeight}px`;
                    this.galleryDiv.style.transform = `scale(${ds.scale})`;
                    this.galleryDiv.style.left = `${screenX}px`;
                    this.galleryDiv.style.top = `${screenY}px`;
                };

                const originalOnRemoved = this.onRemoved;
                this.onRemoved = function() {
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
                 * Manages drag-and-drop events. Uploads dropped images to the ComfyUI
                 * server ("input/visual_gallery") and adds them to the local grid.
                 */

                container.addEventListener("dragover", (e) => {
                    e.preventDefault(); e.stopPropagation(); 
                    gridWrapper.style.backgroundColor = "#1a1a1a"; 
                });
                container.addEventListener("dragleave", (e) => { 
                    e.preventDefault(); e.stopPropagation();
                    gridWrapper.style.backgroundColor = "#0a0a0a"; 
                });
                container.addEventListener("drop", async (e) => {
                    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
                    gridWrapper.style.backgroundColor = "#0a0a0a";
                    this.showPlaceholder(false);

                    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
                    if(files.length > 0) this.uploadAndProcessFiles(files);
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
                                body: formData
                            });
                             
                            if(resp.status === 200) {
                                const data = await resp.json();
                                this.storedImages.push(data);
                                this.addThumbnail(data);
                            }
                        } catch (err) { console.error(err); }
                    }
                    this.saveState();
                };

                /*
                 * ============================================================================
                 * METADATA EXTRACTION
                 * ============================================================================
                 * Complex logic to parse generation data from image files.
                 * Supports standard EXIF, ComfyUI workflow JSON (embedded in PNG),
                 * and CivitAI-style metadata. It attempts to extract positive and
                 * negative prompts to populate the node's outputs.
                 */

                const decodeUserComment = (tag) => {
                    if (!tag) return "";
                     
                    if (typeof tag.description === 'string' && 
                        tag.description !== "[Unicode encoded text]" && 
                        !tag.description.startsWith("binary comment")) {
                        return tag.description.replace(/\0/g, '').trim();
                    }

                    if (tag.value && Array.isArray(tag.value)) {
                        const bytes = new Uint8Array(tag.value);
                        let payload = bytes;
                        let encoding = "utf-8"; 

                        if (bytes.length >= 8 &&
                            bytes[0]===85 && bytes[1]===78 && bytes[2]===73 &&
                            bytes[3]===67 && bytes[4]===79 && bytes[5]===68 &&
                            bytes[6]===69 && bytes[7]===0) {
                            payload = bytes.slice(8);
                            encoding = "utf-16le";
                        }
                        else if (bytes.length >= 8 &&
                            bytes[0]===65 && bytes[1]===83 && bytes[2]===67 &&
                            bytes[3]===73 && bytes[4]===73 && bytes[5]===0) {
                            payload = bytes.slice(8);
                            encoding = "utf-8";
                        }

                        try {
                            const decoder = new TextDecoder(encoding);
                            let str = decoder.decode(payload).replace(/\0/g, '').trim();
                            
                            let highChars = 0;
                            for(let i=0; i<Math.min(str.length, 100); i++) {
                                if(str.charCodeAt(i) > 0x2E80) highChars++;
                            }

                            if (highChars > 20 && encoding === "utf-16le") {
                                const beDecoder = new TextDecoder("utf-16be");
                                const beStr = beDecoder.decode(payload).replace(/\0/g, '').trim();
                                let highCharsBE = 0;
                                for(let i=0; i<Math.min(beStr.length, 100); i++) {
                                    if(beStr.charCodeAt(i) > 0x2E80) highCharsBE++;
                                }
                                if (highCharsBE < highChars) str = beStr;
                            }

                            return str;
                        } catch(e) { console.error("Decode failed", e); }
                    }
                    return "";
                };

                const parseGenerationText = (text, metadata) => {
                    if (!text) return;
                    let posEnd = text.length;
                    const negIdx = text.indexOf("Negative prompt:");
                    const stepsIdx = text.search(/Steps:\s*\d+/);

                    if (negIdx !== -1) posEnd = negIdx;
                    else if (stepsIdx !== -1) posEnd = stepsIdx;

                    const pos = text.substring(0, posEnd).trim();
                    if (pos && !metadata.positive_prompt) metadata.positive_prompt = pos;

                    if (negIdx !== -1) {
                        let negEnd = stepsIdx !== -1 ? stepsIdx : text.length;
                        const neg = text.substring(negIdx + 16, negEnd).trim();
                        if (neg) metadata.negative_prompt = neg;
                    }
                };

                const parseCivitaiStructure = (jsonObj, metadata) => {
                    try {
                        let extra = jsonObj.extraMetadata;
                        if (extra) {
                            if (typeof extra === 'string') {
                                try { extra = JSON.parse(extra); } catch(e) { extra = null; }
                            }
                        }
                        if (!extra) extra = jsonObj;
                        if (extra.prompt && !metadata.positive_prompt) metadata.positive_prompt = extra.prompt;
                        if (extra.negativePrompt && !metadata.negative_prompt) metadata.negative_prompt = extra.negativePrompt;
                        return true;
                    } catch (e) { return false; }
                };

                this.fetchMetadata = async (imgInfo) => {
                    const cacheKey = imgInfo.name;
                    if (this.metadataCache.has(cacheKey)) return this.metadataCache.get(cacheKey);

                    const params = new URLSearchParams({
                        filename: imgInfo.name,
                        subfolder: imgInfo.subfolder,
                        type: imgInfo.type
                    });
                    const url = `/view?${params.toString()}`;

                    try {
                        const response = await fetch(url);
                        const buffer = await response.arrayBuffer();
                        if (!window.ExifReader) return {};

                        const tags = ExifReader.load(buffer);
                        let metadata = { positive_prompt: "", negative_prompt: "" };

                        if (tags.UserComment) {
                            const cleanUC = decodeUserComment(tags.UserComment);
                            if (cleanUC) {
                                if (cleanUC.trim().startsWith("{")) {
                                    try {
                                        const jsonUC = JSON.parse(cleanUC);
                                        parseCivitaiStructure(jsonUC, metadata);
                                    } catch (e) { parseGenerationText(cleanUC, metadata); }
                                } else { parseGenerationText(cleanUC, metadata); }
                            }
                        }

                        if (tags.parameters && tags.parameters.description) {
                            parseGenerationText(tags.parameters.description, metadata);
                        }

                        if (tags['sd-metadata'] && tags['sd-metadata'].description) {
                            try {
                                const invokeData = JSON.parse(tags['sd-metadata'].description);
                                parseCivitaiStructure(invokeData, metadata);
                            } catch(e) {}
                        }

                        let comfyJson = null;
                        let isApiFormat = false;

                        if (tags.prompt && tags.prompt.description) {
                            comfyJson = tags.prompt.description;
                            isApiFormat = true;
                        } else if (tags.workflow && tags.workflow.description) {
                            comfyJson = tags.workflow.description;
                            isApiFormat = false;
                        }

                        if (comfyJson) {
                            try {
                                const graph = JSON.parse(comfyJson);
                                const findNode = (id) => isApiFormat ? graph[id] : (graph.nodes ? graph.nodes.find(n => n.id == id) : null);
                                const traceInput = (node, inputName) => {
                                    if (!node) return "";
                                    if (isApiFormat && node.inputs) {
                                        const val = node.inputs[inputName];
                                        if (Array.isArray(val)) return traceText(val[0]);
                                        if (typeof val === "string") return val;
                                    }
                                    if (!isApiFormat && node.inputs && Array.isArray(node.inputs)) {
                                        const inp = node.inputs.find(i => i.name === inputName);
                                        if (inp && inp.link && graph.links) {
                                            const link = graph.links.find(l => l[0] === inp.link);
                                            if (link) return traceText(link[1]);
                                        }
                                    }
                                    if (node.widgets_values && typeof node.widgets_values[0] === "string") return node.widgets_values[0];
                                    return "";
                                };
                                const traceText = (nodeId) => {
                                    const node = findNode(nodeId);
                                    if (!node) return "";
                                    const type = node.class_type;
                                    if (type === "CLIPTextEncode" || type === "PrimitiveNode" || type === "ShowText" || type === "String Literal") {
                                        if (node.widgets_values) {
                                            const val = node.widgets_values.find(v => typeof v === 'string' && v.length > 0);
                                            if (val) return val;
                                        }
                                        return traceInput(node, "text") || traceInput(node, "string") || traceInput(node, "value");
                                    }
                                    return "";
                                };

                                const nodes = isApiFormat ? Object.values(graph) : graph.nodes;
                                const samplers = nodes.filter(n => n.class_type && n.class_type.includes("Sampler"));
                                let bestPos = "", bestNeg = "";
                                samplers.forEach(sampler => {
                                    const pos = traceInput(sampler, "positive");
                                    const neg = traceInput(sampler, "negative");
                                    if (pos && pos.length > bestPos.length) bestPos = pos;
                                    if (neg && neg.length > bestNeg.length) bestNeg = neg;
                                });

                                if (bestPos) metadata.positive_prompt = bestPos;
                                if (bestNeg) metadata.negative_prompt = bestNeg;

                                if (!metadata.positive_prompt) {
                                    const textNodes = nodes.filter(n => n.class_type && (n.class_type.includes("CLIPTextEncode") || n.class_type === "PrimitiveNode"));
                                    const texts = [];
                                    textNodes.forEach(n => {
                                        if (n.widgets_values) n.widgets_values.forEach(v => { if (typeof v === "string" && v.length > 5) texts.push(v); });
                                    });
                                    texts.sort((a, b) => b.length - a.length);
                                    if (texts.length > 0) metadata.positive_prompt = texts[0];
                                    if (texts.length > 1) metadata.negative_prompt = texts[1];
                                }
                            } catch (e) { console.error("ComfyUI Graph Parse Error", e); }
                        }

                        this.metadataCache.set(cacheKey, metadata);
                        return metadata;
                    } catch (e) { return {}; }
                };

                /*
                 * ============================================================================
                 * THUMBNAIL & SELECTION LOGIC
                 * ============================================================================
                 * Creates visual elements for images and handles user interaction.
                 * When an image is selected, it triggers metadata fetching and updates
                 * the node's hidden widgets.
                 */

                this.addThumbnail = (imgInfo) => {
                    const params = new URLSearchParams({
                        filename: imgInfo.name,
                        subfolder: imgInfo.subfolder,
                        type: imgInfo.type
                    });
                     
                    const url = `/view?${params.toString()}`;
                    const item = document.createElement("div");
                    
                    let ar = "1 / 1";
                    if(this.galleryState.ratio === "landscape") ar = "1.46 / 1";
                    if(this.galleryState.ratio === "portrait") ar = "0.68 / 1";

                    Object.assign(item.style, {
                        position: "relative",
                        borderRadius: "4px",
                        overflow: "hidden",
                        cursor: "pointer",
                        border: "2px solid #333",
                        backgroundImage: `url(${url})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        transition: "all 0.15s ease-out",
                        aspectRatio: ar,
                        opacity: "0.7"
                    });
                    
                    item.dataset.name = imgInfo.name;

                    item.onclick = async () => {
                        this.selectImage(item, imgInfo);
                    };

                    this.galleryGrid.appendChild(item);
                };

                this.selectImage = async (itemElement, imgInfo) => {
                    if (itemElement.style.borderColor === "rgb(0, 210, 255)") return;

                    Array.from(this.galleryGrid.children).forEach(c => {
                        c.style.borderColor = "#333";
                        c.style.boxShadow = "none";
                        c.style.opacity = "0.7"; 
                    });

                    itemElement.style.opacity = "1";
                    itemElement.style.borderColor = "#00d2ff"; 
                    itemElement.style.boxShadow = "0 0 10px rgba(0, 210, 255, 0.6), inset 0 0 5px rgba(0, 210, 255, 0.3)"; 

                    const metadata = await this.fetchMetadata(imgInfo);
                    itemElement.title = metadata.positive_prompt || "No Text Prompt Detected";
                    this.updateWidgets(metadata, imgInfo);
                };

                this.updateWidgets = (meta, imgInfo) => {
                   const map = {
                       "positive_prompt": meta.positive_prompt || "",
                       "negative_prompt": meta.negative_prompt || ""
                   };

                   for (const [key, val] of Object.entries(map)) {
                       const w = this.widgets.find(x => x.name === key);
                       if(w) w.value = val;
                   }

                   const imgW = this.widgets.find(x => x.name === "current_image");
                   if(imgW) {
                       imgW.value = imgInfo ? JSON.stringify({ name: imgInfo.name, subfolder: imgInfo.subfolder }) : "";
                   }

                   app.graph.setDirtyCanvas(true, true);
                };

                /*
                 * ============================================================================
                 * STATE MANAGEMENT
                 * ============================================================================
                 * Persists the gallery state (list of images, view settings) into
                 * hidden widgets so that the gallery survives page reloads and
                 * workflow saves.
                 */

                this.saveState = () => {
                    const listW = this.widgets.find(x => x.name === "image_list");
                    if (listW) listW.value = JSON.stringify(this.storedImages);

                    const settingsW = this.widgets.find(x => x.name === "gallery_settings");
                    if (settingsW) settingsW.value = JSON.stringify(this.galleryState);
                };

                setTimeout(() => {
                    const listW = this.widgets.find(x => x.name === "image_list");
                    if (listW && listW.value && listW.value !== "[]") {
                        try {
                            const saved = JSON.parse(listW.value);
                            if (Array.isArray(saved) && saved.length > 0) {
                                this.storedImages = saved;
                                this.showPlaceholder(false);
                                saved.forEach(imgInfo => this.addThumbnail(imgInfo));
                            }
                        } catch (e) { console.error("Failed to restore gallery images", e); }
                    }

                    const settingsW = this.widgets.find(x => x.name === "gallery_settings");
                    if (settingsW && settingsW.value) {
                        try {
                            const settings = JSON.parse(settingsW.value);
                            if (settings.ratio) {
                                this.setAspectRatio(settings.ratio);
                            } else {
                                this.setAspectRatio("square");
                            }
                        } catch(e) { this.setAspectRatio("square"); }
                    } else {
                        this.setAspectRatio("square");
                    }

                    const currentImgW = this.widgets.find(x => x.name === "current_image");
                    if (currentImgW && currentImgW.value) {
                        try {
                            const currentData = JSON.parse(currentImgW.value);
                            if (currentData && currentData.name) {
                                const items = Array.from(this.galleryGrid.children);
                                const match = items.find(el => el.dataset.name === currentData.name);
                                if (match) {
                                    const imgInfo = this.storedImages.find(i => i.name === currentData.name);
                                    if (imgInfo) {
                                        this.selectImage(match, imgInfo);
                                        match.scrollIntoView({ block: "nearest", behavior: "smooth" });
                                    }
                                }
                            }
                        } catch(e) {}
                    }

                }, 100);

                return r;
            };
        }
    },
});