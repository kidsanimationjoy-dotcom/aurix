import os from 'node:os';
import path from 'node:path';
import { mkdir, lstat, readFile, writeFile } from 'node:fs/promises';

export const AURIX_CODEX_PROFILE = 'aurix-chat-readonly';
export const AURIX_PROFILE_VERSION = 1;

function requireAbsolute(value, label) {
  if (!value || !path.isAbsolute(value)) throw new Error(label + ' must be an absolute path.');
  return path.resolve(value);
}

export function resolveCodexPaths(env = process.env, platform = process.platform, home = os.homedir()) {
  const userHome = requireAbsolute(env.USERPROFILE || env.HOME || home, 'User home');
  let appData;
  if (platform === 'win32') {
    appData = requireAbsolute(env.LOCALAPPDATA || path.join(userHome, 'AppData', 'Local'), 'Local application data');
  } else if (platform === 'darwin') {
    appData = path.join(userHome, 'Library', 'Application Support');
  } else {
    appData = requireAbsolute(env.XDG_DATA_HOME || path.join(userHome, '.local', 'share'), 'XDG data directory');
  }
  const codexHome = platform === 'win32'
    ? path.join(appData, 'AURIX', 'Codex')
    : platform === 'darwin'
      ? path.join(appData, 'AURIX', 'Codex')
      : path.join(appData, 'aurix', 'codex');
  return {
    codexHome: path.resolve(codexHome),
    configPath: path.join(codexHome, 'config.toml'),
    workspaceRoot: path.join(codexHome, 'workspaces', 'chat'),
    canaryRoot: path.join(codexHome, 'sandbox-canary'),
    profileName: AURIX_CODEX_PROFILE,
  };
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

/** AURIX-controlled config: strict read-only profile with one empty workspace and no shell network. */
export function renderCodexProfileConfig(workspaceRoot) {
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

export async function prepareCodexHome(paths, options = {}) {
  const mode = options.mode ?? 0o700;
  await mkdir(paths.codexHome, { recursive: true, mode });
  await mkdir(paths.workspaceRoot, { recursive: true, mode });

  const homeStat = await lstat(paths.codexHome);
  const workspaceStat = await lstat(paths.workspaceRoot);
  if (homeStat.isSymbolicLink() || workspaceStat.isSymbolicLink()) {
    throw Object.assign(new Error('The AURIX Codex home or workspace is a symbolic link. Refusing to use it.'), { code: 'CODEX_HOME_SYMLINK' });
  }
  if (!homeStat.isDirectory() || !workspaceStat.isDirectory()) {
    throw Object.assign(new Error('The AURIX Codex home or workspace is not a directory.'), { code: 'CODEX_HOME_INVALID' });
  }

  const expected = renderCodexProfileConfig(paths.workspaceRoot);
  let existing;
  try {
    const configStat = await lstat(paths.configPath);
    if (configStat.isSymbolicLink() || !configStat.isFile()) {
      throw Object.assign(new Error('The AURIX Codex profile config is not a regular file.'), { code: 'CODEX_PROFILE_INVALID' });
    }
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
      existing = await readFile(paths.configPath, 'utf8');
    }
  }

  if (existing !== expected) {
    throw Object.assign(new Error('The AURIX Codex profile config was changed outside AURIX. Restore the managed profile before enabling Codex.'), { code: 'CODEX_PROFILE_MODIFIED' });
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
