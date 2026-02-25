import chalk from 'chalk';
import { getLocalVariables, getFile, parseFileKey, FigmaNode, FigmaFill } from '../api.js';

interface DesignToken {
  name: string;
  value: string;
  type: 'color' | 'number' | 'string' | 'boolean';
  collection?: string;
  mode?: string;
}

export async function extractTokens(
  fileKeyOrUrl: string,
  options: { format?: 'json' | 'css' | 'scss' | 'js'; output?: string }
): Promise<void> {
  const fileKey = parseFileKey(fileKeyOrUrl);
  const format = options.format || 'json';
  const log = (message: string) => console.error(message);

  log(chalk.dim(`Fetching tokens from file ${fileKey}...`));

  const tokens: DesignToken[] = [];

  // Try to get variables (may fail if not Enterprise)
  try {
    const varsResponse = await getLocalVariables(fileKey);
    const { variables, variableCollections } = varsResponse.meta;

    for (const variable of Object.values(variables)) {
      const collection = variableCollections[variable.variableCollectionId];

      for (const [modeId, value] of Object.entries(variable.valuesByMode)) {
        const mode = collection?.modes.find(m => m.modeId === modeId);

        let tokenValue: string;
        let tokenType: DesignToken['type'];

        if (variable.resolvedType === 'COLOR' && typeof value === 'object' && value !== null) {
          const color = value as { r: number; g: number; b: number; a: number };
          tokenValue = rgbaToHex(color.r, color.g, color.b, color.a);
          tokenType = 'color';
        } else if (variable.resolvedType === 'FLOAT') {
          tokenValue = String(value);
          tokenType = 'number';
        } else if (variable.resolvedType === 'BOOLEAN') {
          tokenValue = String(value);
          tokenType = 'boolean';
        } else {
          tokenValue = String(value);
          tokenType = 'string';
        }

        tokens.push({
          name: variable.name,
          value: tokenValue,
          type: tokenType,
          collection: collection?.name,
          mode: mode?.name,
        });
      }
    }

    log(chalk.green(`Found ${tokens.length} variables`));
  } catch (error) {
    log(chalk.yellow('Variables API not available (requires Enterprise). Extracting from styles...'));
  }

  // Also extract from file styles
  try {
    const file = await getFile(fileKey, { depth: 2 });

    // Extract colors from styles
    for (const [styleId, style] of Object.entries(file.styles)) {
      if (style.styleType === 'FILL') {
        // Find the node with this style to get the actual color
        const color = findStyleColor(file.document, styleId);
        if (color) {
          tokens.push({
            name: style.name,
            value: color,
            type: 'color',
            collection: 'Styles',
          });
        }
      }
    }

    // Extract text styles
    for (const [styleId, style] of Object.entries(file.styles)) {
      if (style.styleType === 'TEXT') {
        tokens.push({
          name: style.name,
          value: 'text-style',
          type: 'string',
          collection: 'Text Styles',
        });
      }
    }

    log(chalk.green(`Extracted ${tokens.length} total tokens`));
  } catch (error) {
    log(chalk.yellow(`Could not extract styles: ${error}`));
  }

  // Output in requested format
  outputTokens(tokens, format);
}

function rgbaToHex(r: number, g: number, b: number, a: number): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  if (a < 1) {
    return `${hex}${toHex(a)}`;
  }
  return hex;
}

function findStyleColor(node: FigmaNode, styleId: string): string | null {
  // Check if this node has the style
  const styles = node.styles as Record<string, string> | undefined;
  if (styles?.fill === styleId && node.fills) {
    const fill = (node.fills as FigmaFill[])[0];
    if (fill?.color) {
      return rgbaToHex(fill.color.r, fill.color.g, fill.color.b, fill.color.a ?? 1);
    }
  }

  // Recurse into children
  if (node.children) {
    for (const child of node.children) {
      const color = findStyleColor(child, styleId);
      if (color) return color;
    }
  }

  return null;
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_\/]+/g, '-')
    .toLowerCase();
}

function toCamelCase(str: string): string {
  return str
    .replace(/[\s_\-\/]+(.)/g, (_, char) => char.toUpperCase())
    .replace(/^(.)/, char => char.toLowerCase());
}

function outputTokens(tokens: DesignToken[], format: string): void {
  if (format === 'json') {
    const grouped: Record<string, Record<string, string>> = {};
    for (const token of tokens) {
      const collection = token.collection || 'default';
      if (!grouped[collection]) grouped[collection] = {};
      grouped[collection][token.name] = token.value;
    }
    console.log(JSON.stringify(grouped, null, 2));
  } else if (format === 'css') {
    console.log(':root {');
    for (const token of tokens) {
      const name = toKebabCase(token.name);
      console.log(`  --${name}: ${token.value};`);
    }
    console.log('}');
  } else if (format === 'scss') {
    for (const token of tokens) {
      const name = toKebabCase(token.name);
      console.log(`$${name}: ${token.value};`);
    }
  } else if (format === 'js') {
    console.log('export const tokens = {');
    for (const token of tokens) {
      const name = toCamelCase(token.name);
      const value = token.type === 'number' ? token.value : `'${token.value}'`;
      console.log(`  ${name}: ${value},`);
    }
    console.log('};');
  }
}
