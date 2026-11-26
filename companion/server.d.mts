import type { Server } from 'node:http';
export const VERSION: string;
export function createCompanionServer(opts: { token: string; origin: string }): Server;
