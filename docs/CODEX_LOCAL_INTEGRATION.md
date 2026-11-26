# OpenAI Codex local companion integration

**Status:** separate AURIX Codex profile setup, official sign-in handoff, and local OS-sandbox canary are implemented in the companion. AURIX chat/task execution remains deliberately disabled.

## 1. Supported no-API-key path

AURIX integrates the official Codex CLI installed by the user on their own computer. The CLI supports the official ChatGPT sign-in flow. AURIX never asks the user to paste an OAuth token or API key into AURIX.

AURIX must not:
- scrape ChatGPT browser cookies or browser local storage;
- read, copy, sync, or upload the user's normal Codex credential cache;
- ask the user to paste an OAuth token or API key into AURIX;
- claim it has embedded a private ChatGPT web conversation or its hidden runtime;
- silently replace the selected Codex provider with another provider.

## 2. Separate AURIX Codex home

AURIX creates an independent Codex home using the `CODEX_HOME` environment variable. The user's existing default Codex configuration and sign-in remain untouched.

Locations:
- Windows: `%LOCALAPPDATA%\\AURIX\\Codex`
- macOS: `~/Library/Application Support/AURIX/Codex`
- Linux: `$XDG_DATA_HOME/aurix/codex` or `~/.local/share/aurix/codex`

AURIX writes a dedicated `config.toml` exclusively. Before status checks or sign-in, it validates the complete directory path and confirms the profile file still exactly matches the expected AURIX-managed content. Symlinks/junctions, changed profile content, or redirected directories cause a fail-closed result.

After profile preparation, **Sign in to AURIX Codex with ChatGPT** runs the official `codex login` process with AURIX's separate `CODEX_HOME`. The user may need to sign in again. AURIX never reads the resulting credential store.

## 3. Permission profile and OS canary

The AURIX profile is named `aurix-chat-readonly`. It extends Codex's built-in read-only policy and sets:
- `:root` to deny;
- `:minimal` to read;
- the dedicated AURIX workspace root to read;
- `:tmpdir` and `:slash_tmp` to deny;
- command network access to disabled.

The canary directory is a sibling of `CODEX_HOME`, not a child. This prevents a broad read allowance under the Codex home from automatically exposing the canary.

When the user selects **Prepare AURIX profile & verify sandbox**, the companion:
1. Prepares and validates the dedicated profile and workspace.
2. Checks the CLI version.
3. Invokes the documented `codex sandbox <platform>` command with `--permission-profile aurix-chat-readonly`, `--include-managed-config`, and `--cd <AURIX workspace>`.
4. Runs a fixed Node.js canary program under the OS sandbox.
5. Requires the canary to read the exact in-workspace file.
6. Requires the canary to be denied read access to a file outside the workspace.
7. Requires write attempts to be denied both outside the workspace and inside the read-only workspace.
8. Cleans up its uniquely named canary files and returns a structured result without exposing the file contents, paths, random values, or raw CLI output.

The canary accepts only explicit access-denial errors (permission denied / access denied). A missing file, a failed workspace read, an unexpected error, a timeout, an unsupported platform, an invalid profile, a managed-policy conflict, or an unavailable sandbox helper is not treated as a pass.

On Windows, status, sign-in and sandbox verification require a native Codex `.exe`. The companion does not build a dynamic command string or route Codex status, login or sandbox invocation through `cmd.exe`, `.cmd`, or `.bat` shims. If a native executable cannot be resolved, the corresponding operation is unavailable and AURIX fails closed.

The Codex CLI permission-profile feature is beta and may change between versions. A successful result applies only to the tested CLI and operating-system environment on that computer at that time.

## 4. What a successful result does—and does not—mean

A successful canary is evidence that the tested Codex sandbox command allowed the dedicated workspace read and blocked the specific outside-read and write probes on that computer.

It does **not** mean:
- AURIX can already send chat prompts to Codex;
- AURIX can run coding tasks;
- a user project folder has been granted;
- a future task-execution path is automatically safe;
- another computer, CLI version, or OS configuration has passed the test.

AURIX task execution remains disabled. The provider adapter advertises no task capabilities and returns `NOT_IMPLEMENTED` for chat/coding execution until the following are implemented and independently tested:
- project folder selection and visible scoped approvals;
- TaskEngine-to-Codex process execution with bounded JSONL parsing;
- task-level cancellation, timeout, and process-exit verification;
- capped outputs and redacted audit records;
- permission prompts surfaced safely to the user;
- tests for success, denial, timeouts, cancellation, and paths outside the approved project.

## 5. Local API

Implemented authenticated routes:
- `GET /v1/health`
- `GET /v1/codex/status`
- `POST /v1/codex/prepare`
- `POST /v1/codex/login`

The legacy `GET /v1/codex/exec` remains method-not-allowed and no execution route is implemented. There is no general filesystem or terminal endpoint.

## 6. Testing

GitHub CI runs type checking, unit tests, and the production build. The fake-CLI unit tests verify:
- separate profile path construction and immutable profile validation;
- correct sandbox argument construction and Windows shell-shim refusal;
- that the prepare endpoint invokes the expected sandbox command;
- that a fake CLI's failed sandbox result remains unverified;
- that login/status use the dedicated AURIX `CODEX_HOME`;
- that provider task capabilities remain empty.

These tests do **not** run Codex itself and do not prove native OS isolation. The real canary must be run locally on the computer where AURIX will be used.

## 7. Official references

- Codex CLI source and installation: https://github.com/openai/codex
- Codex config reference: https://developers.openai.com/codex/config-reference
- Codex sandbox and developer commands: https://learn.chatgpt.com/docs/developer-commands
- Codex approvals and sandbox security: https://learn.chatgpt.com/docs/agent-approvals-security
- Node.js child-process behaviour: https://nodejs.org/api/child_process.html
