# OpenAI Codex local companion integration

**Status:** research-backed implementation specification. It does not imply that Codex is installed or connected on any user's computer.

## 1. Supported no-API-key path

AURIX should integrate the official Codex CLI installed and authenticated by the user on their own computer. The CLI supports ChatGPT OAuth sign-in as well as optional API-key sign-in. Current OpenAI documentation says Codex is included across ChatGPT plans, including Free and Go, with usage limits depending on plan. Codex Cloud has separate eligibility rules and is not part of this local CLI path.

AURIX must not:
- scrape ChatGPT browser cookies or browser local storage;
- read, copy, sync, or upload Codex's credential cache;
- ask the user to paste an OAuth token or API key into AURIX;
- claim to have a ChatGPT conversation or memory bridge;
- silently replace the selected Codex provider with another provider.

## 2. Local discovery and sign-in

The companion should:
1. Resolve the official `codex` executable using a trusted executable lookup, not a shell command assembled from user input.
2. Run `codex --version` with a short timeout and return the version string.
3. Run `codex login status` with a short timeout and report only whether a login is present and the authentication mode that the CLI itself reports.
4. If not signed in, let the user explicitly select **Sign in with Codex**. Launch `codex login` locally and allow the official browser OAuth flow to complete.
5. Re-run `codex login status` to verify the result.
6. Provide a disconnect action that asks before running `codex logout`, since that command removes the user's locally cached Codex credentials and may affect their other Codex clients that share the same cache.

The companion must never inspect `~/.codex/auth.json`. OpenAI documentation states this file may contain access tokens and should be treated like a password. The CLI can use its OS credential store or other supported credential-storage settings; AURIX should leave those decisions to the official CLI and user.

## 3. Execution contract

The first useful task adapter can use the documented non-interactive command:

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

- Start with read-only inspection/plan tasks where possible.
- Before a coding run, AURIX must show the intended project root and a plan, then require the user to approve that task's scoped workspace-write access.
- The CLI must use its workspace sandbox and approval controls. Never use `--dangerously-bypass-approvals-and-sandbox` / `--yolo`.
- Do not grant extra directories with `--add-dir` unless the user approves each additional path.
- Do not allow the web app to set arbitrary environment variables or arbitrary executable paths.
- Keep the companion bound to loopback, require its pairing token, validate Origin/Host, and keep the existing emergency stop.
- Shell command execution, deployment, credential handling, and access outside the selected project remain separately gated; project-write approval is not approval for those actions.
- Any command or permission prompt that cannot be surfaced to the user safely must fail closed.

## 5. AURIX integration steps

1. Implement a Codex companion adapter with `discover`, `getStatus`, `beginLogin`, `logout`, `executeTask`, and `cancelTask` operations.
2. Add an explicit Codex sign-in screen and status in Settings.
3. Add a per-project approved local folder picker to the companion UI; do not accept arbitrary browser paths.
4. Connect TaskEngine's `executeTask`, `emitProgress`, `emitOutput`, and AbortSignal to the local Codex subprocess.
5. Persist task results and provider provenance, never credentials.
6. Run harmless integration tests with an unauthenticated CLI, an authenticated CLI, a missing executable, provider quota/rate-limit errors, cancellation, timeout, and paths outside the approved root.
7. Keep the adapter status `not_configured` until the CLI health check succeeds and the task execution contract has been tested.

## 6. Official references

- Codex CLI install and source: https://github.com/openai/codex
- ChatGPT plan availability: https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan
- Authentication and local credential storage: https://learn.chatgpt.com/docs/auth?surface=cli
- CLI arguments, sandbox, and approval controls: https://learn.chatgpt.com/docs/cli/reference
- Non-interactive execution and streaming: https://learn.chatgpt.com/docs/non-interactive-mode
