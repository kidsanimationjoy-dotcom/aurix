# Provider and Authentication Matrix

This matrix is a design constraint. It prevents AURIX from confusing account sign-in, API access, local CLI access and permission to reuse proprietary services.

| Provider/system | Best AURIX role | Supported route to investigate | API key? | Important boundary |
|---|---|---|---|---|
| OpenAI Codex | Local coding agent; optional reviewer | Official Codex CLI, ChatGPT sign-in, documented open-source Sign in with ChatGPT | Not necessarily for eligible supported local/plan flows | ChatGPT plan usage is eligibility-gated, account-limited and does not expose private chat history |
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

OpenAI documents a Sign in with ChatGPT flow for open-source and local applications. It separates:
- identity: sign in to an AURIX account;
- optional plan usage: permission for eligible AI requests to use the user's ChatGPT plan/credits.

Requirements:
- Use the documented OAuth flow and security model.
- The user chooses whether to grant plan-usage permission.
- The integration does not grant access to ChatGPT conversations or memory.
- Eligible plan availability is limited; current documentation describes Plus/Pro plan usage for the open-source/local flow.
- Plus usage can share a rolling usage window across participating apps.
- Paid/remote-hosted products require separate provider approval.
- The current AURIX owner account is on Free, so do not promise plan-backed model use for that account until its eligibility changes.
- Tokens stay in protected local/self-hosted storage. Never expose them to browser JavaScript, logs, analytics, source control or URLs.

Codex CLI is a separate practical option: the official CLI repository documents ChatGPT sign-in for supported ChatGPT plans, alongside API-key authentication. AURIX should integrate it as a user-authorised local companion rather than scrape its session.

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

- OpenAI Sign in with ChatGPT: https://developers.openai.com/siwc/
- OpenAI local open-source sign-in quickstart: https://developers.openai.com/siwc/quickstart
- OpenAI profiles, sessions and token security: https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions
- OpenAI Codex: https://github.com/openai/codex
- Claude Code: https://code.claude.com/docs/
- Claude plugins: https://github.com/anthropics/claude-plugins-official
- Claude Agent SDK: https://github.com/anthropics/claude-agent-sdk-typescript
- Grok Build: https://github.com/xai-org/grok-build
- Grok Build docs: https://docs.x.ai/build/overview
- Higgsfield Skills: https://github.com/higgsfield-ai/skills
- Higgsfield API: https://open.higgsfield.ai/
- 21st.dev MCP: https://docs.21st.dev/mcp
- REA: https://github.com/morluto/rea
