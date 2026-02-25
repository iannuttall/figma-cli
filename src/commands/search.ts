import chalk from 'chalk';
import { getFile, getFileNodes, parseFileKey, FigmaNode } from '../api.js';

interface SearchOptions {
  text?: string;
  nodeId?: string;
  page?: string;
  format?: 'json' | 'text';
  caseSensitive?: boolean;
}

interface SearchMatch {
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

function collectMatches(
  node: FigmaNode,
  page: string,
  query: string,
  caseSensitive: boolean,
  out: SearchMatch[]
): void {
  if (node.type === 'TEXT') {
    const text = String(node.characters || '');
    if (text) {
      const haystack = caseSensitive ? text : text.toLowerCase();
      const needle = caseSensitive ? query : query.toLowerCase();
      if (haystack.includes(needle)) {
        out.push({
          id: node.id,
          name: node.name,
          page,
          text: text.trim(),
        });
      }
    }
  }

  if (!Array.isArray(node.children)) return;
  for (const child of node.children) {
    const nextPage = child.type === 'CANVAS' ? child.name : page;
    collectMatches(child, nextPage, query, caseSensitive, out);
  }
}

function printMatches(matches: SearchMatch[], query: string): void {
  console.log(chalk.bold(`Search results for "${query}" (${matches.length})`));
  console.log('');

  if (matches.length === 0) {
    console.log(chalk.yellow('No matches found.'));
    return;
  }

  matches.forEach((match, index) => {
    console.log(`${index + 1}. ${chalk.cyan(match.name)} ${chalk.dim(`(${match.id})`)}`);
    console.log(`   ${chalk.dim(`page: ${match.page}`)}`);
    console.log(`   ${match.text}`);
    console.log('');
  });
}

export async function searchText(fileKeyOrUrl: string, options: SearchOptions): Promise<void> {
  const fileKey = parseFileKey(fileKeyOrUrl);
  const format = options.format || 'text';
  const isJson = format === 'json';
  const query = options.text?.trim() || '';
  const nodeId = options.nodeId ? normalizeNodeId(options.nodeId) : '';
  const pageFilter = options.page?.trim();
  const caseSensitive = Boolean(options.caseSensitive);

  if (!query) {
    throw new Error('Pass a search query with --text "<query>".');
  }
  if (nodeId && pageFilter) {
    throw new Error('Use either --node-id or --page, not both.');
  }

  if (!isJson) {
    console.log(chalk.dim(`Searching "${query}" in ${fileKey}...`));
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

  const matches: SearchMatch[] = [];
  collectMatches(root, rootPage, query, caseSensitive, matches);

  if (isJson) {
    console.log(JSON.stringify({
      fileKey,
      query,
      nodeId: nodeId || undefined,
      page: pageFilter || undefined,
      count: matches.length,
      matches,
    }, null, 2));
    return;
  }

  printMatches(matches, query);
}
