import chalk from 'chalk';
import { createInterface } from 'node:readline/promises';
import { emitKeypressEvents } from 'node:readline';
import { stdin, stdout } from 'node:process';
import {
  detectShellProfile,
  getConfigPath,
  getFigmaToken,
  saveFigmaToken,
  upsertShellTokenExport,
} from '../auth.js';

interface AuthOptions {
  token?: string;
  profile?: string;
  configOnly?: boolean;
  show?: boolean;
}

function maskToken(token: string): string {
  if (token.length <= 8) {
    return '*'.repeat(token.length);
  }

  return `${token.slice(0, 4)}${'*'.repeat(Math.max(token.length - 8, 4))}${token.slice(-4)}`;
}

async function promptForToken(): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY) {
    const rl = createInterface({ input: stdin, output: stdout });
    try {
      return (await rl.question('Paste your Figma Personal Access Token: ')).trim();
    } finally {
      rl.close();
    }
  }

  return new Promise((resolve, reject) => {
    let token = '';
    const previousRawMode = stdin.isRaw;

    const cleanup = (): void => {
      stdin.removeListener('keypress', onKeypress);
      if (stdin.setRawMode) {
        stdin.setRawMode(previousRawMode);
      }
      stdout.write('\n');
    };

    const onKeypress = (_str: string, key: { name?: string; ctrl?: boolean; sequence?: string }): void => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        reject(new Error('Token entry cancelled.'));
        return;
      }

      if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        resolve(token.trim());
        return;
      }

      if (key.name === 'backspace') {
        token = token.slice(0, -1);
        return;
      }

      if (typeof key.sequence === 'string' && key.sequence.length > 0) {
        token += key.sequence;
      }
    };

    stdout.write('Paste your Figma Personal Access Token: ');
    emitKeypressEvents(stdin);
    stdin.resume();
    if (stdin.setRawMode) {
      stdin.setRawMode(true);
    }
    stdin.on('keypress', onKeypress);
  });
}

function normalizeToken(rawToken: string): string {
  const cleaned = rawToken.trim().replace(/^['"]+|['"]+$/g, '');
  if (!cleaned) {
    throw new Error('Token cannot be empty.');
  }
  return cleaned;
}

export async function setupAuth(options: AuthOptions): Promise<void> {
  if (options.show) {
    const token = getFigmaToken();
    console.log(chalk.bold('Figma Auth Status'));
    console.log(`  Config path: ${chalk.cyan(getConfigPath())}`);
    console.log(`  Default shell profile: ${chalk.cyan(detectShellProfile())}`);
    console.log(`  Token: ${token ? chalk.green(maskToken(token)) : chalk.yellow('not configured')}`);
    console.log('');
    return;
  }

  const token = normalizeToken(options.token || await promptForToken());
  const configPath = saveFigmaToken(token);

  console.log(chalk.green(`Saved token to ${configPath}`));

  if (options.configOnly) {
    console.log(chalk.dim('Skipped shell profile update (--config-only).'));
    console.log(chalk.dim('The CLI will still work using the saved config token.'));
    return;
  }

  const profilePath = upsertShellTokenExport(token, options.profile);
  console.log(chalk.green(`Updated ${profilePath} with FIGMA_TOKEN export.`));
  console.log(chalk.dim(`Run: source ${profilePath}`));
}
