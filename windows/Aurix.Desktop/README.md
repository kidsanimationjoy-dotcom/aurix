# AURIX Windows Desktop Companion

This is the native Windows desktop companion for AURIX. It is a real WPF desktop process with a system-tray entry point, not a hosted website.

## Hands-free voice behaviour

AURIX can stay in the Windows system tray with hands-free wake-word listening enabled:

1. Enable **hands-free** once in the AURIX window.
2. Say **“AURIX”** or **“Hey AURIX”**.
3. Pause briefly while AURIX switches from its wake-word grammar to one-command dictation.
4. Speak one instruction. AURIX sends the recognised text to its local task planner.
5. After one command, AURIX returns to the wake-word-only grammar.

You do not need to reopen the window or press a microphone button for each task. Closing the window hides it to the tray; it does not stop an enabled wake-word listener. The tray menu lets you pause or resume listening. The tray tooltip indicates whether the wake-word listener is active. **Exit AURIX** stops the process and releases the microphone.

Hands-free opt-in is saved for the current Windows user. If you also press **Enable start with Windows**, AURIX registers itself to launch hidden in the tray at sign-in and restores hands-free mode if it was enabled. Pausing hands-free turns off the saved preference, so the next sign-in will not reactivate the microphone until you enable it again.

## Local AI conversation

The Windows companion can route ordinary spoken questions to the separate AURIX Codex profile through the authenticated loopback companion:

1. Start the Node companion on this same PC at its default address, `http://127.0.0.1:4317`.
2. Copy the pairing token printed in that companion terminal into **Local AI Chat → Connect**. AURIX stores it encrypted with Windows DPAPI for the current Windows user.
3. Use **Verify AI sandbox** and wait for the local Codex profile and operating-system sandbox check to pass.
4. If Codex is not signed in, use **Sign in to Codex** and complete the official sign-in in the companion terminal.
5. Say “AURIX” and ask a question. Requests that do not match a supported local desktop command are sent as text to the local Codex CLI; the microphone audio is not sent.

When a voice request does not match a built-in command, local Codex may return either a normal answer or a JSON desktop-action proposal. AURIX validates proposals against the strict action schema and the existing application allowlist. AI proposals may launch allowlisted apps and inspect visible windows or named controls across supported apps, but AI-proposed button clicks and text entry are restricted to Notepad only. Browsers, messaging clients and other connected apps cannot receive AI-proposed UI mutations in this release. A proposed plan is shown for approval before execution; Notepad button clicks and text entry still require their own separate approvals. The existing deterministic command grammar continues to allow explicitly named actions in its documented supported apps, with the same per-action approval prompts. AURIX does not run arbitrary shell commands, scripts, general filesystem operations, network actions or unrestricted mouse/keyboard automation. The last 12 user/assistant turns are kept in memory for the current desktop session only; use **Clear conversation** to erase that in-memory context. An emergency stop cancels the in-flight chat request or stops remaining desktop task steps.

The pairing token is encrypted for the current Windows user and is not written to the task audit log. The local companion must remain running. The desktop companion does not bypass the Codex plan, account, or usage limits.

## Voice privacy and requirements

The hands-free service uses `System.Speech` and a locally installed English Windows speech recognizer. While waiting, it loads a narrow grammar containing only the AURIX wake phrase choices; it does not run general dictation in the background. Only after the wake phrase is recognised does it load a dictation grammar for one instruction. The dictation grammar is unloaded after that command and the wake-word grammar is restored.

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
