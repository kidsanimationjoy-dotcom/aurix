// AURIX local companion — authenticated, loopback-only API.
// Implemented: health, safe Codex status/login, verified sandbox setup, and read-only Codex chat.
// Not implemented: project-folder access, file writes, general terminal access, or coding-agent execution.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createCodexChatWorkspace, createCodexExecManager, removeCodexChatWorkspace, CODEX_CHAT_MAX_PROMPT_CHARS } from './codex-exec.mjs';
import {
  checkLegacySystemConfig,
  prepareCodexHome,
  resolveCodexPaths,
  runCodexSandboxCanary,
  resolveNativeCodexCommand,
  validateCodexHome,
} from './codex-profile.mjs';

export const VERSION = '0.4.0';

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function isLoopbackHost(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    const parsed = new URL(`http://${value}`);
    return parsed.username === '' && parsed.password === '' &&
      ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function safeEnvironment(codexHome) {
  const allowed = [
    'PATH', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
    'TMP', 'TEMP', 'TMPDIR', 'SystemRoot', 'WINDIR',
    'APPDATA', 'LOCALAPPDATA', 'PATHEXT', 'LANG', 'LC_ALL',
  ];
  const env = {};
  for (const key of allowed) {
    if (typeof process.env[key] === 'string') env[key] = process.env[key];
  }
  if (codexHome) env.CODEX_HOME = codexHome;
  else delete env.CODEX_HOME;
  delete env.OPENAI_API_KEY;
  return env;
}

function spawnCodex(command, args, options = {}) {
  const fixedArgs = args.every((arg) => ['--version', 'login', 'status'].includes(arg));
  if (!fixedArgs) throw new Error('Only fixed Codex status and login arguments are allowed by this companion stage.');
  return spawn(command, args, { ...options, shell: false });
}

function runCaptured(command, args, { timeoutMs = 4000, prefixArgs = [], env = safeEnvironment() } = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    const child = spawnCodex(command, [...prefixArgs, ...args], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const append = (current, chunk) => {
      const remaining = 4096 - current.length;
      return remaining > 0 ? current + chunk.toString('utf8').slice(0, remaining) : current;
    };
    child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk); });
    child.once('error', (error) => finish({ code: null, stdout, stderr, errorCode: error.code ?? 'SPAWN_ERROR', timedOut }));
    child.once('close', (code) => finish({ code, stdout, stderr, errorCode: null, timedOut }));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
  });
}

export async function inspectCodex({ command = 'codex', prefixArgs = [], codexHome } = {}) {
  const env = safeEnvironment(codexHome);
  let executable = command;
  if (process.platform === 'win32') {
    try { executable = await resolveNativeCodexCommand(command, env, process.platform); }
    catch {
      return { state: 'error', installed: false, signedIn: false, version: null, authMode: 'unknown', message: 'A native Codex .exe is required. AURIX will not launch a .cmd or .bat shim through a shell.' };
    }
  }
  const versionCheck = await runCaptured(executable, ['--version'], { timeoutMs: 4000, prefixArgs, env });
  if (versionCheck.errorCode === 'ENOENT') {
    return { state: 'missing', installed: false, signedIn: false, version: null, authMode: 'unknown', message: 'Codex CLI was not found on PATH.' };
  }
  if (versionCheck.errorCode || versionCheck.timedOut || versionCheck.code !== 0) {
    return { state: 'error', installed: false, signedIn: false, version: null, authMode: 'unknown', message: 'Codex CLI could not be checked. Verify the local installation.' };
  }

  const versionText = `${versionCheck.stdout} ${versionCheck.stderr}`;
  const version = versionText.match(/\b\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?\b/)?.[0] ?? 'installed';
  const loginCheck = await runCaptured(executable, ['login', 'status'], { timeoutMs: 4000, prefixArgs, env });
  if (loginCheck.errorCode || loginCheck.timedOut) {
    return { state: 'error', installed: true, signedIn: false, version, authMode: 'unknown', message: 'Codex is installed, but its sign-in status could not be checked.' };
  }

  const output = `${loginCheck.stdout}\n${loginCheck.stderr}`.toLowerCase();
  const authMode = /chatgpt/.test(output) ? 'chatgpt' : /api[ -]?key/.test(output) ? 'api_key' : 'unknown';
  const signedIn = loginCheck.code === 0;
  return {
    state: signedIn ? 'ready' : 'needs_login',
    installed: true,
    signedIn,
    version,
    authMode,
    message: signedIn ? 'AURIX Codex profile is signed in.' : 'AURIX Codex profile is installed but not signed in.',
  };
}


async function prepareAndVerifyCodex({ command, paths }) {
  try {
    const prepared = await prepareCodexHome(paths);
    const env = safeEnvironment(paths.codexHome);
    const executable = process.platform === 'win32'
      ? await resolveNativeCodexCommand(command, env, process.platform)
      : command;
    const version = await runCaptured(executable, ['--version'], { timeoutMs: 5000, env });
    if (version.errorCode || version.timedOut || version.code !== 0) {
      return {
        profilePrepared: true, sandboxVerified: false, profileName: paths.profileName,
        platform: process.platform, cliInstalled: false, version: null,
        code: version.errorCode || (version.timedOut ? 'CODEX_VERSION_TIMEOUT' : 'CODEX_NOT_READY'),
        message: 'The separate AURIX Codex profile was created, but Codex CLI could not be verified. Task execution remains disabled.',
      };
    }
    const versionText = `${version.stdout} ${version.stderr}`;
    const cliVersion = versionText.match(/\b\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?\b/)?.[0] ?? 'installed';
    const managed = await checkLegacySystemConfig(paths, process.env, process.platform);
    if (!managed.ok) {
      return {
        profilePrepared: true, sandboxVerified: false, profileName: paths.profileName,
        platform: process.platform, cliInstalled: true, version: cliVersion,
        code: managed.code, message: managed.message,
      };
    }
    const sandbox = await runCodexSandboxCanary({
      paths, command, env, platform: process.platform, timeoutMs: 20000,
    });
    return {
      profilePrepared: true, sandboxVerified: sandbox.ok, profileName: paths.profileName,
      platform: process.platform, cliInstalled: true, version: cliVersion,
      code: sandbox.code, message: sandbox.message,
    };
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'CODEX_PROFILE_PREPARE_FAILED';
    return {
      profilePrepared: false, sandboxVerified: false, profileName: paths.profileName,
      platform: process.platform, cliInstalled: false, version: null,
      code, message: 'AURIX could not safely create or validate its separate Codex profile. No Codex execution is enabled.',
    };
  }
}

async function readJson(req, limit = 4096) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) throw Object.assign(new Error('Request body is too large.'), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (!total) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON.'), { statusCode: 400 });
  }
}

export function createCompanionServer({ token, origin, codexCommand = 'codex', codexPrefixArgs = [], codexPaths = null }) {
  let loginChild = null;
  let sandboxVerification = { verified: false, version: null };
  const codexExec = createCodexExecManager({ platform: process.platform });
  const paths = codexPaths ?? resolveCodexPaths(process.env, process.platform);

  return http.createServer(async (req, res) => {
    const reqOrigin = req.headers.origin;
    const cors = {};
    if (reqOrigin && reqOrigin !== origin) {
      res.writeHead(403, { 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ error: 'ORIGIN_NOT_ALLOWED' }));
    }
    if (!isLoopbackHost(req.headers.host)) {
      res.writeHead(403, { 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ error: 'HOST_NOT_ALLOWED' }));
    }
    if (reqOrigin === origin) {
      cors['Access-Control-Allow-Origin'] = origin;
      cors['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
      cors['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
      cors['Access-Control-Allow-Private-Network'] = 'true';
      cors['Vary'] = 'Origin';
    }
    const send = (status, body) => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors });
      res.end(JSON.stringify(body));
    };

    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      return res.end();
    }

    const auth = req.headers.authorization ?? '';
    const given = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!safeEqual(given, token)) return send(401, { error: 'UNAUTHORIZED' });

    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/v1/health') {
      return send(200, {
        service: 'aurix-companion',
        apiVersion: 1,
        version: VERSION,
        capabilities: ['health', 'cli.codex.status', 'cli.codex.login', 'cli.codex.profile.prepare', 'cli.codex.sandbox.verify', 'cli.codex.chat.readonly'],
        grantedRoots: [],
      });
    }


    if (req.method === 'POST' && url.pathname === '/v1/codex/prepare') {
      try {
        await readJson(req);
      } catch (error) {
        return send(error?.statusCode ?? 400, { error: 'INVALID_REQUEST', message: 'The Codex profile request was invalid.' });
      }
      const result = await prepareAndVerifyCodex({ command: codexCommand, paths });
      sandboxVerification = result.sandboxVerified
        ? { verified: true, version: result.version }
        : { verified: false, version: null };
      return send(200, result);
    }

    if (req.method === 'GET' && url.pathname === '/v1/codex/status') {
      try {
        await validateCodexHome(paths);
      } catch {
        return send(200, {
          state: 'error', installed: false, signedIn: false, version: null, authMode: 'unknown',
          profilePrepared: false, profileName: paths.profileName,
          message: 'Prepare the separate AURIX Codex profile before checking its sign-in status.',
        });
      }
      const status = await inspectCodex({ command: codexCommand, prefixArgs: codexPrefixArgs, codexHome: paths.codexHome });
      const sandboxVerified = sandboxVerification.verified && status.version === sandboxVerification.version;
      if (!sandboxVerified) sandboxVerification = { verified: false, version: null };
      return send(200, {
        ...status,
        profilePrepared: true,
        profileName: paths.profileName,
        sandboxVerified,
      });
    }

    if (req.method === 'POST' && url.pathname === '/v1/codex/login') {
      try {
        await validateCodexHome(paths);
      } catch {
        return send(409, { error: 'CODEX_PROFILE_NOT_PREPARED', message: 'Prepare the separate AURIX Codex profile before signing in.' });
      }
      const status = await inspectCodex({ command: codexCommand, prefixArgs: codexPrefixArgs, codexHome: paths.codexHome });
      if (!status.installed) return send(409, { error: 'CODEX_NOT_INSTALLED', message: status.message });
      if (status.signedIn) return send(409, { error: 'ALREADY_SIGNED_IN', message: 'Codex CLI is already signed in.' });
      if (loginChild && loginChild.exitCode === null && !loginChild.killed) {
        return send(409, { error: 'LOGIN_ALREADY_RUNNING', message: 'A Codex sign-in process is already running in the companion terminal.' });
      }
      try {
        // Deliberately inherit the companion terminal: official Codex handles browser OAuth itself.
        // AURIX does not capture the login output or read the CLI credential store.
        const loginExecutable = process.platform === 'win32'
          ? await resolveNativeCodexCommand(codexCommand, safeEnvironment(paths.codexHome), process.platform)
          : codexCommand;
        const child = spawnCodex(loginExecutable, [...codexPrefixArgs, 'login'], {
          env: safeEnvironment(paths.codexHome),
          stdio: 'inherit',
          windowsHide: false,
        });
        loginChild = child;
        child.once('error', () => { if (loginChild === child) loginChild = null; });
        child.once('close', () => { if (loginChild === child) loginChild = null; });
        return send(202, { started: true, message: 'AURIX Codex sign-in opened in the companion terminal using its separate profile. Complete the official browser sign-in there, then check status again.' });
      } catch {
        loginChild = null;
        return send(500, { error: 'CODEX_LOGIN_START_FAILED', message: 'Could not start the official Codex sign-in process.' });
      }
    }

    if (req.method === 'POST' && url.pathname === '/v1/codex/exec') {
      let body;
      try {
        body = await readJson(req, CODEX_CHAT_MAX_PROMPT_CHARS + 2048);
      } catch (error) {
        return send(error?.statusCode ?? 400, { error: 'INVALID_REQUEST', message: 'The Codex chat request was invalid.' });
      }
      const taskId = body?.taskId;
      const userPrompt = body?.prompt;
      if (!/^[A-Za-z0-9_-]{1,96}$/.test(String(taskId ?? '')) ||
          typeof userPrompt !== 'string' || !userPrompt.trim() || userPrompt.length > 9_000) {
        return send(400, { error: 'INVALID_REQUEST', message: 'A valid task ID and a prompt of 1 to 9,000 characters are required.' });
      }

      // A disconnected browser must not leave a local Codex process running.
      res.once('close', () => {
        if (!res.writableEnded) void codexExec.cancel(taskId);
      });

      const prepared = await prepareAndVerifyCodex({ command: codexCommand, paths });
      sandboxVerification = prepared.sandboxVerified
        ? { verified: true, version: prepared.version }
        : { verified: false, version: null };
      if (!prepared.sandboxVerified) {
        return send(409, {
          error: prepared.code || 'CODEX_SANDBOX_UNVERIFIED',
          message: 'The read-only OS sandbox could not be verified for this task. No prompt was sent to Codex.',
        });
      }

      const status = await inspectCodex({
        command: codexCommand,
        prefixArgs: codexPrefixArgs,
        codexHome: paths.codexHome,
      });
      if (!status.installed || !status.signedIn || status.authMode !== 'chatgpt') {
        return send(409, {
          error: 'CODEX_CHATGPT_SIGN_IN_REQUIRED',
          message: 'Sign in to the separate AURIX Codex profile with ChatGPT before using read-only chat.',
        });
      }
      if (status.version !== prepared.version) {
        sandboxVerification = { verified: false, version: null };
        return send(409, {
          error: 'CODEX_VERSION_CHANGED',
          message: 'The Codex CLI version changed during sandbox verification. Run the profile check again.',
        });
      }

      const env = safeEnvironment(paths.codexHome);
      let executable;
      try {
        executable = await resolveNativeCodexCommand(codexCommand, env, process.platform);
      } catch {
        return send(409, {
          error: 'CODEX_NATIVE_EXECUTABLE_REQUIRED',
          message: 'A supported native Codex executable could not be resolved. No task was started.',
        });
      }

      const prompt = [
        'AURIX read-only chat mode: answer the user in text only.',
        'You have no access to their local projects, browser data, or files outside the isolated empty AURIX workspace.',
        'Do not claim to have inspected any project. Do not attempt file changes, terminal commands, network access, or deployments.',
        '',
        'User request:',
        userPrompt.trim(),
      ].join('\n');

      if (prompt.length > CODEX_CHAT_MAX_PROMPT_CHARS) {
        return send(400, { error: 'PROMPT_TOO_LONG', message: 'This Codex chat prompt is too long for the read-only local chat mode.' });
      }

      let taskWorkspaceRoot = null;
      let taskResult = null;
      let executionError = null;
      try {
        taskWorkspaceRoot = await createCodexChatWorkspace(paths.workspaceRoot);
        taskResult = await codexExec.run({
          taskId,
          command: executable,
          workspaceRoot: taskWorkspaceRoot,
          profileName: paths.profileName,
          prompt,
          env,
        });
      } catch (error) {
        executionError = error;
      }

      let cleanupFailed = false;
      if (taskWorkspaceRoot) {
        try {
          await removeCodexChatWorkspace(paths.workspaceRoot, taskWorkspaceRoot);
        } catch {
          cleanupFailed = true;
        }
      }
      if (cleanupFailed) {
        return send(500, {
          error: 'CODEX_CHAT_WORKSPACE_CLEANUP_FAILED',
          message: 'AURIX could not confirm cleanup of the temporary chat workspace. Do not retry until the companion is checked.',
        });
      }
      if (executionError) {
        const code = executionError && typeof executionError === 'object' && 'code' in executionError ? String(executionError.code) : 'CODEX_EXECUTION_FAILED';
        const statusCode = code === 'CODEX_TASK_TIMEOUT' ? 504
          : code === 'CODEX_BUSY' ? 429
          : code === 'CODEX_TASK_CANCELLED' || code === 'CODEX_CHAT_WORKSPACE_NOT_EMPTY' ? 409
          : 502;
        const message = code === 'CODEX_TASK_CANCELLED' ? 'The Codex task was cancelled.'
          : code === 'CODEX_TASK_TIMEOUT' ? 'The Codex task timed out and its local process was stopped.'
          : code === 'CODEX_BUSY' ? 'The local Codex executor is already handling another task.'
          : code === 'CODEX_CHAT_WORKSPACE_NOT_EMPTY' ? 'The isolated AURIX chat workspace contains unexpected files. No prompt was sent to Codex.'
          : 'The read-only Codex task failed. The companion did not return raw process output.';
        return send(statusCode, { error: code, message });
      }
      return send(200, { output: taskResult.output, mode: 'read_only_chat' });
    }

    if (req.method === 'POST' && url.pathname === '/v1/codex/cancel') {
      let body;
      try {
        body = await readJson(req);
      } catch (error) {
        return send(error?.statusCode ?? 400, { error: 'INVALID_REQUEST', message: 'The cancellation request was invalid.' });
      }
      const taskId = body?.taskId;
      if (!/^[A-Za-z0-9_-]{1,96}$/.test(String(taskId ?? ''))) {
        return send(400, { error: 'INVALID_TASK_ID', message: 'A valid task ID is required.' });
      }
      const cancelled = await codexExec.cancel(taskId);
      return send(cancelled ? 200 : 504, {
        cancelled,
        message: cancelled ? 'The local Codex process was stopped.' : 'The companion could not confirm that the Codex process tree stopped.',
      });
    }

    if (req.method === 'GET' && url.pathname === '/v1/codex/exec') {
      return send(405, { error: 'METHOD_NOT_ALLOWED' });
    }
    return send(501, { error: 'NOT_IMPLEMENTED', message: 'This companion build does not grant filesystem or task-execution access.' });
  });
}

// CLI entry
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const token = process.env.AURIX_COMPANION_TOKEN || randomBytes(24).toString('base64url');
  const origin = process.env.AURIX_ORIGIN || 'http://localhost:5173';
  const port = Number(process.env.AURIX_COMPANION_PORT || 4317);
  createCompanionServer({ token, origin }).listen(port, '127.0.0.1', () => {
    console.log(`AURIX companion ${VERSION} listening on http://127.0.0.1:${port}`);
    console.log(`Allowed origin: ${origin}`);
    console.log(`Pairing token:  ${token}`);
    console.log('Capabilities: official Codex status/login and sandbox-gated read-only text chat; no project file access, file writes, or general terminal endpoint.');
  });
}
