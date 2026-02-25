import chalk from 'chalk';
import { getFile, parseFileKey, FigmaNode } from '../api.js';
import { findNodePath, findPageNode, normalizeNodeId, toTree, TreeNode } from '../utils/nodes.js';

interface TreeOptions {
  nodeId?: string;
  page?: string;
  depth?: number;
  format?: 'json' | 'text';
}

interface TreeResult {
  fileKey: string;
  rootNodeId: string;
  rootNodeName: string;
  rootNodeType: string;
  depth: number;
  parentId?: string;
  page?: string;
  ancestors: Array<{ id: string; name: string; type: string }>;
  tree: TreeNode;
}

function printTree(node: TreeNode, indent = 0): void {
  const prefix = '  '.repeat(indent);
  console.log(`${prefix}${node.name} (${node.id}) ${node.type}`);
  for (const child of node.children) {
    printTree(child, indent + 1);
  }
}

export async function printNodeTree(fileKeyOrUrl: string, options: TreeOptions): Promise<void> {
  const fileKey = parseFileKey(fileKeyOrUrl);
  const format = options.format || 'text';
  const isJson = format === 'json';
  const depth = Number.isFinite(options.depth) && options.depth! > 0 ? Math.floor(options.depth!) : 3;
  const rawNodeId = options.nodeId?.trim();
  const pageFilter = options.page?.trim();

  if (rawNodeId && pageFilter) {
    throw new Error('Use either --node-id or --page, not both.');
  }

  if (!isJson) {
    console.log(chalk.dim(`Building tree for ${fileKey} (depth=${depth})...`));
  }

  const file = await getFile(fileKey);
  let root: FigmaNode = file.document;
  let parentId: string | undefined;
  let pageName: string | undefined;
  let ancestors: Array<{ id: string; name: string; type: string }> = [];

  if (rawNodeId) {
    const nodeId = normalizeNodeId(rawNodeId);
    const path = findNodePath(file.document, nodeId);
    if (!path) {
      throw new Error(`Node ${nodeId} not found.`);
    }

    root = path.node;
    parentId = path.parent ? normalizeNodeId(path.parent.id) : undefined;
    pageName = path.page?.name;
    ancestors = path.ancestors.map((ancestor) => ({
      id: normalizeNodeId(ancestor.id),
      name: ancestor.name,
      type: ancestor.type,
    }));
  } else if (pageFilter) {
    const pageNode = findPageNode(file.document, pageFilter);
    root = pageNode;
    pageName = pageNode.name;
    ancestors = [{
      id: normalizeNodeId(file.document.id),
      name: file.document.name,
      type: file.document.type,
    }];
  }

  const result: TreeResult = {
    fileKey,
    rootNodeId: normalizeNodeId(root.id),
    rootNodeName: root.name,
    rootNodeType: root.type,
    depth,
    parentId,
    page: pageName,
    ancestors,
    tree: toTree(root, depth),
  };

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(chalk.bold(`Tree "${result.rootNodeName}"`));
  console.log(chalk.dim(`Node ID: ${result.rootNodeId}`));
  console.log(chalk.dim(`Type: ${result.rootNodeType}`));
  if (result.parentId) console.log(chalk.dim(`Parent ID: ${result.parentId}`));
  if (result.page) console.log(chalk.dim(`Page: ${result.page}`));
  console.log('');
  printTree(result.tree);
}

