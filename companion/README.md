# AURIX local companion (foundation)

A browser tab served from Netlify cannot safely read your disk, run a terminal or launch local CLIs.
The companion is the planned bridge: a small program **you run on your own machine** that AURIX talks to over loopback.

## What exists today
- `server.mjs` — binds to `127.0.0.1` only, requires a bearer pairing token, and implements one read-only endpoint: `GET /v1/health`.
- CORS is answered only for the configured origin (`AURIX_ORIGIN`, default `http://localhost:5173`), with `Access-Control-Allow-Private-Network` for hosted-to-localhost requests.
- Every other path returns `501 NOT_IMPLEMENTED`. **There is no filesystem or terminal access.**

```bash
npm run companion
# AURIX_ORIGIN=https://your-site.netlify.app AURIX_COMPANION_PORT=4317 npm run companion
```
Copy the printed URL and pairing token into **Settings → Local companion**. The token is kept in `sessionStorage` only.

## Designed, not built (see `src/companion/protocol.ts`)
- `filesystem.read` / `filesystem.write` limited to folders the user explicitly grants.
- `terminal.exec` where each command is shown verbatim and needs approval first.
- Adapters that launch Codex, Grok Build and REA locally.
- Audit entries for every approval and execution.

## Not yet verified
- Browser behaviour against a real Netlify HTTPS origin (mixed content and Private Network Access prompts differ by browser).
