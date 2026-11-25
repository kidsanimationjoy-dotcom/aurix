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

- [Complete feature catalogue](docs/FEATURE_CATALOG.md)
- [System architecture](docs/ARCHITECTURE.md)
- [Provider and authentication matrix](docs/PROVIDER_MATRIX.md)
- [Unified skills and plugin system](docs/EXTENSIONS.md)
- [3D website studio](docs/3D_WEBSITE_STUDIO.md)
- [Implementation roadmap and acceptance tests](docs/ROADMAP.md)

## Initial technical direction

- **Desktop/local-first shell:** local companion processes and user-owned project folders.
- **Web UI:** React + TypeScript. Reuse proven patterns from existing projects, but do not blindly copy the AURIX-REA investigation console.
- **3D:** Three.js + React Three Fiber, GLB/GLTF asset support and an accessible non-3D fallback.
- **Agent integrations:** MCP and ACP adapters where supported, plus provider-specific official CLI/SDK adapters.
- **Storage:** local SQLite and project files initially; optional encrypted sync later.
- **Execution:** scoped workspaces, least-privilege permissions, approvals for sensitive actions, audit logs and emergency stop.

## Current status

This repository contains the product blueprint. It is not yet a working multi-provider AI application. The roadmap defines what must be implemented and tested.

## Legal and technical note

AURIX may independently implement similar user-facing capabilities and reuse code only where the upstream licence permits it. Reused dependencies, components, skills, plugins and models must retain applicable notices, comply with provider terms and be reviewed before use.
