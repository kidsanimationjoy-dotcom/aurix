/**
 * AURIX local companion — protocol foundation (API v1).
 *
 * Implemented: authenticated loopback health, separate Codex profile/sign-in,
 * sandbox verification, and bounded read-only Codex chat through Task Center approval.
 * Not implemented: general filesystem, project-folder access, general terminal,
 * coding-agent sessions, browser automation, or deployment operations.
 */
export const COMPANION_API_VERSION = 1;

export type CompanionCapability =
  | 'health'
  | 'filesystem.read'
  | 'filesystem.write'
  | 'terminal.exec'
  | 'cli.codex.status'
  | 'cli.codex.login'
  | 'cli.codex.profile.prepare'
  | 'cli.codex.sandbox.verify'
  | 'cli.codex.chat.readonly'
  | 'cli.grok-build'
  | 'cli.rea';

export interface HealthResponse {
  service: 'aurix-companion';
  apiVersion: number;
  version: string;
  /** Capabilities this companion build actually implements right now. */
  capabilities: CompanionCapability[];
  /** Directories the user has explicitly granted. Empty until a grant flow exists. */
  grantedRoots: string[];
}

/** Future: every side-effecting request must carry an approval id issued after user consent. */
export interface ApprovalRequest {
  id: string;
  capability: CompanionCapability;
  summary: string;
  /** e.g. the exact command line or file path. Shown verbatim to the user. */
  subject: string;
  requestedAt: number;
}

export type CompanionState = 'not_configured' | 'unreachable' | 'unauthorized' | 'incompatible' | 'connected';
export interface CompanionStatus {
  state: CompanionState;
  message: string;
  health?: HealthResponse;
}


export type CodexAuthMode = 'chatgpt' | 'api_key' | 'unknown';
export type CodexInstallState = 'missing' | 'needs_login' | 'ready' | 'error';

export interface CodexStatus {
  state: CodexInstallState;
  installed: boolean;
  signedIn: boolean;
  version: string | null;
  authMode: CodexAuthMode;
  message: string;
  profilePrepared?: boolean;
  /** True only after the local OS sandbox canary passed in this companion process. */
  sandboxVerified?: boolean;
  profileName?: string;
}

export interface CodexPrepareResult {
  profilePrepared: boolean;
  sandboxVerified: boolean;
  profileName: string;
  platform: string;
  cliInstalled: boolean;
  version: string | null;
  code: string;
  message: string;
}

export interface LocalCompanionConfig {
  url: string;
  token: string;
}
