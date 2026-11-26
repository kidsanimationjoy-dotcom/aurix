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

Spoken commands are submitted after one wake phrase and one utterance. The task planner still accepts only its documented local command patterns; the connected AI reasoning layer is not implemented yet. Actions that change another app still require their existing approval prompt.

For a button click, AURIX must find exactly one visible, enabled button with that exact name. Buttons whose names suggest sending, sharing, purchasing, paying, transferring, submitting or publishing display an additional warning. Destructive button names are blocked.

For text entry, AURIX must find exactly one visible editable field with the exact name requested. It shows the text preview and asks for approval before replacing the field's current value. It will not submit the form. UI Automation providers differ, so some applications or fields may not expose a usable named control; AURIX reports that limitation rather than forcing input.

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
