class TerminalSearch {
    constructor() {
        if (document.getElementById("terminalSearch") || document.getElementById("settingsEditor")) {
            return false;
        }

        window.keyboard.detach();

        this.term = window.term[window.currentTerm];

        this.disp = new Modal({
            type: "custom",
            title: "Search in terminal",
            html: `<input type="search" id="terminalSearch" placeholder="Find text in scrollback..." />
                <p id="terminalSearch-status"></p>`,
            buttons: [
                {label: "Previous", action: "window.activeTerminalSearch.previous()"},
                {label: "Next", action: "window.activeTerminalSearch.next()"}
            ]
        }, () => {
            delete window.activeTerminalSearch;
            window.keyboard.attach();
            window.term[window.currentTerm].term.focus();
        });

        this.input = document.getElementById("terminalSearch");
        this.status = document.getElementById("terminalSearch-status");

        this.input.addEventListener("input", () => {
            this.next(true);
        });
        this.input.addEventListener("keydown", e => {
            if (e.key === "Enter") {
                if (e.shiftKey) {
                    this.previous();
                } else {
                    this.next();
                }
                e.preventDefault();
            }
        });

        this.input.focus();
    }

    next(fromStart) {
        if (!this.term || !this.input.value) {
            this.status.innerText = "";
            return;
        }
        let found = this.term.findNext(this.input.value, {incremental: !!fromStart});
        this.status.innerText = found ? "" : "No matches";
    }

    previous() {
        if (!this.term || !this.input.value) {
            this.status.innerText = "";
            return;
        }
        let found = this.term.findPrevious(this.input.value);
        this.status.innerText = found ? "" : "No matches";
    }
}

module.exports = {
    TerminalSearch
};
