import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

interface FigmaCliConfig {
  figmaToken?: string;
}

const CONFIG_PATH = join(homedir(), '.config', 'figma-cli', 'config.json');

function readConfig(): FigmaCliConfig {
  if (!existsSync(CONFIG_PATH)) {
    return {};
  }

  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw) as FigmaCliConfig;
  } catch {
    return {};
  }
}

function writeConfig(config: FigmaCliConfig): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');

  try {
    chmodSync(CONFIG_PATH, 0o600);
  } catch {
    // Ignore chmod failures on filesystems that do not support POSIX permissions.
  }
}

function shellEscapeDoubleQuoted(value: string): string {
  return value.replace(/(["\\$`])/g, '\\$1');
}

function assertSafeShellToken(token: string): void {
  // Prevent command injection through shell rc files.
  if (/[\u0000-\u001F\u007F`]/.test(token)) {
    throw new Error('Token contains unsupported control characters for shell profile export.');
  }
}

function expandHomePath(filePath: string): string {
  if (filePath === '~') {
    return homedir();
  }
  if (filePath.startsWith('~/')) {
    return join(homedir(), filePath.slice(2));
  }
  return filePath;
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function getFigmaToken(): string | undefined {
  const envToken = process.env.FIGMA_TOKEN?.trim();
  if (envToken) {
    return envToken;
  }

  const rawConfigToken = readConfig().figmaToken;
  const configToken = typeof rawConfigToken === 'string' ? rawConfigToken.trim() : '';
  return configToken || undefined;
}

export function saveFigmaToken(token: string): string {
  const cleanToken = token.trim();
  if (!cleanToken) {
    throw new Error('Token cannot be empty.');
  }

  const config = readConfig();
  config.figmaToken = cleanToken;
  writeConfig(config);
  return CONFIG_PATH;
}

export function detectShellProfile(): string {
  const shell = process.env.SHELL ?? '';
  const home = homedir();

  if (shell.endsWith('/bash')) {
    const bashrc = join(home, '.bashrc');
    return existsSync(bashrc) ? bashrc : join(home, '.bash_profile');
  }

  if (shell.endsWith('/fish')) {
    return join(home, '.config', 'fish', 'config.fish');
  }

  return join(home, '.zshrc');
}

export function upsertShellTokenExport(token: string, profilePath?: string): string {
  const cleanToken = token.trim();
  if (!cleanToken) {
    throw new Error('Token cannot be empty.');
  }
  assertSafeShellToken(cleanToken);

  const targetPath = expandHomePath(profilePath || detectShellProfile());
  const isFish = targetPath.endsWith('/config.fish');
  const exportPattern = isFish
    ? /^\s*set\s+-gx\s+FIGMA_TOKEN\b.*$/gm
    : /^\s*export\s+FIGMA_TOKEN=.*$/gm;
  const exportLine = isFish
    ? `set -gx FIGMA_TOKEN "${shellEscapeDoubleQuoted(cleanToken)}"`
    : `export FIGMA_TOKEN="${shellEscapeDoubleQuoted(cleanToken)}"`;
  const existing = existsSync(targetPath) ? readFileSync(targetPath, 'utf-8') : '';
  const withoutToken = existing.replace(exportPattern, '').trimEnd();
  const nextContent = withoutToken ? `${withoutToken}\n\n${exportLine}\n` : `${exportLine}\n`;

  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, nextContent, 'utf-8');

  return targetPath;
}
