# AURIX System Architecture

## 1. Architecture goals

1. Provider-independent core: no provider owns AURIX memory, project database, UI or orchestration.
2. Local-first execution: user project files and credentials remain on the user's machine by default.
3. Explicit provenance: every model answer, tool result, media asset and code change records its source.
4. Replaceable adapters: local companions, MCP servers, SDKs and hosted APIs implement a common internal contract.
5. Bounded autonomy: agents work within a scoped project, time/token budget and permission profile.
6. Honest capability reporting: disconnected or unsupported features are visibly unavailable.
7. Evidence-led verification: a result is not complete until applicable checks pass.

## 2. High-level components

~~~text
AURIX UI
  - Chat and conversation workspace
  - Projects and files
  - Coding Studio
  - Research Studio
  - Media Studio
  - 3D Website Studio
  - Agents / Tasks dashboard
  - Plugins / Skills / MCP manager
  - Provider / Usage / Security settings
          |
AURIX APPLICATION CORE
  - Identity and local profile
  - Project and conversation service
  - Intent classifier and model router
  - Agent/task orchestrator
  - Context and memory manager
  - Skills registry
  - Plugin and marketplace manager
  - MCP / ACP tool broker
  - Permission and policy engine
  - Execution supervisor
  - Artifact/media library
  - Usage and cost ledger
  - Audit and observability service
          |
ADAPTER LAYER
  - OpenAI / Codex local and supported sign-in adapter
  - Claude Code local companion adapter
  - xAI / Grok Build adapter
  - Higgsfield CLI / MCP / API adapter
  - 21st.dev CLI / MCP adapter
  - REA CLI / MCP adapter
          |
EXECUTION BOUNDARIES
  - Project-scoped filesystem workspace
  - Shell sandbox
  - Browser test environment
  - Preview server
  - Media generation job runner
  - Three.js / React Three Fiber runtime
~~~

## 3. Core task lifecycle

1. Receive user instruction and attachments.
2. Resolve project, files, user settings and relevant context.
3. Classify intent: chat, research, coding, media, 3D, reverse engineering or mixed.
4. Select provider/agent by user choice, capability, availability, privacy and usage limits.
5. Create a bounded task with scope, tools, model, budget, permissions and expected outputs.
6. Load only relevant skills and project instructions.
7. Build context from current messages, project memory and retrieved files.
8. Plan; request approval when the operation is ambiguous or high-impact.
9. Execute tools and record events.
10. Validate outputs: tests, build, screenshots, media metadata or evidence coverage.
11. Ask for approval before publication, deployment, external communication or destructive actions.
12. Save results, decisions, provenance and a concise session summary.

## 4. Model router

Support:
- manual provider/model selection;
- automatic routing by task type;
- user-defined priorities;
- capability checks before routing;
- account/credential status;
- usage and cost limits;
- local vs hosted privacy preference;
- fallback only after a clear failure and only when policy allows;
- visible explanation of the selected engine.

The router must not equate more expensive with better. For complex work it may call a specialist and reviewer, but concurrency and total spend are bounded.

Example policy:
- general conversation -> user's selected general model;
- current research -> model with authorised web search;
- multi-file software task -> local coding agent;
- media request -> Higgsfield workflow;
- component search and interface draft -> 21st.dev;
- authorised application inspection -> REA;
- final architecture review -> selected high-capability reviewer if available.

## 5. Agent orchestration

### Parent agent
- owns the user's objective;
- creates a task graph;
- assigns narrow tasks;
- monitors child tasks;
- resolves conflicting results;
- verifies final work.

### Specialist agents
Each agent has role, task types, read/write scope, allowed tools, preferred provider/model, time/token budget, concurrency limit, output contract and stop conditions.

Default roles:
- researcher;
- codebase explorer;
- planner;
- implementer;
- test engineer;
- reviewer;
- UI/UX engineer;
- 3D engineer;
- documentation writer;
- REA analyst.

Parallel agents must not edit the same files in one worktree. Use separate worktrees or read-only roles, then merge through review.

## 6. Memory and context

Separate:
- conversation history (immutable session record);
- short-term active context;
- user-approved profile memory;
- project memory;
- project knowledge index;
- task/session state;
- tool outputs and evidence.

Memory rules:
- save preferences only when relevant and permitted;
- never silently promote sensitive information into persistent memory;
- allow inspect, edit, export and delete;
- retrieve only relevant project/user facts;
- preserve source links and timestamps;
- compaction never deletes the original transcript;
- show when an answer uses retrieved memory or project material.

Context manager:
- estimate context size;
- rank relevant messages/files/tool outputs;
- include summaries with source pointers;
- avoid repeatedly injecting full file contents;
- preserve important decisions, tests and unresolved work;
- keep raw event log available for audit.

## 7. Skills, plugins and tools

Skills:
- parse compatible SKILL.md packages;
- validate frontmatter;
- discover names/descriptions and load details progressively;
- support optional scripts, references and templates;
- track scope, version, source pin and disabled state;
- support explicit invocation and automatic matching.

Plugins:
- register marketplace sources;
- validate manifests;
- inventory files/scripts and licences;
- hash and pin exact versions;
- list dependencies and requested capabilities;
- require user approval;
- support install/update/disable/remove/rollback;
- keep hooks and MCP inactive until trusted;
- log activity and errors.

MCP broker:
- discover server tools;
- expose only approved tools to each task;
- validate input schemas;
- enforce timeouts and result-size caps;
- record requests, results and errors;
- redact credentials;
- distinguish read-only from mutating actions.

ACP/local companion adapter:
- discover whether an official CLI supports documented ACP or headless use;
- run as a child process with explicit user authorisation;
- scope its working directory and environment;
- stream status/events to AURIX;
- never scrape hidden browser sessions or copy tokens across vendors.

## 8. Coding execution environment

- Create a project workspace selected by the user.
- Use a per-task sandbox/container where practical.
- Restrict writes to selected project and temporary directories.
- Deny secret/credential directory reads by default.
- Require approval for system-wide changes, credentials, external network, deployment and destructive deletes.
- Record command, working directory, exit code and log pointer.
- Provide a visible emergency stop that cancels AURIX-owned child processes.
- Do not run unknown repository scripts automatically.
- Treat repository instructions and third-party output as untrusted data until reviewed.

## 9. 3D runtime architecture

- React application shell.
- React Three Fiber scene renderer.
- Three.js rendering primitives.
- GLB/GLTF importer with validation.
- Camera, lighting, animation and interaction controllers.
- Shader/material component catalogue.
- Performance monitor and quality settings.
- Responsive layout and reduced-motion fallback.
- Scene inspector and property panel.
- Code editor for scene scripts/components.
- Preview, screenshot and build verification.
- Asset provenance and licence metadata.

## 10. Storage

Initial local-first storage:
- SQLite for local metadata;
- filesystem for project source and media files;
- content hashes for deduplication and integrity;
- optional local vector index for document/project retrieval;
- OS credential manager for tokens.

Future optional sync:
- encrypted user-controlled backup/sync;
- conflict handling;
- per-project access policies;
- no provider secret copied to an ordinary cloud database.

## 11. Observability

Every task records:
- task ID and parent task ID;
- selected provider/model label;
- timestamps;
- tools called;
- approvals and denials;
- files changed;
- exit codes and test outcomes;
- provider usage/cost if reported;
- generated asset IDs and metadata;
- unresolved items.

Logs redact tokens, personal data and secrets. Users can inspect and export task history.

## 12. Local-first boundary

Initial AURIX should run locally on the user's computer. A web UI may be served from localhost. A future hosted version needs a different architecture: provider partner approvals, secure multi-tenant credential storage, server-side secrets, abuse prevention and data-retention controls. Do not assume a local OAuth flow can be copied into a hosted product.
