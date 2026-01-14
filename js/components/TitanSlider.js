import { attachMadTooltip } from "./Utils.js";
import { SLIDER_COLORS } from "./Constants.js";

export function createTitanSlider(label, min, max, step, initialValue, onChange, isDisabled = false, isDynamic = false, tooltip = "", onDragStart = null, onDragEnd = null, useDynamicColor = false) {
    const wrapper = document.createElement("div");
    wrapper.className = `titan-wrapper ${isDisabled ? "disabled" : ""}`;
    if (isDynamic) wrapper.classList.add("mad-dynamic-step");

    wrapper.dataset.min = String(min);
    wrapper.dataset.max = String(max);
    wrapper.dataset.step = String(step);
    wrapper.dataset.val = String(initialValue);

    if (tooltip) attachMadTooltip(wrapper, tooltip);

    const track = document.createElement("div");
    track.className = "titan-track";

    const isBipolar = min < 0 && max > 0;
    if (isBipolar) {
        const centerMark = document.createElement("div");
        centerMark.className = "titan-center-mark visible";
        track.appendChild(centerMark);
    }

    const fill = document.createElement("div");
    fill.className = "titan-fill";
    track.appendChild(fill);

    const labelSpan = document.createElement("span");
    labelSpan.className = "titan-label";
    labelSpan.textContent = label;
    track.appendChild(labelSpan);

    const valueBox = document.createElement("div");
    valueBox.className = "titan-value-box";

    const display = document.createElement("div");
    display.className = "titan-display";
    valueBox.appendChild(display);

    const input = document.createElement("input");
    input.type = "number";
    input.className = "titan-input";
    valueBox.appendChild(input);

    wrapper.appendChild(track);
    wrapper.appendChild(valueBox);

    let currentValue = parseFloat(initialValue);
    if (Number.isNaN(currentValue)) currentValue = min;

    const getDecimals = (s) => (String(s).split(".")[1] || "").length;

    const updateVisuals = (val) => {
        if (Number.isNaN(val)) val = min;
        val = Math.max(min, Math.min(max, val));
        currentValue = val;
        wrapper.dataset.val = String(currentValue);

        const currentStep = parseFloat(wrapper.dataset.step);
        const decimals = getDecimals(currentStep);

        display.textContent = currentValue.toFixed(decimals);
        input.value = String(currentValue);

        if (useDynamicColor) {
            const absVal = Math.abs(val);
            let color = SLIDER_COLORS.DEFAULT;
            if (absVal <= 1.05) color = SLIDER_COLORS.SAFE;
            else if (absVal <= 1.55) color = SLIDER_COLORS.WARN;
            else color = SLIDER_COLORS.DANGER;

            wrapper.style.setProperty("--accent", color);
            wrapper.style.setProperty("--accent-hover", color);
            fill.style.backgroundColor = color;
        }

        if (isBipolar) {
            const totalRange = max - min;
            const valFromMin = val - min;
            const percentPos = (valFromMin / totalRange) * 100;
            if (val >= 0) {
                fill.style.left = "50%";
                fill.style.width = Math.max(0, percentPos - 50) + "%";
            } else {
                fill.style.left = percentPos + "%";
                fill.style.width = Math.max(0, 50 - percentPos) + "%";
            }
        } else {
            const percent = ((val - min) / (max - min)) * 100;
            fill.style.left = "0";
            fill.style.width = percent + "%";
        }
    };

    updateVisuals(currentValue);

    if (!isDisabled) {
        let isDragging = false;
        let startX;
        let startVal;

        const onMouseMove = (e) => {
            if (!isDragging) return;
            e.preventDefault();

            const deltaX = e.clientX - startX;
            const range = max - min;
            const pixelWidth = track.offsetWidth || 200;

            let sensitivity = range / pixelWidth;
            if (e.shiftKey) sensitivity /= 10;

            let newVal = startVal + deltaX * sensitivity;

            const currentStep = parseFloat(wrapper.dataset.step);
            if (!Number.isNaN(currentStep) && currentStep > 0) {
                newVal = Math.round(newVal / currentStep) * currentStep;
                const decimals = getDecimals(currentStep);
                newVal = parseFloat(newVal.toFixed(decimals));
                if (Math.abs(newVal) < currentStep / 10) newVal = 0;
            }

            updateVisuals(newVal);
            onChange(currentValue, false);
        };

        const onMouseUp = () => {
            if (!isDragging) return;
            isDragging = false;
            wrapper.classList.remove("active");
            document.body.style.cursor = "";
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
            onChange(currentValue, true);
            if (onDragEnd) onDragEnd();
        };

        track.addEventListener("mousedown", (e) => {
            isDragging = true;
            startX = e.clientX;
            startVal = currentValue;
            wrapper.classList.add("active");
            document.body.style.cursor = "ew-resize";
            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
            if (onDragStart) onDragStart();
        });

        let wheelCommitTimer = null;
        wrapper.addEventListener(
            "wheel",
            (e) => {
                e.preventDefault();
                const direction = e.deltaY < 0 ? 1 : -1;
                const currentStep = parseFloat(wrapper.dataset.step);
                const val = parseFloat(wrapper.dataset.val);

                let effectiveStep = currentStep;
                if (e.shiftKey) effectiveStep /= 10;

                let newVal = val + effectiveStep * direction;

                const decimals = getDecimals(currentStep);
                newVal = parseFloat(newVal.toFixed(e.shiftKey ? decimals + 1 : decimals));
                newVal = Math.max(min, Math.min(max, newVal));

                updateVisuals(newVal);
                onChange(newVal, false);

                if (wheelCommitTimer) clearTimeout(wheelCommitTimer);
                wheelCommitTimer = setTimeout(() => {
                    onChange(newVal, true);
                }, 400);
            },
            { passive: false },
        );

        track.addEventListener("dblclick", () => {
            let def = isBipolar ? 0 : min;
            if (/Strength|Scale|Structure|Concept|Artistic|Texture/.test(label)) def = 1.0;
            updateVisuals(def);
            onChange(currentValue, true);
        });

        display.addEventListener("click", () => {
            input.style.display = "block";
            input.focus();
            input.select();
            if (onDragStart) onDragStart();
        });

        const closeInput = () => {
            let typed = parseFloat(input.value);
            if (Number.isNaN(typed)) typed = currentValue;
            updateVisuals(typed);
            input.style.display = "none";
            onChange(currentValue, true);
            if (onDragEnd) onDragEnd();
        };

        input.addEventListener("blur", closeInput);
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") input.blur();
            if (e.key === "Escape") {
                input.value = String(currentValue);
                input.blur();
            }
        });
    }

    wrapper.updateValue = updateVisuals;
    return wrapper;
}
