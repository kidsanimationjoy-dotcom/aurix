// AURIX local companion — authenticated, loopback-only API.
// Implemented: health, safe Codex CLI status check, and official local login handoff.
// Not implemented: filesystem access, terminal execution, or Codex task execution.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { analyzeReaTarget, reaStatus } from './rea.mjs';
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

export function createCompanionServer({ token, origin, codexCommand = 'codex', codexPrefixArgs = [], codexPaths = null, reaCommand = 'rea', reaRoots = [] }) {
  let loginChild = null;
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
        capabilities: ['health', 'cli.codex.status', 'cli.codex.login', 'cli.codex.profile.prepare', 'cli.codex.sandbox.verify', 'rea.status', 'rea.javascript.analyze', 'rea.desktop.inspect', 'rea.android.inspect'],
        grantedRoots: [],
      });
    }


    if (req.method === 'POST' && url.pathname === '/v1/codex/prepare') {
      try {
        await readJson(req);
      } catch (error) {
        const status = error && typeof error === 'object' && 'statusCode' in error
          ? Number(error.statusCode) : 400;
        return send(status >= 400 && status < 500 ? status : 400, {
          error: 'INVALID_REQUEST',
          message: status === 413
            ? 'The profile preparation request is too large.'
            : 'The profile preparation request must contain valid JSON.',
        });
      }
      return send(200, await prepareAndVerifyCodex({ command: codexCommand, paths }));
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
      return send(200, { ...status, profilePrepared: true, profileName: paths.profileName });
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

    if (req.method === 'GET' && url.pathname === '/v1/rea/status') {
      const status = await reaStatus({ command: reaCommand });
      return send(200, { ...status, approvedRootCount: reaRoots.length });
    }

    if (req.method === 'POST' && url.pathname === '/v1/rea/analyze') {
      let body;
      try { body = await readJson(req, 4096); }
      catch (error) {
        const status = error && typeof error === 'object' && 'statusCode' in error ? Number(error.statusCode) : 400;
        return send(status >= 400 && status < 500 ? status : 400, {
          error: 'INVALID_REQUEST',
          message: status === 413 ? 'REA request is too large.' : 'REA request must contain valid JSON.',
        });
      }
      try {
        const kind = ['desktop', 'android'].includes(body.kind) ? body.kind : 'javascript';
        const result = await analyzeReaTarget({ target: body.target, roots: reaRoots, command: reaCommand, kind });
        return send(200, { ok: true, result });
      } catch (error) {
        return send(400, { ok: false, error: 'REA_ANALYSIS_FAILED', message: error instanceof Error ? error.message.slice(0, 1200) : 'REA analysis failed.' });
      }
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
  const reaRoots = (process.env.AURIX_REA_ROOTS || '').split(path.delimiter).filter(Boolean);
  createCompanionServer({ token, origin, reaRoots }).listen(port, '127.0.0.1', () => {
    console.log(`AURIX companion ${VERSION} listening on http://127.0.0.1:${port}`);
    console.log(`Allowed origin: ${origin}`);
    console.log(`Pairing token:  ${token}`);
    console.log('Capabilities: health, Codex sign-in/status, and REA analysis of explicitly approved target folders.');
    console.log('REA approved roots: ' + reaRoots.length);
  });
}
