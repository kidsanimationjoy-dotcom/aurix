# AURIX local companion

A browser cannot directly run or safely inspect software on the user's computer. The AURIX companion is a small program the user runs locally. The browser contacts it through loopback using a per-run pairing token.

## Current implementation

- Binds to `127.0.0.1` only.
- Checks the request Origin and Host, and compares the bearer token using a timing-safe comparison.
- Implements authenticated health, Codex status, and official Codex sign-in handoff.
- Creates a dedicated AURIX-owned Codex home. It does not read, edit, or reuse the user's normal `~/.codex` profile.
- Creates a strict read-only permission profile for a dedicated empty AURIX chat workspace.
- Runs a local Codex sandbox canary using Codex's documented `codex sandbox` command and includes managed configuration.
- The canary checks that the sandbox can read its own workspace file, cannot read an existing file outside that workspace, and cannot write either outside the workspace or into the read-only workspace.
- Returns only a structured verification result. Canary contents, random tokens, file contents, raw CLI output, and credentials are not returned to the browser.
- Uses the dedicated `CODEX_HOME` for AURIX Codex status and sign-in. It removes `OPENAI_API_KEY` from the subprocess environment.
- On Windows, Codex status, sign-in and sandbox verification require a native `.exe`; AURIX never launches a `.cmd` / `.bat` shell shim through a command shell.

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

The sandbox canary directory is a sibling of the Codex home, not a child of it. The managed config is created exclusively and later checked byte-for-byte. A changed config, redirected/symlinked directory, conflicting managed setting, or unverifiable sandbox causes a fail-closed result.

## Security boundaries

- The companion does not read `~/.codex/auth.json`, browser cookies, browser storage, API keys, or local credential caches.
- The official Codex CLI handles the separate AURIX sign-in.
- The sandbox canary uses an argument array and `shell: false`. On Windows, it requires a native Codex executable for this step.
- The sandbox command includes managed configuration and does not use any sandbox-bypass flag.
- Codex custom permission profiles are a changing/beta feature. The local verification must be rerun on the computer where AURIX will be used.
- CI fake-CLI tests verify the API contract and fail-closed behaviour; they are not evidence that a real OS sandbox worked.
- A successful local canary does not enable AURIX task execution, nor does it prove the isolation of future code paths.

See [docs/CODEX_LOCAL_INTEGRATION.md](../docs/CODEX_LOCAL_INTEGRATION.md) for the integration contract.
