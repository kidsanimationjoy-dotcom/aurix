# AURIX Windows Desktop Companion

This is the native Windows desktop companion for AURIX. It is a real WPF desktop process with a system-tray entry point, not a hosted website.

## Implemented in this branch

- Native WPF desktop window with system-tray Open and Exit actions.
- Close-to-tray behaviour. Hiding the window stops microphone listening and cancels remaining task steps.
- Optional local speech dictation. The user must press **Start voice listening**; recognised words are placed in the command box for review and are **not executed automatically**.
- Deterministic, allowlisted launcher for Notepad, Calculator, Paint, File Explorer, Edge, Chrome, Windows Terminal, Discord and Spotify.
- Multi-app launch tasks.
- Read-only inspection of visible window titles and process names.
- Read-only inspection of named UI Automation controls in supported apps. It does not read field values or password controls.
- Exact-name button activation through UI Automation, only after an approval prompt.
- Text entry into an exact-name editable UI Automation field, only after a preview and approval. The field is replaced; the action does not submit a form.
- Destructive button names (delete, remove, erase, format, wipe, uninstall and reset) are blocked.
- Password, PIN, payment-code, token, secret and recovery-code fields are refused.
- Ambiguous or duplicate control matches are refused rather than guessed.
- No coordinate-based clicking or simulated keyboard fallback.
- Emergency stop cancels remaining task steps.
- Microsoft Defender status query and user-confirmed quick-scan request.
- Explicit current-user startup registration.

## First supported commands

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

For a button click, AURIX must find exactly one visible, enabled button with that exact name. It asks for approval before activating it. Buttons whose names suggest sending, sharing, purchasing, paying, transferring, submitting or publishing show an additional warning. Destructive button names are blocked.

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

## Voice requirements and privacy

Voice dictation uses the Windows `System.Speech` recognition API and an installed Windows speech recognizer. A supported English recognizer is preferred, but another installed recognizer may be selected. If Windows has no usable recognizer or microphone input device, voice mode reports an error and typed commands remain available.

Microphone access starts only after the user presses the voice button. Audio is used by the local recognizer and is not uploaded by this feature. Recognised text is only inserted into the command box; the user must review it and press **Run task**. Hiding or exiting AURIX stops voice listening. There is no always-on wake-word or clap listener in this build.

## Important limits

This is an early, bounded computer-use foundation, not yet a general autonomous computer operator or antivirus replacement. It does not yet understand arbitrary natural-language tasks with a connected AI model, perform general screenshot understanding, use a wake phrase or detect claps. It can interact only with a small supported-app list and controls exposed through Windows UI Automation. Microsoft Defender remains responsible for real-time protection and threat remediation.

Do not add hidden microphone capture, covert monitoring, arbitrary command execution, or automatic deletion of files based only on an AI guess. Future computer-control actions must remain visible, scoped, logged and permission-gated. Sensitive operations such as sending messages, changing security settings, purchases, publishing or external sharing require explicit confirmation.
