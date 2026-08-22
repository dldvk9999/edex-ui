const signale = require("signale");
const {app, BrowserWindow, dialog, shell, Menu} = require("electron");

process.on("uncaughtException", e => {
    signale.fatal(e);
    dialog.showErrorBox("eDEX-UI crashed", e.message || "Cannot retrieve error message.");
    if (tty) {
        tty.close();
    }
    if (extraTtys) {
        Object.keys(extraTtys).forEach(key => {
            if (extraTtys[key] !== null) {
                extraTtys[key].close();
            }
        });
    }
    process.exit(1);
});

signale.start(`Starting eDEX-UI v${app.getVersion()}`);
signale.info(`With Node ${process.versions.node} and Electron ${process.versions.electron}`);
signale.info(`Renderer is Chrome ${process.versions.chrome}`);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    signale.fatal("Error: Another instance of eDEX is already running. Cannot proceed.");
    app.exit(1);
}

signale.time("Startup");

const electron = require("electron");
require('@electron/remote/main').initialize()
const ipc = electron.ipcMain;
const path = require("path");
const url = require("url");
const fs = require("fs");
const which = require("which");
const Terminal = require("./classes/terminal.class.js").Terminal;

ipc.on("log", (e, type, content) => {
    signale[type](content);
});

var win, tty, extraTtys;
const settingsFile = path.join(electron.app.getPath("userData"), "settings.json");
const shortcutsFile = path.join(electron.app.getPath("userData"), "shortcuts.json");
const lastWindowStateFile = path.join(electron.app.getPath("userData"), "lastWindowState.json");
const lastSessionFile = path.join(electron.app.getPath("userData"), "lastSession.json");
const sshProfilesFile = path.join(electron.app.getPath("userData"), "sshProfiles.json");
const themesDir = path.join(electron.app.getPath("userData"), "themes");
const innerThemesDir = path.join(__dirname, "assets/themes");
const kblayoutsDir = path.join(electron.app.getPath("userData"), "keyboards");
const innerKblayoutsDir = path.join(__dirname, "assets/kb_layouts");
const fontsDir = path.join(electron.app.getPath("userData"), "fonts");
const innerFontsDir = path.join(__dirname, "assets/fonts");

// Unset proxy env variables to avoid connection problems on the internal websockets
// See #222
if (process.env.http_proxy) delete process.env.http_proxy;
if (process.env.https_proxy) delete process.env.https_proxy;

// Bypass GPU acceleration blocklist, trading a bit of stability for a great deal of performance, mostly on Linux
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-video-decode");

// Fix userData folder not setup on Windows
try {
    fs.mkdirSync(electron.app.getPath("userData"));
    signale.info(`Created config dir at ${electron.app.getPath("userData")}`);
} catch(e) {
    signale.info(`Base config dir is ${electron.app.getPath("userData")}`);
}
// Create default settings file
if (!fs.existsSync(settingsFile)) {
    fs.writeFileSync(settingsFile, JSON.stringify({
        shell: (process.platform === "win32") ? "powershell.exe" : "bash",
        shellArgs: '',
        cwd: electron.app.getPath("userData"),
        keyboard: "en-US",
        theme: "tron",
        termFontSize: 15,
        audio: true,
        audioVolume: 1.0,
        disableFeedbackAudio: false,
        clockHours: 24,
        pingAddr: "1.1.1.1",
        port: 3000,
        nointro: false,
        nocursor: false,
        forceFullscreen: true,
        allowWindowed: false,
        excludeThreadsFromToplist: true,
        hideDotfiles: false,
        fsListView: false,
        experimentalGlobeFeatures: false,
        experimentalFeatures: false,
        restoreSession: false,
        keyboardHidden: false
    }, "", 4));
    signale.info(`Default settings written to ${settingsFile}`);
}
// Create default shortcuts file
if (!fs.existsSync(shortcutsFile)) {
    fs.writeFileSync(shortcutsFile, JSON.stringify([
        { type: "app", trigger: "Ctrl+Shift+C", action: "COPY", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+V", action: "PASTE", enabled: true },
        { type: "app", trigger: "Ctrl+Tab", action: "NEXT_TAB", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+Tab", action: "PREVIOUS_TAB", enabled: true },
        { type: "app", trigger: "Ctrl+X", action: "TAB_X", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+S", action: "SETTINGS", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+K", action: "SHORTCUTS", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+O", action: "SSH_PROFILES", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+F", action: "FUZZY_SEARCH", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+A", action: "LAUNCH_APP", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+G", action: "FIND_IN_TERMINAL", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+L", action: "FS_LIST_VIEW", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+H", action: "FS_DOTFILES", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+P", action: "KB_PASSMODE", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+B", action: "TOGGLE_KEYBOARD", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+T", action: "THEME_EDITOR", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+Z", action: "LOCK_SCREEN", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+I", action: "DEV_DEBUG", enabled: false },
        { type: "app", trigger: "Ctrl+Shift+F5", action: "DEV_RELOAD", enabled: true },
        { type: "shell", trigger: "Ctrl+Shift+Alt+Space", action: "neofetch", linebreak: true, enabled: false }
    ], "", 4));
    signale.info(`Default keymap written to ${shortcutsFile}`);
}
//Create default window state file
if(!fs.existsSync(lastWindowStateFile)) {
    fs.writeFileSync(lastWindowStateFile, JSON.stringify({
        useFullscreen: true
    }, "", 4));
    signale.info(`Default last window state written to ${lastWindowStateFile}`);
}
// Create default SSH profiles file (docs/10-todo.md 10.2 "SSH profile manager")
if (!fs.existsSync(sshProfilesFile)) {
    fs.writeFileSync(sshProfilesFile, JSON.stringify([], "", 4));
    signale.info(`Default SSH profiles file written to ${sshProfilesFile}`);
}

// Copy default themes & keyboard layouts & fonts
signale.pending("Mirroring internal assets...");
// mkdir-if-missing + copy every file from the bundled inner dir into the
// user-writable outer one. `binary: true` skips the utf-8 decode/re-encode
// round-trip for font files, which aren't text.
function mirrorAssetDir(innerDir, outerDir, binary) {
    try {
        fs.mkdirSync(outerDir);
    } catch (e) {
        // Folder already exists
    }
    fs.readdirSync(innerDir).forEach(e => {
        let content = binary
            ? fs.readFileSync(path.join(innerDir, e))
            : fs.readFileSync(path.join(innerDir, e), {encoding: "utf-8"});
        fs.writeFileSync(path.join(outerDir, e), content);
    });
}
mirrorAssetDir(innerThemesDir, themesDir, false);
mirrorAssetDir(innerKblayoutsDir, kblayoutsDir, false);
mirrorAssetDir(innerFontsDir, fontsDir, true);

// Version history logging
const versionHistoryPath = path.join(electron.app.getPath("userData"), "versions_log.json");
var versionHistory = fs.existsSync(versionHistoryPath) ? require(versionHistoryPath) : {};
var version = app.getVersion();
if (typeof versionHistory[version] === "undefined") {
	versionHistory[version] = {
		firstSeen: Date.now(),
		lastSeen: Date.now()
	};
} else {
	versionHistory[version].lastSeen = Date.now();
}
fs.writeFileSync(versionHistoryPath, JSON.stringify(versionHistory, 0, 2), {encoding:"utf-8"});

// Explicit application menu with a real "Preferences" item wired to the in-app
// Settings UI (window.openSettings(), see src/_renderer.js). Without this, Electron
// falls back to its own default menu template, which has no Preferences entry
// anywhere - on macOS in particular, Cocoa/AppKit still surfaces a "Preferences…"
// item as OS boilerplate even then, and clicking it did nothing since nothing was
// ever wired to it (docs/10-todo.md 10.3, "'Preferences' menu item does nothing").
function registerApplicationMenu() {
    const isMac = process.platform === "darwin";
    const openPreferences = () => {
        if (win && !win.isDestroyed()) win.webContents.send("open-settings");
    };

    const template = [
        ...(isMac ? [{
            label: app.name,
            submenu: [
                {role: "about"},
                {type: "separator"},
                {label: "Preferences…", accelerator: "CmdOrCtrl+,", click: openPreferences},
                {type: "separator"},
                {role: "services"},
                {type: "separator"},
                {role: "hide"},
                {role: "hideOthers"},
                {role: "unhide"},
                {type: "separator"},
                {role: "quit"}
            ]
        }] : []),
        {
            label: "File",
            submenu: [
                ...(isMac ? [] : [{label: "Preferences…", accelerator: "CmdOrCtrl+,", click: openPreferences}, {type: "separator"}]),
                isMac ? {role: "close"} : {role: "quit"}
            ]
        },
        {role: "editMenu"},
        {role: "viewMenu"},
        {role: "windowMenu"}
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(settings) {
    signale.info("Creating window...");

    let display;
    if (!isNaN(settings.monitor)) {
        display = electron.screen.getAllDisplays()[settings.monitor] || electron.screen.getPrimaryDisplay();
    } else {
        display = electron.screen.getPrimaryDisplay();
    }
    let {x, y, width, height} = display.bounds;
    width++; height++;
    win = new BrowserWindow({
        title: "eDEX-UI",
        x,
        y,
        width,
        height,
        show: false,
        resizable: true,
        movable: settings.allowWindowed || false,
        fullscreen: settings.forceFullscreen || false,
        autoHideMenuBar: true,
        frame: settings.allowWindowed || false,
        backgroundColor: '#000000',
        webPreferences: {
            devTools: true,
	    enableRemoteModule: true,
            contextIsolation: false,
            backgroundThrottling: false,
            webSecurity: true,
            nodeIntegration: true,
            nodeIntegrationInSubFrames: false,
            allowRunningInsecureContent: false,
            experimentalFeatures: settings.experimentalFeatures || false
        }
    });

    win.loadURL(url.format({
        pathname: path.join(__dirname, 'ui.html'),
        protocol: 'file:',
        slashes: true
    }));

    registerApplicationMenu();

    signale.complete("Frontend window created!");
    win.show();
    if (!settings.allowWindowed) {
        win.setResizable(false);
    } else if (!require(lastWindowStateFile)["useFullscreen"]) {
        win.setFullScreen(false);
    }

    signale.watch("Waiting for frontend connection...");
}

app.on('ready', async () => {
    signale.pending(`Loading settings file...`);
    let settings = require(settingsFile);
    signale.pending(`Resolving shell path...`);
    settings.shell = await which(settings.shell).catch(e => { throw(e) });
    signale.info(`Shell found at ${settings.shell}`);
    signale.success(`Settings loaded!`);

    // Session restore (docs/10-todo.md 10.2 "Session/layout save & restore") - opt-in via
    // settings.restoreSession. Only the main tab's cwd is handled here; extra tabs (1-4)
    // are recreated by the renderer after boot via the "ttyspawn" IPC below.
    if (settings.restoreSession && fs.existsSync(lastSessionFile)) {
        try {
            let lastSession = JSON.parse(fs.readFileSync(lastSessionFile, "utf-8"));
            if (lastSession.mainCwd && fs.existsSync(lastSession.mainCwd)) {
                settings.cwd = lastSession.mainCwd;
            }
        } catch (e) {
            signale.warn(`Could not read lastSession.json, ignoring. (${e.message})`);
        }
    }

    if (!require("fs").existsSync(settings.cwd)) throw new Error("Configured cwd path does not exist.");

    // See #366
    let cleanEnv = await require("shell-env")(settings.shell).catch(e => { throw e; });

    Object.assign(cleanEnv, {
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        TERM_PROGRAM: "eDEX-UI",
        TERM_PROGRAM_VERSION: app.getVersion()
    }, settings.env);

    signale.pending(`Creating new terminal process on port ${settings.port || '3000'}`);
    tty = new Terminal({
        role: "server",
        shell: settings.shell,
        params: settings.shellArgs || '',
        cwd: settings.cwd,
        env: cleanEnv,
        port: settings.port || 3000
    });
    signale.success(`Terminal back-end initialized!`);
    tty.onclosed = (code, signal) => {
        tty.ondisconnected = () => {};
        signale.complete("Terminal exited", code, signal);
        app.quit();
    };
    tty.onopened = () => {
        signale.success("Connected to frontend!");
        signale.timeEnd("Startup");
    };
    tty.onresized = (cols, rows) => {
        signale.info("Resized TTY to ", cols, rows);
    };
    tty.ondisconnected = () => {
        signale.error("Lost connection to frontend");
        signale.watch("Waiting for frontend connection...");
    };

    // Support for multithreaded systeminformation calls
    signale.pending("Starting multithreaded calls controller...");
    require("./_multithread.js");

    createWindow(settings);

    // Real in-app auto-update (docs/10-todo.md 10.3), building on the
    // publish config in package.json (electron-builder already writes the
    // latest.yml/app-update.yml metadata electron-updater reads at build
    // time, since "publish" is configured there).
    //
    // Skipped entirely on macOS: electron-updater's Squirrel.Mac backend
    // needs a code-signed app to work, and this project ships unsigned
    // .dmg builds on purpose (docs/06-build-and-deployment.md - no Apple
    // Developer certificate available). Trying to auto-update there would
    // just fail (or worse, half-succeed into a broken app bundle). macOS
    // users still get the existing GitHub-Releases-polling notification
    // (updateChecker.class.js, renderer-side) telling them a new version
    // exists and linking out to download it manually - that one doesn't
    // depend on code signing since it never touches the installed bundle.
    //
    // Also skipped when running unpackaged (`npm start` / dev), since
    // there's no installed app for electron-updater to replace.
    if (process.platform !== "darwin" && app.isPackaged) {
        const { autoUpdater } = require("electron-updater");
        autoUpdater.autoDownload = false;
        autoUpdater.autoInstallOnAppQuit = false;

        autoUpdater.on("update-available", info => {
            signale.info(`electron-updater: update ${info.version} available`);
            if (win && !win.isDestroyed()) win.webContents.send("autoupdate", "available", {version: info.version});
        });
        autoUpdater.on("update-not-available", () => {
            signale.info("electron-updater: already up to date");
        });
        autoUpdater.on("update-downloaded", () => {
            signale.success("electron-updater: update downloaded, ready to install");
            if (win && !win.isDestroyed()) win.webContents.send("autoupdate", "downloaded");
        });
        autoUpdater.on("error", e => {
            // Never fatal - worst case, the user just doesn't get an
            // auto-update prompt this run and can still update manually.
            signale.warn(`electron-updater: ${e.message}`);
        });

        ipc.on("autoupdate-action", (e, action) => {
            if (action === "download") autoUpdater.downloadUpdate().catch(e => signale.warn(`electron-updater: download failed: ${e.message}`));
            if (action === "install") autoUpdater.quitAndInstall();
        });

        // Give the window/renderer time to finish loading before checking,
        // so the "update available" IPC message isn't sent before anything
        // is listening for it.
        setTimeout(() => {
            autoUpdater.checkForUpdates().catch(e => signale.warn(`electron-updater: check failed: ${e.message}`));
        }, 15000);
    }

    // Support for more terminals, used for creating tabs (currently limited to 4 extra terms)
    extraTtys = {};
    let basePort = settings.port || 3000;
    basePort = Number(basePort) + 2;

    for (let i = 0; i < 4; i++) {
        extraTtys[basePort+i] = null;
    }

    // Called by the renderer just before a UI reload (Ctrl+R / "Reload UI").
    // Without this, extra terminal tabs' backend TTYs and websocket servers
    // survive the reload while the renderer's tab state is wiped, leaking
    // shells/ports and crashing the app when a previously-open tab is
    // reopened after a few reloads (see #630).
    ipc.on("closeExtraTtys", e => {
        Object.keys(extraTtys).forEach(key => {
            if (extraTtys[key] !== null) {
                try {
                    extraTtys[key].onclosed = () => {};
                    extraTtys[key].ondisconnected = () => {};
                    extraTtys[key].close();
                    extraTtys[key].wss.close();
                } catch (err) {
                    // Already closed/closing, ignore
                }
                extraTtys[key] = null;
            }
        });
        e.returnValue = true;
    });

    ipc.on("ttyspawn", (e, requestId, requestedCwd) => {
        let port = null;
        Object.keys(extraTtys).forEach(key => {
            if (extraTtys[key] === null && port === null) {
                extraTtys[key] = {};
                port = key;
            }
        });

        if (port === null) {
            signale.error("TTY spawn denied (Reason: exceeded max TTYs number)");
            e.sender.send("ttyspawn-reply-"+requestId, "ERROR: max number of ttys reached");
        } else {
            // Used to restore a tab's own cwd on session restore (falls back to the
            // main tab's current cwd - the pre-existing behavior - if unset/invalid).
            let spawnCwd = tty.tty._cwd || settings.cwd;
            if (requestedCwd && fs.existsSync(requestedCwd)) {
                spawnCwd = requestedCwd;
            }

            signale.pending(`Creating new TTY process on port ${port}`);
            let term = new Terminal({
                role: "server",
                shell: settings.shell,
                params: settings.shellArgs || '',
                cwd: spawnCwd,
                env: cleanEnv,
                port: port
            });
            signale.success(`New terminal back-end initialized at ${port}`);
            term.onclosed = (code, signal) => {
                term.ondisconnected = () => {};
                term.wss.close();
                signale.complete(`TTY exited at ${port}`, code, signal);
                extraTtys[term.port] = null;
                term = null;
            };
            term.onopened = pid => {
                signale.success(`TTY ${port} connected to frontend (process PID ${pid})`);
            };
            term.onresized = () => {};
            term.ondisconnected = () => {
                term.onclosed = () => {};
                term.close();
                term.wss.close();
                extraTtys[term.port] = null;
                term = null;
            };

            extraTtys[port] = term;
            e.sender.send("ttyspawn-reply-"+requestId, "SUCCESS: "+port);
        }
    });

    // Backend support for theme and keyboard hotswitch
    let themeOverride = null;
    let kbOverride = null;
    ipc.on("getThemeOverride", (e, arg) => {
        e.sender.send("getThemeOverride", themeOverride);
    });
    ipc.on("getKbOverride", (e, arg) => {
        e.sender.send("getKbOverride", kbOverride);
    });
    ipc.on("setThemeOverride", (e, arg) => {
        themeOverride = arg;
    });
    ipc.on("setKbOverride", (e, arg) => {
        kbOverride = arg;
    });
});

app.on('web-contents-created', (e, contents) => {
    // Prevent creating more than one window
    contents.on('new-window', (e, url) => {
        e.preventDefault();
        shell.openExternal(url);
    });

    // Prevent loading something else than the UI
    contents.on('will-navigate', (e, url) => {
        if (url !== contents.getURL()) e.preventDefault();
    });
});

app.on('window-all-closed', () => {
    signale.info("All windows closed");
    app.quit();
});

app.on('before-quit', () => {
    tty.close();
    Object.keys(extraTtys).forEach(key => {
        if (extraTtys[key] !== null) {
            extraTtys[key].close();
        }
    });
    signale.complete("Shutting down...");
});
