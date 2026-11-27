// Local REA bridge for AURIX. Runs only the documented JavaScript/Electron
// application analyzer against targets inside directories explicitly allowlisted by the user.
import { spawn } from 'node:child_process';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';

const MAX_OUTPUT = 1_000_000;
const MAX_BROWSER_OUTPUT = 3_000_000;
const DEFAULT_TIMEOUT_MS = 90_000;

function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function safeEnvironment() {
  const allowed = ['PATH', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'TMP', 'TEMP', 'TMPDIR', 'SystemRoot', 'WINDIR', 'APPDATA', 'LOCALAPPDATA', 'PATHEXT', 'LANG', 'LC_ALL'];
  const env = {};
  for (const key of allowed) if (typeof process.env[key] === 'string') env[key] = process.env[key];
  return env;
}

function run(command, args, timeoutMs = DEFAULT_TIMEOUT_MS, maxOutput = MAX_OUTPUT) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: safeEnvironment() });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const append = (current, chunk) => {
      const next = current + chunk.toString('utf8');
      if (next.length > maxOutput) {
        child.kill();
        finish(reject, new Error('REA output exceeded the one-megabyte safety limit.'));
        return current;
      }
      return next;
    };
    child.stdout.on('data', chunk => { stdout = append(stdout, chunk); });
    child.stderr.on('data', chunk => { stderr = append(stderr, chunk); });
    child.once('error', error => finish(reject, error));
    child.once('close', code => {
      if (code !== 0) return finish(reject, new Error(('REA exited with code ' + code + ': ' + stderr).slice(0, 1200)));
      finish(resolve, { stdout, stderr });
    });
    const timer = setTimeout(() => {
      child.kill();
      finish(reject, new Error('REA analysis timed out.'));
    }, timeoutMs);
  });
}

export async function reaStatus({ command = 'rea' } = {}) {
  try {
    const result = await run(command, ['--help'], 5000);
    return { available: true, version: 'installed (help command verified)' };
  } catch (error) {
    return { available: false, version: null, message: error instanceof Error && error.code === 'ENOENT'
      ? 'REA CLI was not found. Install the official rea-agents package locally.'
      : 'REA CLI could not be verified: ' + (error instanceof Error ? error.message : 'unknown error') };
  }
}

async function resolveApprovedTarget(target, roots, allowAsar = false) {
  if (typeof target !== 'string' || !target.trim() || target.length > 2048) {
    throw new Error('Provide a valid local application path.');
  }
  if (!Array.isArray(roots) || roots.length === 0) {
    throw new Error('No REA target folders have been approved. Configure AURIX_REA_ROOTS first.');
  }
  const canonicalTarget = await realpath(target);
  const targetStat = await stat(canonicalTarget);
  const isDirectory = targetStat.isDirectory();
  const isAsarArchive = allowAsar &&
    targetStat.isFile() &&
    path.extname(canonicalTarget).toLowerCase() === '.asar';

  if (!isDirectory && !isAsarArchive) {
    throw new Error(allowAsar
      ? 'The JavaScript REA target must be an application directory or an .asar archive.'
      : 'The REA target must be an installation directory.');
  }

  const canonicalRoots = await Promise.all(roots.map(root => realpath(root)));
  if (!canonicalRoots.some(root => within(root, canonicalTarget))) {
    throw new Error('This target is outside the folders explicitly approved for REA inspection.');
  }

  return canonicalTarget;
}

async function resolveApprovedFile(target, roots) {
  if (typeof target !== 'string' || !target.trim() || target.length > 2048) throw new Error('Provide a valid local artifact file.');
  if (!Array.isArray(roots) || roots.length === 0) throw new Error('No REA target folders have been approved. Configure AURIX_REA_ROOTS first.');
  const canonicalTarget = await realpath(target);
  const targetStat = await stat(canonicalTarget);
  if (!targetStat.isFile()) throw new Error('The REA Android target must be a file.');
  const canonicalRoots = await Promise.all(roots.map(root => realpath(root)));
  if (!canonicalRoots.some(root => within(root, canonicalTarget))) throw new Error('This file is outside the folders explicitly approved for REA inspection.');
  return canonicalTarget;
}

async function runJsonAnalysis(command, args, canonicalTarget, options = {}) {
  const result = await run(command, args, options.timeoutMs ?? DEFAULT_TIMEOUT_MS, options.maxOutput ?? MAX_OUTPUT);
  let report;
  try { report = JSON.parse(result.stdout); }
  catch { throw new Error('REA did not return valid JSON. Raw output was withheld.'); }
  return { target: canonicalTarget, engine: 'rea-agents', analyzedAt: new Date().toISOString(), report };
}

export async function analyzeReaTarget({ target, roots = [], command = 'rea', kind = 'javascript' }) {
  const canonicalTarget = kind === 'android' ? await resolveApprovedFile(target, roots) : await resolveApprovedTarget(target, roots, kind === 'javascript');
  if (kind === 'android') return runJsonAnalysis(command, ['inspect-android-package', canonicalTarget, '--json'], canonicalTarget);
  if (kind === 'javascript') return runJsonAnalysis(command, ['analyze-javascript-application', canonicalTarget, '--json'], canonicalTarget);
  if (kind === 'desktop') return runJsonAnalysis(command, ['inspect-desktop-application', canonicalTarget, '--json'], canonicalTarget);
  throw new Error('Unsupported REA analysis workflow.');
}

/**
 * REA's browser observer is strictly passive. Accept only a literal loopback
 * CDP HTTP endpoint with an explicit TCP port; never forward arbitrary URLs.
 */
export function validateReaBrowserEndpoint(value) {
  if (typeof value !== 'string' || value.length > 128) {
    throw new Error('Enter a local Chrome DevTools endpoint such as http://127.0.0.1:9222.');
  }
  const match = /^http:\/\/127\.0\.0\.1:([0-9]{1,5})\/?$/u.exec(value.trim());
  if (!match) {
    throw new Error('Browser inspection accepts only http://127.0.0.1:PORT with an explicit port.');
  }
  const port = Number(match[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('The local Chrome DevTools port must be between 1 and 65535.');
  }
  return 'http://127.0.0.1:' + String(port);
}

function validateBrowserTargetId(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 256 ||
      /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error('Select a valid browser tab from the discovered target list.');
  }
  return value;
}

export async function listReaBrowserTargets({ endpoint, command = 'rea' } = {}) {
  const localEndpoint = validateReaBrowserEndpoint(endpoint);
  const result = await run(command, ['list-browser-targets', localEndpoint, '--json'], 20_000, MAX_BROWSER_OUTPUT);
  let report;
  try { report = JSON.parse(result.stdout); }
  catch { throw new Error('REA did not return valid browser target JSON. Raw output was withheld.'); }
  return { endpoint: localEndpoint, engine: 'rea-agents', inspectedAt: new Date().toISOString(), report };
}

export async function inspectReaBrowserTarget({ endpoint, targetId, kind = 'page', command = 'rea' } = {}) {
  const localEndpoint = validateReaBrowserEndpoint(endpoint);
  const selectedTargetId = validateBrowserTargetId(targetId);
  const operation = kind === 'bundle' ? 'analyze-web-bundle' : kind === 'page' ? 'inspect-web-page' : null;
  if (!operation) throw new Error('Unsupported passive browser inspection workflow.');
  const args = kind === 'bundle'
    ? [operation, localEndpoint, selectedTargetId, '--json']
    : [operation, localEndpoint, selectedTargetId, '--observation-ms', '500', '--json'];
  const result = await runJsonAnalysis(command, args, selectedTargetId, {
    timeoutMs: kind === 'bundle' ? 300_000 : DEFAULT_TIMEOUT_MS,
    maxOutput: MAX_BROWSER_OUTPUT,
  });
  return { ...result, endpoint: localEndpoint, targetId: selectedTargetId, kind };
}
