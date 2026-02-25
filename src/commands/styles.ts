import chalk from 'chalk';
import { getFile, getFileNodes, parseFileKey, FigmaEffect, FigmaFill, FigmaNode } from '../api.js';
import { buildParentMap, normalizeNodeId, parseNodeIdsCsv } from '../utils/nodes.js';

interface StylesOptions {
  nodeId?: string;
  nodeIds?: string;
  format?: 'json' | 'text';
}

interface PaddingValues {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  source: 'explicit' | 'inferred' | 'none';
}

export interface NodeStyleDetails {
  css: Record<string, string>;
  layout: {
    mode?: string;
    itemSpacing?: number;
    primaryAxisAlignItems?: string;
    counterAxisAlignItems?: string;
    layoutWrap?: string;
    layoutSizingHorizontal?: string;
    layoutSizingVertical?: string;
    padding: PaddingValues;
  };
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  rawStyle: Record<string, unknown>;
}

function toHex(r: number, g: number, b: number, a = 1): string {
  const toByteHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  const base = `#${toByteHex(r)}${toByteHex(g)}${toByteHex(b)}`;
  return a < 1 ? `${base}${toByteHex(a)}` : base;
}

function colorFromFill(fill?: FigmaFill): string | undefined {
  if (!fill || fill.type !== 'SOLID' || !fill.color) return undefined;
  const alpha = typeof fill.opacity === 'number' ? fill.opacity : fill.color.a ?? 1;
  return toHex(fill.color.r, fill.color.g, fill.color.b, alpha);
}

function firstSolidFill(node: FigmaNode): string | undefined {
  const fills = Array.isArray(node.fills) ? (node.fills as FigmaFill[]) : [];
  for (const fill of fills) {
    const color = colorFromFill(fill);
    if (color) return color;
  }
  return undefined;
}

function firstSolidStroke(node: FigmaNode): string | undefined {
  const strokes = Array.isArray(node.strokes) ? (node.strokes as FigmaFill[]) : [];
  for (const stroke of strokes) {
    const color = colorFromFill(stroke);
    if (color) return color;
  }
  return undefined;
}

function boxShadowFromEffects(effects: FigmaEffect[] | undefined): string | undefined {
  if (!Array.isArray(effects)) return undefined;

  const shadows = effects
    .filter((effect) => effect.visible && effect.type === 'DROP_SHADOW')
    .map((effect) => {
      const x = effect.offset?.x ?? 0;
      const y = effect.offset?.y ?? 0;
      const blur = effect.radius ?? 0;
      const color = effect.color
        ? toHex(effect.color.r, effect.color.g, effect.color.b, effect.color.a ?? 1)
        : '#00000033';
      return `${x}px ${y}px ${blur}px ${color}`;
    });

  if (shadows.length === 0) return undefined;
  return shadows.join(', ');
}

function numberPx(value: unknown): string | undefined {
  return typeof value === 'number' ? `${value}px` : undefined;
}

function toNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function inferPaddingFromChildren(node: FigmaNode): PaddingValues {
  const rec = node as Record<string, unknown>;
  const explicit = {
    top: toNumber(rec.paddingTop),
    right: toNumber(rec.paddingRight),
    bottom: toNumber(rec.paddingBottom),
    left: toNumber(rec.paddingLeft),
  };

  if (
    typeof explicit.top === 'number' ||
    typeof explicit.right === 'number' ||
    typeof explicit.bottom === 'number' ||
    typeof explicit.left === 'number'
  ) {
    return {
      top: explicit.top,
      right: explicit.right,
      bottom: explicit.bottom,
      left: explicit.left,
      source: 'explicit',
    };
  }

  if (!node.absoluteBoundingBox || !Array.isArray(node.children) || node.children.length === 0) {
    return { source: 'none' };
  }

  const boundedChildren = node.children.filter((child) => Boolean(child.absoluteBoundingBox));
  if (boundedChildren.length === 0) {
    return { source: 'none' };
  }

  const parentBounds = node.absoluteBoundingBox;
  let minTop = Number.POSITIVE_INFINITY;
  let minRight = Number.POSITIVE_INFINITY;
  let minBottom = Number.POSITIVE_INFINITY;
  let minLeft = Number.POSITIVE_INFINITY;

  for (const child of boundedChildren) {
    const bounds = child.absoluteBoundingBox!;
    const top = bounds.y - parentBounds.y;
    const left = bounds.x - parentBounds.x;
    const right = (parentBounds.x + parentBounds.width) - (bounds.x + bounds.width);
    const bottom = (parentBounds.y + parentBounds.height) - (bounds.y + bounds.height);
    minTop = Math.min(minTop, top);
    minRight = Math.min(minRight, right);
    minBottom = Math.min(minBottom, bottom);
    minLeft = Math.min(minLeft, left);
  }

  const values = [minTop, minRight, minBottom, minLeft];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    return { source: 'none' };
  }

  return {
    top: Math.round(minTop * 100) / 100,
    right: Math.round(minRight * 100) / 100,
    bottom: Math.round(minBottom * 100) / 100,
    left: Math.round(minLeft * 100) / 100,
    source: 'inferred',
  };
}

export function buildStyleDetails(node: FigmaNode): NodeStyleDetails {
  const style = (node.style as Record<string, unknown> | undefined) ?? {};
  const css: Record<string, string> = {};
  const rec = node as Record<string, unknown>;

  const background = firstSolidFill(node);
  const stroke = firstSolidStroke(node);
  const boxShadow = boxShadowFromEffects(node.effects as FigmaEffect[] | undefined);
  const padding = inferPaddingFromChildren(node);

  if (node.type === 'TEXT' && background) {
    css.color = background;
  } else if (background) {
    css['background-color'] = background;
  }
  if (stroke) {
    css['border-color'] = stroke;
    css['border-style'] = 'solid';
  }

  if (style.fontFamily) css['font-family'] = String(style.fontFamily);
  if (style.fontSize) css['font-size'] = `${style.fontSize}px`;
  if (style.fontWeight) css['font-weight'] = String(style.fontWeight);
  if (style.lineHeightPx) css['line-height'] = `${style.lineHeightPx}px`;
  if (style.letterSpacing) css['letter-spacing'] = `${style.letterSpacing}px`;
  if (style.textAlignHorizontal) css['text-align'] = String(style.textAlignHorizontal).toLowerCase();

  if (node.absoluteBoundingBox) {
    css.width = `${node.absoluteBoundingBox.width}px`;
    css.height = `${node.absoluteBoundingBox.height}px`;
  }

  const layoutMode = String(rec.layoutMode || '');
  if (layoutMode === 'HORIZONTAL' || layoutMode === 'VERTICAL') {
    css.display = 'flex';
    css['flex-direction'] = layoutMode === 'VERTICAL' ? 'column' : 'row';
  }

  const itemSpacing = numberPx(rec.itemSpacing);
  if (itemSpacing) css.gap = itemSpacing;

  if (
    typeof padding.top === 'number' ||
    typeof padding.right === 'number' ||
    typeof padding.bottom === 'number' ||
    typeof padding.left === 'number'
  ) {
    css.padding = `${padding.top ?? 0}px ${padding.right ?? 0}px ${padding.bottom ?? 0}px ${padding.left ?? 0}px`;
  }

  const cornerRadius = numberPx(rec.cornerRadius);
  if (cornerRadius) css['border-radius'] = cornerRadius;

  if (typeof rec.opacity === 'number') {
    css.opacity = String(rec.opacity);
  }

  if (boxShadow) {
    css['box-shadow'] = boxShadow;
  }

  return {
    css,
    layout: {
      mode: typeof rec.layoutMode === 'string' ? rec.layoutMode : undefined,
      itemSpacing: typeof rec.itemSpacing === 'number' ? rec.itemSpacing : undefined,
      primaryAxisAlignItems: typeof rec.primaryAxisAlignItems === 'string' ? rec.primaryAxisAlignItems : undefined,
      counterAxisAlignItems: typeof rec.counterAxisAlignItems === 'string' ? rec.counterAxisAlignItems : undefined,
      layoutWrap: typeof rec.layoutWrap === 'string' ? rec.layoutWrap : undefined,
      layoutSizingHorizontal: typeof rec.layoutSizingHorizontal === 'string' ? rec.layoutSizingHorizontal : undefined,
      layoutSizingVertical: typeof rec.layoutSizingVertical === 'string' ? rec.layoutSizingVertical : undefined,
      padding,
    },
    absoluteBoundingBox: node.absoluteBoundingBox,
    rawStyle: style,
  };
}

export function buildCssMap(node: FigmaNode): Record<string, string> {
  return buildStyleDetails(node).css;
}

function printCss(item: {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  parentId?: string;
  details: NodeStyleDetails;
}): void {
  console.log(chalk.bold(`Computed CSS for "${item.nodeName}"`));
  console.log(chalk.dim(`Node ID: ${item.nodeId}`));
  console.log(chalk.dim(`Type: ${item.nodeType}`));
  if (item.parentId) {
    console.log(chalk.dim(`Parent ID: ${item.parentId}`));
  }
  console.log('');

  if (Object.keys(item.details.css).length === 0) {
    console.log(chalk.yellow('No style properties found on this node.'));
    return;
  }

  console.log(`.figma-node-${item.nodeId.replace(/:/g, '-')}` + ' {');
  for (const [key, value] of Object.entries(item.details.css)) {
    console.log(`  ${key}: ${value};`);
  }
  console.log('}');

  const { padding } = item.details.layout;
  if (
    typeof padding.top === 'number' ||
    typeof padding.right === 'number' ||
    typeof padding.bottom === 'number' ||
    typeof padding.left === 'number'
  ) {
    const source = padding.source === 'inferred' ? ' (inferred from child bounds)' : '';
    console.log(chalk.dim(`padding source: ${padding.source}${source}`));
  }
}

export async function getNodeStyles(fileKeyOrUrl: string, options: StylesOptions): Promise<void> {
  const fileKey = parseFileKey(fileKeyOrUrl);
  const format = options.format || 'text';
  const isJson = format === 'json';
  const rawNodeId = options.nodeId?.trim();
  const rawNodeIds = options.nodeIds?.trim();

  if (rawNodeId && rawNodeIds) {
    throw new Error('Use either --node-id or --node-ids, not both.');
  }
  if (!rawNodeId && !rawNodeIds) {
    throw new Error('Pass a node ID with --node-id or a list with --node-ids.');
  }

  const nodeIds = rawNodeId ? [normalizeNodeId(rawNodeId)] : parseNodeIdsCsv(rawNodeIds!);
  if (nodeIds.length === 0) {
    throw new Error('No valid node IDs found.');
  }

  if (!isJson) {
    console.log(chalk.dim(`Fetching node styles for ${fileKey} (${nodeIds.length} node${nodeIds.length === 1 ? '' : 's'})...`));
  }

  const [nodesResponse, file] = await Promise.all([
    getFileNodes(fileKey, nodeIds),
    getFile(fileKey),
  ]);
  const parentMap = buildParentMap(file.document);

  const missing = nodeIds.filter((id) => !nodesResponse.nodes[id]?.document);
  if (missing.length > 0) {
    throw new Error(`Node(s) not found: ${missing.join(', ')}`);
  }

  const results = nodeIds.map((nodeId) => {
    const node = nodesResponse.nodes[nodeId].document;
    return {
      fileKey,
      nodeId,
      nodeName: node.name,
      nodeType: node.type,
      parentId: parentMap.get(nodeId),
      details: buildStyleDetails(node),
    };
  });

  if (isJson) {
    if (results.length === 1) {
      const item = results[0];
      console.log(JSON.stringify({
        fileKey: item.fileKey,
        nodeId: item.nodeId,
        nodeName: item.nodeName,
        nodeType: item.nodeType,
        parentId: item.parentId,
        absoluteBoundingBox: item.details.absoluteBoundingBox,
        css: item.details.css,
        layout: item.details.layout,
        style: item.details.rawStyle,
      }, null, 2));
      return;
    }

    console.log(JSON.stringify({
      fileKey,
      count: results.length,
      nodes: results.map((item) => ({
        nodeId: item.nodeId,
        nodeName: item.nodeName,
        nodeType: item.nodeType,
        parentId: item.parentId,
        absoluteBoundingBox: item.details.absoluteBoundingBox,
        css: item.details.css,
        layout: item.details.layout,
        style: item.details.rawStyle,
      })),
    }, null, 2));
    return;
  }

  results.forEach((result, index) => {
    if (index > 0) console.log('');
    printCss(result);
  });
}

