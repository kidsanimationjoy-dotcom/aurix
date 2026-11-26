export type ProviderId = 'claude' | 'grok' | 'openai' | 'higgsfield' | 'twentyfirst' | 'rea';

export type ConnectionState =
  | 'not_configured'
  | 'awaiting_authentication'
  | 'connected'
  | 'blocked'
  | 'error';

/** How much of the adapter actually exists. The UI shows this next to the connection state. */
export type ImplementationLevel = 'interface_only' | 'implemented_untested' | 'implemented_tested';

export type Capability =
  | 'chat'
  | 'coding_agent'
  | 'subagents'
  | 'skills'
  | 'mcp'
  | 'hooks'
  | 'media_video'
  | 'media_image'
  | 'model_discovery'
  | 'ui_components'
  | 'themes'
  | 'investigation';

export interface ProviderStatus {
  state: ConnectionState;
  implementation: ImplementationLevel;
  summary: string;
  detail?: string;
  account?: string;
  checkedAt: number;
}

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  vendor: string;
  role: string;
  /** Capabilities the AURIX spec intends for this provider. Not a claim that they work today. */
  plannedCapabilities: Capability[];
  authentication: string;
  references: { label: string; url: string }[];
  constraints: string[];
}

export type AdapterErrorCode =
  | 'NOT_CONNECTED'
  | 'NOT_IMPLEMENTED'
  | 'UNSUPPORTED'
  | 'AUTHORIZATION_REQUIRED'
  | 'RATE_LIMITED'
  | 'PROVIDER_ERROR';
export interface AdapterError {
  code: AdapterErrorCode;
  message: string;
}
export type Result<T> = { ok: true; value: T } | { ok: false; error: AdapterError };

export interface ProviderAdapter {
  readonly meta: ProviderMeta;
  getStatus(): Promise<ProviderStatus>;
  /** Actual, currently usable capabilities. Omit only for legacy adapters without runtime discovery. */
  getCapabilities?(): Promise<Capability[]>;
}

/* ---------- Chat ---------- */
export interface ChatRequest {
  sessionId?: string;
  projectId?: string;
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
}
export interface ChatReply {
  sessionId: string;
  content: string;
}
export interface ChatAdapter extends ProviderAdapter {
  sendMessage(req: ChatRequest): Promise<Result<ChatReply>>;
}

/* ---------- Coding agents (need a local companion or secure runtime) ---------- */
export interface AgentSessionRequest {
  projectId: string;
  instruction: string;
  /** Every command/file write inside the session must pass the approval gate. */
  approvalMode: 'ask_every_time';
}
export interface AgentSession {
  id: string;
  providerId: ProviderId;
  status: 'planning' | 'running' | 'awaiting_approval' | 'completed' | 'failed' | 'cancelled';
}
export interface CodingAgentAdapter extends ProviderAdapter {
  startSession(req: AgentSessionRequest): Promise<Result<AgentSession>>;
  cancelSession(sessionId: string): Promise<Result<void>>;
}

/* ---------- Media (Higgsfield) ---------- */
export interface MediaModel {
  id: string;
  name: string;
  kinds: ('video' | 'image')[];
  /** Whatever the provider reports; never hardcoded in AURIX. */
  parameters: Record<string, unknown>;
}
export interface MediaJobRequest {
  modelId: string;
  kind: 'video' | 'image';
  prompt: string;
  settings: Record<string, unknown>;
}
export interface MediaOutput {
  url: string;
  mime: string;
}
/**
 * A job can only be 'completed' when the provider has returned at least one output.
 * The non-empty tuple makes "completed but no result" unrepresentable.
 */
export type MediaJob =
  | { id: string; status: 'queued' | 'running'; progress?: number }
  | { id: string; status: 'failed' | 'cancelled'; error: string }
  | { id: string; status: 'completed'; outputs: [MediaOutput, ...MediaOutput[]] };
export interface MediaAdapter extends ProviderAdapter {
  listModels(): Promise<Result<MediaModel[]>>;
  submitJob(req: MediaJobRequest): Promise<Result<MediaJob>>;
  getJob(id: string): Promise<Result<MediaJob>>;
}

/* ---------- UI components (21st.dev) ---------- */
export interface UiComponentSummary {
  id: string;
  name: string;
  description: string;
}
export interface UiComponentAdapter extends ProviderAdapter {
  searchComponents(query: string): Promise<Result<UiComponentSummary[]>>;
  getComponentSource(id: string): Promise<Result<{ files: { path: string; content: string }[] }>>;
}

/* ---------- Investigation (REA) ---------- */
export interface InvestigationAuthorization {
  /** The user must state they are authorised to examine the target. */
  statement: string;
  confirmedAt: number;
}
export interface EvidenceRef {
  id: string;
  description: string;
}
export interface InvestigationFinding {
  claim: string;
  /** At least one piece of evidence is required for every finding. */
  evidence: [EvidenceRef, ...EvidenceRef[]];
}
export interface InvestigationReport {
  findings: InvestigationFinding[];
  /** What could not be determined. Must be reported, never omitted. */
  unknowns: string[];
  /** Counts and coverage copied from REA's validated application graph. */
  graphSummary?: { nodes: number; edges: number; coverage: string };
  /** Bounded, evidence-linked node index for the UI; never presented as runtime proof. */
  graphNodes?: { id: string; kind: string; path?: string }[];
  desktopSummary?: unknown;
}
export interface InvestigationAdapter extends ProviderAdapter {
  createInvestigation(target: string, auth: InvestigationAuthorization): Promise<Result<{ id: string }>>;
  getReport(id: string): Promise<Result<InvestigationReport>>;
}
