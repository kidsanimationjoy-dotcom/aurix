import type { Server } from 'node:http';
import type { CodexProfilePaths } from './codex-profile.mjs';
export const VERSION: string;
export function createCompanionServer(opts: {
  token: string;
  origin: string;
  codexCommand?: string;
  codexPrefixArgs?: string[];
  codexPaths?: CodexProfilePaths | null;
}): Server;
