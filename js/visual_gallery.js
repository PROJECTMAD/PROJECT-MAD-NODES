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

                this.setSize([400, 600]);
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
                        minWidth: "clamp(180px, 25%, 300px)",
                        minWidthPx: 180,
                        ratio: "1 / 1",
                        ratioValue: 1,
                    },
                    landscape: {
                        id: "landscape",
                        label: "1.46:1",
                        name: "LANDSCAPE",
                        minWidth: "clamp(200px, 33%, 300px)",
                        minWidthPx: 200,
                        ratio: "1.46 / 1",
                        ratioValue: 1.46,
                    },
                    portrait: {
                        id: "portrait",
                        label: "0.68:1",
                        name: "PORTRAIT",
                        minWidth: "clamp(180px, 25%, 180px)",
                        minWidthPx: 180,
                        ratio: "0.68 / 1",
                        ratioValue: 0.68,
                    },
                };

                const widgetNames = ["positive_prompt", "negative_prompt", "image_list", "current_image", "gallery_settings"];

                const hideWidget = (w) => {
                    w.type = "hidden";
                    w.computeSize = () => [0, -4];
                    w.visible = false;
                };

                const hideWidgets = () => {
                    widgetNames.forEach((name) => {
                        const w = this.widgets.find((x) => x.name === name);
                        if (w) hideWidget(w);
                    });
                };
                hideWidgets();
                this.drawWidgets = function () {};
                this.widgets_visible = false;

                const originalOnConfigure = this.onConfigure;
                this.onConfigure = function () {
                    if (originalOnConfigure) originalOnConfigure.apply(this, arguments);
                    hideWidgets();
                    this.drawWidgets = function () {};
                    this.widgets_visible = false;
                };

                /*
                 * ============================================================================
                 * CANVAS GALLERY RENDERING
                 * ============================================================================
                 */

                const BASE_TITLE_HEIGHT = (window.LiteGraph && LiteGraph.NODE_TITLE_HEIGHT) ? LiteGraph.NODE_TITLE_HEIGHT : 30;
                const TOOLBAR_HEIGHT = 22;
                const PADDING = 6;
                const GAP = 6;
                const MAX_THUMB_CACHE = 60;
                this._lastCachePrune = 0;

                this._galleryScrollY = 0;
                this._galleryHoverIndex = -1;
                this._selectedImageName = null;
                this._showPlaceholder = true;
                this._thumbCache = new Map();
                this._galleryButtons = {};
                this._lastLayout = null;

                this.showPlaceholder = (show) => {
                    this._showPlaceholder = !!show;
                    this.setDirtyCanvas(true, true);
                };

                const getViewConfig = () => VIEW_MODES[this.galleryState.ratio] || VIEW_MODES.square;

                const getTitleHeight = () => {
                    let h = BASE_TITLE_HEIGHT;
                    const slotHeight = (window.LiteGraph && LiteGraph.NODE_SLOT_HEIGHT) ? LiteGraph.NODE_SLOT_HEIGHT : 20;
                    const outH = this.outputs ? this.outputs.length * slotHeight : 0;
                    const inH = this.inputs ? this.inputs.length * slotHeight : 0;
                    h = Math.max(h, BASE_TITLE_HEIGHT + Math.max(outH, inH) * 0.5);
                    const ws = typeof this.widgets_start_y === "number" ? this.widgets_start_y : 0;
                    return Math.max(h, ws);
                };

                const getContentRect = () => {
                    const titleH = getTitleHeight();
                    const x = PADDING;
                    const y = titleH + TOOLBAR_HEIGHT + PADDING;
                    const w = Math.max(0, this.size[0] - PADDING * 2);
                    const h = Math.max(0, this.size[1] - titleH - TOOLBAR_HEIGHT - PADDING * 2);
                    return { x, y, w, h };
                };

                const makeImageUrl = (imgInfo) => {
                    const params = new URLSearchParams({
                        filename: imgInfo.name,
                        subfolder: imgInfo.subfolder,
                        type: imgInfo.type,
                    });
                    return `/view?${params.toString()}`;
                };

                const ensureThumb = (imgInfo) => {
                    if (!imgInfo) return null;
                    const key = imgInfo.name;
                    let entry = this._thumbCache.get(key);
                    if (!entry) {
                        const img = new Image();
                        img.decoding = "async";
                        entry = { img, loaded: false, error: false, lastUsed: 0, thumb: null, thumbW: 0, thumbH: 0, thumbLoading: false };
                        img.onload = () => {
                            entry.loaded = true;
                            if (!entry.thumbLoading) {
                                entry.thumbLoading = true;
                                const maxSize = 384;
                                const w = img.naturalWidth || img.width;
                                const h = img.naturalHeight || img.height;
                                if (Math.max(w, h) <= maxSize) {
                                    entry.thumb = img;
                                    entry.thumbW = w;
                                    entry.thumbH = h;
                                    entry.img = null;
                                    entry.thumbLoading = false;
                                    this.setDirtyCanvas(true, true);
                                    return;
                                }
                                const scale = Math.min(1, maxSize / Math.max(w, h));
                                const tw = Math.max(1, Math.round(w * scale));
                                const th = Math.max(1, Math.round(h * scale));
                                if (window.createImageBitmap) {
                                    createImageBitmap(img, { resizeWidth: tw, resizeHeight: th, resizeQuality: "high" })
                                        .then((bmp) => {
                                            entry.thumb = bmp;
                                            entry.thumbW = tw;
                                            entry.thumbH = th;
                                            entry.img = null;
                                            try { img.src = ""; } catch (e) {}
                                            this.setDirtyCanvas(true, true);
                                        })
                                        .catch(() => {})
                                        .finally(() => {
                                            entry.thumbLoading = false;
                                        });
                                } else {
                                    const canvas = document.createElement("canvas");
                                    canvas.width = tw;
                                    canvas.height = th;
                                    const ctx = canvas.getContext("2d", { alpha: false });
                                    ctx.imageSmoothingEnabled = true;
                                    ctx.imageSmoothingQuality = "high";
                                    ctx.drawImage(img, 0, 0, tw, th);
                                    entry.thumb = canvas;
                                    entry.thumbW = tw;
                                    entry.thumbH = th;
                                    entry.img = null;
                                    try { img.src = ""; } catch (e) {}
                                    entry.thumbLoading = false;
                                    this.setDirtyCanvas(true, true);
                                }
                            }
                            this.setDirtyCanvas(true, true);
                        };
                        img.onerror = () => {
                            entry.error = true;
                            this.setDirtyCanvas(true, true);
                        };
                        img.src = makeImageUrl(imgInfo);
                        this._thumbCache.set(key, entry);
                    }
                    const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
                    entry.lastUsed = now;
                    return entry;
                };

                const pruneCache = () => {
                    const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
                    if (this._thumbCache.size <= MAX_THUMB_CACHE) return;
                    if (now - this._lastCachePrune < 1000) return;
                    this._lastCachePrune = now;
                    const entries = Array.from(this._thumbCache.entries());
                    entries.sort((a, b) => a[1].lastUsed - b[1].lastUsed);
                    const removeCount = Math.max(0, entries.length - MAX_THUMB_CACHE);
                    for (let i = 0; i < removeCount; i++) {
                        const entry = entries[i][1];
                        if (entry && entry.thumb && entry.thumb.close) entry.thumb.close();
                        this._thumbCache.delete(entries[i][0]);
                    }
                };

                const drawToolbar = (ctx) => {
                    ctx.save();
                    const x = PADDING;
                    const y = getTitleHeight() + 2;
                    const w = this.size[0] - PADDING * 2;
                    const h = TOOLBAR_HEIGHT;

                    ctx.fillStyle = "#111";
                    ctx.fillRect(x, y, w, h);

                    ctx.fillStyle = "#888";
                    ctx.font = "10px sans-serif";
                    ctx.textBaseline = "middle";
                    ctx.fillText("GALLERY", x + 6, y + h / 2);

                    const buttons = [
                        { id: "square", label: "SQUARE" },
                        { id: "landscape", label: "LANDSCAPE" },
                        { id: "portrait", label: "PORTRAIT" },
                    ];
                    const btnW = 72;
                    const btnH = 18;
                    const gap = 4;
                    const totalW = buttons.length * btnW + (buttons.length - 1) * gap;
                    const startX = x + (w - totalW) / 2;
                    const btnY = y + (h - btnH) / 2;

                    this._galleryButtons = {};

                    buttons.forEach((btn, idx) => {
                        const bx = startX + idx * (btnW + gap);
                        const isActive = this.galleryState.ratio === btn.id;
                        ctx.fillStyle = isActive ? "#444" : "#222";
                        ctx.strokeStyle = isActive ? "#666" : "#333";
                        ctx.lineWidth = 1;
                        ctx.fillRect(bx, btnY, btnW, btnH);
                        ctx.strokeRect(bx + 0.5, btnY + 0.5, btnW - 1, btnH - 1);
                        ctx.fillStyle = isActive ? "#fff" : "#888";
                        ctx.textAlign = "center";
                        ctx.fillText(btn.label, bx + btnW / 2, btnY + btnH / 2);
                        this._galleryButtons[`ratio:${btn.id}`] = { x: bx, y: btnY, w: btnW, h: btnH };
                    });

                    const clearW = 50;
                    const clearX = x + w - clearW - 6;
                    ctx.fillStyle = "#222";
                    ctx.strokeStyle = "#333";
                    ctx.fillRect(clearX, btnY, clearW, btnH);
                    ctx.strokeRect(clearX + 0.5, btnY + 0.5, clearW - 1, btnH - 1);
                    ctx.fillStyle = "#888";
                    ctx.textAlign = "center";
                    ctx.fillText("CLEAR", clearX + clearW / 2, btnY + btnH / 2);
                    this._galleryButtons.clear = { x: clearX, y: btnY, w: clearW, h: btnH };
                    ctx.restore();
                };

                const drawGallery = (ctx) => {
                    if (!this.graph || this.flags.collapsed) return;

                    const content = getContentRect();
                    if (content.w <= 0 || content.h <= 0) return;

                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(content.x, content.y, content.w, content.h);
                    ctx.clip();

                    ctx.fillStyle = "#0a0a0a";
                    ctx.fillRect(content.x, content.y, content.w, content.h);

                    const total = this.storedImages.length;
                    if (total === 0) {
                        ctx.fillStyle = "#444";
                        ctx.font = "12px sans-serif";
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.fillText("Drag & Drop Images", content.x + content.w / 2, content.y + content.h / 2 - 6);
                        ctx.font = "10px sans-serif";
                        ctx.fillText("(Saved to input/visual_gallery)", content.x + content.w / 2, content.y + content.h / 2 + 10);
                        ctx.restore();
                        return;
                    }

                    const config = getViewConfig();
                    const minCol = config.minWidthPx || 120;
                    const ratio = config.ratioValue || 1;
                    const cols = Math.max(1, Math.floor((content.w + GAP) / (minCol + GAP)));
                    const colW = Math.max(1, (content.w - GAP * (cols - 1)) / cols);
                    const rowH = Math.max(1, colW / ratio);
                    const rows = Math.ceil(total / cols);
                    const rowSpan = rowH + GAP;
                    const colSpan = colW + GAP;
                    const totalHeight = rows * rowH + GAP * Math.max(0, rows - 1);
                    const maxScroll = Math.max(0, totalHeight - content.h);
                    this._galleryScrollY = Math.max(0, Math.min(this._galleryScrollY, maxScroll));

                    const startRow = Math.max(0, Math.floor(this._galleryScrollY / rowSpan) - 1);
                    const endRow = Math.min(rows - 1, Math.ceil((this._galleryScrollY + content.h) / rowSpan) + 1);

                    for (let row = startRow; row <= endRow; row++) {
                        for (let col = 0; col < cols; col++) {
                            const idx = row * cols + col;
                            if (idx >= total) break;
                            const imgInfo = this.storedImages[idx];
                            const x = content.x + col * (colW + GAP);
                            const y = content.y + row * (rowH + GAP) - this._galleryScrollY;

                            ctx.fillStyle = "#111";
                            ctx.fillRect(x, y, colW, rowH);

                            const entry = ensureThumb(imgInfo);
                            if (entry && entry.thumb) {
                                const img = entry.thumb;
                                const iw = entry.thumbW || img.width;
                                const ih = entry.thumbH || img.height;
                                const imgAspect = iw / ih;
                                const cellAspect = colW / rowH;
                                let sx = 0;
                                let sy = 0;
                                let sw = iw;
                                let sh = ih;
                                if (imgAspect > cellAspect) {
                                    sw = ih * cellAspect;
                                    sx = (iw - sw) / 2;
                                } else if (imgAspect < cellAspect) {
                                    sh = iw / cellAspect;
                                    sy = (ih - sh) / 2;
                                }
                                ctx.drawImage(img, sx, sy, sw, sh, x, y, colW, rowH);
                            } else {
                                ctx.fillStyle = "#222";
                                ctx.fillRect(x, y, colW, rowH);
                            }

                            const isSelected = this._selectedImageName === imgInfo.name;
                            const isHover = this._galleryHoverIndex === idx;
                            if (isSelected || isHover) {
                                ctx.lineWidth = 2;
                                ctx.strokeStyle = isSelected ? "#00d2ff" : "#555";
                                ctx.strokeRect(x + 1, y + 1, colW - 2, rowH - 2);
                            } else {
                                ctx.strokeStyle = "#333";
                                ctx.lineWidth = 1;
                                ctx.strokeRect(x + 0.5, y + 0.5, colW - 1, rowH - 1);
                            }
                        }
                    }

                    this._lastLayout = { content, cols, colW, rowH, rowSpan, colSpan, total, rows, totalHeight };

                    if (maxScroll > 0) {
                        const sbW = 6;
                        const sbH = content.h;
                        const thumbH = Math.max(20, (content.h / totalHeight) * sbH);
                        const thumbY = content.y + (this._galleryScrollY / maxScroll) * (sbH - thumbH);
                        const sbX = content.x + content.w - sbW;

                        ctx.fillStyle = "rgba(20, 20, 20, 0.5)";
                        ctx.fillRect(sbX, content.y, sbW, sbH);

                        ctx.fillStyle = "rgba(120, 120, 120, 0.6)";
                        if (ctx.roundRect) {
                            ctx.beginPath();
                            ctx.roundRect(sbX, thumbY, sbW, thumbH, 3);
                            ctx.fill();
                        } else {
                            ctx.fillRect(sbX, thumbY, sbW, thumbH);
                        }
                    }

                    pruneCache();
                    ctx.restore();
                };

                this.setAspectRatio = (modeId) => {
                    this.galleryState.ratio = modeId;
                    this.saveState();
                    this.setDirtyCanvas(true, true);
                };

                const originalOnDrawForeground = this.onDrawForeground;
                this.onDrawForeground = function (ctx) {
                    if (originalOnDrawForeground) originalOnDrawForeground.apply(this, arguments);
                    if (!this.graph || this.flags.collapsed) return;
                    hideWidgets();
                    drawToolbar(ctx);
                    drawGallery(ctx);
                };

                const originalOnMouseDown = this.onMouseDown;
                this.onMouseDown = function (e, pos, graphcanvas) {
                    if (originalOnMouseDown) originalOnMouseDown.apply(this, arguments);
                    if (!this.graph || this.flags.collapsed) return;
                    if (!pos) return;
                    const btns = this._galleryButtons || {};
                    for (const [key, rect] of Object.entries(btns)) {
                        if (!rect) continue;
                        if (pos[0] >= rect.x && pos[0] <= rect.x + rect.w && pos[1] >= rect.y && pos[1] <= rect.y + rect.h) {
                            if (key.startsWith("ratio:")) {
                                const modeId = key.split(":")[1];
                                this.setAspectRatio(modeId);
                            } else if (key === "clear") {
                                this.storedImages = [];
                                this.metadataCache.clear();
                                this._selectedImageName = null;
                                this._galleryScrollY = 0;
                                this.updateWidgets({}, null);
                                this.saveState();
                                this.showPlaceholder(true);
                            }
                            this.setDirtyCanvas(true, true);
                            return true;
                        }
                    }

                    const layout = this._lastLayout;
                    if (!layout) return;
                    const content = layout.content;
                    if (pos[0] < content.x || pos[0] > content.x + content.w || pos[1] < content.y || pos[1] > content.y + content.h) return;

                    const maxScroll = Math.max(0, layout.totalHeight - content.h);
                    if (maxScroll > 0) {
                        const sbW = 10;
                        const sbX = content.x + content.w - sbW;
                        if (pos[0] >= sbX && pos[0] <= content.x + content.w) {
                            this._isDraggingScrollbar = true;
                            this._scrollDragStartY = pos[1];
                            this._scrollDragStartScrollY = this._galleryScrollY;
                            if (graphcanvas) graphcanvas.node_captured = this;
                            return true;
                        }
                    }

                    const localX = pos[0] - content.x;
                    const localY = pos[1] - content.y + this._galleryScrollY;
                    const col = Math.floor(localX / layout.colSpan);
                    const row = Math.floor(localY / layout.rowSpan);
                    if (col < 0 || row < 0 || col >= layout.cols) return;

                    const cellX = localX - col * layout.colSpan;
                    const cellY = localY - row * layout.rowSpan;
                    if (cellX > layout.colW || cellY > layout.rowH) return;

                    const idx = row * layout.cols + col;
                    if (idx < 0 || idx >= layout.total) return;
                    const imgInfo = this.storedImages[idx];
                    if (!imgInfo) return;

                    if (e?.button === 2 || e?.which === 3) return;
                    this.selectImage(null, imgInfo);
                    this.setDirtyCanvas(true, true);
                    return true;
                };

                const originalGetExtraMenuOptions = this.getExtraMenuOptions;
                this.getExtraMenuOptions = function(canvas, options) {
                    let isImageClicked = false;
                    if (this.graph && !this.flags.collapsed) {
                        const layout = this._lastLayout;
                        const pos = canvas.graph_mouse;
                        if (layout && pos) {
                            const localX = pos[0] - this.pos[0];
                            const localY = pos[1] - this.pos[1];
                            const content = layout.content;
                            if (localX >= content.x && localX <= content.x + content.w && localY >= content.y && localY <= content.y + content.h) {
                                const cellX = localX - content.x;
                                const cellY = localY - content.y + this._galleryScrollY;
                                const col = Math.floor(cellX / layout.colSpan);
                                const row = Math.floor(cellY / layout.rowSpan);
                                if (cellX - col * layout.colSpan <= layout.colW && cellY - row * layout.rowSpan <= layout.rowH) {
                                    const idx = row * layout.cols + col;
                                    if (idx >= 0 && idx < layout.total) {
                                        const imgInfo = this.storedImages[idx];
                                        if (imgInfo) {
                                            isImageClicked = true;
                                            
                                            options.length = 0;
                                            const myOptions =[
                                                { content: "View Fullscreen", callback: () => this.viewFullscreen(imgInfo) },
                                                { content: "Analyze Prompt", callback: () => this.analyzePrompt(imgInfo) },
                                                { content: "Remove Image", callback: () => this.removeImage(imgInfo) }
                                            ];
                                            
                                            for (let i = 0; i < myOptions.length; i++) {
                                                options[i] = myOptions[i];
                                            }
                                            
                                            options.push = function() { return this.length; };
                                            options.unshift = function() { return this.length; };
                                            options.splice = function() { return []; };
                                            options.pop = function() { return undefined; };
                                            options.shift = function() { return undefined; };
                                            options.reverse = function() { return this; };
                                            options.sort = function() { return this; };
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    if (!isImageClicked && originalGetExtraMenuOptions) {
                        return originalGetExtraMenuOptions.apply(this, arguments);
                    }
                    if (!isImageClicked && window.LiteGraph && LiteGraph.LGraphNode.prototype.getExtraMenuOptions) {
                        return LiteGraph.LGraphNode.prototype.getExtraMenuOptions.apply(this, arguments);
                    }
                };

                const originalOnMouseMove = this.onMouseMove;
                this.onMouseMove = function (e, pos, graphcanvas) {
                    if (originalOnMouseMove) originalOnMouseMove.apply(this, arguments);
                    if (!this.graph || this.flags.collapsed) return;
                    const layout = this._lastLayout;
                    if (!layout || !pos) return;
                    
                    let localPos = pos;
                    let graphPos = null;
                    if (!localPos && graphcanvas) {
                        graphPos = graphcanvas.convertEventToCanvasOffset(e);
                        if (graphPos) localPos = [graphPos[0] - this.pos[0], graphPos[1] - this.pos[1]];
                    } else if (localPos) {
                        graphPos = [localPos[0] + this.pos[0], localPos[1] + this.pos[1]];
                    }
                    
                    if (this._isDraggingScrollbar) {
                        const maxScroll = Math.max(0, layout.totalHeight - layout.content.h);
                        const sbH = layout.content.h;
                        const thumbH = Math.max(20, (layout.content.h / layout.totalHeight) * sbH);
                        const scrollRange = sbH - thumbH;
                        
                        const deltaY = localPos[1] - this._scrollDragStartY;
                        const scrollFraction = deltaY / scrollRange;
                        this._galleryScrollY = Math.max(0, Math.min(maxScroll, this._scrollDragStartScrollY + scrollFraction * maxScroll));
                        this.setDirtyCanvas(true, true);
                        return true;
                    }

                    if (!graphPos || !localPos) return;
                    if (!this.isPointInside(graphPos[0], graphPos[1])) return;

                    const content = layout.content;

                    if (localPos[0] < content.x || localPos[0] > content.x + content.w || localPos[1] < content.y || localPos[1] > content.y + content.h) {
                        if (this._galleryHoverIndex !== -1) {
                            this._galleryHoverIndex = -1;
                            this.setDirtyCanvas(true, true);
                        }
                    } else {
                        const localX = localPos[0] - content.x;
                        const localY = localPos[1] - content.y + this._galleryScrollY;
                        const col = Math.floor(localX / layout.colSpan);
                        const row = Math.floor(localY / layout.rowSpan);
                        let idx = row * layout.cols + col;
                        const cellX = localX - col * layout.colSpan;
                        const cellY = localY - row * layout.rowSpan;
                        if (cellX > layout.colW || cellY > layout.rowH) idx = -1;
                        if (idx !== this._galleryHoverIndex) {
                            this._galleryHoverIndex = idx >= 0 && idx < layout.total ? idx : -1;
                            this.setDirtyCanvas(true, true);
                        }
                    }
                    
                };

                this._onCanvasWheel = (e) => {
                    if (!this.graph || this.flags.collapsed) return;
                    const canvas = app.canvas;
                    if (!canvas || !canvas.graph_mouse) return;
                    
                    const localX = canvas.graph_mouse[0] - this.pos[0];
                    const localY = canvas.graph_mouse[1] - this.pos[1];
                    
                    if (localX < 0 || localY < 0 || localX > this.size[0] || localY > this.size[1]) return;
                    
                    const layout = this._lastLayout;
                    if (!layout) return;
                    const content = layout.content;
                    if (localX >= content.x && localX <= content.x + content.w &&
                        localY >= content.y && localY <= content.y + content.h) {
                        
                        const delta = e.deltaY || (e.detail ? e.detail * 40 : 0);
                        if (delta !== 0) {
                            this._galleryScrollY += delta > 0 ? 60 : -60;
                            const maxScroll = Math.max(0, layout.rows * layout.rowH + GAP * Math.max(0, layout.rows - 1) - content.h);
                            this._galleryScrollY = Math.max(0, Math.min(this._galleryScrollY, maxScroll));
                            this.setDirtyCanvas(true, true);
                            e.preventDefault();
                            e.stopPropagation();
                        }
                    }
                };
                
                if (app.canvas && app.canvas.canvas) {
                    app.canvas.canvas.addEventListener("wheel", this._onCanvasWheel, { passive: false, capture: true });
                }

                const originalOnMouseUp = this.onMouseUp;
                this.onMouseUp = function (e, pos, graphcanvas) {
                    if (originalOnMouseUp) originalOnMouseUp.apply(this, arguments);
                    if (this._isDraggingScrollbar) {
                        this._isDraggingScrollbar = false;
                        return true;
                    }
                };

                const originalOnRemoved = this.onRemoved;
                this.onRemoved = function () {
                    if (originalOnRemoved) originalOnRemoved.apply(this, arguments);
                    this._thumbCache.clear();
                    this._galleryButtons = {};
                    this._teardownCanvasDnD();
                    if (this._onCanvasWheel && app.canvas && app.canvas.canvas) {
                        app.canvas.canvas.removeEventListener("wheel", this._onCanvasWheel, { passive: false, capture: true });
                    }
                };

                /*
                 * ============================================================================
                 * FILE HANDLING & UPLOAD
                 * ============================================================================
                 */

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
                                this.addThumbnail(data);
                            }
                        } catch (err) {
                            logError("Upload failed:", err);
                        }
                    }
                    this.saveState();
                };

                this._setupCanvasDnD = () => {
                    const canvasEl = app?.canvas?.canvas;
                    if (!canvasEl) return;
                    if (this._dndHandlers) return;
                    const ds = app.canvas.ds;
                    const getGraphPos = (evt) => {
                        const rect = canvasEl.getBoundingClientRect();
                        const x = (evt.clientX - rect.left) / ds.scale - ds.offset[0];
                        const y = (evt.clientY - rect.top) / ds.scale - ds.offset[1];
                        return [x, y];
                    };
                    const isOverNode = (evt) => {
                        const pos = getGraphPos(evt);
                        return this.isPointInside(pos[0], pos[1]);
                    };

                    const onDragOver = (evt) => {
                        if (!isOverNode(evt)) return;
                        evt.preventDefault();
                        evt.dataTransfer.dropEffect = "copy";
                    };

                    const onDrop = (evt) => {
                        if (!isOverNode(evt)) return;
                        evt.preventDefault();
                        evt.stopPropagation();
                        if (evt._vpgHandled) return;
                        evt._vpgHandled = true;
                        const files = Array.from(evt.dataTransfer?.files || []).filter((f) => f.type && f.type.startsWith("image/"));
                        if (files.length > 0) {
                            this.showPlaceholder(false);
                            this.uploadAndProcessFiles(files);
                        }
                    };

                    const target = document.body;
                    target.addEventListener("dragover", onDragOver, true);
                    target.addEventListener("drop", onDrop, true);
                    this._dndHandlers = { onDragOver, onDrop, target };
                };

                this._teardownCanvasDnD = () => {
                    const handlers = this._dndHandlers;
                    if (!handlers) return;
                    handlers.target.removeEventListener("dragover", handlers.onDragOver, true);
                    handlers.target.removeEventListener("drop", handlers.onDrop, true);
                    this._dndHandlers = null;
                };

                this._setupCanvasDnD();

                this.onDropFile = (file) => {
                    if (file && file.type && file.type.startsWith("image/")) {
                        this.uploadAndProcessFiles([file]);
                        return true;
                    }
                    return false;
                };

                this.onDropFiles = (files) => {
                    const list = Array.from(files || []).filter((f) => f.type && f.type.startsWith("image/"));
                    if (list.length > 0) {
                        this.uploadAndProcessFiles(list);
                        return true;
                    }
                    return false;
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

                const scorePromptText = (text) => {
                    if (!text || typeof text !== "string") return -Infinity;
                    if (looksLikeJson(text)) return -Infinity;
                    let score = text.length;
                    if (/\s/.test(text)) score += 8;
                    if (/[,\.;:]/.test(text)) score += 4;
                    if (!/[a-zA-Z0-9]/.test(text)) score -= 4;
                    return score;
                };

                const rankCandidates = (items, limit = 80) => {
                    const map = new Map();
                    for (const item of items) {
                        if (!item) continue;
                        const text = typeof item === "string" ? item : item.text;
                        if (!text || typeof text !== "string") continue;
                        const cleaned = text.trim();
                        if (!cleaned) continue;
                        const score = typeof item === "object" && typeof item.score === "number"
                            ? item.score
                            : scorePromptText(cleaned);
                        const prev = map.get(cleaned);
                        if (prev == null || score > prev) map.set(cleaned, score);
                    }
                    return Array.from(map, ([text, score]) => ({ text, score }))
                        .sort((a, b) => b.score - a.score)
                        .slice(0, limit);
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

                const buildGraphTools = (graph) => {
                    if (!graph) return null;
                    let isApi = false;

                    if (graph.nodes && Array.isArray(graph.nodes)) {
                        isApi = false;
                    } else if (typeof graph === 'object' && Object.values(graph).some(n => n && n.class_type)) {
                        isApi = true;
                    } else {
                        return null;
                    }

                    const findNode = (id) => (isApi ? graph[id] : graph.nodes.find((n) => n.id == id));
                    const nodes = isApi ? Object.values(graph) : graph.nodes;

                    const MAX_TRACE_DEPTH = 24;
                    const MAX_CANDIDATES_PER_NODE = 30;

                    const isBypassed = (node) => {
                        if (!node) return false;
                        const mode = node.mode;
                        if (mode == 4 || mode == 2) return true;
                        if (node.flags && (node.flags.bypassed || node.flags.bypass)) return true;
                        return false;
                    };

                    const chooseBestText = (candidates) => {
                        let best = "";
                        let bestScore = -Infinity;
                        for (const text of candidates) {
                            const score = scorePromptText(text);
                            if (score > bestScore) {
                                bestScore = score;
                                best = text;
                            }
                        }
                        return best || "";
                    };

                    const dedupeCandidates = (items, limit = 80) => {
                        const map = new Map();
                        for (const item of items) {
                            if (!item || !item.text) continue;
                            const cleaned = String(item.text).trim();
                            if (!cleaned) continue;
                            const score = typeof item.score === "number" ? item.score : scorePromptText(cleaned);
                            const prev = map.get(cleaned);
                            if (prev == null || score > prev) map.set(cleaned, score);
                        }
                        return Array.from(map, ([text, score]) => ({ text, score }))
                            .sort((a, b) => b.score - a.score)
                            .slice(0, limit);
                    };

                    const resolveWidgetText = (node, outIndex) => {
                        if (!node || !node.widgets_values) return "";
                        const w = node.widgets_values;
                        if (Array.isArray(w)) {
                            if (typeof outIndex === "number" && typeof w[outIndex] === "string" && w[outIndex].length > 0) {
                                return w[outIndex];
                            }
                            const strings = w.filter(x => typeof x === "string" && x.length > 0);
                            return chooseBestText(strings);
                        }
                        if (typeof w === "string" && w.length > 0) return w;
                        return "";
                    };

                    const resolveInputText = (node, outIndex) => {
                        if (!node || !node.inputs || Array.isArray(node.inputs) || typeof node.inputs !== "object") return "";
                        const inputs = node.inputs;

                        const stringEntries = Object.entries(inputs)
                            .filter(([, v]) => typeof v === "string" && v.length > 0);

                        if (stringEntries.length === 0) return "";

                        if (typeof outIndex === "number" && outIndex >= 0 && outIndex < stringEntries.length) {
                            return stringEntries[outIndex][1];
                        }

                        return chooseBestText(stringEntries.map(([, v]) => v));
                    };

                    const resolveSeparator = (node) => {
                        const candidates = [];
                        if (node && node.widgets_values) {
                            if (Array.isArray(node.widgets_values)) {
                                for (const v of node.widgets_values) {
                                    if (typeof v === "string" && v.length > 0) candidates.push(v);
                                }
                            } else if (typeof node.widgets_values === "string") {
                                candidates.push(node.widgets_values);
                            }
                        }
                        if (node && node.inputs && !Array.isArray(node.inputs) && typeof node.inputs === "object") {
                            for (const v of Object.values(node.inputs)) {
                                if (typeof v === "string" && v.length > 0) candidates.push(v);
                            }
                        }

                        const shortCandidates = candidates.filter(c => c.length <= 10 && !looksLikeJson(c));
                        if (shortCandidates.length === 0) return "";

                        let best = "";
                        let bestScore = -Infinity;
                        for (const c of shortCandidates) {
                            let score = 0;
                            if (/\s/.test(c)) score += 3;
                            if (/[\,\.;:\|\/]/.test(c)) score += 4;
                            score -= c.length;
                            if (score > bestScore) {
                                bestScore = score;
                                best = c;
                            }
                        }
                        return best || "";
                    };

                    const normalizeKey = (value) => String(value ?? "")
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "");

                    const getLinkedInputs = (node) => {
                        const links = [];
                        if (!node) return links;

                        if (isApi && node.inputs && typeof node.inputs === "object" && !Array.isArray(node.inputs)) {
                            for (const [name, val] of Object.entries(node.inputs)) {
                                if (Array.isArray(val) && val.length >= 2) {
                                    links.push({ name, from: val[0], outIndex: val[1] });
                                }
                            }
                        } else if (!isApi && Array.isArray(node.inputs)) {
                            for (const inp of node.inputs) {
                                if (inp && inp.link && graph.links) {
                                    const link = graph.links.find(l => l[0] === inp.link);
                                    if (link) links.push({ name: inp.name, from: link[1], outIndex: link[2] });
                                }
                            }
                        }
                        return links;
                    };

                    const getInputLinkByName = (node, name) => {
                        const links = getLinkedInputs(node);
                        const key = normalizeKey(name);
                        return links.find(l => normalizeKey(l.name) == key) || null;
                    };

                    const inferSelectedInput = (node, links) => {
                        if (!node || links.length === 0) return null;
                        if (links.length === 1) return links[0];

                        const widgetValues = [];
                        if (Array.isArray(node.widgets_values)) widgetValues.push(...node.widgets_values);
                        else if (node.widgets_values != null) widgetValues.push(node.widgets_values);

                        for (const raw of widgetValues) {
                            if (typeof raw === "number" && Number.isFinite(raw)) {
                                const idx = Math.floor(raw);
                                if (idx >= 0 && idx < links.length) return links[idx];
                            }
                            if (typeof raw === "string") {
                                const s = normalizeKey(raw);
                                if (!s) continue;
                                const byName = links.find(l => normalizeKey(l.name) === s);
                                if (byName) return byName;
                                const m = s.match(/\d+/);
                                if (m) {
                                    const idx = parseInt(m[0], 10) - 1;
                                    if (idx >= 0 && idx < links.length) return links[idx];
                                }
                            }
                        }

                        return null;
                    };

                    const getLiteralInputByName = (node, name) => {
                        if (!node) return "";
                        if (node.inputs && !Array.isArray(node.inputs) && typeof node.inputs === "object") {
                            const val = node.inputs[name];
                            if (typeof val === "string" && val.length > 0) return val;
                        }
                        if (Array.isArray(node.widgets_values)) {
                            if (name === "string_a" && typeof node.widgets_values[0] === "string") return node.widgets_values[0];
                            if (name === "string_b" && typeof node.widgets_values[1] === "string") return node.widgets_values[1];
                        }
                        return "";
                    };

                    function traceInput(node, inputName, depth = 0, visited = new Set()) {
                        if (!node) return "";

                        if (isApi && node.inputs) {
                            const val = node.inputs[inputName];
                            if (Array.isArray(val)) {
                                return traceText(val[0], val[1], depth + 1, visited);
                            }
                            if (typeof val === "string") return val;
                        } else if (!isApi && node.inputs && Array.isArray(node.inputs)) {
                            const inp = node.inputs.find(i => i.name === inputName);
                            if (inp && inp.link && graph.links) {
                                const link = graph.links.find(l => l[0] === inp.link);
                                if (link) {
                                    return traceText(link[1], link[2], depth + 1, visited);
                                }
                            }
                        }

                        const w = resolveWidgetText(node);
                        if (typeof w === "string") return w;
                        return "";
                    }

                    function traceText(nodeId, outIndex = 0, depth = 0, visited = new Set()) {
                        if (!nodeId) return "";
                        if (depth > MAX_TRACE_DEPTH) return "";
                        const visitKey = `${nodeId}:${outIndex}`;
                        if (visited.has(visitKey)) return "";
                        visited.add(visitKey);

                        const node = findNode(nodeId);
                        if (!node) return "";

                        const type = (node.class_type || node.type || "").toLowerCase();

                        if (isBypassed(node) || type.includes("reroute") || type.includes("passthrough")) {
                            const linked = getLinkedInputs(node);
                            const selected = inferSelectedInput(node, linked);
                            if (selected) {
                                const val = traceText(selected.from, selected.outIndex, depth + 1, visited);
                                if (val) return val;
                            }
                            const results = linked
                                .map(l => traceText(l.from, l.outIndex, depth + 1, visited))
                                .filter(Boolean);
                            const best = chooseBestText(results);
                            if (best) return best;
                        }

                        if (type.includes("stringconcatenate")) {
                            const left = traceInput(node, "string_a", depth + 1, visited);
                            const right = traceInput(node, "string_b", depth + 1, visited);
                            const fallbackA = Array.isArray(node.widgets_values) && typeof node.widgets_values[0] === "string" ? node.widgets_values[0] : "";
                            const fallbackB = Array.isArray(node.widgets_values) && typeof node.widgets_values[1] === "string" ? node.widgets_values[1] : "";
                            const a = left || fallbackA;
                            const b = right || fallbackB;
                            const sep = resolveSeparator(node);
                            if (a && b) return `${a}${sep}${b}`;
                            if (a || b) return a || b || "";
                        }

                        const traced = chooseBestText([
                            traceInput(node, "text", depth + 1, visited),
                            traceInput(node, "string", depth + 1, visited),
                            traceInput(node, "value", depth + 1, visited),
                        ]);
                        if (traced) return traced;

                        const linkedInputs = getLinkedInputs(node);
                        if (linkedInputs.length > 0) {
                            const selected = inferSelectedInput(node, linkedInputs);
                            if (selected) {
                                const val = traceText(selected.from, selected.outIndex, depth + 1, visited);
                                if (val) return val;
                            }
                            const results = linkedInputs
                                .map(l => traceText(l.from, l.outIndex, depth + 1, visited))
                                .filter(Boolean);
                            const best = chooseBestText(results);
                            if (best) return best;
                        }

                        const inputText = resolveInputText(node, outIndex);
                        if (inputText && !looksLikeJson(inputText)) return inputText;

                        const widgetText = resolveWidgetText(node, outIndex);
                        if (widgetText && !looksLikeJson(widgetText)) return widgetText;

                        if (node.inputs && Array.isArray(node.inputs) && node.inputs.length === 1) {
                            const solo = node.inputs[0];
                            if (solo && solo.link && graph.links) {
                                const link = graph.links.find(l => l[0] === solo.link);
                                if (link) {
                                    return traceText(link[1], link[2], depth + 1, visited);
                                }
                            }
                        }

                        return "";
                    }

                    function collectCandidatesFromInput(node, inputName, bonus = 0, depth = 0, visited = new Set()) {
                        if (!node) return [];
                        if (isApi && node.inputs) {
                            const val = node.inputs[inputName];
                            if (Array.isArray(val)) {
                                return collectCandidates(val[0], val[1], depth + 1, visited, bonus);
                            }
                            if (typeof val === "string" && val.length > 0) {
                                return [{ text: val, score: scorePromptText(val) + bonus }];
                            }
                        } else if (!isApi && node.inputs && Array.isArray(node.inputs)) {
                            const inp = node.inputs.find(i => i.name === inputName);
                            if (inp && inp.link && graph.links) {
                                const link = graph.links.find(l => l[0] === inp.link);
                                if (link) {
                                    return collectCandidates(link[1], link[2], depth + 1, visited, bonus);
                                }
                            }
                        }
                        return [];
                    }

                    function collectCandidates(nodeId, outIndex = 0, depth = 0, visited = new Set(), bonus = 0) {
                        if (!nodeId) return [];
                        if (depth > MAX_TRACE_DEPTH) return [];
                        const visitKey = `${nodeId}:${outIndex}`;
                        if (visited.has(visitKey)) return [];
                        visited.add(visitKey);

                        const node = findNode(nodeId);
                        if (!node) return [];

                        const type = (node.class_type || node.type || "").toLowerCase();
                        let results = [];

                        const addText = (text, extra = 0) => {
                            if (!text || typeof text !== "string") return;
                            if (looksLikeJson(text)) return;
                            results.push({ text, score: scorePromptText(text) + bonus + extra });
                        };

                        if (isBypassed(node) || type.includes("reroute") || type.includes("passthrough")) {
                            const linked = getLinkedInputs(node);
                            const selected = inferSelectedInput(node, linked);
                            if (selected) {
                                results = results.concat(collectCandidates(selected.from, selected.outIndex, depth + 1, new Set(visited), bonus + 10));
                            }
                            for (const l of linked) {
                                if (selected && l === selected) continue;
                                results = results.concat(collectCandidates(l.from, l.outIndex, depth + 1, new Set(visited), bonus));
                            }
                            return dedupeCandidates(results, MAX_CANDIDATES_PER_NODE);
                        }

                        if (type.includes("stringconcatenate")) {
                            const leftLink = getInputLinkByName(node, "string_a");
                            const rightLink = getInputLinkByName(node, "string_b");
                            let leftList = leftLink ? collectCandidates(leftLink.from, leftLink.outIndex, depth + 1, new Set(visited), bonus) : [];
                            let rightList = rightLink ? collectCandidates(rightLink.from, rightLink.outIndex, depth + 1, new Set(visited), bonus) : [];

                            const leftLiteral = getLiteralInputByName(node, "string_a");
                            const rightLiteral = getLiteralInputByName(node, "string_b");
                            if (leftLiteral) leftList.push({ text: leftLiteral, score: scorePromptText(leftLiteral) + bonus });
                            if (rightLiteral) rightList.push({ text: rightLiteral, score: scorePromptText(rightLiteral) + bonus });

                            const sep = resolveSeparator(node);
                            const leftTop = dedupeCandidates(leftList, 6);
                            const rightTop = dedupeCandidates(rightList, 6);

                            if (leftTop.length && rightTop.length) {
                                let count = 0;
                                for (const l of leftTop) {
                                    for (const r of rightTop) {
                                        results.push({
                                            text: `${l.text}${sep}${r.text}`,
                                            score: l.score + r.score + scorePromptText(sep),
                                        });
                                        count += 1;
                                        if (count >= MAX_CANDIDATES_PER_NODE) break;
                                    }
                                    if (count >= MAX_CANDIDATES_PER_NODE) break;
                                }
                            } else if (leftList.length || rightList.length) {
                                results = results.concat(leftList, rightList);
                            }

                            return dedupeCandidates(results, MAX_CANDIDATES_PER_NODE);
                        }

                        const linked = getLinkedInputs(node);
                        const selected = inferSelectedInput(node, linked);
                        if (selected) {
                            results = results.concat(collectCandidates(selected.from, selected.outIndex, depth + 1, new Set(visited), bonus + 6));
                        }
                        for (const l of linked) {
                            if (selected && l === selected) continue;
                            results = results.concat(collectCandidates(l.from, l.outIndex, depth + 1, new Set(visited), bonus));
                        }

                        const direct = [
                            traceInput(node, "text", depth + 1, new Set(visited)),
                            traceInput(node, "string", depth + 1, new Set(visited)),
                            traceInput(node, "value", depth + 1, new Set(visited)),
                        ].filter(Boolean);
                        for (const d of direct) addText(d);

                        addText(resolveInputText(node, outIndex));
                        addText(resolveWidgetText(node, outIndex));

                        return dedupeCandidates(results, MAX_CANDIDATES_PER_NODE);
                    }

                    return {
                        isApi,
                        nodes,
                        traceInput,
                        traceText,
                        collectCandidatesFromInput,
                        collectCandidates,
                        dedupeCandidates,
                    };
                };

                const parseComfyGraph = (graph, metadata) => {
                    const tools = buildGraphTools(graph);
                    if (!tools) return false;

                    const samplers = tools.nodes.filter(n => {
                        const t = (n.class_type || n.type || "").toLowerCase();
                        return t.includes("sampler");
                    });

                    let bestPos = "", bestNeg = "";
                    samplers.forEach(s => {
                        const pos = tools.traceInput(s, "positive");
                        const neg = tools.traceInput(s, "negative");
                        if (pos && pos.length > bestPos.length) bestPos = pos;
                        if (neg && neg.length > bestNeg.length) bestNeg = neg;
                    });

                    let found = false;
                    if (bestPos && !metadata.positive_prompt) {
                        const cleaned = sanitizePrompt(bestPos);
                        if (cleaned) {
                            metadata.positive_prompt = cleaned;
                            found = true;
                        }
                    }
                    if (bestNeg && !metadata.negative_prompt) {
                        const cleaned = sanitizePrompt(bestNeg);
                        if (cleaned) {
                            metadata.negative_prompt = cleaned;
                            found = true;
                        }
                    }
                    return found;
                };

                const collectComfyGraphCandidates = (graph) => {
                    const tools = buildGraphTools(graph);
                    if (!tools) return [];

                    const samplers = tools.nodes.filter(n => {
                        const t = (n.class_type || n.type || "").toLowerCase();
                        return t.includes("sampler");
                    });

                    let candidates = [];
                    for (const s of samplers) {
                        candidates = candidates.concat(tools.collectCandidatesFromInput(s, "positive", 10));
                        candidates = candidates.concat(tools.collectCandidatesFromInput(s, "negative", 2));
                    }

                    return tools.dedupeCandidates(candidates, 80);
                };
                window.MAD_VPG = window.MAD_VPG || {};
                window.MAD_VPG.parseComfyGraph = (graphOrString) => {
                    let graph = graphOrString;
                    if (typeof graphOrString === "string") {
                        try {
                            graph = JSON.parse(graphOrString);
                        } catch (e) {
                            return { ok: false, error: "Invalid JSON string" };
                        }
                    }
                    const metadata = { positive_prompt: "", negative_prompt: "" };
                    const found = parseComfyGraph(graph, metadata);
                    return { ok: true, found, metadata };
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
                    const cached = this.metadataCache.get(cacheKey);
                    if (cached && Array.isArray(cached.candidates)) return cached;

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
                        let metadata = { positive_prompt: "", negative_prompt: "", candidates: [] };

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

                        if (comfyJson) {
                            try {
                                const graph = JSON.parse(comfyJson);
                                parseComfyGraph(graph, metadata);
                                metadata.candidates = collectComfyGraphCandidates(graph);
                            } catch (e) {}
                        }

                        if (!metadata.candidates || metadata.candidates.length === 0) {
                            const fallback = [];
                            if (metadata.positive_prompt) fallback.push(metadata.positive_prompt);
                            if (metadata.negative_prompt) fallback.push(metadata.negative_prompt);
                            metadata.candidates = rankCandidates(fallback);
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

                this.showPromptAnalysis = (candidates) => {
                    const existing = document.getElementById("vpg-analyze-overlay");
                    if (existing) existing.remove();

                    const overlay = document.createElement("div");
                    overlay.id = "vpg-analyze-overlay";
                    overlay.className = "mad-gallery-analyze-overlay";

                    const modal = document.createElement("div");
                    modal.className = "mad-gallery-analyze-modal";

                    const header = document.createElement("div");
                    header.className = "mad-gallery-analyze-header";
                    header.innerText = "Analyze Prompt";

                    const list = document.createElement("div");
                    list.className = "mad-gallery-analyze-list";

                    const safeCandidates = Array.isArray(candidates) ? candidates : [];
                    if (safeCandidates.length === 0) {
                        const empty = document.createElement("div");
                        empty.className = "mad-gallery-analyze-empty";
                        empty.innerText = "No prompt candidates found.";
                        list.appendChild(empty);
                    } else {
                        safeCandidates.forEach((cand) => {
                            const text = typeof cand === "string" ? cand : (cand.text || "");
                            const item = document.createElement("div");
                            item.className = "mad-gallery-analyze-item";
                            item.innerText = text;
                            item.title = "Click to copy";
                            item.onclick = async () => {
                                if (!text) return;
                                try {
                                    await navigator.clipboard.writeText(text);
                                } catch (e) {
                                    const temp = document.createElement("textarea");
                                    temp.value = text;
                                    document.body.appendChild(temp);
                                    temp.select();
                                    document.execCommand("copy");
                                    temp.remove();
                                }
                                item.classList.add("copied");
                                setTimeout(() => item.classList.remove("copied"), 600);
                            };
                            list.appendChild(item);
                        });
                    }

                    const footer = document.createElement("div");
                    footer.className = "mad-gallery-analyze-footer";

                    const closeBtn = document.createElement("button");
                    closeBtn.className = "mad-gallery-analyze-close-btn";
                    closeBtn.innerText = "Exit";

                    const close = () => {
                        document.removeEventListener("keydown", onKeyDown);
                        overlay.remove();
                    };

                    const onKeyDown = (e) => {
                        if (e.key === "Escape") {
                            e.preventDefault();
                            close();
                        }
                    };

                    closeBtn.onclick = (e) => {
                        e.stopPropagation();
                        close();
                    };

                    overlay.onclick = (e) => {
                        if (e.target === overlay) close();
                    };

                    document.addEventListener("keydown", onKeyDown);

                    footer.appendChild(closeBtn);
                    modal.appendChild(header);
                    modal.appendChild(list);
                    modal.appendChild(footer);
                    overlay.appendChild(modal);
                    document.body.appendChild(overlay);
                };

                this.analyzePrompt = async (imgInfo) => {
                    const metadata = await this.fetchMetadata(imgInfo);
                    const candidates = Array.isArray(metadata?.candidates)
                        ? metadata.candidates
                        : [];
                    this.showPromptAnalysis(candidates);
                };

                this.removeImage = (imgInfo) => {
                    this.storedImages = this.storedImages.filter((i) => i.name !== imgInfo.name);
                    if (this._selectedImageName === imgInfo.name) this._selectedImageName = null;
                    this.setDirtyCanvas(true, true);

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
                        this._galleryScrollY = 0;
                    }

                    this.saveState();
                };

                /*
                 * ============================================================================
                 * THUMBNAIL & SELECTION LOGIC
                 * ============================================================================
                 */

                this.addThumbnail = (imgInfo) => {
                    const exists = this.storedImages.find((i) => i.name === imgInfo.name);
                    if (!exists) this.storedImages.push(imgInfo);
                    this.showPlaceholder(false);
                    this.setDirtyCanvas(true, true);
                };

                this.selectImage = async (itemElement, imgInfo) => {
                    if (!imgInfo) return;
                    if (this._selectedImageName === imgInfo.name) return;

                    this._selectedImageName = imgInfo.name;
                    this.setDirtyCanvas(true, true);

                    const metadata = await this.fetchMetadata(imgInfo);
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
                                this.setDirtyCanvas(true, true);
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
                                const idx = this.storedImages.findIndex((i) => i.name === currentData.name);
                                if (idx !== -1) {
                                    const imgInfo = this.storedImages[idx];
                                    this._selectedImageName = currentData.name;
                                    const content = (() => {
                                        const titleH = getTitleHeight();
                                        const x = PADDING;
                                        const y = titleH + TOOLBAR_HEIGHT + PADDING;
                                        const w = Math.max(0, this.size[0] - PADDING * 2);
                                        const h = Math.max(0, this.size[1] - titleH - TOOLBAR_HEIGHT - PADDING * 2);
                                        return { x, y, w, h };
                                    })();
                                    if (content.w > 0 && content.h > 0) {
                                        const config = getViewConfig();
                                        const minCol = config.minWidthPx || 120;
                                        const ratio = config.ratioValue || 1;
                                        const cols = Math.max(1, Math.floor((content.w + GAP) / (minCol + GAP)));
                                        const colW = Math.max(1, (content.w - GAP * (cols - 1)) / cols);
                                        const rowH = Math.max(1, colW / ratio);
                                        const rows = Math.ceil(this.storedImages.length / cols);
                                        const totalHeight = rows * rowH + GAP * Math.max(0, rows - 1);
                                        const maxScroll = Math.max(0, totalHeight - content.h);
                                        const row = Math.floor(idx / cols);
                                        const targetTop = row * (rowH + GAP);
                                        this._galleryScrollY = Math.max(0, Math.min(targetTop, maxScroll));
                                    }
                                    this.setDirtyCanvas(true, true);
                                    this.selectImage(null, imgInfo);
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
