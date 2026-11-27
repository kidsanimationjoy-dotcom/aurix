# Stanford OpenJarvis integration

Stanford OpenJarvis is AURIX's **primary local AI reasoning engine**. It handles the natural-language understanding for spoken and typed AI requests. AURIX remains the computer-control layer: it independently validates every proposed action, displays the plan, and asks the user for approval before performing supported actions. Codex remains available as an optional backup provider.

## How the integration works

- AURIX connects to the OpenJarvis API at the fixed loopback address `http://127.0.0.1:8000`. It does not connect to a remote host.
- AURIX checks the local health endpoint and available model list before sending a request.
- Only recognised speech text or typed text is sent to the local OpenJarvis service. Microphone audio stays in AURIX on this computer.
- AURIX sends its strict action contract with the conversation. OpenJarvis must return one JSON answer or an allowlisted AURIX desktop plan.
- AURIX's existing `AiDesktopCommandParser` independently validates the response against the latest user instruction, exact supported action schema, and app allowlist.
- AURIX shows the validated plan and asks for approval. Supported UI changes still require their own action-level approval.
- AI-proposed clicks and text entry remain restricted to Notepad in this release. Browser and messaging-app mutations are not permitted.
- The existing emergency stop cancels the active OpenJarvis request or remaining approved task steps.
- Codex remains selectable as a backup and continues to use the authenticated AURIX companion and its verified sandbox.

OpenJarvis is not granted direct access to AURIX's desktop-control tools by this connector. It does not receive shell, arbitrary script, general file, browser-navigation, or unrestricted keyboard/mouse capabilities. OpenJarvis's built-in agent tools are not used by this AURIX connection.

## Start the local OpenJarvis API

Install OpenJarvis using its official Windows desktop release or its documented CLI setup. The AURIX connector requires the local API server to be available at `127.0.0.1:8000`.

For a CLI installation with the server dependencies installed, start the API in PowerShell:

```powershell
jarvis serve --host 127.0.0.1 --port 8000 --agent simple
```

The `server` extra is required when installing the CLI from source:

```powershell
uv sync --extra server
```

Use `127.0.0.1`, not `0.0.0.0`, so the API remains available only to processes on this computer. The `simple` agent keeps this AURIX integration from using OpenJarvis's separate built-in tool agents. Keep the API server running while AURIX uses OpenJarvis.

Official project resources:

- https://github.com/open-jarvis/OpenJarvis
- https://openjarvis.stanford.edu/
- https://open-jarvis.github.io/OpenJarvis/deployment/api-server/

## Use OpenJarvis in AURIX

1. Start the OpenJarvis API server on the same Windows computer.
2. Open AURIX Desktop. **Stanford OpenJarvis** is selected by default.
3. Select **Check OpenJarvis** to verify that the API and a local model are available.
4. Enter a request or say **“AURIX”** followed by one instruction.
5. Review any proposed desktop plan. AURIX will perform no AI-proposed desktop action unless you approve it.

To use the backup, select **Codex (backup AI provider)**, connect the local AURIX companion, verify its sandbox, and complete the official Codex sign-in if required.

If OpenJarvis is not ready, check that its API server is running, a model is installed, and it is bound to `127.0.0.1:8000`. If API authentication is configured, set `OPENJARVIS_API_KEY` in the environment inherited by AURIX. Do not put API keys in chat messages, source files, or audit logs.

## Current limits

This is a local OpenJarvis reasoning integration with AURIX's own validated desktop-action pipeline. It does not automatically install OpenJarvis, download model weights, or bundle a model with AURIX. OpenJarvis does not bypass AURIX's app allowlist, action parser, separate approvals, task audit boundaries, or emergency stop. Do not expose the API server to a public or untrusted network.
