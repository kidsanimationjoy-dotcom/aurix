# AURIX local companion

A browser tab cannot directly inspect the user's computer. The companion is a small program **the user runs locally** that AURIX contacts over loopback with a pairing token.

## Implemented today

- Binds to `127.0.0.1` only.
- Uses a per-run bearer pairing token and validates both Origin and Host to reduce DNS-rebinding / cross-site request risks.
- Implements authenticated `GET /v1/health`.
- Implements authenticated `GET /v1/codex/status`, which checks `codex --version` and `codex login status`.
- Implements authenticated `POST /v1/codex/login`, which starts the official `codex login` command in the companion terminal so the user completes Codex's own browser sign-in.
- Does not read, copy, or export `~/.codex/auth.json`, environment credentials, cookies, or browser storage.
- Uses an allowlisted environment for Codex subprocesses and does not pass `OPENAI_API_KEY` from the companion environment.
- Supports Windows Codex command shims by invoking `cmd.exe` only for the fixed status/login argument set; no prompt or user-supplied command is sent through a shell.

## Not implemented

- No filesystem read/write endpoint.
- No terminal endpoint.
- No AURIX Codex task execution endpoint.
- No project folder has been granted.
- No Codex logout action (it could affect the user's other Codex clients).

Codex being installed and signed in means only that the official CLI status check succeeded. It does **not** mean AURIX can run chat or coding tasks yet. Execution remains disabled until AURIX can guarantee and verify the narrowly scoped permission profile. Ordinary Codex read-only mode can still read broadly from the machine, so AURIX must not treat it as an isolated chat sandbox.

## Run the companion

```bash
npm run companion
# On a hosted AURIX origin:
# AURIX_ORIGIN=https://your-site.example AURIX_COMPANION_PORT=4317 npm run companion
```

Copy the printed local URL and pairing token into **Settings → Local companion**. The token is kept in browser `sessionStorage` only. Use the companion terminal to complete the official Codex sign-in after pressing **Sign in with ChatGPT** in AURIX.

## Security boundaries

- The web client only accepts HTTP loopback companion addresses (localhost, 127.0.0.1, or ::1).
- The server rejects non-loopback Host headers and foreign Origins.
- Pairing-token comparison is timing-safe.
- Codex login output is inherited by the local terminal; it is not captured by the HTTP API.
- The CLI handles its own credentials. AURIX never inspects its credential cache.
- Codex task execution is explicitly disabled until a restricted filesystem permission profile is enforced and verified on each supported platform.

Windows command-launch behaviour follows the Node.js child-process guidance for `.cmd` / `.bat` files: https://nodejs.org/api/child_process.html

See `src/companion/protocol.ts` and `docs/CODEX_LOCAL_INTEGRATION.md` for the current API and roadmap.
