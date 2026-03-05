import chalk from 'chalk';
import { getFile, parseFileKey } from '../api.js';
import { collectNodeColors } from './styles.js';
import { findNodePath, normalizeNodeId } from '../utils/nodes.js';

interface ColorsOptions {
  nodeId?: string;
  depth?: number;
  format?: 'json' | 'text';
}

interface ColorsResult {
  fileKey: string;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  depth: number;
  count: number;
  nodes: ReturnType<typeof collectNodeColors>;
}

function printColors(result: ColorsResult): void {
  console.log(chalk.bold(`Resolved colors for "${result.nodeName}"`));
  console.log(chalk.dim(`Node ID: ${result.nodeId}`));
  console.log(chalk.dim(`Type: ${result.nodeType}`));
  console.log(chalk.dim(`Depth: ${result.depth}`));
  console.log('');

  for (const item of result.nodes) {
    const indent = '  '.repeat(item.depth);
    const fills = item.fills.length > 0 ? item.fills.join(', ') : chalk.dim('none');
    const strokes = item.strokes.length > 0 ? item.strokes.join(', ') : chalk.dim('none');
    console.log(`${indent}- ${item.nodeName} (${item.nodeId}) ${item.nodeType}`);
    console.log(`${indent}  fills: ${fills}`);
    console.log(`${indent}  strokes: ${strokes}`);
  }
}

export async function getNodeColors(fileKeyOrUrl: string, options: ColorsOptions): Promise<void> {
  const fileKey = parseFileKey(fileKeyOrUrl);
  const format = options.format || 'text';
  const isJson = format === 'json';
  const rawNodeId = options.nodeId?.trim();
  const depth = Number.isFinite(options.depth) && options.depth! >= 0 ? Math.floor(options.depth!) : 1;

  if (!rawNodeId) {
    throw new Error('Pass a node ID with --node-id.');
  }

  const nodeId = normalizeNodeId(rawNodeId);
  if (!isJson) {
    console.log(chalk.dim(`Resolving colors for ${fileKey} (${nodeId}, depth=${depth})...`));
  }

  const file = await getFile(fileKey);
  const path = findNodePath(file.document, nodeId);
  if (!path) {
    throw new Error(`Node ${nodeId} not found.`);
  }

  const nodes = collectNodeColors(path.node, depth);
  const result: ColorsResult = {
    fileKey,
    nodeId,
    nodeName: path.node.name,
    nodeType: path.node.type,
    depth,
    count: nodes.length,
    nodes,
  };

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printColors(result);
}
