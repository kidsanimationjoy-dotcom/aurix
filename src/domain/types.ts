import type { ProviderId } from '../adapters/types';
import type { TaskEvent, TaskRecord } from '../tasks/types';

export type Id = string;
export interface Entity {
  id: Id;
  createdAt: number;
  updatedAt: number;
}
export type ProviderChoice = ProviderId | 'auto';

export interface Project extends Entity {
  name: string;
  description: string;
  preferredProvider: ProviderChoice;
  /** Absolute path on the user's machine. Only meaningful once a local companion grants access. */
  localPath: string | null;
}
export interface Conversation extends Entity {
  projectId: Id | null;
  title: string;
  providerChoice: ProviderChoice;
}
export type MessageDelivery = 'saved_locally' | 'delivered' | 'failed';
export interface Message extends Entity {
  conversationId: Id;
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** 'saved_locally' means stored in this browser only and NOT sent to any provider. */
  delivery: MessageDelivery;
  providerId?: ProviderId;
}
/** Virtual workspace file stored in the browser. Not a file on the user's disk. */
export interface ProjectFile extends Entity {
  projectId: Id;
  path: string;
  content: string;
}
export interface MemoryEntry extends Entity {
  scope: 'global' | 'project';
  projectId: Id | null;
  text: string;
}
export type ClaimStatus = 'verified' | 'unverified' | 'assumption';
export interface ResearchItem extends Entity {
  projectId: Id | null;
  title: string;
  claim: string;
  status: ClaimStatus;
  sourceTitle: string;
  sourceUrl: string;
  notes: string;
}
export interface Skill extends Entity {
  name: string;
  description: string;
  /** Full SKILL.md content */
  body: string;
  version: string;
  enabled: boolean;
  origin: 'custom' | 'imported';
}
export type McpTransport = 'stdio' | 'http' | 'sse';
export interface McpServer extends Entity {
  name: string;
  transport: McpTransport;
  /** Command line (stdio) or URL (http/sse). Never put secrets here. */
  target: string;
  enabled: boolean;
}
export type Permission = 'ask' | 'deny';
export interface AgentDef extends Entity {
  role: string;
  name: string;
  summary: string;
  instructions: string;
  permissions: { fileWrite: Permission; terminal: Permission; network: Permission };
  enabled: boolean;
  builtIn: boolean;
}
export interface Asset extends Entity {
  projectId: Id | null;
  name: string;
  mime: string;
  size: number;
  blob: Blob;
}
export type AuditOutcome = 'success' | 'denied' | 'error' | 'info';
export interface AuditEvent extends Entity {
  actor: 'user' | 'system';
  action: string;
  target: string;
  detail: string;
  outcome: AuditOutcome;
}
export type SceneKind = 'box' | 'sphere' | 'torus' | 'plane';
export interface SceneObject {
  id: Id;
  kind: SceneKind;
  color: string;
  position: [number, number, number];
  spin: boolean;
}
export interface SceneSpec extends Entity {
  projectId: Id | null;
  name: string;
  background: string;
  camera: [number, number, number];
  ambient: number;
  objects: SceneObject[];
}
export interface MediaDraft extends Entity {
  kind: 'video' | 'image';
  prompt: string;
  notes: string;
}
export interface SettingsRecord extends Entity {
  activeProjectId: Id | null;
  reduceMotion: boolean;
  density: 'comfortable' | 'compact';
  companionUrl: string;
}

export interface Schema {
  projects: Project;
  conversations: Conversation;
  messages: Message;
  files: ProjectFile;
  memory: MemoryEntry;
  research: ResearchItem;
  skills: Skill;
  mcpServers: McpServer;
  agents: AgentDef;
  assets: Asset;
  audit: AuditEvent;
  scenes: SceneSpec;
  mediaDrafts: MediaDraft;
  settings: SettingsRecord;
  tasks: TaskRecord;
  taskEvents: TaskEvent;
}
export type CollectionName = keyof Schema;
export const COLLECTIONS: CollectionName[] = [
  'projects', 'conversations', 'messages', 'files', 'memory', 'research', 'skills',
  'mcpServers', 'agents', 'assets', 'audit', 'scenes', 'mediaDrafts', 'settings',
  'tasks', 'taskEvents',
];
