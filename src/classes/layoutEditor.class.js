// Grid-based, freely repositionable/resizable panel layout (docs/10-todo.md,
// "Draggable/resizable grid layout"). Deliberately additive/opt-in, same
// posture as split panes and the theme editor: every registered panel keeps
// its normal CSS-driven position/size (flex columns, percentage widths,
// etc. - see docs/02-architecture.md/docs/05-design-theme.md) until the user
// actually drags or resizes it while in edit mode. Only that panel then
// switches to an absolute, grid-snapped rect persisted to
// settings.panelLayout; everything else is untouched. Toggled via the
// EDIT_LAYOUT app shortcut (default Ctrl+Shift+E), see window.toggleLayoutEditor
// in src/_renderer.js.
//
// Deliberately scoped to the app's five top-level regions (the two side
// columns, the terminal shell, the file browser, the on-screen keyboard) -
// not every individual mod_* widget inside them. Those widgets are laid out
// by their parent column's flexbox and aren't independently addressable in
// the DOM the way these five are; splitting each one out into its own
// grid-managed panel is a much larger per-module CSS change and is left as
// a follow-up (see docs/10-todo.md), not something this pass silently
// half-does. The registry below is intentionally the only place that needs
// editing to register a future panel once that follow-up lands.
class LayoutEditor {
    constructor() {
        this.panels = {
            mod_column_left:  { el: "mod_column_left",  handle: "h3.title" },
            mod_column_right: { el: "mod_column_right", handle: "h3.title" },
            main_shell:       { el: "main_shell",       handle: "h3.title" },
            filesystem:       { el: "filesystem",       handle: "h3.title" },
            keyboard:         { el: "keyboard",          handle: null }
        };

        // Grid granularity. Cell size is derived (100/cols vw, 100/rows vh),
        // not hardcoded, so it stays viewport-resolution-independent like
        // every other measurement in the app (docs/03-code-conventions.md 3.4).
        this.cols = 40;
        this.rows = 20;
        this.minColSpan = 4;
        this.minRowSpan = 3;

        this.active = false;
        this._activeRects = {};
        this._cleanupFns = [];
    }

    // ---- persisted layout (applies at every boot, edit mode or not) ----

    applyStoredLayout() {
        let saved = window.settings.panelLayout || {};
        Object.keys(saved).forEach(id => {
            if (this.panels[id]) this._applyRect(id, saved[id]);
        });
    }

    // ---- edit mode ----

    enter() {
        if (this.active) return;
        this.active = true;
        document.body.classList.add("layout-edit-mode");
        this._buildOverlay();
        this._buildToolbar();
        Object.keys(this.panels).forEach(id => this._wirePanel(id));
    }

    exit() {
        if (!this.active) return;
        this.active = false;
        document.body.classList.remove("layout-edit-mode");

        this._cleanupFns.forEach(fn => fn());
        this._cleanupFns = [];

        let overlay = document.getElementById("layoutEditorOverlay");
        if (overlay) overlay.remove();
        let toolbar = document.getElementById("layoutEditorToolbar");
        if (toolbar) toolbar.remove();

        let saved = window.settings.panelLayout || {};
        Object.keys(this.panels).forEach(id => {
            let el = document.getElementById(this.panels[id].el);
            if (!el) return;
            el.classList.remove("layout-panel-target", "layout-dragging");
            if (!saved[id]) {
                // Nothing was actually committed for this panel this
                // session - hand control back to its normal CSS instead of
                // leaving it pinned to wherever it happened to be seeded.
                ["position", "left", "top", "width", "height", "margin", "right", "bottom"].forEach(p => {
                    el.style.removeProperty(p);
                });
            }
        });

        this._activeRects = {};
    }

    resetLayout() {
        window.settings.panelLayout = {};
        this._persist();

        Object.keys(this.panels).forEach(id => {
            let el = document.getElementById(this.panels[id].el);
            if (!el) return;
            ["position", "left", "top", "width", "height", "margin", "right", "bottom"].forEach(p => {
                el.style.removeProperty(p);
            });
        });

        this._activeRects = {};

        if (this.active) {
            // Re-seed from the now-default rendered geometry so dragging/
            // resizing keeps working without having to leave edit mode.
            Object.keys(this.panels).forEach(id => this._seed(id));
        }
    }

    // ---- DOM scaffolding ----

    _buildOverlay() {
        let overlay = document.createElement("div");
        overlay.id = "layoutEditorOverlay";
        overlay.style.setProperty("--layout-cell-w", (100 / this.cols) + "vw");
        overlay.style.setProperty("--layout-cell-h", (100 / this.rows) + "vh");
        document.body.appendChild(overlay);
    }

    _buildToolbar() {
        let bar = document.createElement("div");
        bar.id = "layoutEditorToolbar";
        bar.innerHTML = `<span>LAYOUT EDIT MODE — drag a panel's title bar to move it, drag an edge to resize it</span>
            <button type="button" id="layoutEditorReset">RESET</button>
            <button type="button" id="layoutEditorDone">DONE</button>`;
        document.body.appendChild(bar);

        document.getElementById("layoutEditorReset").addEventListener("click", () => this.resetLayout());
        document.getElementById("layoutEditorDone").addEventListener("click", () => window.toggleLayoutEditor());
    }

    _wirePanel(panelId) {
        let def = this.panels[panelId];
        let el = document.getElementById(def.el);
        if (!el) return;

        this._seed(panelId);
        el.classList.add("layout-panel-target");

        // Drag handle: reuse the existing h3.title bar where the panel has
        // one (every registered panel except the keyboard, which has no
        // header of its own - see docs/05-design-theme.md 5.2). Fall back to
        // a small injected grip bar so the keyboard is draggable too.
        let handleEl = def.handle ? el.querySelector(def.handle) : null;
        let injected = false;
        if (!handleEl) {
            handleEl = document.createElement("div");
            handleEl.className = "layout-drag-grip";
            handleEl.innerHTML = "⠿ DRAG ⠿";
            el.insertBefore(handleEl, el.firstChild);
            injected = true;
        }
        handleEl.classList.add("layout-drag-handle");

        const onDragStart = e => this._startDrag(panelId, e);
        handleEl.addEventListener("mousedown", onDragStart);
        this._cleanupFns.push(() => {
            handleEl.removeEventListener("mousedown", onDragStart);
            handleEl.classList.remove("layout-drag-handle");
            if (injected) handleEl.remove();
        });

        // Resize handles on all four edges.
        ["n", "s", "e", "w"].forEach(edge => {
            let handle = document.createElement("div");
            handle.className = `layout-handle layout-handle-${edge}`;
            el.appendChild(handle);

            const onResizeStart = e => this._startResize(panelId, edge, e);
            handle.addEventListener("mousedown", onResizeStart);
            this._cleanupFns.push(() => {
                handle.removeEventListener("mousedown", onResizeStart);
                handle.remove();
            });
        });
    }

    // ---- grid math ----

    _cellPx() {
        return { w: window.innerWidth / this.cols, h: window.innerHeight / this.rows };
    }

    _clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    // Seeds a panel's working rect: whatever is already saved, or (first
    // time it's ever touched) a grid rect derived from its current rendered
    // position/size, so entering edit mode never visually jumps anything.
    _seed(panelId) {
        let saved = (window.settings.panelLayout || {})[panelId];
        if (saved) {
            this._applyRect(panelId, saved);
            return;
        }

        let el = document.getElementById(this.panels[panelId].el);
        if (!el) return;

        let box = el.getBoundingClientRect();
        let cell = this._cellPx();
        let rect = {
            col: this._clamp(Math.round(box.left / cell.w), 0, this.cols - this.minColSpan),
            row: this._clamp(Math.round(box.top / cell.h), 0, this.rows - this.minRowSpan),
            colSpan: this._clamp(Math.round(box.width / cell.w), this.minColSpan, this.cols),
            rowSpan: this._clamp(Math.round(box.height / cell.h), this.minRowSpan, this.rows)
        };
        this._applyRect(panelId, rect);
    }

    _applyRect(panelId, rect) {
        this._activeRects[panelId] = rect;

        let def = this.panels[panelId];
        let el = document.getElementById(def.el);
        if (!el) return;

        let cw = 100 / this.cols;
        let ch = 100 / this.rows;

        el.style.position = "absolute";
        el.style.margin = "0";
        el.style.right = "auto";
        el.style.bottom = "auto";
        el.style.left = (rect.col * cw) + "vw";
        el.style.top = (rect.row * ch) + "vh";
        el.style.width = (rect.colSpan * cw) + "vw";
        el.style.height = (rect.rowSpan * ch) + "vh";
    }

    _commit(panelId) {
        window.settings.panelLayout = window.settings.panelLayout || {};
        window.settings.panelLayout[panelId] = Object.assign({}, this._activeRects[panelId]);
        this._persist();
    }

    _persist() {
        const fs = require("fs");
        const path = require("path");
        const remote = require("@electron/remote");
        const settingsFile = path.join(remote.app.getPath("userData"), "settings.json");
        fs.writeFileSync(settingsFile, JSON.stringify(window.settings, "", 4));
    }

    // ---- drag / resize ----

    _startDrag(panelId, evt) {
        if (evt.button !== 0) return;
        evt.preventDefault();

        let el = document.getElementById(this.panels[panelId].el);
        let rect = Object.assign({}, this._activeRects[panelId]);
        let cell = this._cellPx();
        let startX = evt.clientX;
        let startY = evt.clientY;

        el.classList.add("layout-dragging");

        const onMove = e => {
            let dCols = Math.round((e.clientX - startX) / cell.w);
            let dRows = Math.round((e.clientY - startY) / cell.h);
            let col = this._clamp(rect.col + dCols, 0, this.cols - rect.colSpan);
            let row = this._clamp(rect.row + dRows, 0, this.rows - rect.rowSpan);
            this._applyRect(panelId, { col, row, colSpan: rect.colSpan, rowSpan: rect.rowSpan });
        };
        const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            el.classList.remove("layout-dragging");
            this._commit(panelId);
        };

        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    }

    _startResize(panelId, edge, evt) {
        if (evt.button !== 0) return;
        evt.preventDefault();
        evt.stopPropagation();

        let el = document.getElementById(this.panels[panelId].el);
        let rect = Object.assign({}, this._activeRects[panelId]);
        let cell = this._cellPx();
        let startX = evt.clientX;
        let startY = evt.clientY;

        el.classList.add("layout-dragging");

        const onMove = e => {
            let dCols = Math.round((e.clientX - startX) / cell.w);
            let dRows = Math.round((e.clientY - startY) / cell.h);
            let next = Object.assign({}, rect);

            switch (edge) {
                case "e":
                    next.colSpan = this._clamp(rect.colSpan + dCols, this.minColSpan, this.cols - rect.col);
                    break;
                case "w": {
                    let newCol = this._clamp(rect.col + dCols, 0, rect.col + rect.colSpan - this.minColSpan);
                    next.colSpan = rect.colSpan + (rect.col - newCol);
                    next.col = newCol;
                    break;
                }
                case "s":
                    next.rowSpan = this._clamp(rect.rowSpan + dRows, this.minRowSpan, this.rows - rect.row);
                    break;
                case "n": {
                    let newRow = this._clamp(rect.row + dRows, 0, rect.row + rect.rowSpan - this.minRowSpan);
                    next.rowSpan = rect.rowSpan + (rect.row - newRow);
                    next.row = newRow;
                    break;
                }
            }

            this._applyRect(panelId, next);
        };
        const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            el.classList.remove("layout-dragging");
            this._commit(panelId);
        };

        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    }
}

module.exports = { LayoutEditor };
