# AURIX local companion

A browser cannot directly run or safely inspect software on the user's computer. The AURIX companion is a small program the user runs locally. The browser contacts it through loopback using a per-run pairing token.

## Current implementation

- Binds to `127.0.0.1` only.
- Checks the request Origin and Host, and compares the bearer token using a timing-safe comparison.
- Implements authenticated health, Codex status and sign-in, read-only Codex chat, project-scoped Codex App Server sessions, and OAuth-backed Higgsfield CLI handoff.
- Runs the official local REA CLI's documented JavaScript/Electron, desktop, Android APK, and passive browser-inspection workflows through authenticated `/v1/rea/*` endpoints, without API keys.
- Connects to the official Higgsfield CLI using local browser OAuth. It discovers account status and models, obtains a credit estimate before generation, rechecks the estimate, and requires a separate explicit confirmation before creating a billable job.
- Creates a dedicated AURIX-owned Codex home. It does not read, edit, or reuse the user's normal `~/.codex` profile.
- Creates a strict read-only permission profile for a dedicated empty AURIX chat workspace.
- Runs AURIX chat through the documented `codex sandbox` wrapper with the named `aurix-chat-readonly` profile and managed configuration; the profile, not a generic `--sandbox` override, supplies the read-only workspace and denied-root/network policy.
- Runs project coding sessions through the documented Codex App Server JSONL protocol. Each selected project must be inside `AURIX_CODEX_ROOTS`; initial access is read-only and all additional command, file-change and filesystem permission requests are shown in Coding Studio for a one-time user decision.
- Filesystem grants are reduced to explicit paths under the selected project and the current turn only. Command approvals show the exact command and working directory. Network permission requests are always refused. Timeouts automatically decline pending approval prompts.
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

## Read-only Codex chat

After preparing the separate AURIX Codex profile, passing its OS sandbox canary, and completing the official ChatGPT sign-in, AURIX can call the authenticated `POST /v1/codex/chat` endpoint. The endpoint verifies that the sandbox was checked in the current companion process, verifies the profile and sign-in again, and launches only `codex exec --sandbox read-only --ephemeral --json` in AURIX's empty chat workspace. It accepts up to 12 bounded conversation messages and returns only the completed assistant message. The chat process inherits an allowlisted environment that omits `OPENAI_API_KEY`. Restarting the companion clears the in-memory sandbox verification; run the local preparation/check again before chatting.

This provides a local Codex-backed chat capability, not access to the private runtime of this ChatGPT conversation and not an identical Astra model. The chat runs in AURIX's empty workspace. If you explicitly configure `AURIX_CODEX_ROOTS`, the shared read-only profile also permits reading files under those approved roots; it cannot write there or execute project tasks. Do not add folders containing data you do not want the AURIX Codex profile to read.

## Project coding agent

Set `AURIX_CODEX_ROOTS` before launching the companion to the parent directory or directories that contain projects you explicitly approve for local coding. Use the platform path separator between entries (semicolon on Windows, colon on macOS/Linux). Use narrow project folders such as `D:\\Work\\AURIX-projects`, not the drive root or your entire user folder. Preparing the profile registers those roots as read-only workspace roots; writes remain separate, per-turn permission grants. A path stored in the Projects screen is only a project selection; it does not grant access by itself. The companion canonicalizes the selected path and each approved root, then refuses projects outside those roots. During profile preparation, it adds those approved roots to the managed Codex profile as read-only workspace roots. It refuses filesystem roots, the user home/application-data tree, AURIX's own profile folders, and symlinked roots.

The Coding Studio starts a Codex App Server session with the selected project as its runtime working directory. It inherits the verified AURIX custom permission profile rather than overriding it with Codex's generic sandbox presets. That profile extends `:read-only`, denies broad filesystem roots and temporary folders, grants only the minimal platform/runtime reads plus read-only access to the empty AURIX chat workspace and explicitly allowlisted project roots, and disables network access. The selected project must be inside one of those read-only roots to become the session's project workspace. Codex may ask for extra permissions. AURIX shows the reason, requested files, command, parsed command actions, and working directory before presenting a decision. Accepted filesystem paths must stay within the selected project and are granted for the current turn only. Session-scoped root grants are refused. Commands are approved individually and are denied when they request network access or run outside the project. Session-wide approvals are not offered. Stop sends a turn interruption; closing the session terminates the local App Server process.

The App Server process uses the separate AURIX Codex profile and an allowlisted environment without `OPENAI_API_KEY`. It does not use a general-purpose shell or expose arbitrary filesystem/terminal endpoints to the browser. The bridge additionally validates the selected project folder, command working directories, and every write-permission path; extra filesystem grants are restricted to exact paths inside the project and the current turn only. The base profile is still read-only, and no session-wide write grant is offered. This is a project coding integration, not broad desktop control.

## Task Center with local Codex

The Task Center uses the same local Codex App Server after its own provider-and-plan approval. Conversational tasks are sent through AURIX's read-only Codex chat workspace. Coding tasks require an active project with a linked local folder inside one of the explicit `AURIX_CODEX_ROOTS` directories. The provider readiness check is run before presenting the task approval and again when the user approves.

After the task starts, Codex's command, file-change and filesystem permission requests are surfaced inside the Task Center. Each request has its own one-time decision; network access, session-wide root grants and file-change prompts without an exact path list are refused. Pending local action prompts automatically expire and are declined, and a browser reload marks an in-progress task as interrupted rather than restoring a stale approval. Cancelling the task interrupts and closes its local Codex session.

Task Center status and output are stored in the local AURIX workspace. The Task Center does not make a direct API request to OpenAI, does not copy the user's Codex credentials, and does not give Codex access beyond the managed read-only profile and the per-task permissions approved by the user.

## Specialist Agents

The Agents page now launches saved agent profiles as real Task Center tasks. Each run snapshots the agent name, role, summary, instructions and permission choices into the task record so later edits to the definition do not silently change an active task. Choose read-only chat or project coding when launching an agent. Chat uses the AURIX Codex read-only workspace; coding requires an active project whose linked folder has passed the local `AURIX_CODEX_ROOTS` preflight.

The agent's file-change and command settings are enforced at the Codex approval boundary. `deny` causes the matching action to be declined automatically; `ask` places it in Task Center for an individual approval. Network access is always denied by the AURIX platform, even when a saved older agent definition requested "ask". Agents cannot grant themselves extra access, reuse a previous approval, or restore a pending permission request after reload.

## Higgsfield video generation

Install the official CLI locally with `npm install -g @higgsfield/cli`, then use **Media Studio → Sign in with Higgsfield**. The local companion starts the CLI's official browser OAuth flow in its terminal. AURIX never reads, returns, or asks the user to paste Higgsfield OAuth credentials or API keys. The supported workflows currently enable Seedance 2.0 text-to-video and GPT Image 2.5 text-to-image only when the live model catalog reports them. The prompt and model-specific duration, resolution, aspect ratio, mode, quality and variant are validated against the published CLI schema before asking the CLI for a cost estimate. Reference-image editing is not included in this initial integration.

AURIX does not run `generate create` when the user asks for a quote. It stores a short-lived, one-use quote ID in companion memory, displays the raw credit estimate in Media Studio, and requires the user to check the confirmation box and press **Confirm cost and generate**. The companion consumes the quote before any create attempt, re-runs the cost query and refuses to create a job when the price changed. This avoids accidental duplicate submissions using the same quote, although it cannot roll back a job after Higgsfield accepts it. No generation job has been sent during automated tests. Jobs are polled through the official CLI and are shown as completed only when Higgsfield returns a result URL.

All command execution uses `shell: false`, bounded output and timeouts. The CLI handles browser OAuth in its local credential store; AURIX only returns safe account fields such as plan and credit balance. On Windows, the companion uses the installed package's JavaScript entry point instead of spawning an npm `.cmd` shim. The official binary can still be blocked by Windows security controls; do not disable SmartScreen, Defender, or other protections to make it run.

## Still disabled

- Generic filesystem and terminal APIs.
- Cross-application keyboard/mouse and operating-system control.
- General browser automation beyond the passive, explicitly authorised REA inspection.
- Additional Higgsfield image/video models, reference-image editing and image-to-video workflows beyond the supported Seedance 2.0 and GPT Image 2.5 text workflows.
- Claude and Grok account-backed chat adapters remain disconnected; AURIX does not proxy their subscription credentials.

**The local App Server path has automated fake-server tests; this is not proof that your installed Codex version, Windows sandbox, or real project folder has been verified.** Run it locally after setting up the companion and inspect every permission request.

## Set up the companion

1. Run `npm install` and then `npm run companion` on the computer that has the Codex CLI, REA, and/or Higgsfield CLI installed. Set `AURIX_REA_ROOTS` and `AURIX_CODEX_ROOTS` to the separate folders you explicitly authorise, when needed. Example in Windows PowerShell: `$env:AURIX_CODEX_ROOTS = 'D:\\Work\\Projects'` before `npm run companion`. Example on macOS/Linux: `AURIX_CODEX_ROOTS="$HOME/Projects" npm run companion`.
2. Copy the local URL and pairing token printed in the companion terminal into **Settings → Local companion**.
3. Select **Prepare AURIX profile & verify sandbox**. This creates the separate profile and invokes the real local Codex sandbox. AURIX reports failure when the CLI, platform helper, permission profile, or managed settings cannot be verified.
4. After profile creation, select **Sign in to AURIX Codex with ChatGPT**. This sign-in is separate from the user's normal Codex profile.
5. Check status again. For a project coding task, store its local folder path in Projects and ensure it is inside one of the directories in `AURIX_CODEX_ROOTS`. If you change the approved root list later, restart the companion and select **Prepare AURIX profile & verify sandbox** again; AURIX updates only a profile file that exactly matches a previously generated AURIX profile.
6. For Higgsfield, install the official package with `npm install -g @higgsfield/cli`, then use Media Studio's sign-in button. Review the account balance and each cost estimate before confirming any generation.

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

The paired companion supports fixed REA operations within folders explicitly approved through `AURIX_REA_ROOTS`: `analyze-javascript-application` accepts an application directory or `.asar` archive for JavaScript/Electron graph evidence; `inspect-desktop-application` accepts an installation directory for bounded runtime-candidate discovery; and `inspect-android-package` accepts an APK file. AURIX selects between these fixed commands; it does not accept arbitrary shell commands or REA flags. Desktop discovery does not launch the inspected application. It is a static inventory, not a runtime trace.


Android APK inspection is also available with the fixed `inspect-android-package` CLI operation. Select an APK file under an approved `AURIX_REA_ROOTS` directory; AURIX canonicalizes the file path and checks that it remains inside an approved root. The operation is static JADX-backed analysis and does not install or execute the APK.


### Passive browser inspection

AURIX can list eligible tabs and request a passive page inspection or static JavaScript bundle analysis through REA. Enter only an explicit-port `http://127.0.0.1:PORT` DevTools endpoint; other hosts and protocols are rejected. The browser endpoint is local to the computer running the companion and the user must affirm they own or are authorised to inspect that browser session. REA rechecks the selected target and origin and captures the selected tab without navigating, clicking, evaluating page JavaScript or mutating it. Page captures use conservative defaults; bundle analysis parses captured application scripts as source and does not execute them. These operations are not general browser automation or remote-control access.
