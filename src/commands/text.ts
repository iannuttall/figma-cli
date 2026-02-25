import chalk from 'chalk';
import { getFile, getFileNodes, parseFileKey, FigmaNode } from '../api.js';

interface TextOptions {
  nodeId?: string;
  page?: string;
  format?: 'json' | 'text';
}

interface TextNodeEntry {
  id: string;
  name: string;
  page: string;
  text: string;
}

function normalizeNodeId(nodeId: string): string {
  return nodeId.trim().replace(/-/g, ':');
}

function findPageNode(document: FigmaNode, pageFilter: string): FigmaNode {
  const pages = Array.isArray(document.children) ? document.children : [];
  const lower = pageFilter.toLowerCase();
  const exact = pages.find((page) => page.name.toLowerCase() === lower);
  if (exact) return exact;

  const partial = pages.find((page) => page.name.toLowerCase().includes(lower));
  if (partial) return partial;

  const available = pages.map((page) => page.name).slice(0, 15).join(', ');
  throw new Error(`Page "${pageFilter}" not found. Available pages: ${available}`);
}

function collectTextNodes(node: FigmaNode, page: string, out: TextNodeEntry[]): void {
  if (node.type === 'TEXT') {
    const text = String(node.characters || '').trim();
    if (text) {
      out.push({
        id: node.id,
        name: node.name,
        page,
        text,
      });
    }
  }

  if (!Array.isArray(node.children)) return;
  for (const child of node.children) {
    const nextPage = child.type === 'CANVAS' ? child.name : page;
    collectTextNodes(child, nextPage, out);
  }
}

function printTextNodes(items: TextNodeEntry[]): void {
  console.log(chalk.bold(`Text Nodes (${items.length})`));
  console.log('');

  if (items.length === 0) {
    console.log(chalk.yellow('No text nodes found.'));
    return;
  }

  items.forEach((item, index) => {
    console.log(`${index + 1}. ${chalk.cyan(item.name)} ${chalk.dim(`(${item.id})`)}`);
    console.log(`   ${chalk.dim(`page: ${item.page}`)}`);
    console.log(`   ${item.text}`);
    console.log('');
  });
}

export async function extractText(fileKeyOrUrl: string, options: TextOptions): Promise<void> {
  const fileKey = parseFileKey(fileKeyOrUrl);
  const format = options.format || 'text';
  const isJson = format === 'json';
  const nodeId = options.nodeId ? normalizeNodeId(options.nodeId) : '';
  const pageFilter = options.page?.trim();

  if (nodeId && pageFilter) {
    throw new Error('Use either --node-id or --page, not both.');
  }

  if (!isJson) {
    console.log(chalk.dim(`Extracting text from ${fileKey}...`));
  }

  let root: FigmaNode;
  let rootPage = 'Unknown';

  if (nodeId) {
    const nodesResponse = await getFileNodes(fileKey, [nodeId]);
    const node = nodesResponse.nodes[nodeId]?.document;
    if (!node) {
      throw new Error(`Node ${nodeId} not found.`);
    }
    root = node;
    rootPage = 'Scoped node';
  } else {
    const file = await getFile(fileKey);
    root = pageFilter ? findPageNode(file.document, pageFilter) : file.document;
    rootPage = root.type === 'CANVAS' ? root.name : 'Document';
  }

  const textNodes: TextNodeEntry[] = [];
  collectTextNodes(root, rootPage, textNodes);

  if (isJson) {
    console.log(JSON.stringify({
      fileKey,
      nodeId: nodeId || undefined,
      page: pageFilter || undefined,
      count: textNodes.length,
      nodes: textNodes,
    }, null, 2));
    return;
  }

  printTextNodes(textNodes);
}
