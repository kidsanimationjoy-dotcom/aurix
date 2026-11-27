# Stanford OpenJarvis integration

AURIX can optionally use Stanford's OpenJarvis as a local conversational AI provider.

## What this integration does

- Checks the OpenJarvis local health endpoint and available model list.
- Sends recent chat text to the OpenAI-compatible local chat-completions endpoint.
- Connects only to the fixed loopback address `http://127.0.0.1:8000`.
- Uses the optional `OPENJARVIS_API_KEY` environment variable when the local server has authentication enabled.
- Keeps microphone audio local to AURIX. Only the recognised text is sent to the local OpenJarvis process.
- Keeps OpenJarvis chat separate from AURIX desktop control. OpenJarvis receives no AURIX desktop-control tools in this integration. Its replies cannot execute clicks, keyboard input, shell commands, or file operations through AURIX.
- Leaves the existing Codex integration and AURIX's independent task planner and approval prompts available.

## Install and start OpenJarvis

Install OpenJarvis using the official Windows installer or the Windows desktop release linked from the official project site:

- https://github.com/open-jarvis/OpenJarvis
- https://openjarvis.stanford.edu/

Complete its local model setup and confirm that a model is available. Then start the local API server in PowerShell:

```powershell
jarvis serve --host 127.0.0.1 --port 8000 --agent simple
```

Use `127.0.0.1` rather than `0.0.0.0`. The simple agent keeps this AURIX connection in chat-only mode. Keep the OpenJarvis server running while using the OpenJarvis provider in AURIX.

If OpenJarvis is configured with an API key, set `OPENJARVIS_API_KEY` in the environment inherited by AURIX before launching AURIX. Do not put the key in a chat message, project file, or audit log.

## Use it in AURIX

1. Start the OpenJarvis API server as described above.
2. Open AURIX Desktop.
3. In **AI provider**, select **Stanford OpenJarvis (local chat only)**.
4. Select **Check OpenJarvis**. AURIX should report that a local model is ready.
5. Speak a request after the AURIX wake phrase or enter a normal question in the task box.

If the check fails, confirm that OpenJarvis is running, a model is installed, the server is bound to `127.0.0.1:8000`, and any configured API key is available to AURIX.

## Boundaries

This is a first-stage chat integration, not a full OpenJarvis agent/tool integration. It does not install OpenJarvis or download a model automatically, and it does not bundle model weights with AURIX. OpenJarvis cannot bypass AURIX's action planner, approval prompts, activity controls, or emergency stop. Do not expose the OpenJarvis API server to a public or untrusted network.
