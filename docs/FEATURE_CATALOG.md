# AURIX Complete Feature Catalogue

This document converts the researched capabilities of Claude, Grok Build, OpenAI/Codex, Higgsfield, 21st.dev and REA into a product-level feature inventory.

It distinguishes a product capability from a provider integration. AURIX should reproduce useful workflows independently or through supported integrations, not copy private code or promise that every service is available without an account.

Status vocabulary:
- **Core:** AURIX implements and owns the feature.
- **Provider-backed:** requires an authorised provider connection.
- **Companion:** delegated to an official locally installed application or CLI.
- **Later:** planned after the core is stable.
- **Restricted:** cannot be copied or should not be attempted.

---

## 1. Unified AURIX workspace

### Chat and conversations
- Streaming conversation with stop, retry, regenerate and edit-message controls.
- Multiple conversations with search, rename, archive, delete and export.
- Attach files, images and supported documents.
- Conversation branching and continue-from-here.
- Provider/model selector with automatic routing and manual override.
- Reasoning-effort selector only where the selected provider supports it.
- Citations and source cards for research claims.
- Tool-call timeline with provider identity and execution status.
- Conversation-level context and explicit project attachment.
- Clear separation between model answer, tool output, generated asset and verified code change.

### Projects and workspaces
- Create projects with name, description, instructions and icon.
- Project files, reference material, notes, tasks and conversations.
- Project-specific skills, agents, permissions and model routing.
- Link an existing local Git repository or create a project folder.
- Activity feed, decisions log, checkpoints and recovery.
- Project export/import with manifest and file hashes.
- Project memory isolated from unrelated projects.
- User can inspect and edit saved instructions and memory.

### Research workspace
- Web search, page fetch, source comparison and citation capture.
- Search history and research collections.
- Evidence table containing source URL, date, supported claim and confidence.
- Distinguish primary sources, secondary sources, opinion and user-provided material.
- Document Q&A using local indexing and retrieval.
- Multi-step research plan and independent reviewer pass.
- Export research to Markdown, PDF or DOCX after validation.
- Never fabricate citations; unresolved claims remain marked unverified.

---

## 2. Claude-inspired coding environment

The goal is a capable coding-agent workflow, not a copy of Claude's private model.

### Repository understanding
- Read repository structure, manifests, docs, tests and project instructions.
- Search symbols, files, dependencies and references.
- Build a code index and dependency graph.
- Summarise architecture and identify entry points.
- Detect framework, language, build system and test commands.
- Understand monorepos and multi-package layouts.
- Track conventions and relevant files.

### File and terminal tools
- Read, create, edit, move and delete files inside an authorised workspace.
- Show unified diffs before and after edits.
- Run commands in a controlled terminal.
- Stream output and retain logs.
- Stop commands and cancel tasks.
- Allowlist and denylist shell commands.
- Never execute uploaded files or repository scripts automatically.
- Require confirmation for destructive, external-network, credential, deployment or system-level actions.

### Coding-agent loop
1. Understand the request and repository context.
2. Ask only blocking questions.
3. Produce a scoped implementation plan.
4. Identify files and risks.
5. Request approval for consequential operations.
6. Make small, reviewable edits.
7. Run formatter, type checker, tests and build.
8. Inspect failures and repair them.
9. Review the diff for regressions.
10. Summarise changed files, tests and limitations.

### Planning and autonomy
- Read-only exploration mode.
- Plan mode where edits are blocked until plan approval.
- Step-by-step task list with dependencies and outcomes.
- User can comment on or revise plan steps.
- Background tasks with pause, resume, cancel and output retrieval.
- Long-running task budgets and maximum-turn limits.
- Checkpoints before risky changes.
- Resume sessions without relying only on raw transcript replay.

### Specialist coding agents
- Explore agent: read-only codebase investigation.
- Planner: architecture and implementation plan.
- Implementer: scoped code changes.
- Test engineer: tests, fixtures and failure diagnosis.
- Reviewer: separate pass over diff and security.
- UI engineer: responsive interface and accessibility.
- 3D engineer: scenes, models, animation and performance.
- Documentation agent: usage and technical docs.
- Orchestrator merges results and resolves disagreements.
- Each agent receives only the tools, folders and project context it needs.

### Coding-specific features
- Git status, diff, branch creation and commit preparation.
- Optional worktree per agent/task to avoid conflicting edits.
- Conflict detection and controlled merge.
- Code review with file and line references.
- Test discovery and coverage summary.
- Dependency and licence inventory.
- Secret scanning before commits.
- Preview server and browser-based UI verification.
- Build logs, screenshots and reproducible test records.
- Checkpoint/rewind and restore from a known-good state.

### Claude interoperability
- Read compatible CLAUDE.md and .claude/rules instructions.
- Import compatible SKILL.md skills and plugin manifests.
- Parse supported MCP server declarations.
- Support Claude-style hooks through an explicitly reviewed adapter.
- Provide an Open in Claude Code or local companion handoff when the official app is installed and authorised.
- Do not copy proprietary Claude Code binaries, private prompts or model weights.
- Do not use a Claude subscription token as AURIX's hidden provider credential.

---

## 3. Grok-inspired general AI and agent platform

### General conversation and research
- Normal conversational mode for everyday questions.
- Current web research and source comparison where connected.
- X/social search only through an authorised, available capability.
- Image understanding and document analysis.
- Reasoning-effort selection where supported.
- Research mode with parallel investigations and merged findings.
- Distinguish model knowledge from retrieved current information.

### Grok Build-inspired coding/agent capabilities
- Terminal interface or embedded local agent companion.
- Plan viewer and edit gate.
- Subagents with separate contexts.
- Worktree-based parallel tasks.
- Skills, slash commands and project-level AGENTS.md.
- Plugins and marketplace browsing.
- MCP server configuration and connectivity diagnostics.
- Hooks for lifecycle events.
- Persistent memory and session resume.
- Background tasks, workflow runs and dashboard.
- Headless/scripted mode where supported.
- Sandboxed terminal/file access.
- Git integration and code review.
- Configurable tool permission modes and deny rules.
- Model selection, reasoning effort and usage display where supported.

### Grok compatibility
- Read .grok/config.toml and documented project instructions where appropriate.
- Import compatible .grok/skills, .grok/plugins and AGENTS.md.
- Provide a Grok Build companion adapter using its documented CLI/ACP interface.
- Keep xAI model API usage distinct from local Grok Build account sign-in.
- Do not claim the open Grok-1 weights are the current Grok production model.

---

## 4. OpenAI / ChatGPT / Codex-inspired intelligence

### OpenAI integration options
- Local Codex CLI companion, authenticated by supported ChatGPT sign-in.
- Optional Sign in with ChatGPT plan-usage connection for eligible local open-source clients, subject to current eligibility and terms.
- Optional API-backed model integration only if the owner later chooses to configure it.
- Provider-neutral Responses-style adapter where permitted.
- Usage display and account disconnect controls.
- Never scrape ChatGPT web sessions or extract private ChatGPT credentials.

### OpenAI/Codex-inspired capabilities
- Local codebase agent and shell/file tools.
- Plan, implement, test and review loop.
- Skills loaded from capability directories.
- MCP tools and application-defined function tools.
- Sandboxed execution where supported.
- Session state, compaction and resume where supported.
- Subagent delegation where supported by the selected integration.
- Browser, web-search and data tools only when available and enabled.
- Optional high-level review pass by an OpenAI model when the integration allows it.

### No-key boundary
OpenAI documents a no-API-key OAuth route for eligible open-source/local applications. ChatGPT plan usage is not a way to access every ChatGPT product feature or private chat history. Eligibility, account plan, shared usage limits and application approval rules must be checked at connection time. The current Free account must not be represented as eligible for Plus/Pro plan-backed usage.

---

## 5. Higgsfield creative production workspace

Model names, schemas, costs and supported options must be discovered from the live provider catalogue before submitting a paid generation job.

### Image
- Text-to-image.
- Image editing and restyling.
- Image reference and composition guidance.
- Aspect ratio, resolution and output format.
- Variant generation and selection.
- Product images and lifestyle photography.
- Brand assets, logos and mockups.
- YouTube thumbnails and social assets.
- Upscaling/background removal when available.

### Video
- Text-to-video.
- Image-to-video.
- Video references and multi-shot workflows.
- Video editing, continuation and reframing where supported.
- Character, environment and style consistency.
- Cinematic scene planning and camera direction.
- Narration, voice/audio and music where available.
- Faceless explainers, documentary and story workflows.
- Advertising, UGC and virtual presenter workflows.
- Video engagement/virality analysis where available.
- Render queue, progress, retry and completed-asset library.

### 3D and audio
- 3D asset generation where a currently listed model supports it.
- GLB/GLTF ingestion into AURIX's 3D builder.
- Text-to-audio, sound effects and voice workflows where available.
- Media provenance, format and model metadata.
- Validate geometry, textures, rigging and licensing; do not assume generated assets are production-ready.

### Identity and brand
- Soul ID/reusable identity references, only with subject consent and provider approval.
- Brandkit: palette, logo, typography, mockups, packaging, signage, social assets and brandbook.
- Product photoshoot modes.
- Marketplace product-card pipeline.
- Brand consistency review and approved asset library.

### Higgsfield CLI/agent capabilities
- Official CLI account status and login handoff.
- Skill installation and discovery.
- Model catalogue and schema inspection.
- Workflow discovery and parameter validation.
- Cost estimation before generation where exposed.
- Asynchronous job submission, status polling, cancellation and retry.
- Local asset upload and result download.
- Secure credential handling and usage/credit visibility.
- Confirmation before credit-consuming generation.

---

## 6. 21st.dev design and UI engine

### Component library
- Search components by keyword, category, design intent and project context.
- Inspect actual source code and dependencies before adding.
- Install components into the existing project's framework.
- Browse themes, templates, animated heroes, backgrounds, gradients, shaders, galleries and 3D-related examples.
- Bookmark components and organise lists.
- Team libraries where supported by the provider account.

### 21st AI workflows
- Sketch multiple UI variants from a prompt.
- Preview variants.
- Iterate on a selected variant.
- Retrieve resulting source or copy-prompt.
- Rebuild sketches in the project's real framework; do not treat raw sketch HTML as production-ready.
- Check AI-generation eligibility and available credits before generation.
- Clearly display when search/retrieval is free, limited or paid, and when generation requires credits.

### Design system
- Read existing design tokens and component conventions.
- Create/update project design context.
- Publish a project theme.
- Publish components and templates.
- Manage published component metadata and visibility.
- UI exploration and UI review workflows.
- Accessibility, responsive layout, keyboard interaction and reduced-motion review.

### 3D distinction
21st.dev is a design/component supply and generation workflow, not the 3D renderer. AURIX must use a real 3D runtime such as Three.js + React Three Fiber and load validated GLB/GLTF assets.

---

## 7. REA reverse-engineering and evidence workspace

REA is an investigation engine, not the master conversational model and not a private-source recovery backdoor.

### Supported investigation categories
- Websites and browser-visible behaviour.
- JavaScript applications and Electron apps.
- Native binary analysis through supported providers.
- .NET assemblies.
- Android packages/devices and resources.
- Firmware and embedded formats.
- WebAssembly and EVM bytecode.
- Network captures and process/runtime evidence.
- Package/archive and selected database formats.

### Evidence and analysis
- Target inventory and scope declaration.
- Static analysis and source-map recovery when available.
- Browser observation and network inspection.
- Feature trace across modules and process boundaries.
- Evidence IDs, file references and hashes.
- Coverage, limitations and unknowns.
- Compare application versions and captures.
- Reconstruction obligation ledger.
- Verification against finite test cases and observed behaviour.
- Exportable evidence bundle and report.

### REA safety and truthfulness
- Use only software and services the user is authorised to inspect.
- Prefer source code, SDKs and public docs when available.
- Do not attempt private vendor infrastructure, secrets or private model weights.
- A website inspection returns what the browser can observe, not the server's private implementation.
- Keep observation, inference and unknown separate.
- Do not label a recreation exact unless source-level proof and licence permission establish it.

---

## 8. AURIX-native systems that unify everything

These belong to AURIX itself, not to provider adapters:

1. Model/provider registry and health checks.
2. Intent router and user-overridable routing policy.
3. Agent orchestrator, specialist roles and bounded parallelism.
4. Conversation and project state management.
5. Short-term, project and user-controlled long-term memory.
6. Context packing, retrieval and compaction.
7. Unified skills registry and compatibility parser.
8. Unified plugin/marketplace registry with trust controls.
9. MCP client and tool catalogue.
10. ACP/local companion adapters where supported.
11. Permission engine and approval UI.
12. Sandboxed task execution and workspace boundaries.
13. Background task queue and progress dashboard.
14. Artifact, file and media library.
15. Preview environment for web/3D output.
16. Testing and verification orchestrator.
17. Usage, credits and cost ledger.
18. Audit logs, export and emergency stop.
19. Settings, backup, recovery and provider disconnect.
20. Plugin/skill update, version pinning and rollback.

## 9. Recommended AURIX navigation

- Home / Chat
- Projects
- Coding Studio
- Research
- Media Studio
- 3D Website Studio
- Artifacts and Previews
- Agents and Tasks
- Skills
- Plugins / Marketplace
- MCP Tools
- Memory
- Asset Library
- Usage
- Settings / Security

The interface should show unavailable or unauthorised provider features as disconnected, not as functioning buttons.
