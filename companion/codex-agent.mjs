// Local Codex App Server session manager for AURIX.
// The bridge speaks the documented JSONL protocol; it never invokes a shell.
// Project access is restricted to explicitly allowlisted roots and user-approved
// per-turn permission grants. Network access is never granted by this bridge.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { realpath, stat, lstat } from 'node:fs/promises';
import path from 'node:path';

const MAX_PROMPT = 12_000;
const MAX_EVENTS = 400;
const MAX_EVENT_TEXT = 12_000;
const RPC_TIMEOUT_MS = 20_000;
const APPROVAL_TIMEOUT_MS = 120_000;

function within(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function cleanEnvironment(codexHome) {
  const allowed = [
    'PATH', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
    'TMP', 'TEMP', 'TMPDIR', 'SystemRoot', 'WINDIR',
    'APPDATA', 'LOCALAPPDATA', 'PATHEXT', 'LANG', 'LC_ALL',
  ];
  const env = {};
  for (const key of allowed) {
    if (typeof process.env[key] === 'string') env[key] = process.env[key];
  }
  env.CODEX_HOME = codexHome;
  delete env.OPENAI_API_KEY;
  return env;
}

async function canonicalDirectory(target) {
  const canonical = await realpath(target);
  const info = await stat(canonical);
  if (!info.isDirectory()) throw new Error('The selected Codex project must be a directory.');
  return canonical;
}

async function resolveApprovedProject(target, roots) {
  if (typeof target !== 'string' || !target.trim() || target.length > 2048) {
    throw new Error('Provide a valid local project folder path.');
  }
  if (!Array.isArray(roots) || roots.length === 0) {
    throw new Error('No Codex project folders have been approved. Configure AURIX_CODEX_ROOTS first.');
  }
  const projectRoot = await canonicalDirectory(target);
  const canonicalRoots = await Promise.all(roots.map((root) => canonicalDirectory(root)));
  if (!canonicalRoots.some((root) => within(root, projectRoot))) {
    throw new Error('The selected project is outside the folders explicitly approved for Codex.');
  }
  return projectRoot;
}

async function safeProjectPath(root, input) {
  if (typeof input !== 'string' || !input || input.includes('\0')) return false;
  const candidate = path.isAbsolute(input) ? path.resolve(input) : path.resolve(root, input);
  if (!within(root, candidate)) return false;
  let ancestor = candidate;
  while (true) {
    try {
      const info = await lstat(ancestor);
      if (info.isSymbolicLink()) return false;
      const physical = await realpath(ancestor);
      return within(root, physical);
    } catch (error) {
      if (!error || error.code !== 'ENOENT') return false;
      const parent = path.dirname(ancestor);
      if (parent === ancestor) return false;
      ancestor = parent;
    }
  }
}

function truncateText(value, max = MAX_EVENT_TEXT) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

class CodexAppServerSession {
  constructor({ id, command, codexHome, projectRoot }) {
    this.id = id;
    this.command = command;
    this.codexHome = codexHome;
    this.projectRoot = projectRoot;
    this.child = null;
    this.readline = null;
    this.nextRpcId = 1;
    this.waiters = new Map();
    this.approvals = new Map();
    this.items = new Map();
    this.events = [];
    this.sequence = 0;
    this.status = 'starting';
    this.threadId = null;
    this.turnId = null;
    this.error = '';
    this.closed = false;
  }

  emit(type, data = {}) {
    const event = { sequence: ++this.sequence, at: Date.now(), type, ...data };
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    return event;
  }

  snapshot(after = 0) {
    const events = this.events.filter((event) => event.sequence > after).slice(0, 100);
    return {
      id: this.id,
      status: this.status,
      threadId: this.threadId,
      turnId: this.turnId,
      projectRoot: this.projectRoot,
      error: this.error,
      nextCursor: events.length ? events[events.length - 1].sequence : after,
      events,
    };
  }

  write(message) {
    if (!this.child || this.child.stdin.destroyed || this.child.stdin.writableEnded) {
      throw new Error('Codex App Server is not running.');
    }
    this.child.stdin.write(JSON.stringify(message) + '\n');
  }

  notify(method, params = {}) {
    this.write({ method, params });
  }

  request(method, params = {}, timeoutMs = RPC_TIMEOUT_MS) {
    const id = this.nextRpcId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(id);
        reject(new Error('Codex App Server timed out during ' + method + '.'));
      }, timeoutMs);
      this.waiters.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      try { this.write({ id, method, params }); }
      catch (error) {
        clearTimeout(timer);
        this.waiters.delete(id);
        reject(error);
      }
    });
  }

  async start(prompt) {
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_PROMPT) {
      throw new Error('Enter a project task of 12,000 characters or fewer.');
    }
    this.child = spawn(this.command, ['app-server', '--listen', 'stdio://'], {
      cwd: this.projectRoot,
      env: cleanEnvironment(this.codexHome),
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.readline = createInterface({ input: this.child.stdout, crlfDelay: Infinity });
    this.readline.on('line', (line) => this.handleLine(line));
    this.child.stderr.on('data', () => { /* stderr is intentionally not exposed to the browser */ });
    this.child.once('error', (error) => {
      this.error = error && error.code === 'ENOENT'
        ? 'Codex CLI was not found. Install or repair the official local CLI.'
        : 'Codex App Server could not be started.';
      this.status = 'failed';
      this.emit('agent.failed', { message: this.error });
      this.rejectWaiters(new Error(this.error));
    });
    this.child.once('close', (code) => {
      if (this.closed) return;
      if (!['completed', 'interrupted', 'failed'].includes(this.status)) this.status = 'stopped';
      if (!this.error && code !== 0 && code !== null) this.error = 'Codex App Server exited with code ' + code + '.';
      this.emit('agent.process.closed', { code, message: this.error });
      this.rejectWaiters(new Error(this.error || 'Codex App Server closed.'));
    });

    try {
      await this.request('initialize', {
        clientInfo: { name: 'aurix', title: 'AURIX', version: '0.5.0' },
        capabilities: {
          // AURIX asks for permission explicitly and never enables experimental auto tools.
          optOutNotificationMethods: ['item/reasoning/textDelta'],
        },
      });
      this.notify('initialized', {});
      const started = await this.request('thread/start', {
        cwd: this.projectRoot,
        approvalPolicy: {
          granular: {
            mcp_elicitations: false,
            rules: false,
            sandbox_approval: true,
            request_permissions: true,
          },
        },
        sandbox: 'read-only',
      });
      const threadId = started?.thread?.id;
      if (typeof threadId !== 'string' || !threadId) throw new Error('Codex App Server returned no thread ID.');
      this.threadId = threadId;
      const turn = await this.request('turn/start', {
        threadId,
        cwd: this.projectRoot,
        input: [{ type: 'text', text: prompt.trim() }],
        approvalPolicy: {
          granular: {
            mcp_elicitations: false,
            rules: false,
            sandbox_approval: true,
            request_permissions: true,
          },
        },
        sandboxPolicy: { type: 'readOnly', networkAccess: false },
      });
      this.turnId = typeof turn?.turn?.id === 'string' ? turn.turn.id : null;
      if (this.status === 'starting') this.status = 'running';
      this.emit('agent.started', { threadId: this.threadId, turnId: this.turnId });
      return this.snapshot();
    } catch (error) {
      this.status = 'failed';
      this.error = error instanceof Error ? error.message : 'Could not initialize Codex App Server.';
      this.emit('agent.failed', { message: this.error });
      await this.stop();
      throw error;
    }
  }

  rejectWaiters(error) {
    for (const waiter of this.waiters.values()) waiter.reject(error);
    this.waiters.clear();
  }

  handleLine(line) {
    if (!line || line.length > 2_000_000) return;
    let message;
    try { message = JSON.parse(line); }
    catch {
      this.error = 'Codex App Server returned invalid JSONL.';
      this.emit('agent.protocol.error', { message: this.error });
      return;
    }

    if (Object.hasOwn(message, 'id') && typeof message.method === 'string') {
      void this.handleServerRequest(message).catch(() => {
        this.emit('agent.approval.error', { message: 'AURIX could not safely process a Codex approval request; the request was not approved.' });
        try { this.write({ id: message.id, error: { code: -32603, message: 'AURIX refused to process this approval request.' } }); } catch {}
      });
      return;
    }
    if (Object.hasOwn(message, 'id')) {
      const waiter = this.waiters.get(message.id);
      if (waiter) {
        this.waiters.delete(message.id);
        if (message.error) waiter.reject(new Error(truncateText(message.error.message, 500) || 'Codex App Server request failed.'));
        else waiter.resolve(message.result ?? {});
      }
      return;
    }
    if (typeof message.method !== 'string') return;

    const params = message.params ?? {};
    if (message.method === 'turn/started' && typeof params.turn?.id === 'string') {
      this.turnId = params.turn.id;
    }
    if (message.method === 'item/started' && params.item && typeof params.item.id === 'string') {
      this.items.set(params.item.id, params.item);
    }
    if (message.method === 'item/completed' && params.item && typeof params.item.id === 'string') {
      this.items.set(params.item.id, params.item);
      const item = params.item;
      this.emit('agent.item.completed', {
        itemType: item.type,
        itemId: item.id,
        status: item.status ?? '',
        text: item.type === 'agentMessage' ? truncateText(item.text) : undefined,
        changes: item.type === 'fileChange' && Array.isArray(item.changes)
          ? item.changes.slice(0, 30).map((change) => ({
              path: truncateText(change.path, 500),
              kind: truncateText(change.kind, 80),
              diff: truncateText(change.diff, 6000),
            }))
          : undefined,
        command: item.type === 'commandExecution' && typeof item.command === 'string'
          ? [truncateText(item.command, 4000)]
          : undefined,
      });
    }
    if (message.method === 'item/agentMessage/delta') {
      this.emit('agent.output.delta', {
        text: truncateText(params.delta),
        itemId: truncateText(params.itemId, 160),
      });
      return;
    }
    if (message.method === 'item/commandExecution/outputDelta') {
      this.emit('agent.command.output', { text: truncateText(params.delta) });
      return;
    }
    if (message.method === 'turn/plan/updated') {
      this.emit('agent.plan.updated', {
        plan: Array.isArray(params.plan) ? params.plan.slice(0, 20).map((item) => ({
          step: truncateText(item.step, 500),
          status: truncateText(item.status, 40),
        })) : [],
      });
      return;
    }
    if (message.method === 'turn/diff/updated') {
      this.emit('agent.diff.updated', { diff: truncateText(params.diff, 20_000) });
      return;
    }
    if (message.method === 'turn/completed') {
      const turn = params.turn ?? {};
      this.status = turn.status === 'completed' ? 'completed' : turn.status === 'interrupted' ? 'interrupted' : 'failed';
      if (this.status === 'failed') this.error = truncateText(turn.error?.message, 600) || 'Codex did not complete the task.';
      this.emit('agent.turn.completed', { status: this.status, message: this.error });
      return;
    }
    if (message.method === 'error') {
      this.emit('agent.warning', { message: truncateText(params.error?.message ?? params.message, 800) });
    }
  }

  async handleServerRequest(message) {
    const method = message.method;
    const params = message.params ?? {};
    const supported = new Set([
      'item/commandExecution/requestApproval',
      'item/fileChange/requestApproval',
      'item/permissions/requestApproval',
    ]);
    if (!supported.has(method)) {
      this.write({ id: message.id, error: { code: -32601, message: 'AURIX does not handle this App Server request.' } });
      return;
    }

    const approvalId = randomUUID();
    const item = this.items.get(params.itemId) ?? {};
    const record = {
      id: approvalId,
      rpcId: message.id,
      method,
      params,
      item,
      createdAt: Date.now(),
    };
    this.approvals.set(approvalId, record);
    this.emit('agent.approval.required', {
      id: approvalId,
      kind: method === 'item/commandExecution/requestApproval'
        ? (params.networkApprovalContext ? 'network' : 'command')
        : method === 'item/fileChange/requestApproval' ? 'file_change' : 'filesystem',
      reason: truncateText(params.reason, 1000),
      command: typeof params.command === 'string' && params.command.trim()
        ? [truncateText(params.command, 4000)]
        : typeof item.command === 'string' && item.command.trim() ? [truncateText(item.command, 4000)] : [],
      cwd: truncateText(params.cwd ?? item.cwd, 2048),
      network: params.networkApprovalContext ? {
        host: truncateText(params.networkApprovalContext.host, 255),
        protocol: truncateText(params.networkApprovalContext.protocol, 40),
      } : null,
      changes: Array.isArray(item.changes) ? item.changes.slice(0, 30).map((change) => ({
        path: truncateText(change.path, 500),
        kind: truncateText(change.kind, 80),
        diff: truncateText(change.diff, 6000),
      })) : [],
      requestedPermissions: params.permissions ?? null,
    });

    const timer = setTimeout(() => {
      void this.respondApproval(approvalId, 'decline').catch(() => undefined);
    }, APPROVAL_TIMEOUT_MS);
    record.timer = timer;
  }

  async respondApproval(approvalId, decision) {
    const record = this.approvals.get(approvalId);
    if (!record) throw new Error('This approval is no longer pending.');
    if (!['accept', 'decline', 'cancel'].includes(decision)) throw new Error('Unsupported approval decision.');

    let result;
    if (record.method === 'item/commandExecution/requestApproval') {
      if (decision === 'accept') {
        const cwdValue = record.params.cwd ?? record.item.cwd;
        const cwd = typeof cwdValue === 'string' ? await canonicalDirectory(cwdValue) : null;
        if (record.params.networkApprovalContext || !cwd || !within(this.projectRoot, cwd)) {
          throw new Error('AURIX refused this command because it requests network access or runs outside the approved project.');
        }
      }
      result = { decision };
    } else if (record.method === 'item/fileChange/requestApproval') {
      if (decision === 'accept') {
        if (typeof record.params.grantRoot === 'string' && record.params.grantRoot.trim()) {
          throw new Error('AURIX refuses session-scoped root grants. Wait for an explicit per-turn filesystem permission request instead.');
        }
        const changes = Array.isArray(record.item.changes) ? record.item.changes : [];
        if (!changes.length || changes.length > 30) throw new Error('AURIX cannot approve this file change without a bounded, visible list of exact file paths.');
        for (const change of changes) {
          if (!(await safeProjectPath(this.projectRoot, change.path))) {
            throw new Error('AURIX refused this file change because its path is outside the approved project or crosses a symbolic link.');
          }
        }
      }
      result = { decision };
    } else {
      if (decision === 'accept') {
        const fsProfile = record.params.permissions?.fileSystem;
        const network = record.params.permissions?.network;
        if (network?.enabled === true) throw new Error('AURIX does not grant network access to coding sessions.');
        const entries = Array.isArray(fsProfile?.entries) ? fsProfile.entries : [];
        if (!entries.length || entries.length > 20) throw new Error('AURIX can only approve a small explicit list of filesystem paths.');
        const safeEntries = [];
        for (const entry of entries) {
          const target = entry?.path?.type === 'path' ? entry.path.path : null;
          if (!target || !['read', 'write'].includes(entry.access) || !(await safeProjectPath(this.projectRoot, target))) {
            throw new Error('AURIX refused a permission request outside the approved project or with an unsupported path pattern.');
          }
          safeEntries.push({ access: entry.access, path: { type: 'path', path: path.resolve(target) } });
        }
        result = { permissions: { fileSystem: { entries: safeEntries }, network: { enabled: false } }, scope: 'turn' };
      } else {
        result = { permissions: { fileSystem: { entries: [] }, network: { enabled: false } }, scope: 'turn' };
      }
    }

    clearTimeout(record.timer);
    this.approvals.delete(approvalId);
    this.write({ id: record.rpcId, result });
    this.emit('agent.approval.responded', { id: approvalId, decision, kind: record.method });
    return true;
  }

  async interrupt() {
    if (!this.threadId || !this.turnId || this.status !== 'running') return false;
    await this.request('turn/interrupt', { threadId: this.threadId, turnId: this.turnId });
    this.status = 'interrupted';
    this.emit('agent.interrupted', { threadId: this.threadId, turnId: this.turnId });
    return true;
  }

  async stop() {
    this.closed = true;
    for (const [id, approval] of this.approvals) {
      clearTimeout(approval.timer);
      try { this.write({ id: approval.rpcId, result: approval.method === 'item/permissions/requestApproval'
        ? { permissions: { fileSystem: { entries: [] }, network: { enabled: false } }, scope: 'turn' }
        : { decision: 'decline' } }); } catch {}
    }
    this.approvals.clear();
    this.rejectWaiters(new Error('Codex App Server stopped.'));
    if (this.child && this.child.exitCode === null && !this.child.killed) {
      this.child.kill();
    }
    if (!['completed', 'interrupted', 'failed'].includes(this.status)) this.status = 'stopped';
  }
}

export function createCodexAgentManager({ command = 'codex', codexHome, roots = [] } = {}) {
  const sessions = new Map();

  return {
    async start({ target, prompt }) {
      if (!codexHome) throw new Error('The AURIX Codex profile has not been configured.');
      const projectRoot = await resolveApprovedProject(target, roots);
      const id = randomUUID();
      const session = new CodexAppServerSession({ id, command, codexHome, projectRoot });
      sessions.set(id, session);
      try {
        return await session.start(prompt);
      } catch (error) {
        sessions.delete(id);
        throw error;
      }
    },
    snapshot(id, after = 0) {
      const session = sessions.get(id);
      return session ? session.snapshot(after) : null;
    },
    async approve(id, approvalId, decision) {
      const session = sessions.get(id);
      if (!session) throw new Error('Codex agent session not found.');
      return session.respondApproval(approvalId, decision);
    },
    async interrupt(id) {
      const session = sessions.get(id);
      if (!session) throw new Error('Codex agent session not found.');
      return session.interrupt();
    },
    async close(id) {
      const session = sessions.get(id);
      if (!session) return false;
      await session.stop();
      sessions.delete(id);
      return true;
    },
    async closeAll() {
      await Promise.all([...sessions.values()].map((session) => session.stop()));
      sessions.clear();
    },
  };
}
