# AURIX Implementation Roadmap

The scope is large. Deliver it in tested layers so an attractive interface never masks disconnected or imaginary features.

## Phase 0 — Product and repository foundation
- Confirm desktop/local-first target and supported operating systems.
- Establish code standards, CI, dependency policy and licence inventory.
- Write architecture, threat model and data boundaries.
- Select application shell and local storage format.

**Acceptance:** clean install/build; docs and CI reproducible; no credentials committed.

## Phase 1 — Workspace MVP
- Local profile and project selector.
- Chat interface and conversation history.
- File attachments and project library.
- Provider settings with disconnected/connected/limited states.
- Provider registry and health checks.
- Activity and audit view.

**Acceptance:** conversations persist; project data is isolated; unavailable provider features are visibly disabled.

## Phase 2 — AURIX orchestration core
- Intent/task classifier.
- Model router with user override.
- Task plan and progress state.
- Provider adapter interface.
- Tool-call events and streaming.
- Per-task budget, timeout and cancellation.
- Structured final result with provenance.

**Acceptance:** deterministic routing tests; task cancellation stops child processes; provider failures are surfaced honestly.

## Phase 3 — OpenAI/Codex no-key local path
- Review OpenAI Codex CLI source and terms.
- Add local companion discovery and supported sign-in handoff.
- Investigate Sign in with ChatGPT open-source plan-usage flow.
- Implement local credential storage following official docs.
- Add usage/limit status and disconnect action.
- Keep API-key support optional, not required for initial setup.

**Acceptance:** eligible users can complete official login; ineligible accounts get a truthful explanation; tokens never appear in browser storage, logs or Git.

## Phase 4 — General agent capabilities
- Add Grok Build local companion and ACP/CLI adapter where supported.
- Add Claude Code local companion handoff and compatibility importer.
- Implement common tool broker, shell/filesystem permissions and task event log.
- Add project instructions and AGENTS.md/CLAUDE.md readers.
- Add plan mode and diff review.

**Acceptance:** companion runs only after user authorises it; workspace is scoped; shell/file actions are logged; no vendor credentials are extracted.

## Phase 5 — Skills, plugins and MCP
- Implement skill parser and progressive loading.
- Implement plugin manifest/schema.
- Add marketplace browser.
- Add review, hash pinning, licence display and permissions.
- Add install/disable/update/uninstall/rollback.
- Add MCP server manager and health checks.
- Add hooks with trust and timeout controls.

**Acceptance:** untrusted hooks do not run; plugins remain inactive until approved; updates re-request elevated permissions.

## Phase 6 — Projects, memory and context
- Conversation history search.
- Project instructions and knowledge.
- Local document indexing and retrieval.
- User-approved memory.
- Context ranking, summarisation and compaction.
- Task/session resume and checkpoints.

**Acceptance:** unrelated project data does not leak into context; user can inspect/edit/delete memory; raw history remains recoverable.

## Phase 7 — Coding Studio
- Repository indexing.
- File editing and unified diffs.
- Sandboxed terminal.
- Test/build execution.
- Subagents and worktrees.
- Code review and repair.
- Preview server and browser QA.
- Git branch/commit preparation.

**Acceptance:** sample multi-file feature is planned, implemented, tested, reviewed and reverted; no writes escape authorised workspace.

## Phase 8 — Research Studio and REA
- Web research adapter and citations.
- Evidence/source comparison.
- Connect and verify actual rea-agents runtime.
- Add REA MCP/CLI readiness diagnostics.
- Support scoped investigation cases and evidence bundles.
- Add observation/inference/unknown reporting.

**Acceptance:** REA status reflects a live worker; supported test targets return evidence with limitations; no private source recovery is claimed.

## Phase 9 — 21st.dev design integration
- Add CLI login handoff and MCP adapter.
- Component search and source retrieval.
- Design context and tokens.
- Variant generation only when provider reports AI generation enabled and credits available.
- UI review and safe fixes.
- Publish only after explicit approval.

**Acceptance:** search/retrieval works independently from AI generation; paid/credit-consuming calls are gated and reported.

## Phase 10 — Higgsfield Media Studio
- Add CLI login handoff.
- Discover current models and workflows dynamically.
- Support image, video, audio and supported 3D requests.
- Persist asynchronous job state and result URLs/files.
- Cost/credit preview and confirmation.
- Asset library and provenance.

**Acceptance:** live model schema validated; credit-consuming request requires confirmation; failed/expired jobs recover cleanly; secrets stay server/local-side.

## Phase 11 — 3D Website Studio
- Three.js + React Three Fiber foundation.
- Import GLB/GLTF assets.
- 3D hero and product scenes.
- Camera, lights, materials and basic interactions.
- Combine 3D with 21st.dev UI components.
- Mobile/reduced-motion fallback.
- Preview/build/test workflow.

**Acceptance:** complete 3D product site builds, renders, works on phone-sized viewport and has a tested fallback.

## Phase 12 — Polish and reliability
- Full error handling and telemetry controls.
- Secure backup and restore.
- Accessibility audit.
- Performance profiling.
- Provider disconnect/revoke.
- Export/import.
- Documentation and test coverage.
- Release packaging and signed updates where supported.

**Acceptance:** release checklist, rollback test, privacy review, dependency/licence review and end-to-end tests pass.

---

## Core end-to-end test scenarios

1. **Everyday chat:** route to selected model, retain history and show provider.
2. **Research:** gather sources, compare claims, cite URLs and mark uncertain items.
3. **Coding:** approve plan, implement multi-file change, run tests, review diff and rewind.
4. **Parallel work:** assign research and implementation to separate agents/worktrees; merge only after review.
5. **Plugin:** inspect a plugin, reject broad permissions, install safely, disable and uninstall.
6. **MCP:** connect a test server, inspect schemas, approve a mutating tool and log its result.
7. **Memory:** save a user-approved project decision, retrieve in that project, verify it does not appear in another.
8. **Higgsfield:** inspect schema/cost, request confirmation, submit job, track status and store output.
9. **21st.dev:** search/retrieve a component without assuming AI generation credits exist.
10. **REA:** inspect an authorised sample site/app and create an evidence-backed report.
11. **3D website:** generate a scene, load a GLB, interact on desktop/mobile, verify fallback and build.
12. **Emergency stop:** cancel an active task and confirm child processes stop and no new actions are issued.

## Definition of done

A feature is complete only when it is implemented, connected to a real provider/runtime if required, has correct credential and permission handling, includes success/failure states, has recorded verification, and has updated documentation.

A screen, placeholder button or mocked response is not a completed feature.
