window.modals = {};

class Modal {
    constructor(options, onclose) {
        if (!options || !options.type) throw "Missing parameters";

        this.type = options.type;
        this.id = require("nanoid").nanoid();
        while (typeof window.modals[this.id] !== "undefined") {
            this.id = require("nanoid")();
        }
        this.title = options.title || options.type || "Modal window";
        this.message = options.message || "Lorem ipsum dolor sit amet.";
        this.onclose = onclose;
        this.classes = "modal_popup";
        let buttons = [];
        let augs = [];
        let zindex = 0;

        // Reserve a slot in window.modals
        window.modals[this.id] = {};

        switch(this.type) {
            case "error":
                this.classes += " error";
                zindex = 1500;
                buttons.push({label:"PANIC", action:"window.modals['"+this.id+"'].close();"}, {label:"RELOAD", action:"window.location.reload(true);"});
                augs.push("tr-clip", "bl-rect", "r-clip");
                break;
            case "warning":
                this.classes += " warning";
                zindex = 1000;
                buttons.push({label:"OK", action:"window.modals['"+this.id+"'].close();"});
                augs.push("bl-clip", "tr-clip", "r-rect", "b-rect");
                break;
            case "custom":
                this.classes += " info custom";
                zindex = 500;
                buttons = options.buttons || [];
                buttons.push({label:"Close", action:"window.modals['"+this.id+"'].close();"});
                augs.push("tr-clip", "bl-clip");
                break;
            default:
                this.classes += " info";
                zindex = 500;
                buttons.push({label:"OK", action:"window.modals['"+this.id+"'].close();"});
                augs.push("tr-clip", "bl-clip");
                break;
        }

        let DOMstring = `<div id="modal_${this.id}" class="${this.classes}" style="z-index:${zindex+Object.keys(window.modals).length};" augmented-ui="${augs.join(" ")} exe" role="dialog" aria-modal="true" aria-labelledby="modal_${this.id}_title" tabindex="-1">
            <h1 id="modal_${this.id}_title">${this.title}</h1>
            ${this.type === "custom" ? options.html : "<h5>"+this.message+"</h5>"}
            <div>`;
            buttons.forEach(b => {
                // b.action is JS source (e.g. window.modals['xyz'].close();), not
                // plain text - HTML-escaping it here is safe/transparent for that
                // case since the browser HTML-decodes the attribute back to the
                // exact same string before handing it to the JS engine. What this
                // actually protects against: any caller that interpolates
                // untrusted data into an action string (already expected to run
                // it through window._escapeJsString for the JS-string context)
                // still has that interpolated value living inside an HTML
                // attribute one level up - without this, a raw `"` in the
                // untrusted value would terminate the onclick attribute early
                // regardless of any JS-level escaping, since HTML doesn't
                // recognize backslash-escaped quotes.
                DOMstring += `<button onclick="${window._escapeHtml(b.action)}">${b.label}</button>`;
            });
        DOMstring += `</div>
        </div>`;

        this.close = () => {
            let modalElement = document.getElementById("modal_"+this.id);
            modalElement.setAttribute("class", "modal_popup "+this.type+" blink");
            window.audioManager.denied.play();
            document.removeEventListener("keydown", this._keydownHandler);
            if (window._focusedModalId === this.id) delete window._focusedModalId;
            setTimeout(() => {
                modalElement.remove();
                delete window.modals[this.id];
            }, 100);

            if (typeof this.onclose === "function") {
                this.onclose();
            }

            // Most callers' onclose already sends focus somewhere sensible (e.g.
            // back into the terminal) - this is only a fallback for the case
            // where focus was left stranded on <body> (docs/10-todo.md 10.2
            // "Accessibility").
            if (this._previouslyFocused && document.body.contains(this._previouslyFocused) && document.activeElement === document.body) {
                this._previouslyFocused.focus();
            }
        };

        this.focus = () => {
            let modalElement = document.getElementById("modal_"+this.id);
            modalElement.setAttribute("class", this.classes+" focus");
            window._focusedModalId = this.id;
            Object.keys(window.modals).forEach(id => {
                if (id === this.id) return;
                window.modals[id].unfocus();
            });
        };

        this.unfocus = () => {
            let modalElement = document.getElementById("modal_"+this.id);
            modalElement.setAttribute("class", this.classes);
        };

        let tmp = document.createElement("div");
        tmp.innerHTML = DOMstring;
        let element = tmp.firstChild;

        element.addEventListener("mousedown", () => {
            this.focus();
        });
        element.addEventListener("touchstart", () => {
            this.focus();
        });

        switch(this.type) {
            case "error":
                window.audioManager.error.play();
                break;
            case "warning":
                window.audioManager.alarm.play();
                break;
            default:
                window.audioManager.info.play();
                break;
        }
        window.modals[this.id] = this;
        this._previouslyFocused = document.activeElement;
        document.body.appendChild(element);
        this.focus();

        // Move focus into the modal (docs/10-todo.md 10.2 "Accessibility") -
        // land on the first real control if there is one (e.g. an input in a
        // form modal), otherwise the first button.
        let firstFocusable = element.querySelector('input, select, textarea, button, [href]');
        if (firstFocusable) firstFocusable.focus();

        // Escape closes the modal, and Tab/Shift+Tab is trapped inside it
        // while it's the focused one (window._focusedModalId, several modals
        // can be stacked - see this.focus() above) rather than leaking focus
        // out to the app underneath.
        this._keydownHandler = e => {
            if (window._focusedModalId !== this.id) return;

            if (e.key === "Escape") {
                e.preventDefault();
                this.close();
                return;
            }

            if (e.key !== "Tab") return;

            let focusables = Array.from(element.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
                .filter(el => !el.disabled && el.offsetParent !== null);
            if (focusables.length === 0) return;

            let first = focusables[0];
            let last = focusables[focusables.length - 1];

            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };
        document.addEventListener("keydown", this._keydownHandler);

        // Allow dragging the modal around
        let draggedModal = document.getElementById(`modal_${this.id}`);
        let dragTarget = document.querySelector(`div#modal_${this.id} > h1:first-child`);

        draggedModal.zindex = draggedModal.getAttribute("style");

        // Wait for correct rendering of medias and such before calculating rect size
        setTimeout(() => {
            let rect = draggedModal.getBoundingClientRect();
            draggedModal.posX = rect.left;
            draggedModal.posY = rect.top;
        }, 500);

        // Mouse
        function modalMousedownHandler(e) {
            draggedModal.lastMouseX = e.clientX;
            draggedModal.lastMouseY = e.clientY;

            draggedModal.setAttribute("style", `${draggedModal.zindex}background: rgba(var(--color_r), var(--color_g), var(--color_b), 0.5);left: ${draggedModal.posX}px;top: ${draggedModal.posY}px;`);

            window.addEventListener("mousemove", modalMousemoveHandler);
            window.addEventListener("mouseup", modalMouseupHandler);
        }
        function modalMousemoveHandler(e) {
            draggedModal.posX = draggedModal.posX + (e.clientX - draggedModal.lastMouseX);
            draggedModal.posY = draggedModal.posY + (e.clientY - draggedModal.lastMouseY);
            draggedModal.lastMouseX = e.clientX;
            draggedModal.lastMouseY = e.clientY;

            draggedModal.setAttribute("style", `${draggedModal.zindex}background: rgba(var(--color_r), var(--color_g), var(--color_b), 0.5);left: ${draggedModal.posX}px;top: ${draggedModal.posY}px;`);
        }
        function modalMouseupHandler(e) {
            window.removeEventListener("mousemove", modalMousemoveHandler);
            draggedModal.setAttribute("style", `${draggedModal.zindex}left: ${draggedModal.posX}px;top: ${draggedModal.posY}px;`);

            window.removeEventListener("mouseup", modalMouseupHandler);
        }
        dragTarget.addEventListener("mousedown", modalMousedownHandler);

        // Touch
        function modalTouchstartHandler(e) {
            draggedModal.lastMouseX = e.changedTouches[0].clientX;
            draggedModal.lastMouseY = e.changedTouches[0].clientY;

            draggedModal.setAttribute("style", `${draggedModal.zindex}background: rgba(var(--color_r), var(--color_g), var(--color_b), 0.5);left: ${draggedModal.posX}px;top: ${draggedModal.posY}px;`);

            window.addEventListener("touchmove", modalTouchmoveHandler);
            window.addEventListener("touchend", modalTouchendHandler);
        }
        function modalTouchmoveHandler(e) {
            draggedModal.posX = draggedModal.posX + (e.changedTouches[0].clientX - draggedModal.lastMouseX);
            draggedModal.posY = draggedModal.posY + (e.changedTouches[0].clientY - draggedModal.lastMouseY);
            draggedModal.lastMouseX = e.changedTouches[0].clientX;
            draggedModal.lastMouseY = e.changedTouches[0].clientY;

            draggedModal.setAttribute("style", `${draggedModal.zindex}background: rgba(var(--color_r), var(--color_g), var(--color_b), 0.5);left: ${draggedModal.posX}px;top: ${draggedModal.posY}px;`);
        }
        function modalTouchendHandler(e) {
            window.removeEventListener("touchmove", modalTouchmoveHandler);
            draggedModal.setAttribute("style", `${draggedModal.zindex}left: ${draggedModal.posX}px;top: ${draggedModal.posY}px;`);

            window.removeEventListener("touchend", modalTouchendHandler);
        }
        dragTarget.addEventListener("touchstart", modalTouchstartHandler);

        return this.id;
    }
}

module.exports = {
    Modal
};
