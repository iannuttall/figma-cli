import { FigmaNode } from '../api.js';

export interface NodePathResult {
  node: FigmaNode;
  parent?: FigmaNode;
  ancestors: FigmaNode[];
  page?: FigmaNode;
}

export interface TreeNode {
  id: string;
  name: string;
  type: string;
  children: TreeNode[];
}

export function normalizeNodeId(nodeId: string): string {
  return nodeId.trim().replace(/-/g, ':');
}

export function parseNodeIdsCsv(value: string): string[] {
  return value
    .split(',')
    .map((part) => normalizeNodeId(part))
    .filter(Boolean);
}

export function findPageNode(document: FigmaNode, pageFilter: string): FigmaNode {
  const pages = Array.isArray(document.children) ? document.children : [];
  const lower = pageFilter.toLowerCase();
  const exact = pages.find((page) => page.name.toLowerCase() === lower);
  if (exact) return exact;

  const partial = pages.find((page) => page.name.toLowerCase().includes(lower));
  if (partial) return partial;

  const available = pages.map((page) => page.name).slice(0, 15).join(', ');
  throw new Error(`Page "${pageFilter}" not found. Available pages: ${available}`);
}

export function findNodePath(root: FigmaNode, nodeId: string): NodePathResult | null {
  const targetId = normalizeNodeId(nodeId);

  const walk = (
    node: FigmaNode,
    ancestors: FigmaNode[],
    parent: FigmaNode | undefined,
    page: FigmaNode | undefined
  ): NodePathResult | null => {
    const currentPage = node.type === 'CANVAS' ? node : page;
    if (normalizeNodeId(node.id) === targetId) {
      return { node, parent, ancestors, page: currentPage };
    }

    if (!Array.isArray(node.children)) return null;
    for (const child of node.children) {
      const result = walk(child, [...ancestors, node], node, currentPage);
      if (result) return result;
    }

    return null;
  };

  return walk(root, [], undefined, undefined);
}

export function buildParentMap(root: FigmaNode): Map<string, string | undefined> {
  const parents = new Map<string, string | undefined>();

  const walk = (node: FigmaNode, parentId: string | undefined): void => {
    const normalizedId = normalizeNodeId(node.id);
    parents.set(normalizedId, parentId);

    if (!Array.isArray(node.children)) return;
    for (const child of node.children) {
      walk(child, normalizedId);
    }
  };

  walk(root, undefined);
  return parents;
}

export function toTree(node: FigmaNode, depth: number): TreeNode {
  const nextDepth = depth - 1;
  const children = nextDepth > 0 && Array.isArray(node.children)
    ? node.children.map((child) => toTree(child, nextDepth))
    : [];

  return {
    id: normalizeNodeId(node.id),
    name: node.name,
    type: node.type,
    children,
  };
}

