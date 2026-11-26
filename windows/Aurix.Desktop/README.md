# AURIX Windows Desktop Companion

This is the native Windows desktop companion for AURIX. It is a real WPF desktop process with a system-tray entry point, not a hosted website.

## Implemented in this branch

- Native WPF desktop shell with system-tray Open and Exit actions.
- Close-to-tray behavior. Hiding the window also stops microphone listening and cancels any remaining task steps.
- Optional local speech dictation. The user must press **Start voice listening**; recognised words are placed in the command box for review and are **not executed automatically**.
- Local deterministic task planning for a small, explicit allowlist of Windows applications.
- Multi-app launch tasks, for example: `Open Calculator and Notepad`.
- Read-only Windows UI Automation inspection of visible top-level window titles and process names.
- Emergency stop to cancel remaining steps in the current task.
- Microsoft Defender status query and user-confirmed quick-scan request.
- Explicit current-user startup registration.
- No model-generated PowerShell, shell commands, arbitrary executable paths, or silent administrator elevation.

## First supported commands

- `Open Notepad`
- `Open Calculator and Paint`
- `Open File Explorer`
- `Open Edge`
- `Open Chrome`
- `Open Windows Terminal`
- `Open Discord and Spotify`
- `Show open windows`

The launch list is intentionally narrow. An application may fail to launch if it is not installed or Windows cannot resolve its registered executable. AURIX reports that failure instead of claiming success.

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

The publish output is under `bin/Release/net8.0-windows/win-x64/publish/`.

## Voice requirements and privacy

Voice dictation uses the Windows `System.Speech` recognition API and an installed Windows speech recognizer. A supported English recognizer is preferred, but another installed recognizer may be selected. If Windows has no usable recognizer or microphone input device, voice mode reports an error and typed commands remain available.

Microphone access starts only after the user presses the voice button. Audio is used by the local recognizer and is not uploaded by this feature. Recognised text is only inserted into the command box; the user must review it and press **Run task**. Hiding or exiting AURIX stops voice listening. There is no always-on wake-word or clap listener in this build.

## Important limits

This is an early, bounded computer-use foundation, not yet a general autonomous computer operator or antivirus replacement. It cannot yet click buttons, type into other applications, read general screen contents, interpret arbitrary tasks with a connected AI model, use a wake phrase, or detect a clap. The current UI Automation feature reads only visible top-level window titles and process names. Microsoft Defender remains responsible for real-time protection and threat remediation.

Future computer-control actions must remain visible, scoped, logged and permission-gated. Sensitive actions such as sending messages, deleting files, changing security settings, installing software, purchases, publishing or external sharing require explicit confirmation.
