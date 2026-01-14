import { el, attachMadTooltip, sortBlocks, createAnalysisLegend, resolveBadgeStyle } from "./Utils.js";
import { ANALYSIS_TEXT, SEMANTIC_COLORS, TEXT } from "./Constants.js";
import { ICONS } from "./Icons.js";

export class AnalysisPanel {
    static create(stats, arch) {
        const container = el("div", { className: "mad-analysis-panel" });
        if (!stats || !stats.energy_distribution || Object.keys(stats.energy_distribution).length === 0) {
            container.innerHTML = "";
            container.appendChild(this.createPlaceholder());
            return container;
        }
        const badgeData = resolveBadgeStyle(arch);
        const badge = el(
            "span",
            {
                className: "mad-analysis-badge",
                style: {
                    color: badgeData.color,
                    borderColor: badgeData.color,
                    backgroundColor: badgeData.color + "33",
                },
            },
            badgeData.code,
        );

        const header = el(
            "div",
            { className: "mad-analysis-header" },
            el("div", {
                className: "mad-text-muted-sm",
                html: ANALYSIS_TEXT.titleHtml,
            }),
            badge,
        );
        container.appendChild(header);
        const sparsity = stats.sparsity || 0;
        const balance = stats.balance || 0;

        const stabData = this.getStabilityData(sparsity);
        const infData = this.getInfluenceData(balance);

        const metricsRow = el("div", { className: "mad-analysis-metrics" });
        const stabEl = el(
            "div",
            { className: "mad-analysis-metric" },
            el("span", { className: "mad-analysis-metric-label" }, ANALYSIS_TEXT.metrics.concentration),
            el("div", { className: "mad-analysis-metric-value" }, el("div", { className: "mad-analysis-dot", style: { background: stabData.color } }), el("span", { className: "mad-analysis-text" }, stabData.text)),
        );
        attachMadTooltip(stabEl, `<strong>${ANALYSIS_TEXT.metrics.concentration}</strong>\n${stabData.desc}`);
        const infEl = el(
            "div",
            { className: "mad-analysis-metric" },
            el("span", { className: "mad-analysis-metric-label" }, ANALYSIS_TEXT.metrics.bias),
            el("div", { className: "mad-analysis-metric-value" }, el("div", { className: "mad-analysis-dot", style: { background: infData.color } }), el("span", { className: "mad-analysis-text" }, infData.text)),
        );
        attachMadTooltip(infEl, `<strong>${ANALYSIS_TEXT.metrics.bias}</strong>\n${infData.desc}`);

        metricsRow.appendChild(stabEl);
        metricsRow.appendChild(infEl);
        container.appendChild(metricsRow);
        if (stats.energy_distribution) {
            const mapLabel = el("div", { className: "mad-analysis-map-label" }, ANALYSIS_TEXT.mapLabel);
            container.appendChild(mapLabel);
            container.appendChild(this.createHeatmap(stats, arch));
            container.appendChild(createAnalysisLegend());
        }

        return container;
    }
    static createPlaceholder() {
        return el("div", { className: "mad-analysis-placeholder" }, el("div", { className: "mad-analysis-placeholder-icon", html: ICONS.search || "?" }), el("div", {}, ANALYSIS_TEXT.placeholder.title), el("div", { className: "mad-text-tiny-muted" }, ANALYSIS_TEXT.placeholder.subtitle));
    }

    static createHeatmap(stats, arch) {
        const dist = stats.energy_distribution;
        const meta = stats.block_metadata || {};

        const container = el("div", { className: "mad-heatmap-container" });

        const keys = Object.keys(dist);
        const sortedKeys = sortBlocks(keys);
        let maxE = 0;
        sortedKeys.forEach((k) => (maxE = Math.max(maxE, dist[k])));

        sortedKeys.forEach((k) => {
            const val = dist[k];
            const intensity = val / (maxE || 1);
            let baseColor = SEMANTIC_COLORS["OTHER"];

            if (meta[k]) {
                const tag = meta[k].tag;
                baseColor = SEMANTIC_COLORS[tag] || SEMANTIC_COLORS["OTHER"];
            } else {
                const kLow = k.toLowerCase();
                if (kLow.match(/(?:^|_)(input|down|double)/)) baseColor = SEMANTIC_COLORS["POSE"];
                else if (kLow.match(/(?:^|_)(middle|mid|joint)/)) baseColor = SEMANTIC_COLORS["IDENTITY"];
                else if (kLow.match(/(?:^|_)(output|up|single)/)) baseColor = SEMANTIC_COLORS["STYLE"];
                else if (kLow.startsWith("layers")) baseColor = SEMANTIC_COLORS["CLIP"];
            }

            const block = el("div", {
                className: "mad-heatmap-block",
                style: {
                    background: baseColor,
                    opacity: 0.2 + intensity * 0.8,
                },
            });
            const kLow = k.toLowerCase();
            if (kLow.includes("mid") || kLow.includes("middle")) {
                block.classList.add("mad-heatmap-separator");
            }

            const percentage = (intensity * 100).toFixed(1);
            attachMadTooltip(block, ANALYSIS_TEXT.energyTooltip.replace("{key}", k).replace("{percentage}", percentage));
            container.appendChild(block);
        });

        return container;
    }

    static getStabilityData(sparsity) {
        if (sparsity > 0.25) return { text: ANALYSIS_TEXT.stability.high, color: "#e6253a", desc: ANALYSIS_TEXT.stability.highDesc };
        if (sparsity > 0.12) return { text: ANALYSIS_TEXT.stability.mod, color: SEMANTIC_COLORS["IDENTITY"], desc: ANALYSIS_TEXT.stability.modDesc };
        return { text: ANALYSIS_TEXT.stability.safe, color: SEMANTIC_COLORS["POSE"], desc: ANALYSIS_TEXT.stability.safeDesc };
    }

    static getInfluenceData(balance) {
        if (balance > 0.3) return { text: ANALYSIS_TEXT.influence.style, color: SEMANTIC_COLORS["STYLE"], desc: ANALYSIS_TEXT.influence.styleDesc };
        if (balance < -0.3) return { text: ANALYSIS_TEXT.influence.struct, color: SEMANTIC_COLORS["DETAILS"], desc: ANALYSIS_TEXT.influence.structDesc };
        return { text: ANALYSIS_TEXT.influence.neutral, color: SEMANTIC_COLORS["OTHER"], desc: ANALYSIS_TEXT.influence.neutralDesc };
    }
}
