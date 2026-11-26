export const CODEX_CHAT_MAX_PROMPT_CHARS: number;
export const CODEX_CHAT_MAX_OUTPUT_CHARS: number;
export const CODEX_CHAT_MAX_JSONL_BYTES: number;
export const CODEX_CHAT_TIMEOUT_MS: number;

export function buildCodexExecArgs(options: {
  workspaceRoot: string;
  profileName: string;
}): string[];

export interface CodexExecManager {
  run(options: {
    taskId: string;
    command: string;
    workspaceRoot: string;
    profileName: string;
    prompt: string;
    env: NodeJS.ProcessEnv;
  }): Promise<{ output: string }>;
  cancel(taskId: string): Promise<boolean>;
  has(taskId: string): boolean;
  size(): number;
}

export function createCodexExecManager(options?: {
  platform?: NodeJS.Platform;
  timeoutMs?: number;
  maxConcurrent?: number;
}): CodexExecManager;
