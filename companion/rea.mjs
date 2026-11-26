// Local REA bridge for AURIX. Runs only the documented JavaScript/Electron
// application analyzer against directories explicitly allowlisted by the user.
import { spawn } from 'node:child_process';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';

const MAX_OUTPUT = 1_000_000;
const DEFAULT_TIMEOUT_MS = 90_000;

function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function run(command, args, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
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

export async function analyzeReaTarget({ target, roots = [], command = 'rea' }) {
  if (typeof target !== 'string' || !target.trim() || target.length > 2048) {
    throw new Error('Provide a valid local application directory.');
  }
  if (!Array.isArray(roots) || roots.length === 0) {
    throw new Error('No REA target folders have been approved. Configure AURIX_REA_ROOTS first.');
  }
  const canonicalTarget = await realpath(target);
  const targetStat = await stat(canonicalTarget);
  if (!targetStat.isDirectory()) throw new Error('The REA target must be a directory.');
  const canonicalRoots = await Promise.all(roots.map(root => realpath(root)));
  if (!canonicalRoots.some(root => within(root, canonicalTarget))) {
    throw new Error('This target is outside the folders explicitly approved for REA inspection.');
  }

  // Fixed documented command and argument array; no shell, scripts, or user-supplied flags.
  const result = await run(command, ['analyze-javascript-application', canonicalTarget, '--json']);
  let report;
  try { report = JSON.parse(result.stdout); }
  catch { throw new Error('REA did not return valid JSON. Raw output was withheld.'); }
  return {
    target: canonicalTarget,
    engine: 'rea-agents',
    analyzedAt: new Date().toISOString(),
    report,
  };
}
