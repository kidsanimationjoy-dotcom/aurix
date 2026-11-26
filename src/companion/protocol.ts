/**
 * AURIX local companion — protocol foundation (API v1).
 *
 * Purpose: give AURIX *authorised* access to the user's own machine (files, terminal,
 * local CLIs such as Codex, Grok Build, REA). A browser tab on Netlify cannot do this safely.
 *
 * Implemented today:   GET /v1/health  (authenticated, read-only, reveals nothing sensitive)
 * Designed, NOT built: filesystem.*, terminal.*, approvals — see CompanionCapability below.
 */
export const COMPANION_API_VERSION = 1;

export type CompanionCapability =
  | 'health'
  | 'filesystem.read'
  | 'filesystem.write'
  | 'terminal.exec'
  | 'cli.codex'
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
