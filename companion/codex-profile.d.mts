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
export interface CodexProfileOptions {
  mode?: number;
  projectRoots?: string[];
}
export const AURIX_CODEX_PROFILE: string;
export const AURIX_PROFILE_VERSION: number;
export function resolveCodexPaths(env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform, home?: string): CodexProfilePaths;
export function renderCodexProfileConfig(workspaceRoot: string, platform?: NodeJS.Platform, projectRoots?: string[]): string;
export function normalizeCodexProjectRoots(paths: CodexProfilePaths, roots?: string[]): Promise<string[]>;
export function hasLegacySandboxSetting(configText: string): boolean;
export function systemCodexConfigPaths(env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform): string[];
export function prepareCodexHome(paths: CodexProfilePaths, options?: CodexProfileOptions): Promise<{ ok: true; profileName: string; codexHome: string; workspaceRoot: string; canaryRoot: string }>;
export function validateCodexHome(paths: CodexProfilePaths, options?: Pick<CodexProfileOptions, 'projectRoots'>): Promise<{ ok: true; profileName: string; codexHome: string; workspaceRoot: string }>;
export function checkLegacySystemConfig(paths: CodexProfilePaths, env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform, systemPaths?: string[]): Promise<{ ok: boolean; code?: string; message: string }>;
export function resolveNativeCodexCommand(command?: string, env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform): Promise<string>;
export function buildCodexSandboxArgs(options: { platform: NodeJS.Platform; profileName: string; workspaceRoot: string; executable: string; executableArgs?: string[] }): string[];
export function runCodexSandboxCanary(options: { paths: CodexProfilePaths; command?: string; env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform; projectRoots?: string[]; timeoutMs?: number }): Promise<CodexSandboxResult>;
