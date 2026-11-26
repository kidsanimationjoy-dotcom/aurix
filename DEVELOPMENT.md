# AURIX app — development notes (Phase 0–1)

> This file is intentionally not named README.md so it cannot overwrite the repository's existing README.
> Merge the sections you want into the README.

## Run
```bash
npm install
npm run dev          # http://localhost:5173
npm test             # node:test + tsx, no browser needed
npm run typecheck
npm run build        # tsc --noEmit && vite build -> dist/
npm run preview      # then: npm run smoke  (needs `npx playwright install chromium`)
npm run companion    # optional local companion (health check only)
```

## Layout
| Path | Purpose |
|---|---|
| `src/domain` | Typed records, built-in agent definitions |
| `src/storage` | `Db` (cache + subscriptions + append-only audit), `IndexedDbBackend`, `MemoryBackend` |
| `src/adapters` | `ProviderAdapter` interfaces and six interface-only adapters (Claude, Grok, OpenAI/Codex, Higgsfield, 21st.dev, REA) |
| `src/router` | `routeTask` provider router; nav + hash routes |
| `src/companion` | Companion protocol types and a real health probe |
| `companion/` | Reference companion server (health only) |
| `src/pages`, `src/ui` | The 15 pages and shared components |
| `tests/`, `scripts/smoke.mjs` | Unit tests and Playwright smoke test |

## Rules the code enforces
- A provider is only "connected" if its adapter says so. All six currently report `not_configured` / `interface_only`.
- Adapter calls return `NOT_CONNECTED` errors, never fake success. `MediaJob` cannot be `completed` without at least one output (type-level).
- Chat messages are labelled "saved locally, not sent" unless a provider actually answers.
- Terminal, preview, tests and Git are gated behind the companion and are not simulated.
- Deletes need a second click; the audit log cannot be edited or deleted through the app.
