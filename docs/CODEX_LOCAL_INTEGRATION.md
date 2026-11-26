# OpenAI Codex local companion integration

**Status:** local CLI installation/sign-in status and official login handoff are implemented in the companion. Codex task execution is deliberately disabled; this document specifies the next safe implementation stage. It does not imply that Codex is installed or signed in on any user's computer.

## 1. Supported no-API-key path

AURIX should integrate the official Codex CLI installed and authenticated by the user on their own computer. The CLI supports ChatGPT OAuth sign-in as well as optional API-key sign-in. Current OpenAI documentation says Codex is included across ChatGPT plans, including Free and Go, with usage limits depending on plan. Codex Cloud has separate eligibility rules and is not part of this local CLI path.

AURIX must not:
- scrape ChatGPT browser cookies or browser local storage;
- read, copy, sync, or upload Codex's credential cache;
- ask the user to paste an OAuth token or API key into AURIX;
- claim to have a ChatGPT conversation or memory bridge;
- silently replace the selected Codex provider with another provider.

## 2. Local discovery and sign-in

The companion now:
1. Runs the official `codex` executable through Node's argument-array process API (no shell interpolation on macOS/Linux). On Windows, where CLI installers can expose `.cmd` shims, it invokes `cmd.exe` only with a fixed allowlist of status/login arguments; user prompts and arbitrary commands are not accepted by this path.
2. Runs `codex --version` with a short timeout and returns only a parsed version number.
3. Runs `codex login status` and returns only signed-in state and a sanitised authentication-mode label; it never returns raw CLI output.
4. Lets the user explicitly select **Sign in with ChatGPT**, which starts `codex login` locally. Codex's own process inherits the companion terminal so the user completes the official browser sign-in there.
5. Requires the user to select **Check Codex status** again to verify sign-in.
6. Does not yet provide a logout button. A future logout action must ask before running `codex logout`, because that command affects the same local credential store used by other Codex clients.

The companion must never inspect `~/.codex/auth.json`. OpenAI documentation states this file may contain access tokens and should be treated like a password. The CLI can use its OS credential store or other supported credential-storage settings; AURIX should leave those decisions to the official CLI and user.

## 3. Execution contract — not yet enabled

**Important:** Codex's ordinary `read-only` sandbox prevents writes but can still allow broad reads from the user's machine. An empty temporary working directory does not fix that. AURIX must not run a user prompt in that mode and describe it as private or isolated.

The next task adapter must use an explicit custom permission profile that denies filesystem access from `:root`, permits only Codex's documented `:minimal` runtime paths, and grants read access to one fresh empty AURIX-owned workspace root. The profile must deny `:tmpdir` and `:slash_tmp` unless a narrowly scoped override is proven necessary. Command network access must remain disabled.

A candidate command-line config shape is below. It must be verified against the installed CLI version and the effective configuration before execution can be enabled:

```text
--config 'default_permissions="aurix-readonly-chat"'
--config 'permissions.aurix-readonly-chat.filesystem.":root"="deny"'
--config 'permissions.aurix-readonly-chat.filesystem.":minimal"="read"'
--config 'permissions.aurix-readonly-chat.filesystem.":tmpdir"="deny"'
--config 'permissions.aurix-readonly-chat.filesystem.":slash_tmp"="deny"'
--config 'permissions.aurix-readonly-chat.filesystem.":workspace_roots"."."="read"'
--config 'permissions.aurix-readonly-chat.network.enabled=false'
```

Codex permission profiles are beta and take precedence over older sandbox configuration only when that configuration is not also active. If a user's local config contains legacy `sandbox_mode` or `sandbox_workspace_write` settings, AURIX must detect that conflict and fail closed rather than silently fall back to broad read-only access.

A future implementation may use the documented non-interactive command:

```text
codex exec --json --cd <approved-project-root> --sandbox workspace-write --ask-for-approval on-request -
```

The prompt should be sent through standard input, not interpolated into a shell string. All process arguments must be passed as an argv array to a safe process-spawn API. The working directory must be resolved from a project explicitly selected by the user and validated against the local companion's approved workspace roots.

Codex CLI's non-interactive mode streams progress to standard error and final agent output to standard output; JSON/JSONL output is available for structured events. The adapter should:
- parse bounded JSONL records incrementally;
- forward safe progress events to AURIX's task event stream;
- collect final output separately from diagnostic output;
- enforce AURIX's task timeout and cancellation signal;
- terminate the process on cancellation, then verify that it has exited;
- cap stdout, stderr, and total persisted output;
- redact token-like strings, private paths where appropriate, and environment details from logs;
- return structured exit code/error/provenance metadata.

The exact JSON event schema must be verified against the installed CLI version with a harmless diagnostic task before it is treated as stable. Unknown event types must be ignored safely and must not crash the task.

## 4. Permissions and safety

- Do not enable task execution with the standard broad-read `read-only` sandbox.
- The first chat-only execution must deny broad filesystem reads and allow only `:minimal` plus an empty AURIX-owned workspace. Verify this by an OS-level sandbox test that proves a canary outside the workspace cannot be read.
- Before a coding run, AURIX must show the intended project root and a plan, then require the user to approve that task's scoped workspace-write access.
- The CLI must use its workspace sandbox and approval controls. Never use `--dangerously-bypass-approvals-and-sandbox` / `--yolo`.
- Do not grant extra directories with `--add-dir` unless the user approves each additional path.
- Do not allow the web app to set arbitrary environment variables or arbitrary executable paths.
- Keep the companion bound to loopback, require its pairing token, validate Origin/Host, and keep the existing emergency stop.
- Shell command execution, deployment, credential handling, and access outside the selected project remain separately gated; project-write approval is not approval for those actions.
- Any command or permission prompt that cannot be surfaced to the user safely must fail closed.

## 5. AURIX integration steps

1. Completed: implement Codex CLI discovery, status check and official sign-in handoff.
2. Completed: add Codex sign-in and status controls in Settings.
3. Next: verify custom permission-profile activation and canary-denial tests on Windows, macOS and Linux.
4. Only then implement `executeTask` and cancellation; do not add a broad-read fallback.
5. Add a per-project approved local folder picker only after the read-only chat scope is verified.
3. Add a per-project approved local folder picker to the companion UI; do not accept arbitrary browser paths.
4. Connect TaskEngine's `executeTask`, `emitProgress`, `emitOutput`, and AbortSignal to the local Codex subprocess.
5. Persist task results and provider provenance, never credentials.
6. Run harmless integration tests with an unauthenticated CLI, an authenticated CLI, a missing executable, provider quota/rate-limit errors, cancellation, timeout, and paths outside the approved root.
7. Keep the adapter status `not_configured` until the CLI health check succeeds and the task execution contract has been tested.

## 6. Official references

- Codex CLI install and source: https://github.com/openai/codex
- Node.js Windows `.cmd` / `.bat` child-process behaviour: https://nodejs.org/api/child_process.html
- ChatGPT plan availability: https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan
- Authentication and local credential storage: https://learn.chatgpt.com/docs/auth?surface=cli
- CLI arguments, sandbox, and approval controls: https://learn.chatgpt.com/docs/cli/reference
- Non-interactive execution and streaming: https://learn.chatgpt.com/docs/non-interactive-mode
