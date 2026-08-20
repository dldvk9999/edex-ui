// Disable eval()
window.eval = global.eval = function () {
    throw new Error("eval() is disabled for security reasons.");
};
// Security helper :)
window._escapeHtml = text => {
    let map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => {return map[m];});
};
// For values interpolated into a single-quoted JS string literal that itself
// lives inside an HTML attribute (e.g. onclick='someFn(\'${value}\')').
// HTML-escaping alone does NOT protect this context: browsers HTML-decode
// attribute values (e.g. &quot; -> ") before treating them as JS source, so
// an HTML-escaped quote can still break out of the string at execution time.
window._escapeJsString = text => {
    return String(text).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r");
};
window._encodePathURI = uri => {
    return encodeURI(uri).replace(/#/g, "%23");
};
window._purifyCSS = str => {
    if (typeof str === "undefined") return "";
    if (typeof str !== "string") {
        str = str.toString();
    }
    return str.replace(/[<]/g, "");
};
window._delay = ms => {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, ms);
    });
};

// Initiate basic error handling
window.onerror = (msg, path, line, col, error) => {
    document.getElementById("boot_screen").innerHTML += `${error} :  ${msg}<br/>==> at ${path}  ${line}:${col}`;
};

const path = require("path");
const fs = require("fs");
const electron = require("electron");
const remote = require("@electron/remote");
const ipc = electron.ipcRenderer;

// Clean up any extra terminal tab backends before a UI reload, so their
// TTY/websocket servers don't leak and block reopening those tabs after
// the reload (see #630).
window.onbeforeunload = () => {
    try {
        window.saveSession();
    } catch (e) {
        // window.term may not be initialized yet if the app crashed very early, ignore
    }
    try {
        ipc.sendSync("closeExtraTtys");
    } catch (e) {
        // Main process may already be tearing down, ignore
    }
};

const settingsDir = remote.app.getPath("userData");
const themesDir = path.join(settingsDir, "themes");
const keyboardsDir = path.join(settingsDir, "keyboards");
const fontsDir = path.join(settingsDir, "fonts");
const settingsFile = path.join(settingsDir, "settings.json");
const shortcutsFile = path.join(settingsDir, "shortcuts.json");
const lastWindowStateFile = path.join(settingsDir, "lastWindowState.json");
const sessionFile = path.join(settingsDir, "lastSession.json");
const sshProfilesFile = path.join(settingsDir, "sshProfiles.json");

// Load config
window.settings = require(settingsFile);
window.shortcuts = require(shortcutsFile);
window.lastWindowState = require(lastWindowStateFile);
window.sshProfiles = fs.existsSync(sshProfilesFile) ? require(sshProfilesFile) : [];

// Support for proxies/regulated networks (see #1050).
// Applies to our own network calls (update checker, external IP lookup)
// as well as third-party modules (e.g. geolite2-redist) that use Node's
// https.get() without specifying their own agent, since those default
// to https.globalAgent.
(() => {
    let proxyUrl = window.settings.proxy || process.env.HTTPS_PROXY || process.env.https_proxy
        || process.env.HTTP_PROXY || process.env.http_proxy || process.env.ALL_PROXY || process.env.all_proxy;
    if (!proxyUrl) return;
    try {
        const { HttpsProxyAgent } = require("https-proxy-agent");
        let agent = new HttpsProxyAgent(proxyUrl);
        require("https").globalAgent = agent;
        require("http").globalAgent = agent;
    } catch (e) {
        console.error("Failed to configure proxy agent:", e);
    }
})();

// Load CLI parameters
if (remote.process.argv.includes("--nointro")) {
    window.settings.nointroOverride = true;
} else {
    window.settings.nointroOverride = false;
}
if (electron.remote.process.argv.includes("--nocursor")) {
    window.settings.nocursorOverride = true;
} else {
    window.settings.nocursorOverride = false;
}

// Retrieve theme override (hotswitch)
ipc.once("getThemeOverride", (e, theme) => {
    if (theme !== null) {
        window.settings.theme = theme;
        window.settings.nointroOverride = true;
        _loadTheme(require(path.join(themesDir, window.settings.theme+".json")));
    } else {
        _loadTheme(require(path.join(themesDir, window.settings.theme+".json")));
    }
});
ipc.send("getThemeOverride");
// Same for keyboard override/hotswitch
ipc.once("getKbOverride", (e, layout) => {
    if (layout !== null) {
        window.settings.keyboard = layout;
        window.settings.nointroOverride = true;
    }
});
ipc.send("getKbOverride");

// Load UI theme
window._loadTheme = theme => {

    if (document.querySelector("style.theming")) {
        document.querySelector("style.theming").remove();
    }

    // Load fonts
    let mainFont = new FontFace(theme.cssvars.font_main, `url("${path.join(fontsDir, theme.cssvars.font_main.toLowerCase().replace(/ /g, '_')+'.woff2').replace(/\\/g, '/')}")`);
    let lightFont = new FontFace(theme.cssvars.font_main_light, `url("${path.join(fontsDir, theme.cssvars.font_main_light.toLowerCase().replace(/ /g, '_')+'.woff2').replace(/\\/g, '/')}")`);
    let termFont = new FontFace(theme.terminal.fontFamily, `url("${path.join(fontsDir, theme.terminal.fontFamily.toLowerCase().replace(/ /g, '_')+'.woff2').replace(/\\/g, '/')}")`);

    document.fonts.add(mainFont);
    document.fonts.load("12px "+theme.cssvars.font_main);
    document.fonts.add(lightFont);
    document.fonts.load("12px "+theme.cssvars.font_main_light);
    document.fonts.add(termFont);
    document.fonts.load("12px "+theme.terminal.fontFamily);

    document.querySelector("head").innerHTML += `<style class="theming">
    :root {
        --font_main: "${window._purifyCSS(theme.cssvars.font_main)}";
        --font_main_light: "${window._purifyCSS(theme.cssvars.font_main_light)}";
        --font_mono: "${window._purifyCSS(theme.terminal.fontFamily)}";
        --color_r: ${window._purifyCSS(theme.colors.r)};
        --color_g: ${window._purifyCSS(theme.colors.g)};
        --color_b: ${window._purifyCSS(theme.colors.b)};
        --color_black: ${window._purifyCSS(theme.colors.black)};
        --color_light_black: ${window._purifyCSS(theme.colors.light_black)};
        --color_grey: ${window._purifyCSS(theme.colors.grey)};

        /* Used for error and warning modals */
        --color_red: ${window._purifyCSS(theme.colors.red) || "red"};
        --color_yellow: ${window._purifyCSS(theme.colors.yellow) || "yellow"};
    }

    body {
        font-family: var(--font_main), sans-serif;
        cursor: ${(window.settings.nocursorOverride || window.settings.nocursor) ? "none" : "default"} !important;
    }

    * {
   	   ${(window.settings.nocursorOverride || window.settings.nocursor) ? "cursor: none !important;" : ""}
	}

    ${window._purifyCSS(theme.injectCSS || "")}
    </style>`;

    window.theme = theme;
    window.theme.r = theme.colors.r;
    window.theme.g = theme.colors.g;
    window.theme.b = theme.colors.b;
};

function initGraphicalErrorHandling() {
    window.edexErrorsModals = [];
    window.onerror = (msg, path, line, col, error) => {
        let errorModal = new Modal({
            type: "error",
            title: error,
            message: `${msg}<br/>        at ${path}  ${line}:${col}`
        });
        window.edexErrorsModals.push(errorModal);

        ipc.send("log", "error", `${error}: ${msg}`);
        ipc.send("log", "debug", `at ${path} ${line}:${col}`);
    };
}

function waitForFonts() {
    return new Promise(resolve => {
        if (document.readyState !== "complete" || document.fonts.status !== "loaded") {
            document.addEventListener("readystatechange", () => {
                if (document.readyState === "complete") {
                    if (document.fonts.status === "loaded") {
                        resolve();
                    } else {
                        document.fonts.onloadingdone = () => {
                            if (document.fonts.status === "loaded") resolve();
                        };
                    }
                }
            });
        } else {
            resolve();
        }
    });
}

// A proxy function used to add multithreading to systeminformation calls - see backend process manager @ _multithread.js
function initSystemInformationProxy() {
    const { nanoid } = require("nanoid/non-secure");

    window.si = new Proxy({}, {
        apply: () => {throw new Error("Cannot use sysinfo proxy directly as a function")},
        set: () => {throw new Error("Cannot set a property on the sysinfo proxy")},
        get: (target, prop, receiver) => {
            return function(...args) {
                let callback = (typeof args[args.length - 1] === "function") ? true : false;

                return new Promise((resolve, reject) => {
                    let id = nanoid();
                    ipc.once("systeminformation-reply-"+id, (e, res) => {
                        if (callback) {
                            args[args.length - 1](res);
                        }
                        resolve(res);
                    });
                    ipc.send("systeminformation-call", prop, id, ...args);
                });
            };
        }
    });
}

// Init audio
window.audioManager = new AudioManager();

// See #223
electron.remote.app.focus();

let i = 0;
if (window.settings.nointro || window.settings.nointroOverride) {
    initGraphicalErrorHandling();
    initSystemInformationProxy();
    document.getElementById("boot_screen").remove();
    document.body.setAttribute("class", "");
    waitForFonts().then(initUI);
} else {
    displayLine();
}

// Startup boot log
function displayLine() {
    let bootScreen = document.getElementById("boot_screen");
    let log = fs.readFileSync(path.join(__dirname, "assets", "misc", "boot_log.txt")).toString().split('\n');

    function isArchUser() {
        return require("os").platform() === "linux"
                && fs.existsSync("/etc/os-release")
                && fs.readFileSync("/etc/os-release").toString().includes("arch");
    }

    if (typeof log[i] === "undefined") {
        setTimeout(displayTitleScreen, 300);
        return;
    }

    if (log[i] === "Boot Complete") {
        window.audioManager.granted.play();
    } else {
        window.audioManager.stdout.play();
    }
    bootScreen.innerHTML += log[i]+"<br/>";
    i++;

    switch(true) {
        case i === 2:
            bootScreen.innerHTML += `eDEX-UI Kernel version ${electron.remote.app.getVersion()} boot at ${Date().toString()}; root:xnu-1699.22.73~1/RELEASE_X86_64`;
        case i === 4:
            setTimeout(displayLine, 500);
            break;
        case i > 4 && i < 25:
            setTimeout(displayLine, 30);
            break;
        case i === 25:
            setTimeout(displayLine, 400);
            break;
        case i === 42:
            setTimeout(displayLine, 300);
            break;
        case i > 42 && i < 82:
            setTimeout(displayLine, 25);
            break;
        case i === 83:
            if (isArchUser())
                bootScreen.innerHTML += "btw i use arch<br/>";
            setTimeout(displayLine, 25);
            break;
        case i >= log.length-2 && i < log.length:
            setTimeout(displayLine, 300);
            break;
        default:
            setTimeout(displayLine, Math.pow(1 - (i/1000), 3)*25);
    }
}

// Show "logo" and background grid
async function displayTitleScreen() {
    let bootScreen = document.getElementById("boot_screen");
    if (bootScreen === null) {
        bootScreen = document.createElement("section");
        bootScreen.setAttribute("id", "boot_screen");
        bootScreen.setAttribute("style", "z-index: 9999999");
        document.body.appendChild(bootScreen);
    }
    bootScreen.innerHTML = "";
    window.audioManager.theme.play();

    await _delay(400);

    document.body.setAttribute("class", "");
    bootScreen.setAttribute("class", "center");
    bootScreen.innerHTML = "<h1>eDEX-UI</h1>";
    let title = document.querySelector("section > h1");

    await _delay(200);

    document.body.setAttribute("class", "solidBackground");

    await _delay(100);

    title.setAttribute("style", `background-color: rgb(${window.theme.r}, ${window.theme.g}, ${window.theme.b});border-bottom: 5px solid rgb(${window.theme.r}, ${window.theme.g}, ${window.theme.b});`);

    await _delay(300);

    title.setAttribute("style", `border: 5px solid rgb(${window.theme.r}, ${window.theme.g}, ${window.theme.b});`);

    await _delay(100);

    title.setAttribute("style", "");
    title.setAttribute("class", "glitch");

    await _delay(500);

    document.body.setAttribute("class", "");
    title.setAttribute("class", "");
    title.setAttribute("style", `border: 5px solid rgb(${window.theme.r}, ${window.theme.g}, ${window.theme.b});`);

    await _delay(1000);
    if (window.term) {
        bootScreen.remove();
        return true;
    }
    initGraphicalErrorHandling();
    initSystemInformationProxy();
    waitForFonts().then(() => {
        bootScreen.remove();
        initUI();
    });
}

// Returns the user's desired display name
async function getDisplayName() {
    let user = settings.username || null;
    if (user)
        return user;

    try {
        user = await require("username")();
    } catch (e) {}

    return user;
}

// Create the UI's html structure and initialize the terminal client and the keyboard
async function initUI() {
    document.body.innerHTML += `<section class="mod_column" id="mod_column_left">
        <h3 class="title"><p>PANEL</p><p>SYSTEM</p></h3>
    </section>
    <section id="main_shell" style="height:0%;width:0%;opacity:0;margin-bottom:30vh;" augmented-ui="bl-clip tr-clip exe">
        <h3 class="title" style="opacity:0;"><p>TERMINAL</p><p>MAIN SHELL</p></h3>
        <h1 id="main_shell_greeting"></h1>
    </section>
    <section class="mod_column" id="mod_column_right">
        <h3 class="title"><p>PANEL</p><p>NETWORK</p></h3>
    </section>`;

    await _delay(10);

    window.audioManager.expand.play();
    document.getElementById("main_shell").setAttribute("style", "height:0%;margin-bottom:30vh;");

    await _delay(500);

    document.getElementById("main_shell").setAttribute("style", "margin-bottom: 30vh;");
    document.querySelector("#main_shell > h3.title").setAttribute("style", "");

    await _delay(700);

    document.getElementById("main_shell").setAttribute("style", "opacity: 0;");
    document.body.innerHTML += `
    <section id="filesystem" style="width: 0px;" class="${window.settings.hideDotfiles ? "hideDotfiles" : ""} ${window.settings.fsListView ? "list-view" : ""}">
    </section>
    <section id="keyboard" style="opacity:0;">
    </section>`;
    window.keyboard = new Keyboard({
        layout: path.join(keyboardsDir, settings.keyboard+".json"),
        container: "keyboard"
    });

    await _delay(10);

    document.getElementById("main_shell").setAttribute("style", "");

    await _delay(270);

    let greeter = document.getElementById("main_shell_greeting");

    getDisplayName().then(user => {
        if (user) {
            greeter.innerHTML += `Welcome back, <em>${user}</em>`;
        } else {
            greeter.innerHTML += "Welcome back";
        }
    });

    greeter.setAttribute("style", "opacity: 1;");

    document.getElementById("filesystem").setAttribute("style", "");
    document.getElementById("keyboard").setAttribute("style", "");
    document.getElementById("keyboard").setAttribute("class", "animation_state_1");
    window.audioManager.keyboard.play();

    await _delay(100);

    document.getElementById("keyboard").setAttribute("class", "animation_state_1 animation_state_2");

    await _delay(1000);

    greeter.setAttribute("style", "opacity: 0;");

    await _delay(100);

    document.getElementById("keyboard").setAttribute("class", "");

    await _delay(400);

    greeter.remove();

    // Initialize modules
    window.mods = {};

    // Screensaver-style privacy lock (docs/10-todo.md 10.1 "Lock screen
    // module") - not tied to a column, sits as a full-screen overlay.
    window.mods.lockscreen = new LockScreen();

    // Left column
    window.mods.clock = new Clock("mod_column_left");
    window.mods.volumecontrol = new VolumeControl("mod_column_left");
    window.mods.sysinfo = new Sysinfo("mod_column_left");
    window.mods.hardwareInspector = new HardwareInspector("mod_column_left");
    window.mods.cpuinfo = new Cpuinfo("mod_column_left");
    window.mods.ramwatcher = new RAMwatcher("mod_column_left");
    window.mods.toplist = new Toplist("mod_column_left");

    // Right column
    window.mods.netstat = new Netstat("mod_column_right");
    window.mods.globe = new LocationGlobe("mod_column_right");
    window.mods.conninfo = new Conninfo("mod_column_right");

    // Fade-in animations
    document.querySelectorAll(".mod_column").forEach(e => {
        e.setAttribute("class", "mod_column activated");
    });
    let i = 0;
    let left = document.querySelectorAll("#mod_column_left > div");
    let right = document.querySelectorAll("#mod_column_right > div");
    let x = setInterval(() => {
        if (!left[i] && !right[i]) {
            clearInterval(x);
        } else {
            window.audioManager.panels.play();
            if (left[i]) {
                left[i].setAttribute("style", "animation-play-state: running;");
            }
            if (right[i]) {
                right[i].setAttribute("style", "animation-play-state: running;");
            }
            i++;
        }
    }, 500);

    await _delay(100);

    // Initialize the terminal
    let shellContainer = document.getElementById("main_shell");
    shellContainer.innerHTML += `
        <ul id="main_shell_tabs" role="tablist" aria-label="Shell tabs">
            <li id="shell_tab0" role="tab" tabindex="0" aria-selected="true" aria-controls="terminal0" onkeydown="window.tabKeydown(event, 0);" onclick="window.focusShellTab(0);" ondblclick="window.renameShellTab(0);" class="active"><p>MAIN SHELL</p></li>
            <li id="shell_tab1" role="tab" tabindex="-1" aria-selected="false" aria-controls="terminal1" draggable="true" ondragstart="window.tabDragStart(event, 1);" ondragover="window.tabDragOver(event);" ondrop="window.tabDrop(event, 1);" ondragend="window.tabDragEnd(event);" onkeydown="window.tabKeydown(event, 1);" onclick="window.focusShellTab(1);" ondblclick="window.renameShellTab(1);"><p>EMPTY</p></li>
            <li id="shell_tab2" role="tab" tabindex="-1" aria-selected="false" aria-controls="terminal2" draggable="true" ondragstart="window.tabDragStart(event, 2);" ondragover="window.tabDragOver(event);" ondrop="window.tabDrop(event, 2);" ondragend="window.tabDragEnd(event);" onkeydown="window.tabKeydown(event, 2);" onclick="window.focusShellTab(2);" ondblclick="window.renameShellTab(2);"><p>EMPTY</p></li>
            <li id="shell_tab3" role="tab" tabindex="-1" aria-selected="false" aria-controls="terminal3" draggable="true" ondragstart="window.tabDragStart(event, 3);" ondragover="window.tabDragOver(event);" ondrop="window.tabDrop(event, 3);" ondragend="window.tabDragEnd(event);" onkeydown="window.tabKeydown(event, 3);" onclick="window.focusShellTab(3);" ondblclick="window.renameShellTab(3);"><p>EMPTY</p></li>
            <li id="shell_tab4" role="tab" tabindex="-1" aria-selected="false" aria-controls="terminal4" draggable="true" ondragstart="window.tabDragStart(event, 4);" ondragover="window.tabDragOver(event);" ondrop="window.tabDrop(event, 4);" onkeydown="window.tabKeydown(event, 4);" ondragend="window.tabDragEnd(event);" onclick="window.focusShellTab(4);" ondblclick="window.renameShellTab(4);"><p>EMPTY</p></li>
        </ul>
        <div id="main_shell_innercontainer">
            <pre id="terminal0" class="active" role="tabpanel" aria-label="Main shell"></pre>
            <pre id="terminal1" role="tabpanel" aria-label="Shell tab 1"></pre>
            <pre id="terminal2" role="tabpanel" aria-label="Shell tab 2"></pre>
            <pre id="terminal3" role="tabpanel" aria-label="Shell tab 3"></pre>
            <pre id="terminal4" role="tabpanel" aria-label="Shell tab 4"></pre>
        </div>`;
    window.term = {
        0: new Terminal({
            role: "client",
            parentId: "terminal0",
            port: window.settings.port || 3000
        })
    };
    window.currentTerm = 0;
    window.tabNames = {};
    window.tabProcessNames = {};
    // Left-to-right visual order of the 4 extra tab slots (docs/10-todo.md 10.2
    // "Tab reordering"). The main tab (slot 0) is always first and not reorderable.
    // Slot *identity* (its port/process/name) never changes - only which DOM
    // position it's rendered at, via window.renderTabOrder(). See also
    // window.tabDrop below and the TAB_1..TAB_5/NEXT_TAB/PREVIOUS_TAB shortcut
    // handlers in window.useAppShortcut, which resolve visual position -> slot
    // through this array instead of assuming position === slot number.
    window.tabOrder = [1, 2, 3, 4];
    window.term[0].onprocesschange = p => {
        window.tabProcessNames[0] = p;
        window.updateShellTabLabel(0, p);
    };
    // Prevent losing hardware keyboard focus on the terminal when using touch keyboard
    window.onmouseup = e => {
        if (window.keyboard.linkedToTerm) window.term[window.currentTerm].term.focus();
    };
    window.term[0].term.writeln("\033[1m"+`Welcome to eDEX-UI v${electron.remote.app.getVersion()} - Electron v${process.versions.electron}`+"\033[0m");

    await _delay(100);

    window.fsDisp = new FilesystemDisplay({
        parentId: "filesystem"
    });

    await _delay(200);

    document.getElementById("filesystem").setAttribute("style", "opacity: 1;");

    // Resend terminal CWD to fsDisp if we're hot reloading
    if (window.performance.navigation.type === 1) {
        window.term[window.currentTerm].resendCWD();
    }

    await _delay(200);

    // Session restore (docs/10-todo.md 10.2 "Session/layout save & restore") - opt-in via
    // settings.restoreSession. Main tab's cwd is already handled in _boot.js before the
    // window was created; this recreates any extra tabs (1-4) that were open last time.
    if (window.settings.restoreSession && fs.existsSync(sessionFile)) {
        try {
            let lastSession = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));

            // Restore tab order first (docs/10-todo.md 10.2 "Tab reordering") so tabs
            // spawn straight into their remembered visual position. Validated as an
            // actual permutation of [1,2,3,4] before trusting it - a hand-edited or
            // corrupted lastSession.json shouldn't be able to leave a slot missing.
            if (Array.isArray(lastSession.tabOrder) && [1, 2, 3, 4].every(n => lastSession.tabOrder.includes(n)) && lastSession.tabOrder.length === 4) {
                window.tabOrder = lastSession.tabOrder;
                window.renderTabOrder();
            }

            if (Array.isArray(lastSession.tabs)) {
                for (let saved of lastSession.tabs) {
                    if (!(saved.index >= 1 && saved.index <= 4)) continue;
                    await window.spawnShellTab(saved.index, saved.cwd || undefined, false).then(() => {
                        if (saved.name) {
                            window.tabNames[saved.index] = saved.name;
                            window.updateShellTabLabel(saved.index, window.tabProcessNames[saved.index] || "");
                        }
                    }).catch(() => {
                        // Couldn't reopen this tab (e.g. max TTYs hit somehow), skip it
                    });
                }
            }
            if (lastSession.focusedTab && window.term[lastSession.focusedTab]) {
                window.focusShellTab(lastSession.focusedTab);
            }
        } catch (e) {
            ipc.send("log", "note", `Session restore: could not read lastSession.json (${e.message})`);
        }
    }

    // On platforms/runs where the real auto-updater above is active
    // (non-macOS, packaged), skip this GitHub-API-polling notify-only
    // checker so users don't get two separate "update available" prompts
    // for the same release. Kept as the sole update check on macOS
    // (unsigned build, electron-updater doesn't work there) and in dev
    // runs (nothing installed for electron-updater to replace).
    if (process.platform === "darwin" || !remote.app.isPackaged) {
        window.updateCheck = new UpdateChecker();
    }
}

// Real in-app auto-update, main-process side in _boot.js (docs/10-todo.md
// 10.3). Not gated behind a settings toggle for the same reason the
// existing GitHub-polling UpdateChecker below isn't either - checking is
// always on, but nothing downloads or installs without the user clicking
// through one of these two prompts.
ipc.on("autoupdate", (e, type, payload) => {
    switch (type) {
        case "available":
            window.activeUpdateModal = new Modal({
                type: "custom",
                title: "Update available",
                html: `<h5>eDEX-UI <strong>${window._escapeHtml(payload.version)}</strong> is available. Download it now? eDEX-UI will restart to finish installing once it's downloaded.</h5>`,
                buttons: [
                    {label: "Download", action: "window._triggerAutoUpdateDownload()"}
                ]
            });
            break;
        case "downloaded":
            window.activeUpdateModal = new Modal({
                type: "custom",
                title: "Update ready",
                html: `<h5>Update downloaded. Restart eDEX-UI now to finish installing it?</h5>`,
                buttons: [
                    {label: "Restart now", action: "window._triggerAutoUpdateInstall()"}
                ]
            });
            break;
    }
});

window._triggerAutoUpdateDownload = () => {
    if (window.activeUpdateModal) window.activeUpdateModal.close();
    ipc.send("autoupdate-action", "download");
};

window._triggerAutoUpdateInstall = () => {
    // Deliberately not closing the modal here - quitAndInstall() below
    // tears the whole app down within a second or two anyway.
    ipc.send("autoupdate-action", "install");
};

window.themeChanger = theme => {
    ipc.send("setThemeOverride", theme);
    setTimeout(() => {
        window.location.reload(true);
    }, 100);
};

window.remakeKeyboard = layout => {
    document.getElementById("keyboard").innerHTML = "";
    window.keyboard = new Keyboard({
        layout: path.join(keyboardsDir, layout+".json" || settings.keyboard+".json"),
        container: "keyboard"
    });
    ipc.send("setKbOverride", layout);
};

// Persists which tabs are open, each one's cwd, custom names, and the
// focused tab, so it can be restored on next launch if settings.restoreSession
// is enabled (see window.spawnShellTab below and _boot.js's "ttyspawn" handler).
// Called on tab open/close/rename and on every unload (UI reload or app quit),
// so a crash mid-session still leaves a reasonably fresh save on disk.
window.saveSession = () => {
    if (!window.term) return;

    let session = {
        mainCwd: (window.term[0] && window.term[0].cwd) || window.settings.cwd,
        focusedTab: window.currentTerm,
        tabOrder: window.tabOrder,
        tabs: []
    };

    for (let n = 1; n <= 4; n++) {
        if (window.term[n]) {
            session.tabs.push({
                index: n,
                cwd: window.term[n].cwd || null,
                name: window.tabNames[n] || null
            });
        }
    }

    try {
        fs.writeFileSync(sessionFile, JSON.stringify(session, "", 4));
    } catch (e) {
        // Non-critical (e.g. disk full) - just means session restore won't have
        // the latest state next launch, don't interrupt whatever the user's doing
    }
};

// Tab reordering via native HTML5 drag & drop (docs/10-todo.md 10.2 "Tab
// reordering"). Only slots 1-4 (extra tabs) are draggable/droppable - the
// main tab (slot 0) has no drag attributes in its <li>, so it can't be
// dragged and dropping onto it is a no-op (no ondrop handler there means
// the browser's default "not a valid drop target" behavior applies).
window.tabDragStart = (e, number) => {
    e.dataTransfer.setData("text/plain", String(number));
    e.dataTransfer.effectAllowed = "move";
    document.getElementById("shell_tab"+number).classList.add("dragging");
};

window.tabDragOver = e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
};

window.tabDragEnd = e => {
    document.querySelectorAll("ul#main_shell_tabs > li.dragging").forEach(el => el.classList.remove("dragging"));
};

window.tabDrop = (e, targetNumber) => {
    e.preventDefault();
    let draggedNumber = Number(e.dataTransfer.getData("text/plain"));
    if (!draggedNumber || draggedNumber === targetNumber) return;

    let from = window.tabOrder.indexOf(draggedNumber);
    let to = window.tabOrder.indexOf(targetNumber);
    if (from === -1 || to === -1) return;

    window.tabOrder.splice(from, 1);
    window.tabOrder.splice(to, 0, draggedNumber);

    window.renderTabOrder();
    window.saveSession();
};

// Physically moves each extra tab's <li> in window.tabOrder's sequence to
// match the array - appendChild() on a node already in the DOM moves it
// rather than cloning it, so calling this in order rebuilds the whole
// left-to-right sequence after slot 0 (MAIN, never touched here).
window.renderTabOrder = () => {
    let tabsList = document.getElementById("main_shell_tabs");
    if (!tabsList) return;
    window.tabOrder.forEach(slot => {
        let el = document.getElementById("shell_tab"+slot);
        if (el) tabsList.appendChild(el);
    });
};

// Keyboard behavior for the shell tablist (docs/10-todo.md 10.2
// "Accessibility"), following the WAI-ARIA tabs pattern with *manual*
// activation: arrow keys only move focus (roving tabindex, see
// window._moveTabFocus), Enter/Space actually switches tabs. Manual
// activation is used here specifically because activating an empty slot
// spawns a whole new TTY process - too expensive a side effect to trigger
// just by arrowing past it.
window.tabKeydown = (e, number) => {
    let seq = [0, ...window.tabOrder];

    switch (e.key) {
        case "Enter":
        case " ":
            e.preventDefault();
            window.focusShellTab(number);
            return;
        case "ArrowRight":
        case "ArrowLeft": {
            e.preventDefault();
            let dir = (e.key === "ArrowRight") ? 1 : -1;

            // Alt+Arrow on an extra tab reorders it - the keyboard equivalent
            // of dragging it (window.tabDrop), for anyone who can't use a
            // mouse/touch to reorder tabs.
            if (e.altKey && number >= 1 && number <= 4) {
                let from = window.tabOrder.indexOf(number);
                let to = from + dir;
                if (to < 0 || to >= window.tabOrder.length) return;
                [window.tabOrder[from], window.tabOrder[to]] = [window.tabOrder[to], window.tabOrder[from]];
                window.renderTabOrder();
                window.saveSession();
                document.getElementById("shell_tab"+number).focus();
                return;
            }

            let idx = seq.indexOf(number);
            window._moveTabFocus(seq[(idx + dir + seq.length) % seq.length]);
            return;
        }
        case "Home":
            e.preventDefault();
            window._moveTabFocus(seq[0]);
            return;
        case "End":
            e.preventDefault();
            window._moveTabFocus(seq[seq.length - 1]);
            return;
    }
};

// Moves the single tab-stop (roving tabindex) to `number` and focuses it,
// without activating it - i.e. without switching tabs or spawning
// anything. Kept separate from focusShellTab's aria-selected/tabindex sync,
// which only runs on actual activation.
window._moveTabFocus = number => {
    for (let n = 0; n <= 4; n++) {
        let el = document.getElementById("shell_tab"+n);
        if (el) el.setAttribute("tabindex", (n === number) ? "0" : "-1");
    }
    let target = document.getElementById("shell_tab"+number);
    if (target) target.focus();
};

window.focusShellTab = number => {
    window.audioManager.folder.play();

    if (number !== window.currentTerm && window.term[number]) {
        window.currentTerm = number;

        // ID-based (not DOM-position-based) so this stays correct regardless of
        // where window.renderTabOrder() has physically moved each <li>/<pre> to
        // (docs/10-todo.md 10.2 "Tab reordering").
        for (let n = 0; n <= 4; n++) {
            let tabEl = document.getElementById("shell_tab"+n);
            if (tabEl) {
                tabEl.setAttribute("class", (n === number) ? "active" : "");
                tabEl.setAttribute("aria-selected", (n === number) ? "true" : "false");
                tabEl.setAttribute("tabindex", (n === number) ? "0" : "-1");
            }
            let termEl = document.getElementById("terminal"+n);
            if (termEl) termEl.setAttribute("class", (n === number) ? "active" : "");
        }

        window.term[number].fit();
        window.term[number].term.focus();
        window.term[number].resendCWD();

        window.fsDisp.followTab();
    } else if (number > 0 && number <= 4 && window.term[number] !== null && typeof window.term[number] !== "object") {
        window.spawnShellTab(number).then(() => {
            setTimeout(() => {
                window.focusShellTab(number);
            }, 500);
        }).catch(() => {});
    }
};

// Spawns tab `number`'s backend TTY and hooks up its client Terminal.
// `cwd` is optional (used by session restore to reopen a tab at its saved
// directory - see _boot.js's "ttyspawn" handler); omitted, it falls back to
// the main tab's current cwd, same as manually clicking an empty tab always did.
// `autoFocus` defaults to true (matches pre-existing click behavior); session
// restore passes false so restoring several tabs doesn't fight over focus,
// and explicitly focuses the previously-focused tab once all are back.
window.spawnShellTab = (number, cwd, autoFocus) => {
    if (autoFocus === undefined) autoFocus = true;

    return new Promise((resolve, reject) => {
        window.term[number] = null;

        document.getElementById("shell_tab"+number).innerHTML = "<p>LOADING...</p>";
        const { nanoid } = require("nanoid/non-secure");
        let requestId = nanoid();
        ipc.send("ttyspawn", requestId, cwd);
        ipc.once("ttyspawn-reply-"+requestId, (e, r) => {
            if (r.startsWith("ERROR")) {
                document.getElementById("shell_tab"+number).innerHTML = "<p>ERROR</p>";
                reject(new Error(r));
            } else if (r.startsWith("SUCCESS")) {
                let port = Number(r.substr(9));

                window.term[number] = new Terminal({
                    role: "client",
                    parentId: "terminal"+number,
                    port
                });

                window.term[number].onclose = e => {
                    delete window.term[number].onprocesschange;
                    delete window.tabNames[number];
                    delete window.tabProcessNames[number];
                    document.getElementById("shell_tab"+number).innerHTML = "<p>EMPTY</p>";
                    document.getElementById("terminal"+number).innerHTML = "";
                    window.term[number].term.dispose();
                    delete window.term[number];
                    window.useAppShortcut("PREVIOUS_TAB");
                    window.saveSession();
                };

                window.term[number].onprocesschange = p => {
                    window.tabProcessNames[number] = p;
                    window.updateShellTabLabel(number, p);
                };

                document.getElementById("shell_tab"+number).innerHTML = `<p>::${port}</p>`;
                window.saveSession();
                if (autoFocus) {
                    setTimeout(() => {
                        window.focusShellTab(number);
                    }, 500);
                }
                resolve();
            }
        });
    });
};

window.updateShellTabLabel = (number, processName) => {
    let el = document.getElementById("shell_tab"+number);
    if (!el) return;

    if (window.tabNames[number]) {
        el.innerHTML = `<p>${window._escapeHtml(window.tabNames[number])}</p>`;
        return;
    }

    if (number === 0) {
        el.innerHTML = `<p>MAIN - ${processName}</p>`;
    } else {
        el.innerHTML = `<p>#${number+1} - ${processName}</p>`;
    }
};

// Prompts for a custom tab name (#10-todo.md - "Tab renaming / reordering").
window.renameShellTab = number => {
    if (!window.term[number] || document.getElementById("settingsEditor")) return;

    window.keyboard.detach();
    let modal = new Modal({
        type: "custom",
        title: "Rename Tab",
        html: `<input type="text" id="tabRenameInput" maxlength="20" placeholder="Tab name..." value="${window._escapeHtml(window.tabNames[number] || "")}" />`,
        buttons: [
            {label: "Reset", action: `window.applyTabRename(${number}, true)`},
            {label: "Rename", action: `window.applyTabRename(${number})`}
        ]
    }, () => {
        window.keyboard.attach();
        window.term[window.currentTerm].term.focus();
    });

    window.activeTabRenameModal = modal;

    let input = document.getElementById("tabRenameInput");
    input.focus();
    input.select();
    input.addEventListener("keydown", e => {
        if (e.key === "Enter") {
            window.applyTabRename(number);
            e.preventDefault();
        }
    });
};

window.applyTabRename = (number, reset) => {
    let input = document.getElementById("tabRenameInput");
    let value = (!reset && input) ? input.value.trim().slice(0, 20) : "";

    if (value) {
        window.tabNames[number] = value;
    } else {
        delete window.tabNames[number];
    }
    window.updateShellTabLabel(number, window.tabProcessNames[number] || "");
    window.saveSession();

    if (window.activeTabRenameModal) {
        window.activeTabRenameModal.close();
        delete window.activeTabRenameModal;
    }
};

// Settings editor
window.openSettings = async () => {
    if (document.getElementById("settingsEditor")) return;

    // Build lists of available keyboards, themes, monitors
    let keyboards, themes, monitors, ifaces;
    fs.readdirSync(keyboardsDir).forEach(kb => {
        if (!kb.endsWith(".json")) return;
        kb = kb.replace(".json", "");
        if (kb === window.settings.keyboard) return;
        keyboards += `<option>${kb}</option>`;
    });
    fs.readdirSync(themesDir).forEach(th => {
        if (!th.endsWith(".json")) return;
        th = th.replace(".json", "");
        if (th === window.settings.theme) return;
        themes += `<option>${th}</option>`;
    });
    for (let i = 0; i < electron.remote.screen.getAllDisplays().length; i++) {
        if (i !== window.settings.monitor) monitors += `<option>${i}</option>`;
    }
    let nets = await window.si.networkInterfaces();
    nets.forEach(net => {
        if (net.iface !== window.mods.netstat.iface) ifaces += `<option>${net.iface}</option>`;
    });

    // Unlink the tactile keyboard from the terminal emulator to allow filling in the settings fields
    window.keyboard.detach();

    new Modal({
        type: "custom",
        title: `Settings <i>(v${electron.remote.app.getVersion()})</i>`,
        html: `<table id="settingsEditor">
                    <tr>
                        <th>Key</th>
                        <th>Description</th>
                        <th>Value</th>
                    </tr>
                    <tr>
                        <td>shell</td>
                        <td>The program to run as a terminal emulator</td>
                        <td><input type="text" id="settingsEditor-shell" value="${window.settings.shell}"></td>
                    </tr>
                    <tr>
                        <td>shellArgs</td>
                        <td>Arguments to pass to the shell</td>
                        <td><input type="text" id="settingsEditor-shellArgs" value="${window.settings.shellArgs || ''}"></td>
                    </tr>
                    <tr>
                        <td>cwd</td>
                        <td>Working Directory to start in</td>
                        <td><input type="text" id="settingsEditor-cwd" value="${window.settings.cwd}"></td>
                    </tr>
                    <tr>
                        <td>env</td>
                        <td>Custom shell environment override</td>
                        <td><input type="text" id="settingsEditor-env" value="${window.settings.env}"></td>
                    </tr>
                    <tr>
                        <td>username</td>
                        <td>Custom username to display at boot</td>
                        <td><input type="text" id="settingsEditor-username" value="${window.settings.username}"></td>
                    </tr>
                    <tr>
                        <td>keyboard</td>
                        <td>On-screen keyboard layout code</td>
                        <td><select id="settingsEditor-keyboard">
                            <option>${window.settings.keyboard}</option>
                            ${keyboards}
                        </select></td>
                    </tr>
                    <tr>
                        <td>theme</td>
                        <td>Name of the theme to load</td>
                        <td><select id="settingsEditor-theme">
                            <option>${window.settings.theme}</option>
                            ${themes}
                        </select></td>
                    </tr>
                    <tr>
                        <td>termFontSize</td>
                        <td>Size of the terminal text in pixels</td>
                        <td><input type="number" id="settingsEditor-termFontSize" value="${window.settings.termFontSize}"></td>
                    </tr>
                    <tr>
                        <td>audio</td>
                        <td>Activate audio sound effects</td>
                        <td><select id="settingsEditor-audio">
                            <option>${window.settings.audio}</option>
                            <option>${!window.settings.audio}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>audioVolume</td>
                        <td>Set default volume for sound effects (0.0 - 1.0)</td>
                        <td><input type="number" id="settingsEditor-audioVolume" value="${window.settings.audioVolume || '1.0'}"></td>
                    </tr>
                    <tr>
                        <td>disableFeedbackAudio</td>
                        <td>Disable recurring feedback sound FX (input/output, mostly)</td>
                        <td><select id="settingsEditor-disableFeedbackAudio">
                            <option>${window.settings.disableFeedbackAudio}</option>
                            <option>${!window.settings.disableFeedbackAudio}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>port</td>
                        <td>Local port to use for UI-shell connection</td>
                        <td><input type="number" id="settingsEditor-port" value="${window.settings.port}"></td>
                    </tr>
                    <tr>
                        <td>pingAddr</td>
                        <td>IPv4 address to test Internet connectivity</td>
                        <td><input type="text" id="settingsEditor-pingAddr" value="${window.settings.pingAddr || "1.1.1.1"}"></td>
                    </tr>
                    <tr>
                        <td>clockHours</td>
                        <td>Clock format (12/24 hours)</td>
                        <td><select id="settingsEditor-clockHours">
                            <option>${(window.settings.clockHours === 12) ? "12" : "24"}</option>
                            <option>${(window.settings.clockHours === 12) ? "24" : "12"}</option>
                        </select></td>
                    <tr>
                        <td>monitor</td>
                        <td>Which monitor to spawn the UI in (defaults to primary display)</td>
                        <td><select id="settingsEditor-monitor">
                            ${(typeof window.settings.monitor !== "undefined") ? "<option>"+window.settings.monitor+"</option>" : ""}
                            ${monitors}
                        </select></td>
                    </tr>
                    <tr>
                        <td>nointro</td>
                        <td>Skip the intro boot log and logo${(window.settings.nointroOverride) ? " (Currently overridden by CLI flag)" : ""}</td>
                        <td><select id="settingsEditor-nointro">
                            <option>${window.settings.nointro}</option>
                            <option>${!window.settings.nointro}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>nocursor</td>
                        <td>Hide the mouse cursor${(window.settings.nocursorOverride) ? " (Currently overridden by CLI flag)" : ""}</td>
                        <td><select id="settingsEditor-nocursor">
                            <option>${window.settings.nocursor}</option>
                            <option>${!window.settings.nocursor}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>iface</td>
                        <td>Override the interface used for network monitoring</td>
                        <td><select id="settingsEditor-iface">
                            <option>${window.mods.netstat.iface}</option>
                            ${ifaces}
                        </select></td>
                    </tr>
                    <tr>
                        <td>lockPassword</td>
                        <td>Password for the lock screen (Ctrl+Shift+Z). Leave blank to keep the current<br>password${window.settings.lockPasswordHash ? " (one is currently set)" : " (none set - lock screen is disabled until you set one)"}.</td>
                        <td><input type="password" id="settingsEditor-lockPassword" autocomplete="new-password" placeholder="${window.settings.lockPasswordHash ? "•••• (unchanged)" : "No password set"}"></td>
                    </tr>
                    <tr>
                        <td>allowWindowed</td>
                        <td>Allow using F11 key to set the UI in windowed mode</td>
                        <td><select id="settingsEditor-allowWindowed">
                            <option>${window.settings.allowWindowed}</option>
                            <option>${!window.settings.allowWindowed}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>keepGeometry</td>
                        <td>Try to keep a 16:9 aspect ratio in windowed mode</td>
                        <td><select id="settingsEditor-keepGeometry">
                            <option>${(window.settings.keepGeometry === false) ? 'false' : 'true'}</option>
                            <option>${(window.settings.keepGeometry === false) ? 'true' : 'false'}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>excludeThreadsFromToplist</td>
                        <td>Display threads in the top processes list</td>
                        <td><select id="settingsEditor-excludeThreadsFromToplist">
                            <option>${window.settings.excludeThreadsFromToplist}</option>
                            <option>${!window.settings.excludeThreadsFromToplist}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>hideDotfiles</td>
                        <td>Hide files and directories starting with a dot in file display</td>
                        <td><select id="settingsEditor-hideDotfiles">
                            <option>${window.settings.hideDotfiles}</option>
                            <option>${!window.settings.hideDotfiles}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>fsListView</td>
                        <td>Show files in a more detailed list instead of an icon grid</td>
                        <td><select id="settingsEditor-fsListView">
                            <option>${window.settings.fsListView}</option>
                            <option>${!window.settings.fsListView}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>restoreSession</td>
                        <td>Reopen the same tabs (and their directories) on next launch</td>
                        <td><select id="settingsEditor-restoreSession">
                            <option>${window.settings.restoreSession}</option>
                            <option>${!window.settings.restoreSession}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>experimentalGlobeFeatures</td>
                        <td>Toggle experimental features for the network globe</td>
                        <td><select id="settingsEditor-experimentalGlobeFeatures">
                            <option>${window.settings.experimentalGlobeFeatures}</option>
                            <option>${!window.settings.experimentalGlobeFeatures}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>experimentalFeatures</td>
                        <td>Toggle Chrome's experimental web features (DANGEROUS)</td>
                        <td><select id="settingsEditor-experimentalFeatures">
                            <option>${window.settings.experimentalFeatures}</option>
                            <option>${!window.settings.experimentalFeatures}</option>
                        </select></td>
                    </tr>
                </table>
                <h6 id="settingsEditorStatus" aria-live="polite">Loaded values from memory</h6>
                <br>`,
        buttons: [
            {label: "Open in External Editor", action:`electron.shell.openPath('${settingsFile}');electronWin.minimize();`},
            {label: "Save to Disk", action: "window.writeSettingsFile()"},
            {label: "Reload UI", action: "window.location.reload(true);"},
            {label: "Restart eDEX", action: "electron.remote.app.relaunch();electron.remote.app.quit();"}
        ]
    }, () => {
        // Link the keyboard back to the terminal
        window.keyboard.attach();

        // Focus back on the term
        window.term[window.currentTerm].term.focus();
    });
};

window.writeFile = (path) => {
    fs.writeFile(path, document.getElementById("fileEdit").value, "utf-8", () => {
        document.getElementById("fedit-status").innerHTML = "<i>File saved.</i>";
    });
};

window.writeSettingsFile = () => {
    let newLockPassword = document.getElementById("settingsEditor-lockPassword").value;
    let lockPasswordFields = newLockPassword
        ? LockScreen.hashPassword(newLockPassword)
        : {lockPasswordHash: window.settings.lockPasswordHash, lockPasswordSalt: window.settings.lockPasswordSalt};

    window.settings = {
        shell: document.getElementById("settingsEditor-shell").value,
        shellArgs: document.getElementById("settingsEditor-shellArgs").value,
        cwd: document.getElementById("settingsEditor-cwd").value,
        env: document.getElementById("settingsEditor-env").value,
        username: document.getElementById("settingsEditor-username").value,
        keyboard: document.getElementById("settingsEditor-keyboard").value,
        theme: document.getElementById("settingsEditor-theme").value,
        termFontSize: Number(document.getElementById("settingsEditor-termFontSize").value),
        audio: (document.getElementById("settingsEditor-audio").value === "true"),
        audioVolume: Number(document.getElementById("settingsEditor-audioVolume").value),
        disableFeedbackAudio: (document.getElementById("settingsEditor-disableFeedbackAudio").value === "true"),
        pingAddr: document.getElementById("settingsEditor-pingAddr").value,
        clockHours: Number(document.getElementById("settingsEditor-clockHours").value),
        port: Number(document.getElementById("settingsEditor-port").value),
        monitor: Number(document.getElementById("settingsEditor-monitor").value),
        nointro: (document.getElementById("settingsEditor-nointro").value === "true"),
        nocursor: (document.getElementById("settingsEditor-nocursor").value === "true"),
        iface: document.getElementById("settingsEditor-iface").value,
        lockPasswordHash: lockPasswordFields.lockPasswordHash,
        lockPasswordSalt: lockPasswordFields.lockPasswordSalt,
        allowWindowed: (document.getElementById("settingsEditor-allowWindowed").value === "true"),
        forceFullscreen: window.settings.forceFullscreen,
        keepGeometry: (document.getElementById("settingsEditor-keepGeometry").value === "true"),
        excludeThreadsFromToplist: (document.getElementById("settingsEditor-excludeThreadsFromToplist").value === "true"),
        hideDotfiles: (document.getElementById("settingsEditor-hideDotfiles").value === "true"),
        fsListView: (document.getElementById("settingsEditor-fsListView").value === "true"),
        restoreSession: (document.getElementById("settingsEditor-restoreSession").value === "true"),
        experimentalGlobeFeatures: (document.getElementById("settingsEditor-experimentalGlobeFeatures").value === "true"),
        experimentalFeatures: (document.getElementById("settingsEditor-experimentalFeatures").value === "true")
    };

    Object.keys(window.settings).forEach(key => {
        if (window.settings[key] === "undefined") {
            delete window.settings[key];
        }
    });

    fs.writeFileSync(settingsFile, JSON.stringify(window.settings, "", 4));
    document.getElementById("settingsEditorStatus").innerText = "New values written to settings.json file at "+new Date().toTimeString();
};

window.toggleFullScreen = () => {
    let useFullscreen = (electronWin.isFullScreen() ? false : true);
    electronWin.setFullScreen(useFullscreen);

    //Update settings
    window.lastWindowState["useFullscreen"] = useFullscreen;

    fs.writeFileSync(lastWindowStateFile, JSON.stringify(window.lastWindowState, "", 4));
};

// Display available keyboard shortcuts, editable in-app (docs/10-todo.md 10.2
// "Editable shortcuts UI"). App-type entries (built-in actions) only allow
// editing trigger/enabled, since their `action` is a fixed known value.
// Shell-type (custom command) entries are fully editable and can be added/removed.
window.openShortcutsHelp = () => {
    if (document.getElementById("shortcutsHelpCustomTable")) return;

    const shortcutsDefinition = {
        "COPY": "Copy selected buffer from the terminal.",
        "PASTE": "Paste system clipboard to the terminal.",
        "NEXT_TAB": "Switch to the next opened terminal tab (left to right order).",
        "PREVIOUS_TAB": "Switch to the previous opened terminal tab (right to left order).",
        "TAB_X": "Switch to terminal tab <strong>X</strong>, or create it if it hasn't been opened yet.",
        "SETTINGS": "Open the settings editor.",
        "SHORTCUTS": "List and edit available keyboard shortcuts.",
        "SSH_PROFILES": "Open the SSH profile manager.",
        "FUZZY_SEARCH": "Search for entries in the current working directory.",
        "FIND_IN_TERMINAL": "Search for text in the current terminal's scrollback buffer.",
        "FS_LIST_VIEW": "Toggle between list and grid view in the file browser.",
        "FS_DOTFILES": "Toggle hidden files and directories in the file browser.",
        "KB_PASSMODE": "Toggle the on-screen keyboard's \"Password Mode\", which allows you to safely<br>type sensitive information even if your screen might be recorded (disable visual input feedback).",
        "LOCK_SCREEN": "Lock the screen behind a password prompt (set one first in Settings). This is a privacy<br>screen to deter casual snooping, not a hardened security boundary.",
        "DEV_DEBUG": "Open Chromium Dev Tools, for debugging purposes.",
        "DEV_RELOAD": "Trigger front-end hot reload."
    };

    let appList = "";
    window.shortcuts.filter(e => e.type === "app").forEach(cut => {
        let action = (cut.action.startsWith("TAB_")) ? "TAB_X" : cut.action;
        let hint = (cut.action === "TAB_X") ? ` title="Keep the letter X in the trigger - it gets replaced with 1-5 to build each tab's shortcut"` : "";

        appList += `<tr data-shortcut-row="app" data-action="${window._escapeHtml(cut.action)}">
                        <td><input type="checkbox" class="shortcutsHelp-enabled" ${cut.enabled ? "checked" : ""}></td>
                        <td><input type="text" class="shortcutsHelp-trigger" maxlength=25 value="${window._escapeHtml(cut.trigger)}"${hint}></td>
                        <td>${shortcutsDefinition[action]}</td>
                    </tr>`;
    });

    let customList = "";
    window.shortcuts.filter(e => e.type === "shell").forEach(cut => {
        customList += `<tr data-shortcut-row="shell">
                            <td><input type="checkbox" class="shortcutsHelp-enabled" ${cut.enabled ? "checked" : ""}></td>
                            <td><input type="text" class="shortcutsHelp-trigger" maxlength=25 value="${window._escapeHtml(cut.trigger)}"></td>
                            <td>
                                <input type="text" class="shortcutsHelp-command" placeholder="Run terminal command..." value="${window._escapeHtml(cut.action)}">
                                <input type="checkbox" class="shortcutsHelp-linebreak" ${cut.linebreak ? "checked" : ""}>
                                <span>Enter</span>
                            </td>
                            <td><button type="button" aria-label="Remove this shortcut" onclick="this.closest('tr').remove()">✕</button></td>
                        </tr>`;
    });

    window.keyboard.detach();
    new Modal({
        type: "custom",
        title: `Available Keyboard Shortcuts <i>(v${electron.remote.app.getVersion()})</i>`,
        html: `<h5>Using either the on-screen or a physical keyboard, you can use the following shortcuts:</h5>
                <details open id="shortcutsHelpAccordeon1">
                    <summary>Emulator shortcuts</summary>
                    <table class="shortcutsHelp">
                        <tr>
                            <th>Enabled</th>
                            <th>Trigger</th>
                            <th>Action</th>
                        </tr>
                        ${appList}
                    </table>
                </details>
                <br>
                <details id="shortcutsHelpAccordeon2">
                    <summary>Custom command shortcuts</summary>
                    <table class="shortcutsHelp" id="shortcutsHelpCustomTable">
                        <tr>
                            <th>Enabled</th>
                            <th>Trigger</th>
                            <th>Command</th>
                            <th></th>
                        <tr>
                       ${customList}
                    </table>
                    <button type="button" onclick="window.addCustomShortcutRow()">+ Add custom shortcut</button>
                </details>
                <h6 id="shortcutsHelpStatus" aria-live="polite">Loaded values from memory</h6>
                <br>`,
        buttons: [
            {label: "Open Shortcuts File", action:`electron.shell.openPath('${shortcutsFile}');electronWin.minimize();`},
            {label: "Save to Disk", action: "window.saveShortcuts()"},
            {label: "Reload UI", action: "window.location.reload(true);"},
        ]
    }, () => {
        window.keyboard.attach();
        window.term[window.currentTerm].term.focus();
    });

    let wrap1 = document.getElementById('shortcutsHelpAccordeon1');
    let wrap2 = document.getElementById('shortcutsHelpAccordeon2');

    wrap1.addEventListener('toggle', e => {
        wrap2.open = !wrap1.open;
    });

    wrap2.addEventListener('toggle', e => {
        wrap1.open = !wrap2.open;
    });
};

// Appends a blank, editable row to the custom (shell) shortcuts table.
window.addCustomShortcutRow = () => {
    let table = document.getElementById("shortcutsHelpCustomTable");
    if (!table) return;
    table.insertAdjacentHTML("beforeend", `<tr data-shortcut-row="shell">
        <td><input type="checkbox" class="shortcutsHelp-enabled" checked></td>
        <td><input type="text" class="shortcutsHelp-trigger" maxlength=25 placeholder="Ctrl+Shift+Alt+Space"></td>
        <td>
            <input type="text" class="shortcutsHelp-command" placeholder="Run terminal command...">
            <input type="checkbox" class="shortcutsHelp-linebreak">
            <span>Enter</span>
        </td>
        <td><button type="button" aria-label="Remove this shortcut" onclick="this.closest('tr').remove()">✕</button></td>
    </tr>`);
};

// Rebuilds window.shortcuts from the currently-rendered form, writes it to
// shortcuts.json, and re-registers global shortcuts so changes take effect
// immediately (no reload needed). Rows with an empty trigger or (for custom
// shortcuts) an empty command are skipped - this is how a still-blank "add"
// row, or a row the user cleared out to effectively remove it, is dropped.
window.saveShortcuts = () => {
    let shortcuts = [];

    document.querySelectorAll('tr[data-shortcut-row="app"]').forEach(row => {
        let trigger = row.querySelector(".shortcutsHelp-trigger").value.trim();
        if (!trigger) return;
        shortcuts.push({
            type: "app",
            trigger,
            action: row.getAttribute("data-action"),
            enabled: row.querySelector(".shortcutsHelp-enabled").checked
        });
    });

    document.querySelectorAll('tr[data-shortcut-row="shell"]').forEach(row => {
        let trigger = row.querySelector(".shortcutsHelp-trigger").value.trim();
        let action = row.querySelector(".shortcutsHelp-command").value.trim();
        if (!trigger || !action) return;
        shortcuts.push({
            type: "shell",
            trigger,
            action,
            linebreak: row.querySelector(".shortcutsHelp-linebreak").checked,
            enabled: row.querySelector(".shortcutsHelp-enabled").checked
        });
    });

    window.shortcuts = shortcuts;
    fs.writeFileSync(shortcutsFile, JSON.stringify(window.shortcuts, "", 4));

    globalShortcut.unregisterAll();
    window.registerKeyboardShortcuts();

    let status = document.getElementById("shortcutsHelpStatus");
    if (status) status.innerText = "New values written to shortcuts.json file at "+new Date().toTimeString();
};

// SSH profile manager (docs/10-todo.md 10.2 "SSH profile manager"). Same
// editable-table pattern as the shortcuts UI above: rows are read straight
// from the DOM on save/connect, no separate in-memory form state to keep in
// sync.
window.openSSHProfiles = () => {
    if (document.getElementById("sshProfilesTable")) return;

    let rows = "";
    window.sshProfiles.forEach(p => {
        rows += `<tr data-ssh-row>
                    <td><input type="text" class="sshProfile-name" placeholder="My server" value="${window._escapeHtml(p.name || "")}"></td>
                    <td><input type="text" class="sshProfile-host" placeholder="example.com" value="${window._escapeHtml(p.host || "")}"></td>
                    <td><input type="number" class="sshProfile-port" placeholder="22" value="${window._escapeHtml(p.port || "")}"></td>
                    <td><input type="text" class="sshProfile-username" placeholder="root" value="${window._escapeHtml(p.username || "")}"></td>
                    <td>
                        <div class="sshProfile-identity-wrap">
                            <input type="text" class="sshProfile-identity" placeholder="~/.ssh/id_rsa (optional)" value="${window._escapeHtml(p.identityFile || "")}">
                            <button type="button" aria-label="Browse for identity file" onclick="window.browseSSHIdentityFile(this)">...</button>
                        </div>
                    </td>
                    <td>
                        <button type="button" onclick="window.connectSSHProfile(this)">Connect</button>
                        <button type="button" aria-label="Remove this profile" onclick="this.closest('tr').remove()">✕</button>
                    </td>
                </tr>`;
    });

    window.keyboard.detach();
    let modal = new Modal({
        type: "custom",
        title: `SSH Profiles <i>(v${electron.remote.app.getVersion()})</i>`,
        html: `<h5>Saved connections - click Connect to open a new tab and run <strong>ssh</strong> straight away.</h5>
                <table class="sshProfiles" id="sshProfilesTable">
                    <tr>
                        <th>Name</th>
                        <th>Host</th>
                        <th>Port</th>
                        <th>User</th>
                        <th>Identity file</th>
                        <th></th>
                    </tr>
                    ${rows}
                </table>
                <button type="button" onclick="window.addSSHProfileRow()">+ Add profile</button>
                <h6 id="sshProfilesStatus" aria-live="polite">Loaded values from memory</h6>
                <br>`,
        buttons: [
            {label: "Save to Disk", action: "window.saveSSHProfiles()"},
        ]
    }, () => {
        window.keyboard.attach();
        window.term[window.currentTerm].term.focus();
        delete window.activeSSHProfilesModal;
    });

    window.activeSSHProfilesModal = modal;
};

window.addSSHProfileRow = () => {
    let table = document.getElementById("sshProfilesTable");
    if (!table) return;
    table.insertAdjacentHTML("beforeend", `<tr data-ssh-row>
        <td><input type="text" class="sshProfile-name" placeholder="My server"></td>
        <td><input type="text" class="sshProfile-host" placeholder="example.com"></td>
        <td><input type="number" class="sshProfile-port" placeholder="22"></td>
        <td><input type="text" class="sshProfile-username" placeholder="root"></td>
        <td>
            <div class="sshProfile-identity-wrap">
                <input type="text" class="sshProfile-identity" placeholder="~/.ssh/id_rsa (optional)">
                <button type="button" aria-label="Browse for identity file" onclick="window.browseSSHIdentityFile(this)">...</button>
            </div>
        </td>
        <td>
            <button type="button" onclick="window.connectSSHProfile(this)">Connect</button>
            <button type="button" aria-label="Remove this profile" onclick="this.closest('tr').remove()">✕</button>
        </td>
    </tr>`);
};

// Opens a native file picker for the identity file field, defaulting to ~/.ssh.
window.browseSSHIdentityFile = btn => {
    let result = electron.remote.dialog.showOpenDialogSync({
        defaultPath: path.join(remote.app.getPath("home"), ".ssh"),
        properties: ["openFile", "showHiddenFiles"]
    });
    if (result && result[0]) {
        btn.closest("td").querySelector(".sshProfile-identity").value = result[0];
    }
};

window.saveSSHProfiles = () => {
    let profiles = [];

    document.querySelectorAll("tr[data-ssh-row]").forEach(row => {
        let host = row.querySelector(".sshProfile-host").value.trim();
        if (!host) return;
        profiles.push({
            name: row.querySelector(".sshProfile-name").value.trim(),
            host,
            port: row.querySelector(".sshProfile-port").value.trim(),
            username: row.querySelector(".sshProfile-username").value.trim(),
            identityFile: row.querySelector(".sshProfile-identity").value.trim()
        });
    });

    window.sshProfiles = profiles;
    fs.writeFileSync(sshProfilesFile, JSON.stringify(window.sshProfiles, "", 4));

    let status = document.getElementById("sshProfilesStatus");
    if (status) status.innerText = "New values written to sshProfiles.json file at "+new Date().toTimeString();
};

// Builds the ssh command line from a profile row and runs it. Saves all
// profiles first so the row's current values are remembered even if the
// user never explicitly hit "Save to Disk".
window.connectSSHProfile = btn => {
    let row = btn.closest("tr");
    let host = row.querySelector(".sshProfile-host").value.trim();
    if (!host) return;

    let port = row.querySelector(".sshProfile-port").value.trim();
    let username = row.querySelector(".sshProfile-username").value.trim();
    let identity = row.querySelector(".sshProfile-identity").value.trim();
    let name = row.querySelector(".sshProfile-name").value.trim();

    let quote = s => (/\s/.test(s)) ? `"${s}"` : s;

    let parts = ["ssh"];
    if (port && port !== "22") parts.push("-p", port);
    if (identity) parts.push("-i", quote(identity));
    parts.push(username ? `${username}@${quote(host)}` : quote(host));

    window.saveSSHProfiles();

    if (window.activeSSHProfilesModal) {
        window.activeSSHProfilesModal.close();
    }

    window.runShellCommand(parts.join(" "), name || host);
};

// Waits for a freshly-spawned client Terminal's websocket to actually be
// open (this.write()/writelr() call this.socket.send() directly, which
// throws if the socket isn't OPEN yet - and spawnShellTab's promise
// resolves right after the Terminal object is constructed, well before the
// websocket handshake completes).
window._waitForSocketOpen = (term, timeoutMs) => {
    return new Promise((resolve, reject) => {
        let waited = 0;
        let interval = setInterval(() => {
            if (term.socket && term.socket.readyState === 1) {
                clearInterval(interval);
                resolve();
            } else if ((waited += 100) >= (timeoutMs || 5000)) {
                clearInterval(interval);
                reject(new Error("Timed out waiting for terminal socket to open"));
            }
        }, 100);
    });
};

// Runs a shell command in a free extra tab (opening one if needed, naming it
// `label`), falling back to the currently focused tab if all 4 are already
// in use. Used by the SSH profile manager, kept generic in case other
// one-click-run-a-command features want it later.
window.runShellCommand = (cmd, label) => {
    let freeSlot = null;
    for (let n = 1; n <= 4; n++) {
        if (!window.term[n]) {
            freeSlot = n;
            break;
        }
    }

    if (freeSlot === null) {
        if (window.term[window.currentTerm]) window.term[window.currentTerm].writelr(cmd);
        return;
    }

    window.spawnShellTab(freeSlot).then(() => window._waitForSocketOpen(window.term[freeSlot])).then(() => {
        if (label) {
            window.tabNames[freeSlot] = label.slice(0, 20);
            window.updateShellTabLabel(freeSlot, window.tabProcessNames[freeSlot] || "");
        }
        window.term[freeSlot].writelr(cmd);
        window.saveSession();
    }).catch(() => {
        // Tab didn't come up in time - fall back to whatever's focused rather
        // than silently dropping the command
        if (window.term[window.currentTerm]) window.term[window.currentTerm].writelr(cmd);
    });
};

window.useAppShortcut = action => {
    // While locked, only the LOCK_SCREEN action itself is allowed through
    // (it just no-ops below since we're already locked) - everything else
    // (tab switching, settings, dev tools, etc.) is blocked so the global
    // OS-level shortcuts can't be used to peek/interact around the overlay.
    if (window.mods && window.mods.lockscreen && window.mods.lockscreen.locked && action !== "LOCK_SCREEN") {
        return false;
    }

    switch(action) {
        case "COPY":
            window.term[window.currentTerm].clipboard.copy();
            return true;
        case "PASTE":
            window.term[window.currentTerm].clipboard.paste();
            return true;
        case "NEXT_TAB": {
            // Traverses visual order (main first, then window.tabOrder), not raw
            // slot number, so this stays correct after reordering (docs/10-todo.md
            // 10.2 "Tab reordering").
            let seq = [0, ...window.tabOrder];
            let curIdx = seq.indexOf(window.currentTerm);
            for (let step = 1; step <= seq.length; step++) {
                let next = seq[(curIdx + step) % seq.length];
                if (window.term[next]) {
                    window.focusShellTab(next);
                    break;
                }
            }
            return true;
        }
        case "PREVIOUS_TAB": {
            let seq = [0, ...window.tabOrder];
            let curIdx = seq.indexOf(window.currentTerm);
            for (let step = 1; step <= seq.length; step++) {
                let prev = seq[(curIdx - step + seq.length) % seq.length];
                if (window.term[prev]) {
                    window.focusShellTab(prev);
                    break;
                }
            }
            return true;
        }
        case "TAB_1":
            // Main tab is always first/pinned, not part of window.tabOrder.
            window.focusShellTab(0);
            return true;
        case "TAB_2":
            window.focusShellTab(window.tabOrder[0]);
            return true;
        case "TAB_3":
            window.focusShellTab(window.tabOrder[1]);
            return true;
        case "TAB_4":
            window.focusShellTab(window.tabOrder[2]);
            return true;
        case "TAB_5":
            window.focusShellTab(window.tabOrder[3]);
            return true;
        case "SETTINGS":
            window.openSettings();
            return true;
        case "SHORTCUTS":
            window.openShortcutsHelp();
            return true;
        case "SSH_PROFILES":
            window.openSSHProfiles();
            return true;
        case "FUZZY_SEARCH":
            window.activeFuzzyFinder = new FuzzyFinder();
            return true;
        case "FIND_IN_TERMINAL":
            window.activeTerminalSearch = new TerminalSearch();
            return true;
        case "FS_LIST_VIEW":
            window.fsDisp.toggleListview();
            return true;
        case "FS_DOTFILES":
            window.fsDisp.toggleHidedotfiles();
            return true;
        case "KB_PASSMODE":
            window.keyboard.togglePasswordMode();
            return true;
        case "LOCK_SCREEN":
            if (window.mods && window.mods.lockscreen) window.mods.lockscreen.lock();
            return true;
        case "DEV_DEBUG":
            electron.remote.getCurrentWindow().webContents.toggleDevTools();
            return true;
        case "DEV_RELOAD":
            window.location.reload(true);
            return true;
        default:
            console.warn(`Unknown "${action}" app shortcut action`);
            return false;
    }
};

// Global keyboard shortcuts
const globalShortcut = electron.remote.globalShortcut;
globalShortcut.unregisterAll();

window.registerKeyboardShortcuts = () => {
    window.shortcuts.forEach(cut => {
        if (!cut.enabled) return;

        try {
            if (cut.type === "app") {
                if (cut.action === "TAB_X") {
                    for (let i = 1; i <= 5; i++) {
                        let trigger = cut.trigger.replace("X", i);
                        let dfn = () => { window.useAppShortcut(`TAB_${i}`) };
                        globalShortcut.register(trigger, dfn);
                    }
                } else {
                    globalShortcut.register(cut.trigger, () => {
                        window.useAppShortcut(cut.action);
                    });
                }
            } else if (cut.type === "shell") {
                globalShortcut.register(cut.trigger, () => {
                    let fn = (cut.linebreak) ? "writelr" : "write";
                    window.term[window.currentTerm][fn](cut.action);
                });
            } else {
                console.warn(`${cut.trigger} has unknown type`);
            }
        } catch (e) {
            // User-editable since the shortcuts UI (docs/10-todo.md 10.2) landed -
            // an invalid accelerator string shouldn't take the rest down with it.
            console.warn(`Could not register shortcut "${cut.trigger}": ${e.message}`);
        }
    });
};
window.registerKeyboardShortcuts();

// See #361
window.addEventListener("focus", () => {
    window.registerKeyboardShortcuts();
});

window.addEventListener("blur", () => {
    globalShortcut.unregisterAll();
});

// Prevent showing menu, exiting fullscreen or app with keyboard shortcuts
document.addEventListener("keydown", e => {
    if (e.key === "Alt") {
        e.preventDefault();
    }
    if (e.code.startsWith("Alt") && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
    }
    if (e.key === "F11" && !settings.allowWindowed) {
        e.preventDefault();
    }
    if (e.code === "KeyD" && e.ctrlKey) {
        e.preventDefault();
    }
    if (e.code === "KeyA" && e.ctrlKey) {
        e.preventDefault();
    }
});

// Fix #265
window.addEventListener("keyup", e => {
    if (require("os").platform() === "win32" && e.key === "F4" && e.altKey === true) {
        electron.remote.app.quit();
    }
});

// Fix double-tap zoom on touchscreens
electron.webFrame.setVisualZoomLevelLimits(1, 1);

// Resize terminal with window
window.onresize = () => {
    if (typeof window.currentTerm !== "undefined") {
        if (typeof window.term[window.currentTerm] !== "undefined") {
            window.term[window.currentTerm].fit();
        }
    }
};

// See #413
window.resizeTimeout = null;
let electronWin = electron.remote.getCurrentWindow();
electronWin.on("resize", () => {
    if (settings.keepGeometry === false) return;
    clearTimeout(window.resizeTimeout);
    window.resizeTimeout = setTimeout(() => {
        let win = electron.remote.getCurrentWindow();
        if (win.isFullScreen()) return false;
        if (win.isMaximized()) {
            win.unmaximize();
            win.setFullScreen(true);
            return false;
        }

        let size = win.getSize();

        if (size[0] >= size[1]) {
            win.setSize(size[0], parseInt(size[0] * 9 / 16));
        } else {
            win.setSize(size[1], parseInt(size[1] * 9 / 16));
        }
    }, 100);
});

electronWin.on("leave-full-screen", () => {
    electron.remote.getCurrentWindow().setSize(960, 540);
});
