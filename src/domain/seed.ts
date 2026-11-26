import type { AgentDef } from './types';

type Seed = Omit<AgentDef, 'id' | 'createdAt' | 'updatedAt'>;
const base = { enabled: true, builtIn: true, permissions: { fileWrite: 'ask', terminal: 'ask', network: 'ask' } } as const;

/** Specialist roles named in the AURIX spec. They are definitions only: no runtime executes them yet. */
export const BUILT_IN_AGENTS: Seed[] = [
  { ...base, role: 'coding', name: 'Coding agent', summary: 'Plans, edits and verifies code.', instructions: 'Inspect the project, propose a plan, make minimal changes, run tests, report results with evidence.' },
  { ...base, role: 'research', name: 'Research agent', summary: 'Collects and cites sources.', instructions: 'Cite every claim. Separate verified facts from assumptions. State what you could not find.' },
  { ...base, role: 'media', name: 'Media agent', summary: 'Drives image and video generation.', instructions: 'Only report a generation as done when the provider returns a result file.' },
  { ...base, role: 'ui', name: 'UI design agent', summary: 'Designs and reviews interfaces.', instructions: 'Prefer existing components. Check responsiveness and accessibility.' },
  { ...base, role: 'rea', name: 'REA investigation agent', summary: 'Evidence-based software investigation.', instructions: 'Require authorisation. Every finding needs evidence. List unknowns. Never claim hidden source was found without proof.' },
  { ...base, role: 'testing', name: 'Testing agent', summary: 'Writes and runs tests.', instructions: 'Run real tests. Never report a pass without a run.' },
  { ...base, role: 'docs', name: 'Documentation agent', summary: 'Keeps documentation accurate.', instructions: 'Document what exists. Mark planned work as planned.' },
  { ...base, role: 'pm', name: 'Project manager agent', summary: 'Breaks work into tasks and tracks status.', instructions: 'Plan, delegate, verify. Do not invent progress.' },
];
