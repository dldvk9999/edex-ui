// Screensaver-style privacy lock (docs/10-todo.md 10.1 "Lock screen
// module"). Triggered by Ctrl+Shift+Z, or window.mods.lockscreen.lock().
//
// IMPORTANT - this is a privacy screen, NOT a real access-control boundary.
// eDEX-UI runs with nodeIntegration:true/contextIsolation:false (see
// docs/07-security.md), so anything already running as the same OS user
// has full access to the underlying process regardless of this overlay.
// What it does protect against: someone glancing at, or casually typing
// into, a terminal you stepped away from.
//
// The password is never stored in plaintext - only a PBKDF2 hash + its
// random salt are written to settings.json (see Settings.writeSettingsFile
// in _renderer.js, which calls LockScreen.hashPassword()).
class LockScreen {
    constructor() {
        document.body.insertAdjacentHTML("beforeend", `<div id="lockscreen">
            <div id="lockscreen_inner">
                <h1>SYSTEM LOCKED</h1>
                <input type="password" id="lockscreen_password" autocomplete="off" spellcheck="false" maxlength="256" placeholder="Password">
                <button type="button" id="lockscreen_unlockbtn" onclick="window.mods.lockscreen.attemptUnlock()">UNLOCK</button>
                <h5 id="lockscreen_status">&nbsp;</h5>
            </div>
        </div>`);

        this.locked = false;
        this.failedAttempts = 0;

        this.el = document.getElementById("lockscreen");
        this.panel = document.getElementById("lockscreen_inner");
        this.input = document.getElementById("lockscreen_password");
        this.status = document.getElementById("lockscreen_status");

        this.input.addEventListener("keydown", e => {
            // Stop keystrokes bubbling anywhere else while typing the
            // password (e.g. into xterm, if it somehow still had a pending
            // buffered event).
            e.stopPropagation();
            if (e.key === "Enter") this.attemptUnlock();
        });
    }

    lock() {
        if (this.locked) return;

        if (!window.settings.lockPasswordHash) {
            new Modal({
                type: "warning",
                title: "No lock password set",
                message: "Set a password first in Settings (Ctrl+Shift+S, \"lockPassword\" field) before locking the screen."
            });
            return;
        }

        this.locked = true;
        this.failedAttempts = 0;
        this.status.innerHTML = "&nbsp;";
        this.el.classList.remove("warning");
        this.input.value = "";

        // Route the on-screen keyboard (and physical typing, which follows
        // DOM focus regardless of this flag) to the password field instead
        // of the terminal - same pattern the Settings editor uses.
        window.keyboard.detach();

        this.el.classList.add("active");
        window.audioManager.info.play();

        setTimeout(() => this.input.focus(), 50);
    }

    unlock() {
        this.locked = false;
        this.failedAttempts = 0;
        this.el.classList.remove("active", "warning");
        this.input.value = "";

        window.keyboard.attach();
        if (window.term && window.term[window.currentTerm]) {
            window.term[window.currentTerm].term.focus();
        }
    }

    attemptUnlock() {
        if (!this.locked) return;

        let entered = this.input.value;
        this.input.value = "";

        const crypto = require("crypto");
        let salt = Buffer.from(window.settings.lockPasswordSalt, "hex");
        let storedHash = Buffer.from(window.settings.lockPasswordHash, "hex");
        let enteredHash = crypto.pbkdf2Sync(entered, salt, 100000, 32, "sha256");

        let match = enteredHash.length === storedHash.length && crypto.timingSafeEqual(enteredHash, storedHash);

        if (match) {
            this.unlock();
            return;
        }

        this.failedAttempts++;
        this.status.innerText = `Incorrect password (${this.failedAttempts} failed attempt${this.failedAttempts === 1 ? "" : "s"})`;

        // Restart the shake animation even on repeated failures
        this.panel.classList.remove("shake");
        void this.panel.offsetWidth;
        this.panel.classList.add("shake");

        if (this.failedAttempts >= 3) {
            this.el.classList.add("warning");
            window.audioManager.alarm.play();
        } else {
            window.audioManager.denied.play();
        }

        setTimeout(() => this.input.focus(), 50);
    }

    // Hashes a new lock password for storage in settings.json. Called from
    // window.writeSettingsFile() in _renderer.js when the Settings editor's
    // "lockPassword" field is non-empty; an empty field leaves the existing
    // hash untouched (there's no way to "clear" the password back to none
    // from the editor other than editing settings.json directly - locking
    // stays opt-in either way since lock() no-ops without a hash set).
    static hashPassword(plaintext) {
        const crypto = require("crypto");
        let salt = crypto.randomBytes(16);
        let hash = crypto.pbkdf2Sync(plaintext, salt, 100000, 32, "sha256");
        return {
            lockPasswordSalt: salt.toString("hex"),
            lockPasswordHash: hash.toString("hex")
        };
    }
}

module.exports = {
    LockScreen
};
