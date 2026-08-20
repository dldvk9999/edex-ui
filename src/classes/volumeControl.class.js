// System volume control module (docs/10-todo.md 10.1 "Volume control module").
//
// There is no single cross-platform API for the OS master volume, so this
// shells out to whatever each platform already ships:
//   - macOS:   osascript (AppleScript "volume settings")
//   - Linux:   pactl (PulseAudio/PipeWire), falling back to amixer (ALSA)
//   - Windows: no volume CLI ships with the OS, so a small PowerShell+C#
//              helper script (written to a temp file, see WIN_HELPER_SCRIPT
//              below) drives the Core Audio IAudioEndpointVolume COM
//              interface directly.
// If none of these are available (headless Linux with no audio server,
// exotic setups, etc.) the module degrades to a disabled "N/A" state
// instead of erroring repeatedly.
class VolumeControl {
    constructor(parentId) {
        if (!parentId) throw "Missing parameters";

        this.parent = document.getElementById(parentId);
        this.parent.innerHTML += `<div id="mod_volumecontrol">
            <h1>VOLUME<i id="mod_volumecontrol_level">--%</i></h1>
            <div id="mod_volumecontrol_inner">
                <button type="button" id="mod_volumecontrol_mutebtn" title="Toggle mute" onclick="window.mods.volumecontrol.toggleMute()">MUTE</button>
                <input type="range" id="mod_volumecontrol_slider" min="0" max="100" step="1" value="0" disabled>
            </div>
        </div>`;

        this.platform = process.platform;
        this.supported = true; // Optimistic until proven otherwise by a failed call
        this.muted = false;
        this.volume = 0;
        this._busy = false;
        this._debounceTimer = null;
        this._consecutiveFailures = 0;

        this.slider = document.getElementById("mod_volumecontrol_slider");
        this.muteBtn = document.getElementById("mod_volumecontrol_mutebtn");
        this.levelText = document.getElementById("mod_volumecontrol_level");

        // Live label while dragging, but debounce the actual system call so
        // we don't spawn a subprocess on every pixel of slider movement.
        this.slider.addEventListener("input", () => {
            this.levelText.innerText = `${this.slider.value}%`;
            clearTimeout(this._debounceTimer);
            this._debounceTimer = setTimeout(() => {
                this.setVolume(Number(this.slider.value));
            }, 120);
        });

        this.refresh();
        this.updater = setInterval(() => {
            this.refresh();
        }, 3000);
    }

    // --- Platform command helpers -----------------------------------------

    _execFile(cmd, args) {
        return new Promise((resolve, reject) => {
            require("child_process").execFile(cmd, args, {timeout: 4000}, (err, stdout) => {
                if (err) return reject(err);
                resolve(stdout.toString());
            });
        });
    }

    // Windows has no volume CLI, so drive the Core Audio IAudioEndpointVolume
    // COM interface directly through a small PowerShell+C# helper (written
    // once to a temp file and reused). NOTE: this has only been verified
    // against Microsoft's documented interface layout (endpointvolume.h) -
    // it hasn't been run on an actual Windows machine as part of this
    // change, since the fork's dev environment is Linux. Please report any
    // issues on Windows.
    _winScriptPath() {
        if (this._winScriptPathCache) return this._winScriptPathCache;
        let scriptPath = require("path").join(require("os").tmpdir(), "edex-ui-volume-helper.ps1");
        require("fs").writeFileSync(scriptPath, VolumeControl.WIN_HELPER_SCRIPT, {encoding: "utf-8"});
        this._winScriptPathCache = scriptPath;
        return scriptPath;
    }

    _winRun(action, value) {
        let args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", this._winScriptPath(), "-Action", action];
        if (typeof value !== "undefined") args.push("-Value", String(value));
        return this._execFile("powershell.exe", args);
    }

    // --- Get / set volume ---------------------------------------------------

    async getVolume() {
        switch (this.platform) {
            case "darwin": {
                let out = await this._execFile("osascript", ["-e", "output volume of (get volume settings)"]);
                return parseInt(out, 10);
            }
            case "linux": {
                try {
                    let out = await this._execFile("pactl", ["get-sink-volume", "@DEFAULT_SINK@"]);
                    let m = out.match(/(\d+)%/);
                    if (m) return parseInt(m[1], 10);
                } catch (e) { /* fall through to amixer */ }
                let out2 = await this._execFile("amixer", ["get", "Master"]);
                let m2 = out2.match(/\[(\d+)%\]/);
                if (m2) return parseInt(m2[1], 10);
                throw new Error("Could not parse amixer/pactl output");
            }
            case "win32": {
                let out = await this._winRun("get-volume");
                return parseInt(out.trim(), 10);
            }
            default:
                throw new Error(`Unsupported platform: ${this.platform}`);
        }
    }

    async getMuted() {
        switch (this.platform) {
            case "darwin": {
                let out = await this._execFile("osascript", ["-e", "output muted of (get volume settings)"]);
                return out.trim() === "true";
            }
            case "linux": {
                try {
                    let out = await this._execFile("pactl", ["get-sink-mute", "@DEFAULT_SINK@"]);
                    return /yes/i.test(out);
                } catch (e) { /* fall through to amixer */ }
                let out2 = await this._execFile("amixer", ["get", "Master"]);
                return /\[off\]/.test(out2);
            }
            case "win32": {
                let out = await this._winRun("get-mute");
                return out.trim().toLowerCase() === "true";
            }
            default:
                throw new Error(`Unsupported platform: ${this.platform}`);
        }
    }

    async setVolume(val) {
        val = Math.max(0, Math.min(100, Math.round(val)));
        try {
            switch (this.platform) {
                case "darwin":
                    await this._execFile("osascript", ["-e", `set volume output volume ${val}`]);
                    break;
                case "linux":
                    try {
                        await this._execFile("pactl", ["set-sink-volume", "@DEFAULT_SINK@", `${val}%`]);
                    } catch (e) {
                        await this._execFile("amixer", ["set", "Master", `${val}%`]);
                    }
                    break;
                case "win32":
                    await this._winRun("set-volume", val);
                    break;
            }
            this.volume = val;
            this._consecutiveFailures = 0;
        } catch (e) {
            this._onFailure(e);
        }
    }

    async setMuted(val) {
        try {
            switch (this.platform) {
                case "darwin":
                    await this._execFile("osascript", ["-e", `set volume ${val ? "with" : "without"} output muted`]);
                    break;
                case "linux":
                    try {
                        await this._execFile("pactl", ["set-sink-mute", "@DEFAULT_SINK@", val ? "1" : "0"]);
                    } catch (e) {
                        await this._execFile("amixer", ["set", "Master", val ? "mute" : "unmute"]);
                    }
                    break;
                case "win32":
                    await this._winRun("set-mute", val ? "true" : "false");
                    break;
            }
            this.muted = val;
            this._consecutiveFailures = 0;
            this._render();
        } catch (e) {
            this._onFailure(e);
        }
    }

    toggleMute() {
        if (!this.supported) return;
        this.setMuted(!this.muted);
    }

    // --- Polling / rendering -------------------------------------------------

    async refresh() {
        if (this._busy) return;
        this._busy = true;
        try {
            let [vol, muted] = await Promise.all([this.getVolume(), this.getMuted()]);
            this.volume = vol;
            this.muted = muted;
            this._consecutiveFailures = 0;
            if (!this.supported) {
                // Recovered (e.g. pulseaudio started after boot) - re-enable controls
                this.supported = true;
                this.slider.disabled = false;
            }
            this._render();
        } catch (e) {
            this._onFailure(e);
        }
        this._busy = false;
    }

    _onFailure(e) {
        this._consecutiveFailures++;
        if (this._consecutiveFailures === 3 && this.supported) {
            // Give it a few tries (transient errors happen, e.g. pulseaudio
            // restarting) before giving up and disabling the widget.
            this.supported = false;
            this.slider.disabled = true;
            this.levelText.innerText = "N/A";
            console.warn("VolumeControl: system volume control unavailable on this system:", e.message);
        }
    }

    _render() {
        if (!this.supported) return;
        // Don't fight the user while they're actively dragging
        if (document.activeElement !== this.slider) {
            this.slider.value = this.volume;
        }
        this.levelText.innerText = this.muted ? "MUTED" : `${this.volume}%`;
        this.muteBtn.classList.toggle("active", this.muted);
    }
}

// PowerShell helper: wraps the Core Audio "IAudioEndpointVolume" COM
// interface (the same one Windows' own volume slider uses) since Windows
// has no volume CLI. The interface/GUID layout below matches Microsoft's
// documented endpointvolume.h - the numbered "unusedN()" stubs are
// deliberate placeholders standing in for COM vtable slots this module
// doesn't need (RegisterControlChangeNotify, GetChannelCount, per-channel
// volume, etc.) - .NET's COM interop maps interface members to vtable
// slots strictly by declaration order, so every slot before the one we
// actually want has to be accounted for even though it's never called.
VolumeControl.WIN_HELPER_SCRIPT = `
param(
    [Parameter(Mandatory=$true)][string]$Action,
    [string]$Value
)

Add-Type -TypeDefinition @"
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioEndpointVolume {
    int unused1(); int unused2(); int unused3(); int unused4();
    int SetMasterVolumeLevelScalar(float level, System.Guid eventContext);
    int unused5();
    int GetMasterVolumeLevelScalar(out float level);
    int unused6(); int unused7(); int unused8(); int unused9();
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, System.Guid eventContext);
    int GetMute(out bool mute);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDevice {
    int Activate(ref System.Guid iid, int clsCtx, int activationParams, out IAudioEndpointVolume endpointVolume);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDeviceEnumerator {
    int unused1();
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
public class MMDeviceEnumeratorComObject { }

public static class EdexUiVolumeEndpoint {
    public static IAudioEndpointVolume Get() {
        var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
        IMMDevice device;
        // 0 = eRender (output devices), 1 = eMultimedia role
        enumerator.GetDefaultAudioEndpoint(0, 1, out device);
        var iid = typeof(IAudioEndpointVolume).GUID;
        IAudioEndpointVolume endpointVolume;
        // 23 = CLSCTX_ALL
        device.Activate(ref iid, 23, 0, out endpointVolume);
        return endpointVolume;
    }
}
"@

$endpoint = [EdexUiVolumeEndpoint]::Get()

switch ($Action) {
    "get-volume" {
        $level = 0.0
        $endpoint.GetMasterVolumeLevelScalar([ref]$level) | Out-Null
        Write-Output ([Math]::Round($level * 100))
    }
    "set-volume" {
        $endpoint.SetMasterVolumeLevelScalar([float]([double]$Value / 100), [Guid]::Empty) | Out-Null
    }
    "get-mute" {
        $muted = $false
        $endpoint.GetMute([ref]$muted) | Out-Null
        Write-Output $muted.ToString()
    }
    "set-mute" {
        $endpoint.SetMute([System.Boolean]::Parse($Value), [Guid]::Empty) | Out-Null
    }
}
`;

module.exports = {
    VolumeControl
};
