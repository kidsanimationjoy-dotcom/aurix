# AURIX local companion

A browser cannot directly run or safely inspect software on the user's computer. The AURIX companion is a small program the user runs locally. The browser contacts it through loopback using a per-run pairing token.

## Current implementation

- Binds to `127.0.0.1` only.
- Checks the request Origin and Host, and compares the bearer token using a timing-safe comparison.
- Implements authenticated health, Codex status, and official Codex sign-in handoff.
- Runs the official local REA CLI's documented JavaScript/Electron application analyzer through authenticated `/v1/rea/*` endpoints, without API keys.
- Creates a dedicated AURIX-owned Codex home. It does not read, edit, or reuse the user's normal `~/.codex` profile.
- Creates a strict read-only permission profile for a dedicated empty AURIX chat workspace.
- Runs a local Codex sandbox canary using Codex's documented `codex sandbox` command and includes managed configuration.
- The canary checks that the sandbox can read its own workspace file, cannot read an existing file outside that workspace, and cannot write either outside the workspace or into the read-only workspace.
- It also attempts a connection to a temporary loopback-only listener on the companion host. Any accepted connection fails verification, so the canary checks that sandboxed commands cannot reach that local service without contacting an external host.
- Returns only a structured verification result. Canary contents, random tokens, file contents, raw CLI output, and credentials are not returned to the browser.
- Uses the dedicated `CODEX_HOME` for AURIX Codex status and sign-in. It removes `OPENAI_API_KEY` from the subprocess environment.
- On Windows, Codex status, sign-in and sandbox verification require a native `.exe`; AURIX never launches a `.cmd` / `.bat` shell shim through a command shell.
- The generated Windows profile explicitly prefers MXC and selects `elevated` as its legacy fallback. It does not select `unelevated`, because that mode cannot enforce the denied-read boundary this profile requires. The elevated fallback may require a one-time administrator-approved setup; when neither supported backend is available, verification fails closed.

## Request validation

The profile-preparation endpoint accepts only a small JSON request body. Malformed JSON receives a `400` response and oversized bodies receive `413`; both responses are sanitized and do not terminate the companion process. Regression tests verify that the health endpoint remains available after either rejected request.

## REA local investigation

Install REA from its official source (`npx rea-agents setup` or the documented global CLI installation). Set `AURIX_REA_ROOTS` before starting the companion to a path or list of paths you explicitly approve for inspection. Use the platform path separator between multiple roots (`;` on Windows, `:` on macOS/Linux). AURIX canonicalises both the approved roots and requested target, rejects paths outside those roots (including symlink escapes), and invokes only `rea analyze-javascript-application <target> --json` with `shell: false`. Output is capped at 1 MB and the process is limited to 90 seconds. This first bridge supports JavaScript/Electron analysis; native binary workflows are not exposed by this endpoint.

Example on Windows PowerShell:

```powershell
$env:AURIX_REA_ROOTS = 'D:\\AppsToInspect'
npm run companion
```

Example on macOS/Linux:

```bash
AURIX_REA_ROOTS="$HOME/apps-to-inspect" npm run companion
```

Only add folders containing software you own or are authorised to inspect. The bridge does not bypass login, DRM, network controls, or provider protections and does not extract credentials or private model weights.

## Still disabled

- No AURIX chat/task execution endpoint.
- No terminal or general filesystem endpoint.
- No user project folder grants.
- No task approval UI or execution/cancellation bridge.
- Codex does not receive a project folder or broad write permission.

**Even when the sandbox canary passes, AURIX task execution stays disabled.** The canary is a security prerequisite, not the task executor. A later implementation must add narrow project approvals, visible task plans, cancellation, bounded output, and audit events before it may advertise a task capability.

## Set up the companion

1. Run `npm install` and then `npm run companion` on the computer that has the Codex CLI installed.
2. Copy the local URL and pairing token printed in the companion terminal into **Settings → Local companion**.
3. Select **Prepare AURIX profile & verify sandbox**. This creates the separate profile and invokes the real local Codex sandbox. AURIX reports failure when the CLI, platform helper, permission profile, or managed settings cannot be verified.
4. After profile creation, select **Sign in to AURIX Codex with ChatGPT**. This sign-in is separate from the user's normal Codex profile.
5. Check status again.

For a hosted AURIX origin, set `AURIX_ORIGIN=https://your-site.example` and `AURIX_COMPANION_PORT=4317` before running the companion. The companion still binds to loopback.

## Profile locations

- Windows: `%LOCALAPPDATA%\\AURIX\\Codex`
- macOS: `~/Library/Application Support/AURIX/Codex`
- Linux: `$XDG_DATA_HOME/aurix/codex` or `~/.local/share/aurix/codex`

The sandbox canary directory is a sibling of the Codex home, not a child of it. The managed config is created exclusively and later checked byte-for-byte. A changed config, redirected/symlinked directory, conflicting managed setting, or unverifiable sandbox causes a fail-closed result. The companion also checks the current system policy file locations before launching: `/etc/codex/config.toml`, `/etc/codex/managed_config.toml`, and `/etc/codex/requirements.toml` on Unix; `%ProgramData%\\OpenAI\\Codex\\config.toml` and `%ProgramData%\\OpenAI\\Codex\\requirements.toml` on Windows; and `managed_config.toml` inside AURIX's own `CODEX_HOME`. Legacy `sandbox_mode` or `sandbox_workspace_write` settings in those files are rejected. Modern managed requirements are passed to the real sandbox through `--include-managed-config` and must pass the OS canary.

## Security boundaries

- The companion does not read `~/.codex/auth.json`, browser cookies, browser storage, API keys, or local credential caches.
- The official Codex CLI handles the separate AURIX sign-in.
- The sandbox canary uses an argument array and `shell: false`. On Windows, it requires a native Codex executable for this step.
- The sandbox command includes managed configuration and does not use any sandbox-bypass flag.
- Codex custom permission profiles are a changing/beta feature. The local verification must be rerun on the computer where AURIX will be used.
- CI fake-CLI tests verify the API contract and fail-closed behaviour; they are not evidence that a real OS sandbox worked.
- A successful local canary does not enable AURIX task execution, nor does it prove the isolation of future code paths.

See [docs/CODEX_LOCAL_INTEGRATION.md](../docs/CODEX_LOCAL_INTEGRATION.md) for the integration contract.


### REA workflows

The paired companion supports two fixed REA operations on approved local directories: `analyze-javascript-application` for JavaScript/Electron graph evidence and `inspect-desktop-application` for bounded installation/runtime-candidate discovery. AURIX selects between these fixed commands; it does not accept arbitrary shell commands or REA flags. Desktop discovery does not launch the inspected application.
