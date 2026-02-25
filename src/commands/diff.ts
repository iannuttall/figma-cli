import chalk from 'chalk';
import { getFileNodes, parseFileKey, FigmaFill, FigmaNode } from '../api.js';

interface DiffOptions {
  nodeIds?: string;
  format?: 'json' | 'text';
}

interface NodeSnapshot {
  id: string;
  name: string;
  type: string;
  width?: number;
  height?: number;
  layoutMode?: string;
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  childCount: number;
  textContent: string;
  textStyles: string[];
  fillColors: string[];
}

function normalizeNodeId(nodeId: string): string {
  return nodeId.trim().replace(/-/g, ':');
}

function toHex(r: number, g: number, b: number, a = 1): string {
  const toByteHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  const base = `#${toByteHex(r)}${toByteHex(g)}${toByteHex(b)}`;
  return a < 1 ? `${base}${toByteHex(a)}` : base;
}

function styleSignature(node: FigmaNode): string | null {
  if (node.type !== 'TEXT') return null;
  const style = (node.style as Record<string, unknown> | undefined) ?? {};
  const family = String(style.fontFamily || 'Unknown');
  const weight = String(style.fontWeight || '');
  const size = String(style.fontSize || '');
  const lineHeight = String(style.lineHeightPx || '');
  return `${family}|${weight}|${size}|${lineHeight}`;
}

function firstSolidFillColor(node: FigmaNode): string | null {
  if (!Array.isArray(node.fills)) return null;
  for (const fill of node.fills as FigmaFill[]) {
    if (fill.type === 'SOLID' && fill.color) {
      const alpha = typeof fill.opacity === 'number' ? fill.opacity : fill.color.a ?? 1;
      return toHex(fill.color.r, fill.color.g, fill.color.b, alpha);
    }
  }
  return null;
}

function traverse(node: FigmaNode, fn: (item: FigmaNode) => void): void {
  fn(node);
  if (!Array.isArray(node.children)) return;
  for (const child of node.children) {
    traverse(child, fn);
  }
}

function snapshot(node: FigmaNode): NodeSnapshot {
  const textParts: string[] = [];
  const textStyles = new Set<string>();
  const fillColors = new Set<string>();

  traverse(node, (item) => {
    if (item.type === 'TEXT') {
      const text = String(item.characters || '').trim();
      if (text) textParts.push(text);
    }

    const sig = styleSignature(item);
    if (sig) textStyles.add(sig);

    const fill = firstSolidFillColor(item);
    if (fill) fillColors.add(fill);
  });

  const rec = node as Record<string, unknown>;
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    width: node.absoluteBoundingBox?.width,
    height: node.absoluteBoundingBox?.height,
    layoutMode: typeof rec.layoutMode === 'string' ? rec.layoutMode : undefined,
    itemSpacing: typeof rec.itemSpacing === 'number' ? rec.itemSpacing : undefined,
    paddingTop: typeof rec.paddingTop === 'number' ? rec.paddingTop : undefined,
    paddingRight: typeof rec.paddingRight === 'number' ? rec.paddingRight : undefined,
    paddingBottom: typeof rec.paddingBottom === 'number' ? rec.paddingBottom : undefined,
    paddingLeft: typeof rec.paddingLeft === 'number' ? rec.paddingLeft : undefined,
    childCount: Array.isArray(node.children) ? node.children.length : 0,
    textContent: textParts.join('\n'),
    textStyles: Array.from(textStyles).sort(),
    fillColors: Array.from(fillColors).sort(),
  };
}

function arrayDiff(before: string[], after: string[]): { added: string[]; removed: string[] } {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const added = after.filter((item) => !beforeSet.has(item));
  const removed = before.filter((item) => !afterSet.has(item));
  return { added, removed };
}

function buildDiff(a: NodeSnapshot, b: NodeSnapshot) {
  const layoutDiff: Record<string, { a: number | string | undefined; b: number | string | undefined }> = {};
  const layoutKeys: Array<keyof NodeSnapshot> = [
    'width', 'height', 'layoutMode', 'itemSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'childCount',
  ];

  for (const key of layoutKeys) {
    if (a[key] !== b[key]) {
      layoutDiff[String(key)] = { a: a[key] as number | string | undefined, b: b[key] as number | string | undefined };
    }
  }

  const textChanged = a.textContent !== b.textContent;
  const textPreviewA = a.textContent.slice(0, 180);
  const textPreviewB = b.textContent.slice(0, 180);
  const textStyles = arrayDiff(a.textStyles, b.textStyles);
  const fillColors = arrayDiff(a.fillColors, b.fillColors);

  return {
    nodes: {
      a: { id: a.id, name: a.name, type: a.type },
      b: { id: b.id, name: b.name, type: b.type },
    },
    text: {
      changed: textChanged,
      aLength: a.textContent.length,
      bLength: b.textContent.length,
      aPreview: textPreviewA,
      bPreview: textPreviewB,
    },
    styles: {
      textStylesAddedInB: textStyles.added,
      textStylesRemovedFromA: textStyles.removed,
      fillColorsAddedInB: fillColors.added,
      fillColorsRemovedFromA: fillColors.removed,
    },
    layout: layoutDiff,
  };
}

function printDiff(result: ReturnType<typeof buildDiff>): void {
  console.log(chalk.bold('Node Diff'));
  console.log(`${chalk.cyan('A')}: ${result.nodes.a.name} ${chalk.dim(`(${result.nodes.a.id})`)}`);
  console.log(`${chalk.cyan('B')}: ${result.nodes.b.name} ${chalk.dim(`(${result.nodes.b.id})`)}`);
  console.log('');

  console.log(chalk.bold('Text'));
  console.log(`  Changed: ${result.text.changed ? chalk.yellow('yes') : chalk.green('no')}`);
  console.log(`  Length A/B: ${result.text.aLength}/${result.text.bLength}`);

  console.log(chalk.bold('\nStyles'));
  console.log(`  Text styles added in B: ${result.styles.textStylesAddedInB.length}`);
  console.log(`  Text styles removed from A: ${result.styles.textStylesRemovedFromA.length}`);
  console.log(`  Fill colors added in B: ${result.styles.fillColorsAddedInB.length}`);
  console.log(`  Fill colors removed from A: ${result.styles.fillColorsRemovedFromA.length}`);

  console.log(chalk.bold('\nLayout'));
  const entries = Object.entries(result.layout);
  if (entries.length === 0) {
    console.log(`  ${chalk.green('No layout differences found.')}`);
  } else {
    for (const [key, value] of entries) {
      console.log(`  ${key}: ${chalk.dim(String(value.a))} -> ${chalk.cyan(String(value.b))}`);
    }
  }
}

export async function diffNodes(fileKeyOrUrl: string, options: DiffOptions): Promise<void> {
  const fileKey = parseFileKey(fileKeyOrUrl);
  const format = options.format || 'text';
  const isJson = format === 'json';

  if (!options.nodeIds) {
    throw new Error('Pass two node IDs with --node-ids <a>,<b>.');
  }

  const parts = options.nodeIds.split(',').map((part) => normalizeNodeId(part)).filter(Boolean);
  if (parts.length !== 2) {
    throw new Error('Pass exactly two node IDs with --node-ids <a>,<b>.');
  }

  const [aId, bId] = parts;
  if (!isJson) {
    console.log(chalk.dim(`Diffing nodes ${aId} and ${bId} in ${fileKey}...`));
  }

  const nodesResponse = await getFileNodes(fileKey, [aId, bId]);
  const aNode = nodesResponse.nodes[aId]?.document;
  const bNode = nodesResponse.nodes[bId]?.document;
  if (!aNode || !bNode) {
    throw new Error('Could not fetch one or both nodes.');
  }

  const result = buildDiff(snapshot(aNode), snapshot(bNode));

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printDiff(result);
}
