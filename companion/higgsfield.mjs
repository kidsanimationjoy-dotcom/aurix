// Official Higgsfield CLI bridge. Authentication stays inside the CLI's local
// OAuth store; AURIX never reads or returns credentials.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_OUTPUT = 1_000_000;
const QUOTE_TTL_MS = 5 * 60_000;
const ALLOWED_ENV = [
  'PATH', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
  'APPDATA', 'LOCALAPPDATA', 'SystemRoot', 'WINDIR',
  'TEMP', 'TMP', 'TMPDIR', 'PATHEXT', 'LANG', 'LC_ALL',
];

function safeEnvironment() {
  const env = {};
  for (const key of ALLOWED_ENV) if (typeof process.env[key] === 'string') env[key] = process.env[key];
  for (const key of ['HIGGSFIELD_API_KEY', 'HIGGSFIELD_TOKEN', 'HF_API_KEY', 'OPENAI_API_KEY']) delete env[key];
  return env;
}

function run(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const env = options.env ?? safeEnvironment();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      if (stdout.length > MAX_OUTPUT) {
        child.kill();
        finish(reject, new Error('Higgsfield CLI output exceeded the one-megabyte limit.'));
      }
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < 4000) stderr += chunk.toString('utf8').slice(0, 4000 - stderr.length);
    });
    child.once('error', (error) => finish(reject, error));
    child.once('close', (code) => {
      if (code !== 0) {
        const message = /not authenticated|session expired|unauthorized|please log in/i.test(stderr + stdout)
          ? 'Higgsfield is not signed in. Run the official "higgsfield auth login" command in your local terminal.'
          : ('Higgsfield CLI exited with code ' + code + '. Check the local CLI installation and run the official command in your terminal for details.');
        finish(reject, new Error(message));
        return;
      }
      finish(resolve, { stdout, stderr });
    });
    timer = setTimeout(() => {
      child.kill();
      finish(reject, new Error('Higgsfield CLI operation timed out.'));
    }, timeoutMs);
  });
}

async function resolveCommand(command = 'higgsfield') {
  if (process.platform !== 'win32') return { command, prefix: [] };
  if (path.isAbsolute(command) && command.toLowerCase().endsWith('.exe')) return { command, prefix: [] };

  // On Windows avoid spawning an npm .cmd shim through a shell. Locate the
  // documented npm package entry point and execute it using the current Node.
  const where = await run('where.exe', ['higgsfield'], { timeoutMs: 5000 });
  const shim = where.stdout.split(/\r?\n/u).map((x) => x.trim()).find((x) => /\.cmd$/iu.test(x));
  if (!shim) throw new Error('Higgsfield CLI was not found. Install the official package with "npm install -g @higgsfield/cli".');
  const root = path.join(path.dirname(shim), 'node_modules', '@higgsfield', 'cli');
  const packagePath = path.join(root, 'package.json');
  const packageData = JSON.parse(await readFile(packagePath, 'utf8'));
  const binPath = typeof packageData.bin === 'string'
    ? packageData.bin
    : packageData.bin?.higgsfield ?? packageData.bin?.hf;
  if (typeof binPath !== 'string' || !binPath || path.isAbsolute(binPath) || binPath.split(/[\\/]/u).includes('..')) {
    throw new Error('The installed Higgsfield package has an unsupported CLI entry point.');
  }
  const script = path.resolve(root, binPath);
  if (!script.startsWith(root + path.sep)) throw new Error('The Higgsfield CLI entry point escaped its installed package.');
  await access(script);
  return { command: process.execPath, prefix: [script] };
}

function parseJson(stdout, label) {
  try { return JSON.parse(stdout); }
  catch { throw new Error('Higgsfield did not return valid JSON for ' + label + '. Raw output was withheld.'); }
}

function pickAccount(value) {
  const root = value && typeof value === 'object' ? value : {};
  const account = root.account && typeof root.account === 'object' ? root.account : root.data && typeof root.data === 'object' ? root.data : root;
  const safe = {};
  for (const key of ['email', 'plan', 'workspace', 'credits', 'available_credits', 'credit_balance', 'remaining_credits', 'balance', 'subscription']) {
    if (account[key] !== undefined && account[key] !== null) safe[key] = account[key];
  }
  return safe;
}

function listFromModelResponse(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const key of ['models', 'data', 'items', 'results']) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

function modelIdOf(model) {
  if (!model || typeof model !== 'object') return '';
  for (const key of ['job_set_type', 'id', 'model_id', 'slug']) {
    if (typeof model[key] === 'string' && model[key]) return model[key];
  }
  return '';
}

function stablePricing(value) {
  const out = {};
  const walk = (node, prefix = '') => {
    if (!node || typeof node !== 'object') return;
    for (const [key, item] of Object.entries(node)) {
      const name = prefix ? prefix + '.' + key : key;
      if (/credit|cost|price|estimate|amount/iu.test(key) && (typeof item === 'number' || typeof item === 'string')) {
        out[name] = item;
      } else if (item && typeof item === 'object') {
        walk(item, name);
      }
    }
  };
  walk(value);
  return out;
}

function makeArgs(action, spec) {
  if (spec.modelId !== 'seedance_2_0') {
    throw new Error('AURIX currently enables generation only for the live Seedance 2.0 video model.');
  }
  const prompt = typeof spec.prompt === 'string' ? spec.prompt.trim() : '';
  if (!prompt || prompt.length > 8000) throw new Error('Enter a prompt of 1–8,000 characters.');
  const duration = Number(spec.duration ?? 5);
  const resolution = String(spec.resolution ?? '720p');
  const aspectRatio = String(spec.aspectRatio ?? '16:9');
  if (![5, 10].includes(duration)) throw new Error('Choose a supported 5- or 10-second duration.');
  if (!['720p', '1080p'].includes(resolution)) throw new Error('Choose 720p or 1080p resolution.');
  if (!['16:9', '9:16', '1:1'].includes(aspectRatio)) throw new Error('Choose a supported aspect ratio.');
  return [
    'generate', action, spec.modelId,
    '--mode', 'std',
    '--prompt', prompt,
    '--duration', String(duration),
    '--resolution', resolution,
    '--aspect_ratio', aspectRatio,
    '--json',
  ];
}

function findJobId(value) {
  if (!value || typeof value !== 'object') return null;
  if (typeof value.job_id === 'string') return value.job_id;
  if (typeof value.id === 'string' && /job|generation/i.test(String(value.type ?? value.object ?? 'job'))) return value.id;
  for (const key of ['job', 'data', 'result']) {
    if (value[key] && typeof value[key] === 'object') {
      const found = findJobId(value[key]);
      if (found) return found;
    }
  }
  return null;
}

export function createHiggsfieldManager({ command = 'higgsfield' } = {}) {
  const quotes = new Map();
  let resolved = null;
  let loginChild = null;
  const cli = async (args, timeoutMs) => {
    resolved ??= await resolveCommand(command);
    const result = await run(resolved.command, [...resolved.prefix, ...args], { timeoutMs });
    return result.stdout;
  };

  return {
    async login() {
      if (loginChild && loginChild.exitCode === null && !loginChild.killed) throw new Error('A Higgsfield sign-in process is already running in the companion terminal.');
      resolved ??= await resolveCommand(command);
      const child = spawn(resolved.command, [...resolved.prefix, 'auth', 'login'], {
        shell: false, windowsHide: false, stdio: 'inherit', env: safeEnvironment(),
      });
      loginChild = child;
      child.once('error', () => { if (loginChild === child) loginChild = null; });
      child.once('close', () => { if (loginChild === child) loginChild = null; });
      return { started: true, message: 'The official Higgsfield browser sign-in has started in the local companion terminal. Complete the browser flow there, then refresh the account status. AURIX does not read the sign-in credentials.' };
    },

    async status() {
      try {
        const [versionOut, accountOut] = await Promise.all([
          cli(['version', '--json'], 10_000),
          cli(['account', 'status', '--json'], 15_000),
        ]);
        const version = parseJson(versionOut, 'version');
        const account = pickAccount(parseJson(accountOut, 'account status'));
        return { installed: true, signedIn: true, version, account, message: 'Higgsfield CLI is installed and signed in.' };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Higgsfield status is unavailable.';
        const missing = /not found|ENOENT|install the official package/i.test(message);
        const unauthenticated = /not signed in|auth login|session expired/i.test(message);
        return {
          installed: !missing,
          signedIn: false,
          version: null,
          account: {},
          message,
          code: missing ? 'CLI_MISSING' : unauthenticated ? 'AUTH_REQUIRED' : 'STATUS_ERROR',
        };
      }
    },

    async listModels() {
      const raw = parseJson(await cli(['model', 'list', '--json'], 30_000), 'model catalog');
      const models = listFromModelResponse(raw);
      return {
        raw,
        models: models.map((model) => ({
          id: modelIdOf(model),
          name: typeof model?.name === 'string' ? model.name : modelIdOf(model),
          kinds: Array.isArray(model?.categories) ? model.categories : Array.isArray(model?.kinds) ? model.kinds : [],
          raw: model,
        })).filter((model) => model.id),
      };
    },

    async quote(spec) {
      const catalog = await this.listModels();
      if (!catalog.models.some((model) => model.id === spec.modelId && (model.kinds.length === 0 || model.kinds.some((kind) => /video/iu.test(String(kind)))))) {
        throw new Error('The requested model is not present in the live Higgsfield video-model catalog.');
      }
      const args = makeArgs('cost', spec);
      const raw = parseJson(await cli(args, 60_000), 'generation cost estimate');
      const pricing = stablePricing(raw);
      if (!Object.keys(pricing).length) throw new Error('Higgsfield returned no recognised numeric credit estimate. AURIX will not submit a generation without a verifiable cost field.');
      for (const [id, oldQuote] of quotes) if (oldQuote.expiresAt < Date.now()) quotes.delete(id);
      while (quotes.size >= 50) quotes.delete(quotes.keys().next().value);
      const quoteId = randomUUID();
      const quote = {
        quoteId,
        createdAt: Date.now(),
        expiresAt: Date.now() + QUOTE_TTL_MS,
        modelId: spec.modelId,
        prompt: spec.prompt.trim(),
        settings: { duration: Number(spec.duration ?? 5), resolution: String(spec.resolution ?? '720p'), aspectRatio: String(spec.aspectRatio ?? '16:9') },
        raw,
        pricing,
      };
      quotes.set(quoteId, quote);
      return quote;
    },

    async create({ quoteId, confirmed }) {
      const quote = quotes.get(quoteId);
      if (!quote || quote.expiresAt < Date.now()) throw new Error('The credit estimate expired. Request a new estimate before generation.');
      if (confirmed !== true) throw new Error('Generation requires a separate explicit confirmation after reviewing the credit estimate.');
      // Consume immediately to prevent duplicate paid submissions, including concurrent retries.
      quotes.delete(quoteId);
      const spec = { modelId: quote.modelId, prompt: quote.prompt, ...quote.settings };
      const fresh = parseJson(await cli(makeArgs('cost', spec), 60_000), 'fresh generation cost estimate');
      const pricing = stablePricing(fresh);
      if (!Object.keys(pricing).length) throw new Error('Higgsfield returned no fresh credit estimate. The quote was consumed; request a new estimate before trying again.');
      if (JSON.stringify(pricing) !== JSON.stringify(quote.pricing)) {
        quotes.delete(quoteId);
        throw new Error('Higgsfield pricing changed since the estimate. Request a new estimate and review the updated credits.');
      }
      const created = parseJson(await cli(makeArgs('create', spec), 90_000), 'generation job creation');
      const jobId = findJobId(created);
      if (!jobId) throw new Error('Higgsfield accepted a generation request but did not return a recognised job ID. Check the account job list before retrying to avoid duplicate charges.');
      return { jobId, submittedAt: new Date().toISOString(), raw: created };
    },

    async getJob(jobId) {
      if (typeof jobId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(jobId)) throw new Error('Invalid Higgsfield job ID.');
      return parseJson(await cli(['generate', 'get', jobId, '--json'], 30_000), 'generation job status');
    },
  };
}
