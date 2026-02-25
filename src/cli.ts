#!/usr/bin/env node

import { program } from 'commander';
import chalk from 'chalk';
import { extractTokens } from './commands/tokens.js';
import { exportAssets } from './commands/export.js';
import { runAudit } from './commands/audit.js';
import { getFileInfo } from './commands/info.js';
import { listComponents } from './commands/components.js';
import { analyzeTypography } from './commands/typography.js';
import { setupAuth } from './commands/auth.js';
import { getDesignComments } from './commands/comments.js';
import { extractText } from './commands/text.js';
import { searchText } from './commands/search.js';
import { getNodeStyles } from './commands/styles.js';
import { diffNodes } from './commands/diff.js';
import { inspectNode } from './commands/inspect.js';
import { printNodeTree } from './commands/tree.js';

type CommandHandler = (...args: any[]) => Promise<void>;

function withErrorHandling(handler: CommandHandler): (...args: any[]) => Promise<void> {
  return async (...args: any[]) => {
    try {
      await handler(...args);
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
      process.exit(1);
    }
  };
}

program
  .name('fig')
  .description('Figma CLI - Headless design system tools')
  .version('1.0.0');

// Auth command
program
  .command('auth')
  .description('Set and persist FIGMA_TOKEN for this CLI')
  .option('-t, --token <token>', 'Figma personal access token')
  .option('-p, --profile <path>', 'Shell profile to update (default: auto-detected)')
  .option('--config-only', 'Only save to local CLI config (skip shell profile)')
  .option('--show', 'Show current token status')
  .action(withErrorHandling(async (opts) => {
    await setupAuth(opts);
  }));

// Info command
program
  .command('info <file>')
  .description('Get file information')
  .option('-f, --format <format>', 'Output format: json, text', 'text')
  .option('-d, --depth <number>', 'Figma API depth for page/item counts (default: 2)', '2')
  .option('-p, --page <name>', 'Limit output to pages matching this name')
  .action(withErrorHandling(async (file, opts) => {
    const depth = parseInt(opts.depth, 10);
    await getFileInfo(file, { ...opts, depth });
  }));

// Tokens command
program
  .command('tokens <file>')
  .description('Extract design tokens (variables, colors, typography)')
  .option('-f, --format <format>', 'Output format: json, css, scss, js', 'json')
  .option('-o, --output <path>', 'Output file path')
  .action(withErrorHandling(async (file, opts) => {
    await extractTokens(file, opts);
  }));

// Export command
program
  .command('export <file>')
  .description('Export assets from Figma file')
  .option('-f, --format <format>', 'Image format: png, jpg, svg, pdf', 'png')
  .option('-s, --scale <scale>', 'Export scale (1-4)')
  .option('--retina', 'Shortcut for --scale 3')
  .option('-o, --output <dir>', 'Output directory', './figma-exports')
  .option('--components', 'Export all components')
  .option('--frames', 'Export all top-level frames')
  .option('--node-ids <ids>', 'Export specific node IDs (comma-separated)')
  .option('--crop <x,y,w,h>', 'Crop exported PNGs to this rectangle')
  .action(withErrorHandling(async (file, opts) => {
    const scale = opts.scale ? parseFloat(opts.scale) : undefined;
    await exportAssets(file, { ...opts, scale });
  }));

// Audit command
program
  .command('audit <file>')
  .description('Run design system audit')
  .option('-f, --format <format>', 'Output format: json, text', 'text')
  .option('-n, --node-id <id>', 'Audit a specific frame/component node ID')
  .option('-p, --page <name>', 'Audit a specific page name')
  .action(withErrorHandling(async (file, opts) => {
    await runAudit(file, opts);
  }));

// Components command
program
  .command('components <file>')
  .description('List all components in a file')
  .option('-f, --format <format>', 'Output format: json, text', 'text')
  .option('-p, --page <name>', 'Limit components to pages matching this name')
  .action(withErrorHandling(async (file, opts) => {
    await listComponents(file, opts);
  }));

// Typography command
program
  .command('typography <file>')
  .alias('typo')
  .description('Analyze typography in a file or specific node')
  .option('-n, --node-id <id>', 'Analyze specific node ID')
  .option('-f, --format <format>', 'Output format: json, text', 'text')
  .action(withErrorHandling(async (file, opts) => {
    await analyzeTypography(file, opts);
  }));

// Comments command
program
  .command('comments <file>')
  .description('Fetch comments from a file URL or file key')
  .option('-f, --format <format>', 'Output format: json, text', 'text')
  .option('-u, --unresolved', 'Show only unresolved comments')
  .option('-l, --limit <count>', 'Maximum comments to return (default: 100)')
  .option('-n, --node-id <id>', 'Limit comments to a specific node ID')
  .option('-p, --page <name>', 'Limit comments to a page name')
  .option('--since <date>', 'Only include comments on/after this date (ISO/date string)')
  .option('--until <date>', 'Only include comments on/before this date (ISO/date string)')
  .option('--no-node-preview', 'Skip node text previews for node-linked comments')
  .action(withErrorHandling(async (file, opts) => {
    await getDesignComments(file, opts);
  }));

// Text extraction command
program
  .command('text <file>')
  .description('Extract text content from the document or a scoped node/page')
  .option('-n, --node-id <id>', 'Limit extraction to a specific node subtree')
  .option('-p, --page <name>', 'Limit extraction to a page name')
  .option('-f, --format <format>', 'Output format: json, text', 'text')
  .action(withErrorHandling(async (file, opts) => {
    await extractText(file, opts);
  }));

// Text search command
program
  .command('search <file>')
  .description('Find nodes containing specific text')
  .requiredOption('-t, --text <query>', 'Text to search for')
  .option('-n, --node-id <id>', 'Limit search to a specific node subtree')
  .option('-p, --page <name>', 'Limit search to a page name')
  .option('--case-sensitive', 'Use case-sensitive matching')
  .option('-f, --format <format>', 'Output format: json, text', 'text')
  .action(withErrorHandling(async (file, opts) => {
    await searchText(file, opts);
  }));

// Computed styles command
program
  .command('styles <file>')
  .description('Dump computed CSS-like properties for one or more nodes')
  .option('-n, --node-id <id>', 'Target node ID')
  .option('--node-ids <ids>', 'Multiple node IDs (comma-separated)')
  .option('-f, --format <format>', 'Output format: json, text', 'text')
  .action(withErrorHandling(async (file, opts) => {
    await getNodeStyles(file, opts);
  }));

// Node diff command
program
  .command('diff <file>')
  .description('Compare two nodes (text, styles, layout)')
  .requiredOption('--node-ids <a,b>', 'Two node IDs to compare, comma separated')
  .option('-f, --format <format>', 'Output format: json, text', 'text')
  .action(withErrorHandling(async (file, opts) => {
    await diffNodes(file, opts);
  }));

// Combined inspect command
program
  .command('inspect <file>')
  .description('Inspect one node: dimensions + text + styles')
  .requiredOption('-n, --node-id <id>', 'Target node ID')
  .option('-d, --depth <number>', 'Child depth to include in hierarchy output (default: 2)', '2')
  .option('-f, --format <format>', 'Output format: json, text', 'text')
  .action(withErrorHandling(async (file, opts) => {
    const depth = parseInt(opts.depth, 10);
    await inspectNode(file, { ...opts, depth });
  }));

// Node tree command
program
  .command('tree <file>')
  .description('Print node hierarchy tree for a file, page, or node')
  .option('-n, --node-id <id>', 'Root node ID for the tree')
  .option('-p, --page <name>', 'Root page name for the tree')
  .option('-d, --depth <number>', 'Tree depth (default: 3)', '3')
  .option('-f, --format <format>', 'Output format: json, text', 'text')
  .action(withErrorHandling(async (file, opts) => {
    const depth = parseInt(opts.depth, 10);
    await printNodeTree(file, { ...opts, depth });
  }));

// Quick command - file info + audit in one
program
  .command('quick <file>')
  .description('Quick overview: file info + design audit')
  .option('-f, --format <format>', 'Output format: json, text', 'text')
  .option('-d, --depth <number>', 'Figma API depth for page/item counts (default: 2)', '2')
  .option('-p, --page <name>', 'Limit info/audit to a specific page name')
  .option('-n, --node-id <id>', 'Limit audit to a specific node ID')
  .action(withErrorHandling(async (file, opts) => {
    const depth = parseInt(opts.depth, 10);
    console.log(chalk.bold('\nFILE INFO\n'));
    await getFileInfo(file, { ...opts, depth });
    console.log(chalk.bold('\nDESIGN AUDIT\n'));
    await runAudit(file, opts);
  }));

// Parse and run
program.parse();
