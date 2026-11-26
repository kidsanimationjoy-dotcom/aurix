import path from 'node:path';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

export const CODEX_CHAT_MAX_PROMPT_CHARS = 10_000;
export const CODEX_CHAT_MAX_OUTPUT_CHARS = 200_000;
export const CODEX_CHAT_MAX_JSONL_BYTES = 2_000_000;
export const CODEX_CHAT_TIMEOUT_MS = 90_000;

function codedError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function buildCodexExecArgs({ workspaceRoot, profileName }) {
  if (!workspaceRoot || !path.isAbsolute(workspaceRoot)) {
    throw new Error('The Codex workspace path must be absolute.');
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(profileName ?? ''))) {
    throw new Error('The Codex permission profile name is invalid.');
  }

  // Deliberately do not pass --sandbox or a bypass flag. The dedicated
  // CODEX_HOME config and this explicit default_permissions override select
  // the AURIX read-only profile; strict-config makes unknown config fail closed.
  return [
    'exec',
    '--json',
    '--strict-config',
    '--ephemeral',
    '--skip-git-repo-check',
    '--cd', path.resolve(workspaceRoot),
    '--ask-for-approval', 'never',
    '--config', 'default_permissions=' + profileName,
    '-',
  ];
}

function appendJsonLine(line, state) {
  if (!line.trim()) return;
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    state.protocolError = true;
    return;
  }
  if (!event || typeof event !== 'object' || typeof event.type !== 'string') {
    state.protocolError = true;
    return;
  }

  if (event.type === 'error' || event.type === 'turn.failed') {
    state.turnFailed = true;
    return;
  }
  if (event.type === 'turn.completed') {
    state.turnCompleted = true;
    return;
  }
  if (event.type === 'item.completed' && event.item?.type === 'agent_message' && typeof event.item.text === 'string') {
    state.finalMessage = event.item.text.slice(0, CODEX_CHAT_MAX_OUTPUT_CHARS);
  }
}

function isAlive(child) {
  return child.exitCode === null && child.signalCode === null;
}

function waitForClose(entry, timeoutMs) {
  if (entry.closeResult) return Promise.resolve(entry.closeResult);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    entry.closeWaiters.push((result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}

async function runTaskkill(child, env) {
  if (!child.pid) return false;
  const root = env.SystemRoot || env.WINDIR || 'C:\\Windows';
  const executable = path.join(root, 'System32', 'taskkill.exe');
  return await new Promise((resolve) => {
    let settled = false;
    let timer;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(ok);
    };
    let killer;
    try {
      killer = spawn(executable, ['/PID', String(child.pid), '/T', '/F'], {
        env,
        shell: false,
        windowsHide: true,
        stdio: 'ignore',
      });
    } catch {
      finish(false);
      return;
    }
    killer.once('error', () => finish(false));
    killer.once('close', (code) => finish(code === 0));
    timer = setTimeout(() => {
      try { killer.kill(); } catch {}
      finish(false);
    }, 4000);
  });
}

async function terminateProcessTree(entry, platform, env) {
  const child = entry.child;
  if (!isAlive(child)) return true;

  if (platform === 'win32') {
    const treeKilled = await runTaskkill(child, env);
    if (!treeKilled && isAlive(child)) {
      // Best-effort direct-child fallback, but do not report a verified
      // process-tree termination when taskkill could not confirm it.
      try { child.kill(); } catch {}
      await waitForClose(entry, 3000);
      return false;
    }
    return Boolean(await waitForClose(entry, 3000));
  }

  if (child.pid && entry.detached) {
    try { process.kill(-child.pid, 'SIGTERM'); }
    catch (error) {
      if (error?.code === 'ESRCH') return !isAlive(child);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    try { process.kill(-child.pid, 'SIGKILL'); }
    catch (error) {
      if (error?.code !== 'ESRCH') return false;
    }
    return Boolean(await waitForClose(entry, 3000));
  }

  try { child.kill('SIGTERM'); } catch {}
  const closed = await waitForClose(entry, 1500);
  if (closed) return true;
  try { child.kill('SIGKILL'); } catch { try { child.kill(); } catch {} }
  return Boolean(await waitForClose(entry, 3000));
}

/**
 * Runs only an explicitly approved, read-only AURIX chat task. This manager
 * accepts no model-supplied command, no project path and no caller-supplied CLI
 * switches. The caller must first verify the actual Codex OS sandbox canary.
 */
export function createCodexExecManager({
  platform = process.platform,
  timeoutMs = CODEX_CHAT_TIMEOUT_MS,
  maxConcurrent = 1,
} = {}) {
  const running = new Map();
  const cancelledBeforeStart = new Map();

  async function run({ taskId, command, workspaceRoot, profileName, prompt, env }) {
    if (!/^[A-Za-z0-9_-]{1,96}$/.test(String(taskId ?? ''))) {
      throw codedError('INVALID_TASK_ID', 'The task identifier is invalid.');
    }
    const cancelledExpiry = cancelledBeforeStart.get(taskId);
    if (cancelledExpiry) {
      cancelledBeforeStart.delete(taskId);
      if (cancelledExpiry > Date.now()) throw codedError('CODEX_TASK_CANCELLED', 'Codex task was cancelled before process launch.');
    }
    if (running.has(taskId)) throw codedError('TASK_ALREADY_RUNNING', 'This Codex task is already running.');
    if (running.size >= maxConcurrent) throw codedError('CODEX_BUSY', 'The AURIX Codex executor is busy with another task.');
    if (!command || !path.isAbsolute(command)) {
      throw codedError('CODEX_EXECUTABLE_INVALID', 'A resolved absolute Codex executable is required.');
    }
    if (platform === 'win32' && path.extname(command).toLowerCase() !== '.exe') {
      throw codedError('NATIVE_WINDOWS_CLI_REQUIRED', 'A native Codex .exe is required. Command shell shims are not accepted.');
    }
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > CODEX_CHAT_MAX_PROMPT_CHARS) {
      throw codedError('INVALID_PROMPT', 'The Codex chat prompt must contain 1 to 10,000 characters.');
    }

    const args = buildCodexExecArgs({ workspaceRoot, profileName });
    const detached = platform !== 'win32';
    let child;
    try {
      child = spawn(command, args, {
        cwd: path.resolve(workspaceRoot),
        env,
        shell: false,
        detached,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'ignore'],
      });
    } catch {
      throw codedError('CODEX_SPAWN_FAILED', 'The Codex CLI could not be started.');
    }

    const state = {
      finalMessage: '',
      turnCompleted: false,
      turnFailed: false,
      protocolError: false,
      totalBytes: 0,
      lineBuffer: '',
      timedOut: false,
      cancelled: false,
      shutdownAfterCompletion: false,
      closeResult: null,
      closeWaiters: [],
      child,
      detached,
      env,
    };

    const notifyClose = (result) => {
      state.closeResult = result;
      for (const resolve of state.closeWaiters.splice(0)) resolve(result);
    };
    child.once('error', (error) => {
      notifyClose({ code: null, errorCode: error.code || 'SPAWN_ERROR' });
    });
    child.once('close', (code, signal) => {
      notifyClose({ code, signal });
    });

    const decoder = new StringDecoder('utf8');
    let completionTimer = null;
    const processLine = (line) => {
      const wasCompleted = state.turnCompleted;
      appendJsonLine(line, state);
      if (!wasCompleted && state.turnCompleted && isAlive(child)) {
        // Some Windows CLI builds linger after turn.completed. The turn result
        // is already complete; stop the lingering process tree after a short
        // grace period instead of leaving a local process running.
        completionTimer = setTimeout(() => {
          if (!isAlive(child)) return;
          state.shutdownAfterCompletion = true;
          void terminateProcessTree(state, platform, env);
        }, 2500);
      }
    };

    child.stdin.on('error', () => { state.protocolError = true; });
    child.stdout.on('data', (chunk) => {
      state.totalBytes += chunk.length;
      if (state.totalBytes > CODEX_CHAT_MAX_JSONL_BYTES) {
        state.protocolError = true;
        state.cancelled = false;
        void terminateProcessTree(state, platform, env);
        return;
      }
      state.lineBuffer += decoder.write(chunk);
      if (state.lineBuffer.length > 500_000 && !state.lineBuffer.includes('\n')) {
        state.protocolError = true;
        void terminateProcessTree(state, platform, env);
        return;
      }
      let newline;
      while ((newline = state.lineBuffer.indexOf('\n')) >= 0) {
        const line = state.lineBuffer.slice(0, newline);
        state.lineBuffer = state.lineBuffer.slice(newline + 1);
        processLine(line);
      }
    });

    const timer = setTimeout(() => {
      state.timedOut = true;
      void terminateProcessTree(state, platform, env);
    }, timeoutMs);

    const entry = state;
    running.set(taskId, entry);
    try {
      child.stdin.end(prompt.trim() + '\n');
      const closeResult = await new Promise((resolve) => {
        if (entry.closeResult) return resolve(entry.closeResult);
        entry.closeWaiters.push(resolve);
      });

      const remainder = entry.lineBuffer + decoder.end();
      if (remainder.trim()) processLine(remainder);

      if (entry.cancelled) throw codedError('CODEX_TASK_CANCELLED', 'Codex task cancellation was acknowledged.');
      if (entry.timedOut) throw codedError('CODEX_TASK_TIMEOUT', 'Codex did not complete before the local execution timeout.');
      if (entry.protocolError) throw codedError('CODEX_OUTPUT_INVALID', 'Codex returned an invalid or oversized JSONL event stream.');
      if (entry.turnFailed || !entry.turnCompleted) throw codedError('CODEX_TURN_FAILED', 'Codex did not complete the requested chat turn.');
      if (!closeResult || (closeResult.code !== 0 && !entry.shutdownAfterCompletion)) {
        throw codedError('CODEX_EXIT_FAILED', 'Codex reported a completed turn but did not exit cleanly.');
      }
      if (!entry.finalMessage) throw codedError('CODEX_EMPTY_RESPONSE', 'Codex completed without returning a final assistant message.');

      return { output: entry.finalMessage };
    } finally {
      clearTimeout(timer);
      if (completionTimer) clearTimeout(completionTimer);
      running.delete(taskId);
    }
  }

  async function cancel(taskId) {
    const entry = running.get(taskId);
    if (!entry) {
      // Cancellation may arrive while sandbox preflight is still running and
      // before the exec manager has spawned Codex. Tombstones close that race.
      const now = Date.now();
      for (const [id, expiresAt] of cancelledBeforeStart) {
        if (expiresAt <= now) cancelledBeforeStart.delete(id);
      }
      while (cancelledBeforeStart.size >= 1000) {
        const oldest = cancelledBeforeStart.keys().next().value;
        if (oldest === undefined) break;
        cancelledBeforeStart.delete(oldest);
      }
      cancelledBeforeStart.set(taskId, now + 120_000);
      return true;
    }
    entry.cancelled = true;
    return terminateProcessTree(entry, platform, entry.env ?? process.env);
  }

  return {
    run,
    cancel,
    has: (taskId) => running.has(taskId),
    size: () => running.size,
  };
}
