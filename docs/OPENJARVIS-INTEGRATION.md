# Stanford OpenJarvis integration

Stanford OpenJarvis is AURIX's **primary local AI reasoning engine**. It handles natural-language understanding for spoken and typed AI requests. AURIX remains the computer-control layer: it independently validates every proposed action, displays the plan, and asks the user for approval before performing supported actions. Codex remains available as an optional backup provider.

## Native Windows setup

OpenJarvis provides a native Windows installation path. Start with Stanford's official [Native Windows installation guide](https://open-jarvis.github.io/OpenJarvis/getting-started/windows-native/).

The current native Windows guide lists these prerequisites:

- Windows 10 version 1809 or newer.
- Python 3.11–3.13.
- Git on PATH.
- Microsoft C++ build tools (MSVC linker).
- Approximately 5 GB of free disk space.

The official installer clones OpenJarvis to `%LOCALAPPDATA%\OpenJarvis\src` by default, prepares its desktop/server Python environment, installs `uv`, and creates a `jarvis.cmd` command shim. The installer may offer to register a separate Windows scheduled task. When using AURIX's on-demand server controls, skip that separate scheduled task to avoid running two server managers. Restart AURIX after installation so it can read the updated user PATH.

The installation is performed by Stanford's installer, not by AURIX. AURIX does not download or run the install script itself.

## Start and stop the server from AURIX

1. Open AURIX Desktop.
2. Select **OpenJarvis setup guide** if installation has not been completed.
3. Select **Start local server**. AURIX looks for the native installation under `%LOCALAPPDATA%\OpenJarvis\src` (or the `OPENJARVIS_HOME` location) and the installed `uv.exe`.
4. AURIX launches the fixed command:

   ```powershell
   uv run --project "$env:LOCALAPPDATA\OpenJarvis\src" jarvis serve --host 127.0.0.1 --port 8000 --agent simple
   ```

5. AURIX waits for the local API, checks its health and available model, and selects OpenJarvis as the active provider.
6. Use **Stop local server** when finished. AURIX only stops the server process it started itself. Exiting AURIX stops that process; closing the window to the system tray leaves it running.

If the server is already responding on port 8000, AURIX checks it instead of starting a duplicate. If OpenJarvis was started by its own scheduled task or another terminal, AURIX does not take ownership of it and will not stop it.

## How the integration works

- AURIX connects to the OpenJarvis API at the fixed loopback address `http://127.0.0.1:8000`. It does not connect to a remote host.
- AURIX checks the local health endpoint and available model list before sending a request.
- Only recognised speech text or typed text is sent to the local OpenJarvis service. Microphone audio stays in AURIX on this computer.
- Hands-free wake listens locally for “AURIX” or “Hey AURIX” directly; no clap is required. AURIX says “Yes, boss” before starting one-command dictation.
- AURIX sends its strict action contract with the conversation. OpenJarvis must return one JSON answer or an allowlisted AURIX desktop plan.
- AURIX's existing `AiDesktopCommandParser` independently validates the response against the latest user instruction, exact supported action schema, and app allowlist.
- AURIX shows the validated plan and asks for approval. Supported UI changes still require their own action-level approval.
- AI-proposed clicks and text entry remain restricted to Notepad in this release. Browser and messaging-app mutations are not permitted.
- The existing emergency stop cancels the active OpenJarvis request or remaining approved task steps.
- Codex remains selectable as a backup and continues to use the authenticated AURIX companion and its verified sandbox.

OpenJarvis is not granted direct access to AURIX's desktop-control tools by this connector. It does not receive shell, arbitrary script, general file, browser-navigation, or unrestricted keyboard/mouse capabilities. OpenJarvis's built-in agent tools are not used by this AURIX connection. AURIX launches only the installed `uv.exe` with fixed arguments; it does not accept command text from the model or user for this startup operation.

## Troubleshooting

- **Installation not found:** complete the official native Windows setup and restart AURIX.
- **uv.exe not found:** confirm the official installer completed and added its user-local bin directory to PATH, then restart AURIX.
- **API starts but no model is available:** complete the OpenJarvis inference-engine/model setup in its official guide, then select **Check OpenJarvis**.
- **Port 8000 is already in use:** close the other local service or check whether OpenJarvis is already running. AURIX will not start a duplicate server if something is responding on that port.

Do not expose the local API on `0.0.0.0` or a public network. AURIX intentionally binds to `127.0.0.1`.

## Current limits

AURIX can start and stop the local OpenJarvis API when its native Windows installation is found. It does not install OpenJarvis, automatically download model weights, or bundle the model with AURIX. OpenJarvis does not bypass AURIX's app allowlist, action parser, separate approvals, task audit boundaries, or emergency stop.
