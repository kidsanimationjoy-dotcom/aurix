export interface CodexProfilePaths {
  platform: NodeJS.Platform;
  appRoot: string;
  codexHome: string;
  configPath: string;
  workspaceRoot: string;
  canaryRoot: string;
  profileName: string;
}
export interface CodexSandboxResult {
  ok: boolean;
  code: string;
  message: string;
}
export const AURIX_CODEX_PROFILE: string;
export const AURIX_PROFILE_VERSION: number;
export function resolveCodexPaths(env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform, home?: string): CodexProfilePaths;
export function renderCodexProfileConfig(workspaceRoot: string, platform?: NodeJS.Platform): string;
export function hasLegacySandboxSetting(configText: string): boolean;
export function systemCodexConfigPaths(env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform): string[];
export function prepareCodexHome(paths: CodexProfilePaths, options?: { mode?: number }): Promise<{ ok: true; profileName: string; codexHome: string; workspaceRoot: string; canaryRoot: string }>;
export function validateCodexHome(paths: CodexProfilePaths): Promise<{ ok: true; profileName: string; codexHome: string; workspaceRoot: string }>;
export function checkLegacySystemConfig(paths: CodexProfilePaths, env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform, systemPaths?: string[]): Promise<{ ok: boolean; code?: string; message: string }>;
export function resolveNativeCodexCommand(command?: string, env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform): Promise<string>;
export function buildCodexSandboxArgs(options: { platform: NodeJS.Platform; profileName: string; workspaceRoot: string; executable: string; executableArgs?: string[] }): string[];
export function runCodexSandboxCanary(options?: { paths: CodexProfilePaths; command?: string; env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform; timeoutMs?: number }): Promise<CodexSandboxResult>;
