// Local REA bridge for AURIX. Runs only the documented JavaScript/Electron
// application analyzer against targets inside directories explicitly allowlisted by the user.
import { spawn } from 'node:child_process';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';

const MAX_OUTPUT = 1_000_000;
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

function run(command, args, timeoutMs = DEFAULT_TIMEOUT_MS) {
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
      if (next.length > MAX_OUTPUT) {
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

async function runJsonAnalysis(command, args, canonicalTarget) {
  const result = await run(command, args);
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
