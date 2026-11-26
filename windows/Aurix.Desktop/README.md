# AURIX Windows Desktop Foundation

This is the first native Windows desktop companion project for AURIX.

## Current implemented features

- Native WPF desktop window.
- System-tray presence with Open and Exit actions.
- Close-to-tray behavior.
- Current-user startup registration (explicit button; no silent persistence).
- Microsoft Defender status query.
- User-confirmed Microsoft Defender quick-scan request.
- Fixed PowerShell scripts only; no user/model-generated PowerShell is executed.
- Runs as the signed-in user; it does not request administrator privileges.

## Build on Windows 11

Install the .NET 8 SDK, then from this directory:

```powershell
dotnet build -c Release
dotnet run
```

Publish a self-contained Windows x64 build:

```powershell
dotnet publish -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true
```

The executable will be under `bin/Release/net8.0-windows/win-x64/publish/`.

## Important limits

This is a foundation, not a finished autonomous assistant or antivirus product. It does not yet listen to the microphone, perform wake-word/clap detection, control other applications, run a Windows service, or independently remove files. Microsoft Defender remains responsible for real-time protection and threat remediation. AURIX only reads Defender status and requests a quick scan after user confirmation.

Do not add hidden microphone capture, covert monitoring, arbitrary command execution, or automatic deletion of files based only on an AI guess. Future computer-control actions must be visible, scoped, logged and permission-gated.
