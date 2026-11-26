# AURIX Phase 2 — Orchestration Contract

Status: design contract; implementation is not yet claimed.

This document defines the smallest real orchestration layer to build on top of the Phase 0–1 workspace. It is intentionally provider-neutral. It must not report a provider as connected unless a real adapter has passed its health check.

## 1. Phase 2 outcome

A user submits a task. AURIX records it, classifies its intent, resolves the user's provider choice against actual capabilities, creates a visible plan, executes through an adapter, streams lifecycle events, supports cancellation and timeout, and stores a structured result with provenance.

Phase 2 does not yet implement shell access, arbitrary filesystem writes, browser automation, plugin execution, MCP tool execution, or autonomous deployment. Those require the later permission broker and tool sandbox.

## 2. Core domain types

Use discriminated unions and exhaustive switches. Avoid `any` at adapter boundaries.

```ts
type TaskIntent = "chat" | "coding" | "research" | "media" | "unknown";
type TaskStatus =
  | "queued" | "classifying" | "planning" | "waiting_for_provider"
  | "awaiting_approval" | "running" | "cancelling"
  | "succeeded" | "failed" | "cancelled" | "timed_out";

type ProviderId =
  | "openai-codex" | "claude-code" | "grok-build"
  | "higgsfield" | "rea" | "21st-dev";

type ProviderSelection =
  | { mode: "auto" }
  | { mode: "specific"; providerId: ProviderId };

interface TaskRequest {
  id: string;
  projectId: string;
  prompt: string;
  intentHint?: TaskIntent;
  provider: ProviderSelection;
  createdAt: string;
  timeoutMs: number;
  budget?: { maxSteps?: number; maxOutputChars?: number };
}

interface ProviderCapabilities {
  intents: TaskIntent[];
  streaming: boolean;
  cancellation: boolean;
  localExecution: boolean;
}

interface TaskPlanStep {
  id: string;
  title: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
}

interface TaskResult {
  taskId: string;
  status: "succeeded" | "failed" | "cancelled" | "timed_out";
  output?: string;
  error?: { code: string; message: string; retryable: boolean };
  provenance: {
    providerId: ProviderId | null;
    adapterVersion?: string;
    startedAt?: string;
    finishedAt: string;
  };
}
```

## 3. Adapter contract

Every provider adapter must implement the same contract. A disconnected adapter must return a typed unavailable result; it must never fabricate a response.

```ts
interface ProviderAdapter {
  readonly id: ProviderId;
  getCapabilities(): Promise<ProviderCapabilities>;
  healthCheck(): Promise<
    | { status: "connected"; detail?: string }
    | { status: "disconnected" | "limited"; detail: string }
  >;
  execute(
    input: { task: TaskRequest; plan: TaskPlanStep[] },
    context: { signal: AbortSignal; emit: (event: TaskEvent) => void }
  ): Promise<TaskResult>;
}
```

The adapter owns provider-specific protocol details. The orchestrator owns task lifecycle, timeout, cancellation, routing policy, event persistence, and result validation.

## 4. Routing rules

1. A specific provider selection is binding. Never silently switch to another provider.
2. Auto mode may choose only a connected provider whose declared capabilities include the classified intent.
3. A health-check failure excludes that provider for this task and is visible to the user.
4. No matching provider means `waiting_for_provider` with an actionable explanation; do not return generated-looking placeholder text.
5. Classification is deterministic for the initial slice: explicit user hint first, then transparent rule-based signals, otherwise `unknown`. Do not claim an LLM classifier exists until one is actually integrated.
6. The user can inspect and override the selected provider before execution.

## 5. Event model

Persist append-only task events. Minimum event names:

- `task.created`
- `task.classified`
- `provider.checked`
- `provider.selected`
- `task.plan.created`
- `task.approval.requested`
- `task.approval.granted`
- `task.approval.denied`
- `task.started`
- `task.progress`
- `task.output.delta`
- `task.cancel.requested`
- `task.completed`
- `task.failed`
- `task.timed_out`

Each event includes `eventId`, `taskId`, `timestamp`, and a typed payload. Do not store secrets, access tokens, environment variables, or full credential-bearing command lines in event payloads.

## 6. Task approval, lifecycle and cancellation

Allowed terminal states are succeeded, failed, cancelled, and timed_out. A terminal task cannot transition back to running.

- Once a real adapter is selected, AURIX persists the plan and enters `awaiting_approval`. It must not send the task prompt to the provider before the user approves.
- The UI shows the selected provider and full plan with explicit **Approve & run** and **Decline** actions.
- Approval re-checks the exact selected provider and its runtime capability. If it is unavailable, the task returns to `waiting_for_provider`; AURIX must not substitute another provider.
- Declining marks the task cancelled and records that no provider work was started.
- A pending approval survives app reload. It is not treated as an interrupted running task.
- Task-level approval authorizes only the task dispatch. It does not grant blanket filesystem, terminal, network, browser, or deployment access; future adapters must enforce narrower scoped approvals for those operations.
- Start a timeout when execution begins after approval, not while the user is still reviewing a plan.
- Cancellation changes the state to cancelling, aborts the adapter signal, and awaits adapter shutdown.
- Mark cancelled only after the adapter has acknowledged/settled cancellation. If a child process is later introduced, verify that the process has exited before reporting cancellation.
- Timeout aborts execution and produces a timed_out result, not a generic failure.
- Repeated cancel requests are idempotent.
- Persist the final result and terminal event exactly once.

## 7. UI requirements

For each task show:
- current status and selected provider;
- intent classification and whether it was inferred or user-specified;
- plan steps and progress;
- elapsed time and timeout state;
- streamed output only when supplied by a real adapter;
- cancellation control while cancellable;
- final status, error details, and provenance.

A disconnected provider must be visibly disconnected. Never use a green connected badge based only on configuration being present.

## 8. Security boundaries for this phase

- No provider credential in browser localStorage, IndexedDB, logs, task events, or Git.
- No arbitrary shell, terminal, filesystem mutation, network tool, or deployment action in Phase 2.
- Provider adapters receive only the task data required for the selected operation.
- User-selected provider is respected; no silent fallback.
- All external calls have timeout and cancellation handling.
- Treat provider output and task prompt as untrusted data, not executable instructions.
- Keep project/task identifiers scoped; do not mix context across projects.

## 9. Acceptance tests

1. Explicit intent hint wins over heuristic classification.
2. Unknown intent remains unknown; it is not guessed into a provider.
3. A connected execution adapter does not receive the prompt until the task is explicitly approved.
4. Declining a pending task produces no provider execution.
5. Approval re-checks the same selected provider and never silently routes to a replacement.
6. A pending approval survives app reload without being marked as interrupted.
3. Specific disconnected provider does not silently fall back.
4. Auto routing selects only a healthy compatible adapter.
5. No compatible provider produces a truthful waiting state.
6. Adapter output is streamed and attributed to the adapter that produced it.
7. Adapter failure produces a typed error and failed terminal state.
8. Timeout aborts the adapter and produces timed_out.
9. Cancellation is idempotent and produces cancelled only after adapter settlement.
10. Terminal tasks cannot be restarted by late events.
11. Task events and results survive app reload.
12. Tests verify that secrets are not included in persisted event payloads.
13. A clean checkout can install, typecheck, test, and build without extracting the ZIP archive.

## 10. Implementation order

1. Inspect and promote the existing Phase 0–1 source from the repository ZIP into tracked source files. Preserve the existing UI and tests.
2. Add domain types, lifecycle state machine, and deterministic classifier.
3. Add adapter registry and capability-aware router with fake adapters only in tests.
4. Add event persistence and task progress UI.
5. Add timeout/cancellation orchestration and race-condition tests.
6. Connect one real provider only after its official local integration path is confirmed.
7. Update provider matrix and roadmap with verified results.

Do not mark the milestone complete until the acceptance tests pass against the real repository source. Test doubles are for tests only; they are not a connected provider.
