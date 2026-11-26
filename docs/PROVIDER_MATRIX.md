# Provider and Authentication Matrix

This matrix is a design constraint. It prevents AURIX from confusing account sign-in, API access, local CLI access and permission to reuse proprietary services.

| Provider/system | Best AURIX role | Supported route to investigate | API key? | Important boundary |
|---|---|---|---|---|
| OpenAI Codex | Local coding agent; optional reviewer | Official Codex CLI with user-completed ChatGPT sign-in; optional API-key mode | No API key needed for supported ChatGPT sign-in | Current OpenAI help docs say Codex is included across ChatGPT plans, including Free and Go, with plan-dependent limits. Codex Cloud has separate eligibility rules. |
| OpenAI model API | Optional hosted model adapter | Official API / Responses API | Normally yes | API billing is separate from ChatGPT plan billing |
| Claude Code | Local coding-agent companion and compatibility reference | Official locally installed Claude Code; user completes its sign-in | Not necessarily for official app itself | Do not relay subscription OAuth tokens or impersonate Claude Code |
| Claude Agent SDK | SDK reference/provider integration | Official SDK | Requires authorised Anthropic account/provider setup | SDK does not make Claude model weights open source; check current terms |
| Grok Build | Local coding agent and developer workflow companion | Official Grok Build CLI with browser sign-in; ACP/headless where supported | Not necessarily for interactive local sign-in | API key is a separate route for scripted/API usage |
| xAI model API | General conversation/research adapter | Official xAI API | Normally yes | Model API availability and quota are separate from local Grok Build login |
| Higgsfield | Image/video/audio/3D creative execution | Official CLI login, MCP or REST API | CLI route: no separate API key; direct REST: API key | Account plan and credits govern usage; paid generation needs confirmation |
| 21st.dev | Component search, UI drafting and design workflows | Official CLI browser login, MCP | CLI login can avoid pasting a key; CI/API route uses key | Search/retrieval and AI generation have different plan/credit rules |
| REA | Local evidence-led investigation | rea-agents Node CLI and local MCP runtime | Not a model API key; some analysis families need external tools/providers | Inspects authorised targets and available evidence; cannot reveal inaccessible private server code or private weights |
| Three.js / React Three Fiber | AURIX-native 3D rendering | Open-source dependencies | No | Renderers/frameworks, not generative AI services |

## OpenAI / ChatGPT plan usage

The official Codex CLI supports ChatGPT OAuth sign-in for local work and also supports API-key sign-in. Current OpenAI help documentation says Codex is included across ChatGPT plans, including Free and Go, with usage limits varying by plan. Codex Cloud is separately restricted to eligible paid and workspace accounts; do not confuse local CLI access with cloud-agent access.

Requirements:
- Install and invoke the official Codex CLI; let the user complete its own browser-based ChatGPT sign-in.
- Use `codex login status` to check whether the CLI has a login configured. Do not read or copy its cached credentials.
- Codex stores login information in `~/.codex/auth.json` or an OS credential store. Treat the file as a password; AURIX must not read, copy, upload, expose, or log it.
- Use the CLI's documented sandbox and approval controls. Prefer workspace-scoped sandboxing; never use the dangerous approvals-and-sandbox bypass.
- Keep CLI execution local to an explicitly selected project folder. No arbitrary root-directory access.
- Keep API-key sign-in optional. ChatGPT sign-in follows the user's plan limits and workspace controls.
- The local CLI integration does not grant AURIX access to ChatGPT conversations or memory.
- Hosted or remote AURIX products require separate provider review and must not inherit local credentials.

The official Codex CLI is the first preferred OpenAI integration route for AURIX. Integrate it as a user-authorised local companion rather than scraping browser state or relaying private credentials.

## Claude

AURIX may:
- parse compatible Claude project instructions, skills and plugin manifests;
- provide a button to open a selected workspace in the user's official Claude Code installation;
- use public, appropriately licensed SDK examples as architecture references.

AURIX must not:
- copy Claude's private model weights or backend;
- claim Claude Code's public repository is a permissively licensed copy of the model;
- collect or proxy personal Claude subscription credentials;
- present Claude API access as free because a user has a Claude subscription.

## Grok

AURIX may:
- use public Grok Build source under its actual Apache-2.0 licence, preserving notices and reviewing third-party notices;
- run a user-authorised local Grok Build companion;
- interoperate with documented skills, plugins, MCP servers, AGENTS.md and hooks.

AURIX must distinguish Grok Build interactive sign-in from xAI API credentials. Public Grok-1 weights/code are an older release, not the current Grok service.

## Higgsfield

- CLI account login is different from direct API authentication.
- CLI/MCP workflows may use the user's authorised account and credits.
- Direct REST requests use official API credentials and should be server-side.
- Never place API keys in browser bundles.
- Track request IDs, user ownership, status, failures and result retention.
- Check current model schema and cost estimate before paid requests.
- Provide confirmation before credit-consuming generation.

## 21st.dev

- CLI login can save a local token without requiring the user to paste an API key.
- API-key authentication is available for scripts/CI.
- Check usage and generation eligibility before invoking AI generate/iterate.
- Component search and retrieval are not the same as paid AI generation.
- Sketch output is a design draft; rebuild it in the app's actual framework and run tests.

## REA

- rea-agents is a local CLI/MCP tool.
- It requires a supported Node runtime and, for some analysis families, external analysis tools/providers.
- The current AURIX-REA investigation console is not itself a connected REA runtime; its EngineStatus component explicitly records that the engine is pending.
- Connect and test REA in a local worker before advertising analysis as live.

## Credential architecture

- Store provider tokens in OS-protected credential storage where possible.
- Never store provider secrets in ordinary project files or public GitHub repositories.
- Do not log access/refresh tokens, OAuth codes or sensitive authorization URLs.
- Redact secrets from tool output and diagnostics.
- Provide per-provider disconnect and token-revocation guidance.
- Use least-privilege scopes and show exact permissions requested.
- Local-first credentials remain local; a future hosted version requires approved secure credential brokering and provider review.

## Reference documentation

- OpenAI Codex with ChatGPT plan: https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan
- Codex CLI installation and source: https://github.com/openai/codex
- Codex CLI authentication and credential storage: https://learn.chatgpt.com/docs/auth?surface=cli
- Codex CLI command reference: https://learn.chatgpt.com/docs/cli/reference
- Codex non-interactive runs: https://learn.chatgpt.com/docs/non-interactive-mode
- Claude Code: https://code.claude.com/docs/
- Claude plugins: https://github.com/anthropics/claude-plugins-official
- Claude Agent SDK: https://github.com/anthropics/claude-agent-sdk-typescript
- Grok Build: https://github.com/xai-org/grok-build
- Grok Build docs: https://docs.x.ai/build/overview
- Higgsfield Skills: https://github.com/higgsfield-ai/skills
- Higgsfield API: https://open.higgsfield.ai/
- 21st.dev MCP: https://docs.21st.dev/mcp
- REA: https://github.com/morluto/rea
