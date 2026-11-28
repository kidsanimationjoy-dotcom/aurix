# AURIX Windows Desktop Companion

This is the native Windows desktop companion for AURIX. It is a real WPF desktop process with a system-tray entry point, not a hosted website.

## Check laptop readiness before enabling hands-free

The portable preview includes a one-click helper named `Run-AURIX-Readiness.cmd` beside `Aurix.Desktop.exe`. Double-click it to open AURIX's native read-only readiness report. The helper launches `Aurix.Desktop.exe --readiness-check` directly; it does not depend on running an unsigned PowerShell script or changing PowerShell execution policy. The report checks Windows version and architecture, available waveform-audio input device count, installed offline English speech recognizers, and the optional machine-wide microphone policy. It does not open the microphone, record or upload audio, change privacy settings, or bypass SmartScreen/Defender. A warning is a prompt to review Windows Settings → System → Sound → Input and Settings → Privacy & security → Microphone.

The report cannot prove that the microphone works, that Windows consent is enabled, or that the wake phrase is accurate. Those require a live test on this laptop after a trusted build is available.

## Hands-free voice behaviour

AURIX can stay in the Windows system tray with hands-free wake-word listening enabled:

1. Enable **hands-free** once in the AURIX window.
2. Say **“AURIX”** or **“Hey AURIX”** at a normal speaking volume. No clap or other physical trigger is required.
3. AURIX displays its larger multicolour orb near the bottom centre of the primary display and says, **“Yes, boss. What would you like me to do?”**
4. After the greeting finishes, speak one instruction. AURIX sends the recognised text to its selected local AI provider or bounded local task planner.
5. After one command, AURIX returns to wake-only mode; the orb stays hidden while idle.

You do not need to reopen the window or press a microphone button for each task. Closing the window hides it to the tray; it does not stop an enabled wake-word listener. The tray menu lets you pause or resume listening. The tray tooltip indicates whether the wake-word listener is active. **Exit AURIX** stops the process and releases the microphone.

Hands-free opt-in is saved for the current Windows user. If you also press **Enable start with Windows**, AURIX registers itself to launch hidden in the tray at sign-in and restores hands-free mode if it was enabled. Pausing hands-free turns off the saved preference, so the next sign-in will not reactivate the microphone until you enable it again.

## Local AI conversation

Stanford OpenJarvis is the default AI reasoning engine for AURIX. It handles ordinary questions and proposes supported desktop tasks. AURIX—not the model—validates every plan and controls whether an action can run.

### One-time OpenJarvis setup

1. Select **OpenJarvis setup guide** in AURIX. This opens Stanford's official [native Windows installation guide](https://open-jarvis.github.io/OpenJarvis/getting-started/windows-native/).
2. Check the prerequisites listed there: Windows 10 1809 or newer, Python 3.11–3.13, Git, MSVC build tools, and roughly 5 GB free disk space.
3. Complete the official installation. The native installer places the source under `%LOCALAPPDATA%\\OpenJarvis\\src` by default and prepares the `uv` environment. Skip its separate scheduled task when AURIX should manage the server for the current session.
4. Install a supported inference backend and model using the official OpenJarvis guide. Installing the OpenJarvis runtime alone does not mean a model is ready.
5. Close and reopen AURIX after installation so Windows PATH changes are visible to the app.

### Direct Ollama local model option

Ollama is an additional direct local provider and a no-API-key fallback. AURIX only connects to `127.0.0.1:11434`; it does not use Ollama Cloud.

1. Select **Install local Ollama model** in AURIX, or use the official [Ollama for Windows download](https://ollama.com/download/windows).
2. Open Ollama and let its local service start.
3. In Windows Terminal, run `ollama run qwen3.5:2b` once to download and start the small Qwen 3.5 2B model. The model download takes disk space; actual speed depends on the laptop's memory and hardware. The [Ollama model page](https://ollama.com/library/qwen3.5:2b) lists the current model details.
4. In AURIX, select **Ollama (direct local AI, no API key)** to use it directly. AURIX detects installed models and prefers `qwen3.5:2b` when present; otherwise it uses an installed local model.

Ollama's local OpenAI-compatible endpoint is used only on loopback. Prompts are sent as text; audio is never sent to Ollama. AURIX does not download models in the background or install Ollama for you.

### Daily use

1. Open AURIX Desktop and enable **hands-free** once.
2. Say **“AURIX”** or **“Hey AURIX”**. No clap is required. AURIX says **“Yes, boss. What would you like me to do?”**
3. Speak one instruction after the greeting, or type it into the manual task box.
4. For OpenJarvis, select **Start local server** and wait until the health check and model are ready. For Ollama, make sure the Ollama desktop service is running and a local model is installed.
5. AURIX uses OpenJarvis first by default. If its local readiness check fails, AURIX tries a paired and ready Codex backup, then checks for local Ollama. You can also select Ollama or Codex directly in the provider list.
6. Select **Stop local server** when finished. Exiting AURIX stops only an OpenJarvis server process AURIX started itself.

AURIX sends recognised speech as text to the selected local AI provider; microphone audio stays on this PC. The model returns an answer or a proposed plan. AURIX independently validates the result against its action schema, supported applications, and the user's latest instruction. It displays a proposed plan and asks for approval before execution.

AI-proposed button actions are limited to Notepad, Paint and Calculator, require exact user-named targets and individual approval, and are blocked for destructive or external-impact controls. Text entry remains limited to Notepad, with a separate approval. Browser navigation, messaging, arbitrary shell commands and unrestricted keyboard/mouse control are not exposed to the model.

**Codex remains an optional authenticated backup provider.** Select it in the AI provider menu, connect the local AURIX companion, verify its operating-system sandbox, and complete the official Codex sign-in if required.

The last 12 user/assistant turns are kept in memory for the current desktop session only; use **Clear conversation** to erase this in-memory context. AURIX's audit log records bounded task metadata rather than dictated instructions or entered text.

## Voice privacy and requirements

The hands-free service uses System.Speech and a locally installed English Windows speech recognizer. While waiting, it loads only the narrow AURIX / Hey AURIX wake grammar and does not run general dictation. Once the wake phrase is accepted, AURIX speaks its boss greeting; only when the greeting finishes does it load a one-command dictation grammar. After that command, dictation is unloaded and the wake grammar is restored. Audio is processed locally and is not saved or sent to an AURIX cloud service.

AURIX itself does not save microphone recordings or send room audio to an AURIX cloud service. The microphone remains active for local wake-word detection while hands-free is enabled. You can pause it from the main window or the tray menu, and exiting AURIX releases it. Windows microphone privacy settings still apply. If an English offline recognizer or microphone device is unavailable, AURIX reports the problem and typed commands remain available.

The wake phrase currently supports the recognizer's English pronunciation of “AURIX” and “Hey AURIX”. Wake-word reliability and pronunciation may vary across Windows recognizer installations and microphones; this build has passed its Windows compile and packaging checks, but live wake-word detection must still be tested on the target laptop.

## Other implemented features

- Native WPF desktop window with system-tray Open and Exit actions.
- Close-to-tray behaviour and optional current-user startup registration.
- Deterministic, allowlisted launcher for Notepad, Calculator, Paint, File Explorer, Edge, Chrome, Windows Terminal, Discord and Spotify.
- Multi-app launch tasks.
- Read-only inspection of visible window titles and process names.
- Read-only inspection of named UI Automation controls in supported apps. Field contents and password controls are not read.
- Exact-name button activation through UI Automation, only after an approval prompt.
- Text entry into an exact-name editable UI Automation field, only after a preview and approval. The field is replaced; the action does not submit a form.
- Destructive button names (delete, remove, erase, format, wipe, uninstall and reset) are blocked.
- Password, PIN, payment-code, token, secret and recovery-code fields are refused.
- Ambiguous or duplicate control matches are refused rather than guessed.
- No coordinate-based clicking or simulated keyboard fallback.
- Emergency stop cancels remaining task steps.
- Local task audit log records action type, target application, timestamp and outcome.
- Audit log intentionally excludes dictated instructions, entered field contents, window titles and exception messages.
- Startup registration can be enabled or disabled from the AURIX window.
- Microsoft Defender status query and user-confirmed quick-scan request.

## First supported task commands

- `Open Notepad`
- `Open Calculator and Paint`
- `Open File Explorer`
- `Open Edge`
- `Open Chrome`
- `Open Windows Terminal`
- `Open Discord and Spotify`
- `Show open windows`
- `Inspect controls in Notepad`
- `Click button "Save" in Notepad`
- `Type "Hello AURIX" into "Search" in Edge`

Spoken commands are submitted after one wake phrase and one utterance. The local task planner accepts only its documented desktop command patterns. Other voice requests can use the local Codex reasoning path described above. AI-proposed clicks and text entry are limited to Notepad; the documented deterministic commands retain their own per-action approval prompts in the apps they explicitly support.

For a button click, AURIX must find exactly one visible, enabled button with that exact name. Buttons whose names suggest sending, sharing, purchasing, paying, transferring, submitting or publishing display an additional warning. Destructive button names are blocked.

For text entry, AURIX must find exactly one visible editable field with the exact name requested. It shows the text preview and asks for approval before replacing the field's current value. It will not submit the form. UI Automation providers differ, so some applications or fields may not expose a usable named control; AURIX reports that limitation rather than forcing input.

## Local task audit log

AURIX stores task execution metadata in `%LOCALAPPDATA%\\AURIX\\Desktop\\task-audit.jsonl`. The in-app **Open task log** control opens that folder. The log records only the action type, supported target application, UTC timestamp and outcome. It does not store spoken instructions, entered text, window titles or exception messages. The log is local to the current Windows account and rotates at a bounded size.

## Remove the portable preview

This CI package is a portable preview, not an installer. Before deleting its extracted folder:

1. Pause hands-free from the main window or tray so the microphone is released.
2. Use **Disable start with Windows** in AURIX.
3. Exit AURIX from the tray menu.
4. Delete the folder where you extracted the preview package.

The local task audit folder under `%LOCALAPPDATA%\\AURIX\\Desktop` and the per-user wake-word preference may remain after the app folder is deleted. The audit folder contains only the limited task metadata described above. The preview has no automatic uninstaller or updater.

## Build on Windows 11

Install the .NET 8 SDK, then from this directory:

```powershell
dotnet restore
dotnet build -c Release
dotnet run
```

Publish a self-contained Windows x64 build:

```powershell
dotnet publish -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true
```

The GitHub Actions workflow builds and uploads a `AURIX-Windows-x64` ZIP artifact for each eligible branch run.
