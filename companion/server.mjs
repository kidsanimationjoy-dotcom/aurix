// AURIX local companion — authenticated, loopback-only API.
// Implemented: health, safe Codex CLI status check, and official local login handoff.
// Not implemented: filesystem access, terminal execution, or Codex task execution.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const VERSION = '0.2.0';

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

function safeEnvironment() {
  const allowed = [
    'PATH', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
    'TMP', 'TEMP', 'TMPDIR', 'SystemRoot', 'WINDIR',
    'APPDATA', 'LOCALAPPDATA', 'CODEX_HOME', 'PATHEXT', 'LANG', 'LC_ALL',
  ];
  const env = {};
  for (const key of allowed) {
    if (typeof process.env[key] === 'string') env[key] = process.env[key];
  }
  return env;
}

function spawnCodex(command, args, options = {}) {
  const fixedArgs = args.every((arg) => ['--version', 'login', 'status'].includes(arg));
  if (!fixedArgs) throw new Error('Only fixed Codex status and login arguments are allowed by this companion stage.');

  if (process.platform === 'win32') {
    // Windows npm installations expose .cmd shims. Node documents that these
    // require cmd.exe; only the fixed arguments above can reach this path.
    const executable = String(command).includes(' ')
      ? '"' + String(command).replace(/"/g, '') + '"'
      : String(command);
    const commandLine = [executable, ...args].join(' ');
    return spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/c', commandLine], options);
  }

  return spawn(command, args, options);
}

function runCaptured(command, args, { timeoutMs = 4000, prefixArgs = [] } = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    const child = spawnCodex(command, [...prefixArgs, ...args], {
      env: safeEnvironment(),
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

export async function inspectCodex({ command = 'codex', prefixArgs = [] } = {}) {
  const versionCheck = await runCaptured(command, ['--version'], { timeoutMs: 4000, prefixArgs });
  if (versionCheck.errorCode === 'ENOENT') {
    return { state: 'missing', installed: false, signedIn: false, version: null, authMode: 'unknown', message: 'Codex CLI was not found on PATH.' };
  }
  if (versionCheck.errorCode || versionCheck.timedOut || versionCheck.code !== 0) {
    return { state: 'error', installed: false, signedIn: false, version: null, authMode: 'unknown', message: 'Codex CLI could not be checked. Verify the local installation.' };
  }

  const versionText = `${versionCheck.stdout} ${versionCheck.stderr}`;
  const version = versionText.match(/\b\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?\b/)?.[0] ?? 'installed';
  const loginCheck = await runCaptured(command, ['login', 'status'], { timeoutMs: 4000, prefixArgs });
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
    message: signedIn ? 'Codex CLI is signed in.' : 'Codex CLI is installed but not signed in.',
  };
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

export function createCompanionServer({ token, origin, codexCommand = 'codex', codexPrefixArgs = [] }) {
  let loginChild = null;

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
        capabilities: ['health', 'cli.codex.status', 'cli.codex.login'],
        grantedRoots: [],
      });
    }

    if (req.method === 'GET' && url.pathname === '/v1/codex/status') {
      return send(200, await inspectCodex({ command: codexCommand, prefixArgs: codexPrefixArgs }));
    }

    if (req.method === 'POST' && url.pathname === '/v1/codex/login') {
      const status = await inspectCodex({ command: codexCommand, prefixArgs: codexPrefixArgs });
      if (!status.installed) return send(409, { error: 'CODEX_NOT_INSTALLED', message: status.message });
      if (status.signedIn) return send(409, { error: 'ALREADY_SIGNED_IN', message: 'Codex CLI is already signed in.' });
      if (loginChild && loginChild.exitCode === null && !loginChild.killed) {
        return send(409, { error: 'LOGIN_ALREADY_RUNNING', message: 'A Codex sign-in process is already running in the companion terminal.' });
      }
      try {
        // Deliberately inherit the companion terminal: official Codex handles browser OAuth itself.
        // AURIX does not capture the login output or read the CLI credential store.
        const child = spawnCodex(codexCommand, [...codexPrefixArgs, 'login'], {
          env: safeEnvironment(),
          stdio: 'inherit',
          windowsHide: false,
        });
        loginChild = child;
        child.once('error', () => { if (loginChild === child) loginChild = null; });
        child.once('close', () => { if (loginChild === child) loginChild = null; });
        return send(202, { started: true, message: 'Codex sign-in opened in the companion terminal. Complete the official browser sign-in there, then check status again.' });
      } catch {
        loginChild = null;
        return send(500, { error: 'CODEX_LOGIN_START_FAILED', message: 'Could not start the official Codex sign-in process.' });
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
  createCompanionServer({ token, origin }).listen(port, '127.0.0.1', () => {
    console.log(`AURIX companion ${VERSION} listening on http://127.0.0.1:${port}`);
    console.log(`Allowed origin: ${origin}`);
    console.log(`Pairing token:  ${token}`);
    console.log('Capabilities: health and official Codex CLI status/login only; no filesystem/task execution access.');
  });
}
