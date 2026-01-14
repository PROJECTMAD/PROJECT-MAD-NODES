import { TEXT } from "./Constants.js";
import { ICONS } from "./Icons.js";
import { el } from "./Utils.js";

export class LoRAPickerDialog {
    constructor(availableLoras, onSelect, initialSearch = "") {
        this.availableLoras = availableLoras || [];
        this.onSelect = onSelect;
        this.initialSearch = initialSearch;
        this._boundKeyHandler = this.handleKey.bind(this);
        this.render();
        document.body.appendChild(this.overlay);
        requestAnimationFrame(() => {
            this.overlay.classList.add("visible");
            this.modal.classList.add("visible");
            this.input.focus();

            if (this.input.value) {
                const len = this.input.value.length;
                this.input.setSelectionRange(len, len);
            }
        });

        document.addEventListener("keydown", this._boundKeyHandler);
    }

    render() {
        this.input = el("input", {
            className: "mad-picker-search",
            placeholder: TEXT.pickerSearchPlaceholder,
            oninput: () => this.filterList(),
            value: this.initialSearch,
        });
        this.list = el("div", { className: "mad-picker-list" });
        this.modal = el(
            "div",
            { className: "mad-picker-modal" },

            el("div", { className: "mad-picker-header" }, el("div", { className: "mad-text-muted", html: ICONS.search }), this.input),

            this.list,
        );
        this.overlay = el(
            "div",
            {
                className: "mad-overlay mad-picker-overlay",
                onclick: (e) => {
                    if (e.target === this.overlay) this.close();
                },
            },
            this.modal,
        );
        this.filterList();
    }

    renderList(items) {
        this.list.innerHTML = "";
        items.forEach((name) => {
            const item = el(
                "div",
                {
                    className: "mad-picker-item",
                    onclick: () => {
                        this.onSelect(name);
                        this.close();
                    },
                },
                el("div", { className: "mad-picker-icon", html: ICONS.file }),
                el("span", { className: "mad-picker-text" }, name),
            );
            this.list.appendChild(item);
        });
    }

    filterList() {
        const query = this.input.value.toLowerCase();
        const filtered = this.availableLoras.filter((n) => n.toLowerCase().includes(query));
        this.renderList(filtered);
    }

    handleKey(e) {
        if (e.key === "Escape") this.close();
    }

    close() {
        this.overlay.classList.remove("visible");
        this.modal.classList.remove("visible");
        setTimeout(() => {
            if (document.body.contains(this.overlay)) document.body.removeChild(this.overlay);
        }, 300);
        document.removeEventListener("keydown", this._boundKeyHandler);
    }
}
