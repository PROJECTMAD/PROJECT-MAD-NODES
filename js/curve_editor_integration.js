const app = window.comfyAPI.app.app;
import { TEXT, LOG_PREFIX, WIDGET_NAMES, NODE_COLORS } from "./components/Constants.js";
import { parseScheduleString } from "./components/Utils.js";
import { MultiCurveEditor } from "./components/MultiCurveEditor.js";
const link = document.createElement("link");
link.rel = "stylesheet";
link.type = "text/css";
link.href = new URL("./mad_nodes.css", import.meta.url).href;
document.head.appendChild(link);

const MultiScheduledLoraLoader_DefaultTitle = TEXT.nodeTitle;

app.registerExtension({
    name: "Comfy._MultiScheduledLoraLoader",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "MultiScheduledLoraLoader") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;

            nodeType.prototype.onNodeCreated = function () {
                onNodeCreated?.apply(this, arguments);

                this.color = NODE_COLORS.TITLE_BG;
                this.bgcolor = NODE_COLORS.BG;
                const configWidget = this.widgets.find((w) => w.name === WIDGET_NAMES.CONFIG);
                if (configWidget) {
                    configWidget.type = "hidden";
                    configWidget.computeSize = () => [0, -4];
                }
                const getUpstreamStatus = (slotName) => {
                    const inputIndex = this.findInputSlot(slotName);
                    if (inputIndex === -1 || !this.inputs[inputIndex].link) return { exists: false, active: false, node: null };

                    const linkId = this.inputs[inputIndex].link;
                    const link = app.graph.links[linkId];
                    if (!link) return { exists: false, active: false, node: null };

                    const originNode = app.graph.getNodeById(link.origin_id);
                    if (!originNode) return { exists: false, active: false, node: null };
                    const isActive = originNode.mode !== 2 && originNode.mode !== 4;
                    return { exists: true, active: isActive, node: originNode };
                };
                const getExternalText = () => {
                    const status = getUpstreamStatus(WIDGET_NAMES.STRING);
                    if (!status.exists || !status.active || !status.node) return null;

                    if (status.node.widgets) {
                        const textWidget = status.node.widgets.find((w) => typeof w.value === "string" || w.type === "text" || w.type === "customtext");
                        if (textWidget) return textWidget.value;
                    }
                    return null;
                };

                const openEditor = () => {
                    const widget = this.widgets.find((w) => w.name === WIDGET_NAMES.CONFIG);
                    let internalData = [];
                    try {
                        internalData = widget.value ? JSON.parse(widget.value) : [];
                    } catch (e) {
                        internalData = [];
                    }

                    let importData = null;
                    const externalText = getExternalText();

                    if (externalText && typeof externalText === "string" && externalText.trim().length > 0) {
                        importData = parseScheduleString(externalText);
                    }

                    new MultiCurveEditor(this, internalData, importData, (newConfig) => {
                        if (widget) {
                            widget.value = JSON.stringify(newConfig);
                            if (widget.callback) widget.callback(widget.value, app.canvas, this, this.pos, {});
                        }
                        this.triggerTitleUpdate();
                    });
                };

                this.triggerTitleUpdate = (forceExternalValue = null) => {
                    if (this._titleTimer) clearTimeout(this._titleTimer);
                    this._titleTimer = setTimeout(() => updateNodeTitle(forceExternalValue), 50);
                };

                this.hijackUpstreamWidget = () => {
                    const status = getUpstreamStatus(WIDGET_NAMES.STRING);
                    if (!status.exists || !status.node) {
                        this._hookedWidget = null;
                        return;
                    }

                    const widget = status.node.widgets?.find((w) => typeof w.value === "string" || w.type === "text" || w.type === "customtext");
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
                    const configWidget = this.widgets.find((w) => w.name === WIDGET_NAMES.CONFIG);
                    let internalData = [];
                    let activeProfileName = "Default";

                    try {
                        const parsed = JSON.parse(configWidget.value || "[]");
                        if (Array.isArray(parsed)) {
                            internalData = parsed;
                        } else if (parsed && parsed.profiles) {
                            activeProfileName = parsed.active_profile || "Default";
                            const profileData = parsed.profiles[activeProfileName];
                            if (profileData && !Array.isArray(profileData) && profileData.loras) {
                                internalData = profileData.loras;
                            } else {
                                internalData = profileData || [];
                            }
                        }
                    } catch (e) {}
                    const enabledInternalCount = internalData.filter((i) => i.enabled !== false).length;
                    const hasInternal = enabledInternalCount > 0;
                    const hookStatus = getUpstreamStatus(WIDGET_NAMES.HOOKS);
                    const hasHooks = hookStatus.exists && hookStatus.active;

                    const strStatus = getUpstreamStatus(WIDGET_NAMES.STRING);
                    let currentExternalInput = forceExternalValue ?? getExternalText();

                    if (strStatus.exists && !strStatus.active) currentExternalInput = null;

                    const hasStr = currentExternalInput && typeof currentExternalInput === "string" && currentExternalInput.trim().length > 0;
                    let mode = "STANDARD";
                    let statusText = "";

                    if (!hasInternal && hasStr && !hasHooks) {
                        mode = "EXTERNAL_A";
                    } else if (!hasInternal && !hasStr && hasHooks) {
                        mode = "EXTERNAL_B";
                    } else if (!hasInternal && hasStr && hasHooks) {
                        mode = "BRIDGE";
                    } else if (hasInternal && hasStr && hasHooks) {
                        mode = "OVERRIDE";
                    } else {
                        mode = "STANDARD";
                    }
                    if (mode === "STANDARD") {
                        if (hasInternal) {
                            statusText = `[${activeProfileName}] (${enabledInternalCount} Active)`;
                        } else {
                            statusText = "";
                        }
                    } else if (mode === "OVERRIDE") {
                        statusText = `[${activeProfileName}] (Override: ${enabledInternalCount} Active)`;
                    } else if (mode === "EXTERNAL_A") {
                        const parsed = parseScheduleString(currentExternalInput);
                        statusText = `[External] (${parsed.length} Active)`;
                    } else if (mode === "EXTERNAL_B") {
                        statusText = `[Passthrough]`;
                    } else if (mode === "BRIDGE") {
                        statusText = `[Bridge Mode]`;
                    }
                    const finalTitle = statusText ? `${MultiScheduledLoraLoader_DefaultTitle} ${statusText}` : MultiScheduledLoraLoader_DefaultTitle;

                    if (finalTitle !== lastTitle) {
                        this.title = finalTitle;
                        lastTitle = finalTitle;
                        this.setDirtyCanvas(true, true);
                    }
                };

                this.triggerTitleUpdate();

                const originalOnExecuted = this.onExecuted;
                this.onExecuted = function () {
                    this.triggerTitleUpdate();
                    if (originalOnExecuted) originalOnExecuted.apply(this, arguments);
                };

                const scheduleConfigWidget = this.widgets.find((w) => w.name === WIDGET_NAMES.CONFIG);
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
                        let stateChanged = false;
                        for (let name of [WIDGET_NAMES.STRING, WIDGET_NAMES.HOOKS]) {
                            const status = getUpstreamStatus(name);
                            const key = `_last_${name}_mode`;
                            const currentMode = status.node ? status.node.mode : -1;

                            if (this[key] !== currentMode) {
                                this[key] = currentMode;
                                stateChanged = true;
                            }
                        }
                        if (stateChanged) this.triggerTitleUpdate();
                    }
                };

                this.addWidget("button", TEXT.openEditorButton, null, openEditor);
            };
        }
    },

    async loadedGraphNode(node, app) {
        if (node.type === "MultiScheduledLoraLoader") {
            let isLegacy = false;

            if (node.outputs[0] && node.outputs[0].links && node.outputs[0].links.length > 0) {
                const linkId = node.outputs[0].links[0];
                const link = app.graph.links[linkId];
                if (link) {
                    const targetNode = app.graph.getNodeById(link.target_id);
                    const targetInput = targetNode.inputs[link.target_slot];
                    if (targetInput.type === "HOOKS" || targetInput.type === "hooks" || targetInput.name === WIDGET_NAMES.HOOKS) {
                        isLegacy = true;
                    }
                }
            }

            if (!isLegacy && node.outputs[1] && node.outputs[1].links && node.outputs[1].links.length > 0) {
                const linkId = node.outputs[1].links[0];
                const link = app.graph.links[linkId];
                if (link) {
                    const targetNode = app.graph.getNodeById(link.target_id);
                    const targetInput = targetNode.inputs[link.target_slot];
                    if (targetInput.type === "STRING" || targetInput.type === "string") {
                        isLegacy = true;
                    }
                }
            }

            if (isLegacy) {
                console.log(`${LOG_PREFIX} Legacy workflow detected. Migrating output connections...`);

                if (node.outputs[2] && node.outputs[2].links && node.outputs[2].links.length > 0) {
                    const linksToMove = [...node.outputs[2].links];
                    for (const linkId of linksToMove) {
                        const link = app.graph.links[linkId];
                        const targetNode = app.graph.getNodeById(link.target_id);
                        node.disconnectOutput(2);
                        node.connect(3, targetNode, link.target_slot);
                    }
                }

                if (node.outputs[1] && node.outputs[1].links && node.outputs[1].links.length > 0) {
                    const linksToMove = [...node.outputs[1].links];
                    for (const linkId of linksToMove) {
                        const link = app.graph.links[linkId];
                        const targetNode = app.graph.getNodeById(link.target_id);
                        node.disconnectOutput(1);
                        node.connect(2, targetNode, link.target_slot);
                    }
                }

                if (node.outputs[0] && node.outputs[0].links && node.outputs[0].links.length > 0) {
                    const linksToMove = [...node.outputs[0].links];
                    for (const linkId of linksToMove) {
                        const link = app.graph.links[linkId];
                        const targetNode = app.graph.getNodeById(link.target_id);
                        node.disconnectOutput(0);
                        node.connect(1, targetNode, link.target_slot);
                    }
                }
                app.graph.setDirtyCanvas(true, true);
            }
        }
    },
});
