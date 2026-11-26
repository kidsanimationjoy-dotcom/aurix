# AURIX local companion

A browser cannot directly run or safely inspect software on the user's computer. The AURIX companion is a small program the user runs locally. The browser contacts it through loopback using a per-run pairing token.

## Current implementation

- Binds to `127.0.0.1` only.
- Checks the request Origin and Host, and compares the bearer token using a timing-safe comparison.
- Implements authenticated health, Codex status, and official Codex sign-in handoff.
- Creates a dedicated AURIX-owned Codex home. It does not read, edit, or reuse the user's normal `~/.codex` profile.
- Creates a strict read-only permission profile for a dedicated empty AURIX chat workspace.
- Runs a local Codex sandbox canary using Codex's documented `codex sandbox` command and includes managed configuration.
- Exposes a text-only, read-only chat task endpoint using the official `codex exec --json` CLI after a fresh successful canary and ChatGPT sign-in check. It accepts only a task ID and a bounded prompt; command arguments, project paths, files and tools are never supplied by the request.
- Re-runs the OS sandbox canary before every chat dispatch, and accepts only Task Center-approved tasks. The same Codex CLI version must match the last successful verification.
- The canary checks that the sandbox can read its own workspace file, cannot read an existing file outside that workspace, and cannot write either outside the workspace or into the read-only workspace.
- It also attempts a connection to a temporary loopback-only listener on the companion host. Any accepted connection fails verification, so the canary checks that sandboxed commands cannot reach that local service without contacting an external host.
- Returns only a structured verification result. Canary contents, random tokens, file contents, raw CLI output, and credentials are not returned to the browser.
- Uses the dedicated `CODEX_HOME` for AURIX Codex status and sign-in. It removes `OPENAI_API_KEY` from the subprocess environment.
- On Windows, Codex status, sign-in and sandbox verification require a native `.exe`; AURIX never launches a `.cmd` / `.bat` shell shim through a command shell.
- The generated Windows profile explicitly prefers MXC and selects `elevated` as its legacy fallback. It does not select `unelevated`, because that mode cannot enforce the denied-read boundary this profile requires. The elevated fallback may require a one-time administrator-approved setup; when neither supported backend is available, verification fails closed.

## Read-only chat only

- Codex chat is available only through Task Center, after an explicit **Approve & run** action.
- The provider is advertised for task routing only when its separate AURIX profile is signed in with ChatGPT and the latest sandbox canary passed for the same CLI version.
- The companion repeats the OS canary before every actual chat dispatch.
- Each chat gets a new, private, empty temporary subfolder under the AURIX chat root. If the root contains unexpected files, AURIX refuses to send the prompt. The temporary folder is removed before success is returned; cleanup failure is reported.
- Chat uses a fixed read-only permission profile, disables command network, does not attach user project folders, and returns only the final assistant text.
- Process output, prompt size, duration and concurrency are bounded. Cancellation attempts to stop the local process tree before the task settles.

## Still disabled

- No Home chat dispatch to Codex.
- No coding-agent or project-file access.
- No user project folder grants or local file read/write endpoints.
- No general terminal, browser, network or deployment endpoint.
- No persistent Codex session/rollout history from AURIX chat.

**The successful canary permits only this bounded read-only chat mode.** It does not authorize coding-agent or project tasks, project inspection, file changes, general command execution or deployment, and it does not prove the isolation of future code paths. A real sandbox canary must pass on the actual user's computer; fake-CLI tests in CI verify the API contract only and are not proof of OS isolation.

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
