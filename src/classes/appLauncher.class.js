// Program launcher (docs/10-todo.md 10.4). Deliberately a standalone,
// on-demand modal (same pattern as FuzzyFinder) rather than coupled to the
// on-screen keyboard's collapsed state, which the original request paired it
// with - a launcher is useful independently of whether the keyboard happens
// to be hidden, and coupling the two would mean keyboard users on a desktop
// (who may never hide the keyboard) could never reach it. Bound to the
// LAUNCH_APP shortcut (default Ctrl+Shift+A) like every other on-demand
// modal in the app.
class AppLauncher {
    constructor() {
        if (document.getElementById("appLauncher")) {
            return false;
        }

        window.keyboard.detach();

        this.apps = null;
        this._matches = [];

        this.disp = new Modal({
            type: "custom",
            title: "Launch Application",
            html: `<input type="search" id="appLauncher" placeholder="Search installed applications..." role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls="appLauncher-results" />
                <ul id="appLauncher-results" role="listbox" aria-label="Installed applications">
                    <li role="option" aria-selected="true">Scanning installed applications&hellip;</li>
                </ul>`,
            buttons: [
                {label: "Launch", action: "window.activeAppLauncher.launch()"}
            ]
        }, () => {
            delete window.activeAppLauncher;
            window.keyboard.attach();
            window.term[window.currentTerm].term.focus();
        });

        this.input = document.getElementById("appLauncher");
        this.results = document.getElementById("appLauncher-results");

        this.input.addEventListener("input", () => this.search(this.input.value));
        this.input.addEventListener("keydown", e => {
            let selectedEl, selected, next;
            switch (e.key) {
                case "Enter":
                    this.launch();
                    e.preventDefault();
                    break;
                case "ArrowDown":
                    selectedEl = this.results.querySelector("li.appLauncherMatchSelected");
                    if (!selectedEl) return;
                    selected = Number(selectedEl.id.substr(16));
                    next = (document.getElementById(`appLauncherMatch-${selected+1}`)) ? selected+1 : 0;
                    this._selectMatch(next);
                    e.preventDefault();
                    break;
                case "ArrowUp":
                    selectedEl = this.results.querySelector("li.appLauncherMatchSelected");
                    if (!selectedEl) return;
                    selected = Number(selectedEl.id.substr(16));
                    next = (document.getElementById(`appLauncherMatch-${selected-1}`)) ? selected-1 : 0;
                    this._selectMatch(next);
                    e.preventDefault();
                    break;
                default:
                    // Do nothing, input event will be triggered
            }
        });

        this._discoverApps().then(apps => {
            this.apps = apps;
            this.search(this.input.value);
        });

        this.input.focus();
    }

    // Cross-platform installed-application discovery. No shared mechanism
    // exists across OSes (docs/10-todo.md 10.4), so each platform gets its
    // own strategy:
    //  - Windows: recursively walk the (system + per-user) Start Menu
    //    Programs folders for .lnk shortcuts. Not parsed for their real
    //    target - electron.shell.openPath() can launch a .lnk directly.
    //  - macOS: list top-level *.app bundles under /Applications and
    //    ~/Applications.
    //  - Linux (and other XDG-compliant platforms): parse .desktop entries
    //    under the standard system/user application directories, skipping
    //    NoDisplay=true (background services, not user-facing apps).
    async _discoverApps() {
        const fs = require("fs");
        const path = require("path");
        const os = require("os");
        let apps = [];

        try {
            if (process.platform === "win32") {
                let dirs = [
                    path.join(process.env.PROGRAMDATA || "C:\\ProgramData", "Microsoft", "Windows", "Start Menu", "Programs"),
                    path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs")
                ];
                dirs.forEach(dir => {
                    apps.push(...this._walkForExt(dir, ".lnk"));
                });
            } else if (process.platform === "darwin") {
                let dirs = ["/Applications", path.join(os.homedir(), "Applications")];
                dirs.forEach(dir => {
                    if (!fs.existsSync(dir)) return;
                    fs.readdirSync(dir).forEach(entry => {
                        if (entry.toLowerCase().endsWith(".app")) {
                            apps.push({name: entry.replace(/\.app$/i, ""), path: path.join(dir, entry)});
                        }
                    });
                });
            } else {
                let dirs = [
                    "/usr/share/applications",
                    "/usr/local/share/applications",
                    path.join(os.homedir(), ".local", "share", "applications")
                ];
                dirs.forEach(dir => {
                    if (!fs.existsSync(dir)) return;
                    fs.readdirSync(dir).forEach(entry => {
                        if (!entry.toLowerCase().endsWith(".desktop")) return;
                        try {
                            let content = fs.readFileSync(path.join(dir, entry), "utf-8");
                            if (/^NoDisplay\s*=\s*true\s*$/im.test(content)) return;
                            let nameMatch = content.match(/^Name=(.+)$/m);
                            if (!nameMatch) return;
                            apps.push({name: nameMatch[1].trim(), path: path.join(dir, entry)});
                        } catch (e) {
                            // Unreadable/malformed .desktop file - skip it, don't fail discovery
                        }
                    });
                });
            }
        } catch (e) {
            console.warn(`App discovery failed: ${e.message}`);
        }

        let seen = new Set();
        return apps.filter(app => {
            let key = app.name.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).sort((a, b) => a.name.localeCompare(b.name));
    }

    _walkForExt(dir, ext, depth) {
        depth = depth || 0;
        const fs = require("fs");
        const path = require("path");
        let found = [];
        if (depth > 4 || !fs.existsSync(dir)) return found;

        let entries;
        try {
            entries = fs.readdirSync(dir, {withFileTypes: true});
        } catch (e) {
            return found;
        }

        entries.forEach(entry => {
            let full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                found.push(...this._walkForExt(full, ext, depth+1));
            } else if (entry.name.toLowerCase().endsWith(ext)) {
                found.push({name: entry.name.replace(new RegExp(ext.replace(".", "\\.")+"$", "i"), ""), path: full});
            }
        });
        return found;
    }

    search(text) {
        if (this.apps === null) {
            return; // Still scanning - leave the "Scanning..." placeholder up
        }

        this._matches = this.apps.filter(app => app.name.toLowerCase().includes((text || "").toLowerCase())).slice(0, 8);

        if (this._matches.length === 0) {
            this.results.innerHTML = `<li role="option" aria-selected="true">No matching applications found</li>`;
            this.input.removeAttribute("aria-activedescendant");
            return;
        }

        let html = "";
        this._matches.forEach((app, i) => {
            html += `<li id="appLauncherMatch-${i}" role="option" aria-selected="${(i === 0) ? "true" : "false"}" class="${(i === 0) ? "appLauncherMatchSelected" : ""}" onclick="window.activeAppLauncher._selectMatch(${i})" ondblclick="window.activeAppLauncher.launch(${i})">${window._escapeHtml(app.name)}</li>`;
        });
        this.results.innerHTML = html;
        this.input.setAttribute("aria-activedescendant", "appLauncherMatch-0");
    }

    _selectMatch(index) {
        let prevEl = this.results.querySelector("li.appLauncherMatchSelected");
        if (prevEl) {
            prevEl.removeAttribute("class");
            prevEl.setAttribute("aria-selected", "false");
        }
        let nextEl = document.getElementById(`appLauncherMatch-${index}`);
        if (!nextEl) return;
        nextEl.setAttribute("class", "appLauncherMatchSelected");
        nextEl.setAttribute("aria-selected", "true");
        this.input.setAttribute("aria-activedescendant", nextEl.id);
    }

    launch(index) {
        let selectedIndex = index;
        if (typeof selectedIndex !== "number") {
            let selectedEl = this.results.querySelector("li.appLauncherMatchSelected");
            if (!selectedEl || !selectedEl.id) return;
            selectedIndex = Number(selectedEl.id.substr(16));
        }

        let app = this._matches[selectedIndex];
        if (!app) return;

        electron.shell.openPath(app.path);
        this.disp.close();
    }
}

module.exports = {
    AppLauncher
};
