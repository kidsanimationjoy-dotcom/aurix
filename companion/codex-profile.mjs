import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access, lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';

export const AURIX_CODEX_PROFILE = 'aurix-chat-readonly';
export const AURIX_PROFILE_VERSION = 3;

function requireAbsolute(value, label) {
  if (!value || !path.isAbsolute(value)) throw new Error(label + ' must be an absolute path.');
  return path.resolve(value);
}

function samePath(a, b) {
  const left = path.resolve(a);
  const right = path.resolve(b);
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function isWithin(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

export function resolveCodexPaths(env = process.env, platform = process.platform, home = os.homedir()) {
  const userHome = requireAbsolute(env.USERPROFILE || env.HOME || home, 'User home');
  let dataRoot;
  if (platform === 'win32') {
    dataRoot = requireAbsolute(env.LOCALAPPDATA || path.join(userHome, 'AppData', 'Local'), 'Local application data');
  } else if (platform === 'darwin') {
    dataRoot = path.join(userHome, 'Library', 'Application Support');
  } else {
    dataRoot = requireAbsolute(env.XDG_DATA_HOME || path.join(userHome, '.local', 'share'), 'XDG data directory');
  }
  const appRoot = path.resolve(dataRoot, platform === 'linux' ? 'aurix' : 'AURIX');
  const codexHome = path.join(appRoot, 'Codex');
  return {
    platform,
    appRoot,
    codexHome,
    configPath: path.join(codexHome, 'config.toml'),
    workspaceRoot: path.join(codexHome, 'workspaces', 'chat'),
    // Deliberately a sibling of CODEX_HOME so the :minimal read allowance cannot
    // accidentally include the canary merely because it lives in the Codex home.
    canaryRoot: path.join(appRoot, 'SandboxCanary'),
    profileName: AURIX_CODEX_PROFILE,
  };
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

/** Strict read-only chat profile with one dedicated AURIX workspace and no command network. */
function renderLegacyCodexProfileConfigV2(workspaceRoot) {
  const root = requireAbsolute(workspaceRoot, 'Codex workspace root');
  const profile = AURIX_CODEX_PROFILE;
  return [
    'default_permissions = ' + tomlString(profile),
    '',
    '[permissions.' + profile + ']',
    'description = "AURIX isolated read-only chat profile"',
    'extends = ":read-only"',
    '',
    '[permissions.' + profile + '.workspace_roots]',
    tomlString(root) + ' = true',
    '',
    '[permissions.' + profile + '.filesystem]',
    '":root" = "deny"',
    '":minimal" = "read"',
    '":tmpdir" = "deny"',
    '":slash_tmp" = "deny"',
    '',
    '[permissions.' + profile + '.filesystem.":workspace_roots"]',
    '"." = "read"',
    '',
    '[permissions.' + profile + '.network]',
    'enabled = false',
    '',
  ].join('\n');
}

/** Strict read-only chat profile with one dedicated AURIX workspace and no command network. */
export function renderCodexProfileConfig(workspaceRoot, platform = process.platform) {
  const root = requireAbsolute(workspaceRoot, 'Codex workspace root');
  const profile = AURIX_CODEX_PROFILE;
  const lines = [
    'default_permissions = ' + tomlString(profile),
    '',
  ];

  if (platform === 'win32') {
    // MXC is preferred on compatible Windows devices. The elevated legacy
    // backend is the only fallback here because unelevated cannot enforce
    // the denied-read boundary that this profile requires.
    lines.push(
      '[features]',
      'prefer_mxc = true',
      '',
      '[windows]',
      'sandbox = "elevated"',
      '',
    );
  }

  lines.push(
    '[permissions.' + profile + ']',
    'description = "AURIX isolated read-only chat profile"',
    'extends = ":read-only"',
    '',
    '[permissions.' + profile + '.workspace_roots]',
    tomlString(root) + ' = true',
    '',
    '[permissions.' + profile + '.filesystem]',
    '":root" = "deny"',
    '":minimal" = "read"',
    '":tmpdir" = "deny"',
    '":slash_tmp" = "deny"',
    '',
    '[permissions.' + profile + '.filesystem.":workspace_roots"]',
    '"." = "read"',
    '',
    '[permissions.' + profile + '.network]',
    'enabled = false',
    '',
  );
  return lines.join('\n');
}

async function replaceManagedProfileAtomically(target, content) {
  const temporary = path.join(
    path.dirname(target),
    '.aurix-config-' + randomBytes(12).toString('hex') + '.tmp',
  );
  try {
    await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    // rename replaces the existing regular file rather than following a final-component symlink.
    await rename(temporary, target);
  } finally {
    try { await rm(temporary, { force: true }); } catch {}
  }
}
export function hasLegacySandboxSetting(configText) {
  const text = String(configText ?? '');
  return /^(\s*sandbox_mode\s*=|\s*sandbox_workspace_write(?:\.|\s*=)|\s*\[sandbox_workspace_write(?:\.|\]))/m.test(text);
}

export function systemCodexConfigPaths(env = process.env, platform = process.platform) {
  if (platform === 'win32') {
    const programData = env.ProgramData || 'C:\\ProgramData';
    return [path.join(programData, 'OpenAI', 'Codex', 'config.toml')];
  }
  return ['/etc/codex/config.toml', '/etc/codex/managed_config.toml'];
}

async function ensureSafeDirectory(target, mode = 0o700) {
  const absolute = path.resolve(target);
  const root = path.parse(absolute).root;
  let current = root;
  for (const segment of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      await lstat(current);
    } catch (error) {
      if (!error || error.code !== 'ENOENT') throw error;
      try { await mkdir(current, { mode }); }
      catch (mkdirError) { if (!mkdirError || mkdirError.code !== 'EEXIST') throw mkdirError; }
    }
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw Object.assign(new Error('An AURIX Codex directory path contains a symbolic link or non-directory component.'), { code: 'CODEX_PATH_UNSAFE' });
    }
    const physical = await realpath(current);
    if (!samePath(physical, current)) {
      throw Object.assign(new Error('An AURIX Codex directory resolves through a redirected path.'), { code: 'CODEX_PATH_REDIRECTED' });
    }
  }
  return absolute;
}

async function assertSafeDirectory(target) {
  const absolute = path.resolve(target);
  const root = path.parse(absolute).root;
  let current = root;
  for (const segment of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw Object.assign(new Error('An AURIX Codex directory path contains a symbolic link or non-directory component.'), { code: 'CODEX_PATH_UNSAFE' });
    }
    const physical = await realpath(current);
    if (!samePath(physical, current)) {
      throw Object.assign(new Error('An AURIX Codex directory resolves through a redirected path.'), { code: 'CODEX_PATH_REDIRECTED' });
    }
  }
  return absolute;
}

async function assertRegularFile(target) {
  const stat = await lstat(target);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw Object.assign(new Error('The AURIX Codex profile config is not a regular file.'), { code: 'CODEX_PROFILE_INVALID' });
  }
  const physical = await realpath(target);
  if (!samePath(physical, target)) {
    throw Object.assign(new Error('The AURIX Codex profile config resolves through a redirected path.'), { code: 'CODEX_PROFILE_INVALID' });
  }
}

function validatePathLayout(paths) {
  if (!isWithin(paths.appRoot, paths.codexHome) ||
      !isWithin(paths.codexHome, paths.workspaceRoot) ||
      !isWithin(paths.appRoot, paths.canaryRoot) ||
      isWithin(paths.codexHome, paths.canaryRoot)) {
    throw Object.assign(new Error('The AURIX Codex workspace or canary path is outside its expected isolated layout.'), { code: 'CODEX_PATH_LAYOUT_INVALID' });
  }
}

export async function prepareCodexHome(paths, options = {}) {
  const mode = options.mode ?? 0o700;
  validatePathLayout(paths);
  await ensureSafeDirectory(paths.appRoot, mode);
  await ensureSafeDirectory(paths.codexHome, mode);
  await ensureSafeDirectory(paths.workspaceRoot, mode);
  await ensureSafeDirectory(paths.canaryRoot, mode);

  const expected = renderCodexProfileConfig(paths.workspaceRoot, paths.platform ?? process.platform);
  let existing;
  try {
    await assertRegularFile(paths.configPath);
    existing = await readFile(paths.configPath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code !== 'ENOENT') throw error;
  }

  if (existing === undefined) {
    try {
      await writeFile(paths.configPath, expected, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      existing = expected;
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')) throw error;
      await assertRegularFile(paths.configPath);
      existing = await readFile(paths.configPath, 'utf8');
    }
  }

  if (existing !== expected) {
    const legacy = renderLegacyCodexProfileConfigV2(paths.workspaceRoot);
    if (existing === legacy) {
      await assertRegularFile(paths.configPath);
      await replaceManagedProfileAtomically(paths.configPath, expected);
      existing = expected;
    } else {
      throw Object.assign(new Error('The AURIX Codex profile config was changed outside AURIX. Restore the managed profile before verification.'), { code: 'CODEX_PROFILE_MODIFIED' });
    }
  }
  return {
    ok: true,
    profileName: paths.profileName,
    codexHome: paths.codexHome,
    workspaceRoot: paths.workspaceRoot,
    canaryRoot: paths.canaryRoot,
  };
}

export async function validateCodexHome(paths) {
  validatePathLayout(paths);
  await assertSafeDirectory(paths.appRoot);
  await assertSafeDirectory(paths.codexHome);
  await assertSafeDirectory(paths.workspaceRoot);
  await assertSafeDirectory(paths.canaryRoot);
  await assertRegularFile(paths.configPath);
  const expected = renderCodexProfileConfig(paths.workspaceRoot, paths.platform ?? process.platform);
  const actual = await readFile(paths.configPath, 'utf8');
  if (actual !== expected) {
    throw Object.assign(new Error('The AURIX Codex profile config was changed outside AURIX.'), { code: 'CODEX_PROFILE_MODIFIED' });
  }
  return { ok: true, profileName: paths.profileName, codexHome: paths.codexHome, workspaceRoot: paths.workspaceRoot };
}

export async function checkLegacySystemConfig(paths, env = process.env, platform = process.platform) {
  for (const file of systemCodexConfigPaths(env, platform)) {
    try {
      const text = await readFile(file, 'utf8');
      if (hasLegacySandboxSetting(text)) {
        return { ok: false, code: 'LEGACY_SYSTEM_SANDBOX_CONFIG', message: 'A machine-wide Codex config contains legacy sandbox settings. AURIX will not run until the effective profile can be verified.' };
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code !== 'ENOENT') {
        return { ok: false, code: 'SYSTEM_CONFIG_UNREADABLE', message: 'A machine-wide Codex config exists but could not be checked. AURIX will fail closed.' };
      }
    }
  }
  return { ok: true, message: 'No conflicting legacy system sandbox setting was found.' };
}

export async function resolveNativeCodexCommand(command = 'codex', env = process.env, platform = process.platform) {
  const isWindows = platform === 'win32';
  const candidates = [];
  if (path.isAbsolute(command)) {
    candidates.push(command);
  } else {
    const dirs = String(env.PATH || '').split(path.delimiter).filter(Boolean);
    const base = path.basename(command);
    const extensions = isWindows ? ['.exe'] : [''];
    for (const dir of dirs) for (const extension of extensions) {
      candidates.push(path.join(dir, path.extname(base) ? base : base + extension));
    }
  }
  for (const candidate of candidates) {
    if (isWindows && path.extname(candidate).toLowerCase() !== '.exe') continue;
    try {
      await lstat(candidate);
      const physical = await realpath(candidate);
      const stat = await lstat(physical);
      if (!stat.isFile()) continue;
      if (!isWindows) await access(physical, 0o1);
      return physical;
    } catch { /* try next PATH entry */ }
  }
  throw Object.assign(new Error(isWindows
    ? 'A native Codex .exe was not found. AURIX will not route the sandbox command through a .cmd or .bat shell shim.'
    : 'The Codex executable was not found or is not executable.'), { code: isWindows ? 'NATIVE_WINDOWS_CLI_REQUIRED' : 'CODEX_EXECUTABLE_NOT_FOUND' });
}

export function buildCodexSandboxArgs({ platform, profileName, workspaceRoot, executable, executableArgs = [] }) {
  const sandboxPlatform = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : platform === 'linux' ? 'linux' : null;
  if (!sandboxPlatform) throw Object.assign(new Error('This operating system has no supported Codex sandbox command.'), { code: 'SANDBOX_PLATFORM_UNSUPPORTED' });
  if (!path.isAbsolute(workspaceRoot) || !path.isAbsolute(executable)) {
    throw new Error('Codex sandbox workspace and executable paths must be absolute.');
  }
  if (platform === 'win32' && path.extname(executable).toLowerCase() !== '.exe') {
    throw Object.assign(new Error('A native Codex .exe is required on Windows; shell shims are not accepted.'), { code: 'NATIVE_WINDOWS_CLI_REQUIRED' });
  }
  return [
    'sandbox', sandboxPlatform,
    '--permission-profile', profileName,
    '--include-managed-config',
    '--cd', workspaceRoot,
    '--', executable, ...executableArgs,
  ];
}

const CANARY_PROGRAM = String.raw`
const fs = require('node:fs');
const [insidePath, outsidePath, outsideWritePath, workspaceWritePath, expected] = process.argv.slice(1);
function denied(error) { return !!error && (error.code === 'EACCES' || error.code === 'EPERM'); }
try {
  if (fs.readFileSync(insidePath, 'utf8') !== expected) process.exit(10);
} catch { process.exit(11); }
try {
  fs.readFileSync(outsidePath, 'utf8');
  process.exit(20);
} catch (error) {
  if (!denied(error)) process.exit(21);
}
try {
  fs.writeFileSync(outsideWritePath, expected, { flag: 'wx' });
  try { fs.unlinkSync(outsideWritePath); } catch {}
  process.exit(30);
} catch (error) {
  if (!denied(error)) process.exit(31);
}
try {
  fs.writeFileSync(workspaceWritePath, expected, { flag: 'wx' });
  try { fs.unlinkSync(workspaceWritePath); } catch {}
  process.exit(40);
} catch (error) {
  if (!denied(error)) process.exit(41);
}
process.stdout.write('AURIX_SANDBOX_CANARY_OK');
`;

export async function runCodexSandboxCanary({ paths, command = 'codex', env = process.env, platform = process.platform, timeoutMs = 20000 } = {}) {
  const created = [];
  try {
    await validateCodexHome(paths);
    const executable = await resolveNativeCodexCommand(command, env, platform);
    const token = randomBytes(24).toString('hex');
    const insidePath = path.join(paths.workspaceRoot, '.aurix-canary-' + token + '.txt');
    const outsidePath = path.join(paths.canaryRoot, '.aurix-canary-' + token + '.txt');
    const outsideWritePath = path.join(paths.canaryRoot, '.aurix-write-' + token + '.txt');
    const workspaceWritePath = path.join(paths.workspaceRoot, '.aurix-write-' + token + '.txt');
    for (const file of [insidePath, outsidePath]) {
      await writeFile(file, token, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      created.push(file);
    }
    // Also clean the two write targets if a broken sandbox permits either write.
    created.push(outsideWritePath, workspaceWritePath);
    const args = buildCodexSandboxArgs({
      platform, profileName: paths.profileName, workspaceRoot: paths.workspaceRoot,
      executable: process.execPath,
      executableArgs: ['-e', CANARY_PROGRAM, insidePath, outsidePath, outsideWritePath, workspaceWritePath, token],
    });
    const result = await new Promise((resolve) => {
      let settled = false;
      let stdout = '';
      const child = spawn(executable, args, {
        cwd: paths.workspaceRoot,
        env,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      child.stdout.on('data', (chunk) => { if (stdout.length < 2048) stdout += chunk.toString('utf8').slice(0, 2048 - stdout.length); });
      child.once('error', (error) => finish({ ok: false, code: error.code || 'SANDBOX_SPAWN_FAILED' }));
      child.once('close', (code) => finish({ ok: code === 0 && stdout.includes('AURIX_SANDBOX_CANARY_OK'), code: code === 0 ? 'CANARY_OUTPUT_INVALID' : 'SANDBOX_CANARY_FAILED' }));
      const timer = setTimeout(() => {
        finish({ ok: false, code: 'SANDBOX_TIMEOUT' });
        child.kill();
      }, timeoutMs);
    });
    if (!result.ok) {
      return { ok: false, code: result.code, message: 'Codex sandbox did not prove all required read/write restrictions. Execution remains disabled.' };
    }
    return { ok: true, code: 'VERIFIED', message: 'The OS sandbox allowed the AURIX workspace read and blocked outside reads and writes.' };
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'SANDBOX_CHECK_FAILED';
    return { ok: false, code, message: 'AURIX could not verify the Codex OS sandbox. Execution remains disabled.' };
  } finally {
    for (const file of created) {
      try { await rm(file, { force: true }); } catch {}
    }
  }
}
