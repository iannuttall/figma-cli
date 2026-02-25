import chalk from 'chalk';
import { getFile, parseFileKey, FigmaNode } from '../api.js';
import { buildStyleDetails } from './styles.js';
import { findNodePath, normalizeNodeId } from '../utils/nodes.js';

interface InspectOptions {
  nodeId?: string;
  depth?: number;
  format?: 'json' | 'text';
}

interface Dimensions {
  width?: number;
  height?: number;
}

interface ChildNodeSummary {
  id: string;
  name: string;
  type: string;
  children: ChildNodeSummary[];
}

interface InspectResult {
  fileKey: string;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  parentId?: string;
  page?: string;
  ancestors: Array<{ id: string; name: string; type: string }>;
  dimensions: Dimensions;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  childrenDepth: number;
  children: ChildNodeSummary[];
  text: {
    count: number;
    content: string[];
    preview: string;
  };
  styles: Record<string, string>;
  layout: ReturnType<typeof buildStyleDetails>['layout'];
  style: Record<string, unknown>;
}

function collectText(node: FigmaNode, out: string[]): void {
  if (node.type === 'TEXT') {
    const text = String(node.characters || '').trim();
    if (text) out.push(text);
  }

  if (!Array.isArray(node.children)) return;
  for (const child of node.children) {
    collectText(child, out);
  }
}

function buildTextPreview(parts: string[], maxLength = 180): string {
  const combined = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (!combined) return '';
  if (combined.length <= maxLength) return combined;
  return `${combined.slice(0, maxLength - 1)}...`;
}

function buildChildren(node: FigmaNode, depth: number): ChildNodeSummary[] {
  if (depth <= 0 || !Array.isArray(node.children)) return [];
  return node.children.map((child) => ({
    id: normalizeNodeId(child.id),
    name: child.name,
    type: child.type,
    children: buildChildren(child, depth - 1),
  }));
}

function printChildTree(children: ChildNodeSummary[], indent = 1): void {
  for (const child of children) {
    const prefix = '  '.repeat(indent);
    console.log(`${prefix}- ${child.name} (${child.id}) ${child.type}`);
    if (child.children.length > 0) {
      printChildTree(child.children, indent + 1);
    }
  }
}

function printInspect(result: InspectResult): void {
  console.log(chalk.bold(`Inspect "${result.nodeName}"`));
  console.log(chalk.dim(`Node ID: ${result.nodeId}`));
  console.log(chalk.dim(`Type: ${result.nodeType}`));
  if (result.parentId) console.log(chalk.dim(`Parent ID: ${result.parentId}`));
  if (result.page) console.log(chalk.dim(`Page: ${result.page}`));
  console.log('');

  if (result.ancestors.length > 0) {
    const path = result.ancestors.map((node) => `${node.name} (${node.id})`).join(' > ');
    console.log(chalk.bold('Ancestors'));
    console.log(`  ${path}`);
    console.log('');
  }

  const width = typeof result.dimensions.width === 'number' ? `${result.dimensions.width}px` : 'unknown';
  const height = typeof result.dimensions.height === 'number' ? `${result.dimensions.height}px` : 'unknown';
  console.log(chalk.bold('Dimensions'));
  console.log(`  ${width} x ${height}`);
  if (result.absoluteBoundingBox) {
    console.log(`  x: ${result.absoluteBoundingBox.x}px, y: ${result.absoluteBoundingBox.y}px`);
  }
  console.log('');

  console.log(chalk.bold(`Children (depth=${result.childrenDepth})`));
  if (result.children.length === 0) {
    console.log('  No child nodes found.');
  } else {
    printChildTree(result.children);
  }
  console.log('');

  console.log(chalk.bold(`Text (${result.text.count})`));
  if (result.text.count === 0) {
    console.log('  No text content found.');
  } else {
    console.log(`  Preview: ${result.text.preview}`);
  }
  console.log('');

  console.log(chalk.bold('Styles'));
  if (Object.keys(result.styles).length === 0) {
    console.log('  No style properties found.');
    return;
  }

  for (const [key, value] of Object.entries(result.styles)) {
    console.log(`  ${key}: ${value}`);
  }
}

export async function inspectNode(fileKeyOrUrl: string, options: InspectOptions): Promise<void> {
  const fileKey = parseFileKey(fileKeyOrUrl);
  const format = options.format || 'text';
  const isJson = format === 'json';
  const rawNodeId = options.nodeId?.trim();
  const depth = Number.isFinite(options.depth) && options.depth! > 0 ? Math.floor(options.depth!) : 2;

  if (!rawNodeId) {
    throw new Error('Pass a node ID with --node-id.');
  }

  const nodeId = normalizeNodeId(rawNodeId);
  if (!isJson) {
    console.log(chalk.dim(`Inspecting ${fileKey} (${nodeId})...`));
  }

  const file = await getFile(fileKey);
  const path = findNodePath(file.document, nodeId);
  if (!path) {
    throw new Error(`Node ${nodeId} not found.`);
  }

  const textContent: string[] = [];
  collectText(path.node, textContent);
  const styleDetails = buildStyleDetails(path.node);

  const result: InspectResult = {
    fileKey,
    nodeId,
    nodeName: path.node.name,
    nodeType: path.node.type,
    parentId: path.parent ? normalizeNodeId(path.parent.id) : undefined,
    page: path.page?.name,
    ancestors: path.ancestors.map((ancestor) => ({
      id: normalizeNodeId(ancestor.id),
      name: ancestor.name,
      type: ancestor.type,
    })),
    dimensions: {
      width: path.node.absoluteBoundingBox?.width,
      height: path.node.absoluteBoundingBox?.height,
    },
    absoluteBoundingBox: path.node.absoluteBoundingBox,
    childrenDepth: depth,
    children: buildChildren(path.node, depth),
    text: {
      count: textContent.length,
      content: textContent,
      preview: buildTextPreview(textContent),
    },
    styles: styleDetails.css,
    layout: styleDetails.layout,
    style: styleDetails.rawStyle,
  };

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printInspect(result);
}

