# AURIX

**An independent, local-first, multi-engine AI workspace.**

AURIX brings together conversational AI, research, coding agents, creative media, interactive 3D website creation, skills, plugins, tools and evidence-led application investigation.

This repository is the independent AURIX project. It is separate from the AURIX-REA investigation-console repository.

## Product direction

AURIX uses specialist systems instead of pretending one model is best at every task:

- **OpenAI / ChatGPT / Codex:** optional high-level reasoning, review and local coding-agent integration. Prefer supported ChatGPT sign-in for eligible open-source/local usage; do not require an API key as the default.
- **Claude:** coding-agent workflows and Claude Code interoperability through authorised official routes.
- **Grok:** general conversation and research where authorised; Grok Build as a local coding-agent companion.
- **Higgsfield:** image, video, audio and supported 3D media workflows through its official CLI, MCP or API.
- **21st.dev:** component discovery, design workflows, UI drafting where enabled, themes and publishing.
- **REA:** local, evidence-backed reverse engineering of authorised applications, websites and binaries.

AURIX owns task routing, projects, memory, skills, plugins, tools, permissions, execution records and the user experience. Provider systems are replaceable adapters.

## First principle: no false integrations

AURIX must distinguish:
1. a native AURIX feature;
2. a feature provided by a locally installed companion;
3. a feature delivered by a connected provider account;
4. a planned feature.

A model product is not automatically an embeddable API. Subscription sign-in is not permission to extract or relay private credentials. AURIX must not claim to have recovered private model weights, internal prompts or inaccessible server code.

## Documentation

- [Windows desktop companion guide](windows/Aurix.Desktop/README.md)
- [Windows desktop architecture and current limits](docs/WINDOWS_DESKTOP_ARCHITECTURE.md)
- [AURIX launch readiness and release gates](docs/LAUNCH_READINESS.md)
- [Windows code-signing policy and current status](docs/CODE_SIGNING_POLICY.md)
- [Complete feature catalogue](docs/FEATURE_CATALOG.md)
- [System architecture](docs/ARCHITECTURE.md)
- [Provider and authentication matrix](docs/PROVIDER_MATRIX.md)
- [Unified skills and plugin system](docs/EXTENSIONS.md)
- [3D website studio](docs/3D_WEBSITE_STUDIO.md)
- [Implementation roadmap and acceptance tests](docs/ROADMAP.md)
- [Phase 2 orchestration contract](docs/PHASE_2_CONTRACT.md)
- [Phase 2 implementation notes](docs/PHASE_2_IMPLEMENTATION.md)
- [Official Codex CLI local integration](docs/CODEX_LOCAL_INTEGRATION.md)

## Initial technical direction

- **Desktop/local-first shell:** local companion processes and user-owned project folders.
- **Web UI:** React + TypeScript. Reuse proven patterns from existing projects, but do not blindly copy the AURIX-REA investigation console.
- **3D:** Three.js + React Three Fiber, GLB/GLTF asset support and an accessible non-3D fallback.
- **Agent integrations:** MCP and ACP adapters where supported, plus provider-specific official CLI/SDK adapters.
- **Storage:** local SQLite and project files initially; optional encrypted sync later.
- **Execution:** scoped workspaces, least-privilege permissions, approvals for sensitive actions, audit logs and emergency stop.

## Current status

The Phase 0–1 application source is now available as ordinary tracked project files on the source-promotion branch. Its clean-source CI has verified dependency installation, TypeScript checks, unit tests, production build and browser smoke tests.

The Phase 2 Task Center and local task engine are implemented on the current development branch: tasks persist locally, receive transparent rule-based classification, build plans, route only to eligible connected providers, store progress/output events, support retry, timeout and cancellation, and recover interrupted work honestly. The real Codex/Claude/Grok/Higgsfield/REA/21st.dev provider execution adapters are not yet connected; a task must remain waiting rather than fabricate an AI result. See the Phase 2 docs for exact acceptance and limitations.

The official Codex CLI local integration path has been researched and documented. No API key is required for the supported ChatGPT sign-in path, but Codex use still follows the user's plan limits. AURIX is not yet deployed, and a passing CI run is not a deployment or proof of a connected provider.

## Legal and technical note

AURIX may independently implement similar user-facing capabilities and reuse code only where the upstream licence permits it. Reused dependencies, components, skills, plugins and models must retain applicable notices, comply with provider terms and be reviewed before use.
