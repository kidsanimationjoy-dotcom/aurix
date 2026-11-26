export interface CodexAgentEvent {
  sequence: number;
  at: number;
  type: string;
  [key: string]: unknown;
}

export interface CodexAgentSnapshot {
  id: string;
  status: 'starting' | 'running' | 'completed' | 'interrupted' | 'failed' | 'stopped';
  threadId: string | null;
  turnId: string | null;
  projectRoot: string;
  error: string;
  nextCursor: number;
  events: CodexAgentEvent[];
}

export interface CodexAgentManager {
  start(input: { target: string; prompt: string }): Promise<CodexAgentSnapshot>;
  snapshot(id: string, after?: number): CodexAgentSnapshot | null;
  approve(id: string, approvalId: string, decision: string): Promise<boolean>;
  interrupt(id: string): Promise<boolean>;
  close(id: string): Promise<boolean>;
  closeAll(): Promise<void>;
}

export function createCodexAgentManager(options?: {
  command?: string;
  codexHome?: string;
  roots?: string[];
}): CodexAgentManager;
