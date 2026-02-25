import chalk from 'chalk';
import { getFile, getFileNodes, parseFileKey, FigmaNode } from '../api.js';
import { normalizeNodeId } from '../utils/nodes.js';

interface TypographyStyle {
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  lineHeight: string;
  letterSpacing: string;
  textCase?: string;
  textDecoration?: string;
  usageCount: number;
  examples: string[];
}

interface TypographyResult {
  fontFamilies: Map<string, number>;
  fontSizes: Map<number, number>;
  fontWeights: Map<number, number>;
  lineHeights: Map<string, number>;
  letterSpacings: Map<string, number>;
  styles: TypographyStyle[];
}

export async function analyzeTypography(
  fileKeyOrUrl: string,
  options: { nodeId?: string; format?: 'json' | 'text' }
): Promise<void> {
  const fileKey = parseFileKey(fileKeyOrUrl);
  const format = options.format || 'text';
  const isJson = format === 'json';

  if (!isJson) {
    console.log(chalk.dim(`Analyzing typography in ${fileKey}...`));
  }

  let document: FigmaNode;

  if (options.nodeId) {
    // Fetch specific node
    const nodeId = normalizeNodeId(options.nodeId); // URL format may use dash, API uses colon
    if (!isJson) {
      console.log(chalk.dim(`Fetching node ${nodeId}...`));
    }
    const response = await getFileNodes(fileKey, [nodeId]);
    const nodeData = response.nodes[nodeId];
    if (!nodeData) {
      throw new Error(`Node ${nodeId} not found`);
    }
    document = nodeData.document;
    if (!isJson) {
      console.log(chalk.green(`Node: ${document.name}`));
    }
  } else {
    // Fetch whole file
    const file = await getFile(fileKey);
    document = file.document;
    if (!isJson) {
      console.log(chalk.green(`File: ${file.name}`));
    }
  }

  const result: TypographyResult = {
    fontFamilies: new Map(),
    fontSizes: new Map(),
    fontWeights: new Map(),
    lineHeights: new Map(),
    letterSpacings: new Map(),
    styles: [],
  };

  const styleSignatures = new Map<string, TypographyStyle>();

  // Traverse and collect typography
  traverseNodes(document, (node) => {
    if (node.type === 'TEXT') {
      const style = node.style as Record<string, unknown> | undefined;
      if (!style) return;

      const fontFamily = String(style.fontFamily || 'Unknown');
      const fontWeight = Number(style.fontWeight || 400);
      const fontSize = Number(style.fontSize || 16);
      const lineHeightPx = style.lineHeightPx ? `${style.lineHeightPx}px` : 'auto';
      const letterSpacing = style.letterSpacing ? `${style.letterSpacing}px` : '0px';
      const textCase = String(style.textCase || 'ORIGINAL');
      const textDecoration = String(style.textDecoration || 'NONE');
      const characters = String(node.characters || '').slice(0, 50);

      // Count occurrences
      result.fontFamilies.set(fontFamily, (result.fontFamilies.get(fontFamily) || 0) + 1);
      result.fontSizes.set(fontSize, (result.fontSizes.get(fontSize) || 0) + 1);
      result.fontWeights.set(fontWeight, (result.fontWeights.get(fontWeight) || 0) + 1);
      result.lineHeights.set(lineHeightPx, (result.lineHeights.get(lineHeightPx) || 0) + 1);
      if (letterSpacing !== '0px') {
        result.letterSpacings.set(letterSpacing, (result.letterSpacings.get(letterSpacing) || 0) + 1);
      }

      // Track unique style combinations
      const signature = `${fontFamily}|${fontWeight}|${fontSize}`;
      if (!styleSignatures.has(signature)) {
        styleSignatures.set(signature, {
          fontFamily,
          fontWeight,
          fontSize,
          lineHeight: lineHeightPx,
          letterSpacing,
          textCase: textCase !== 'ORIGINAL' ? textCase : undefined,
          textDecoration: textDecoration !== 'NONE' ? textDecoration : undefined,
          usageCount: 0,
          examples: [],
        });
      }
      const styleEntry = styleSignatures.get(signature)!;
      styleEntry.usageCount++;
      if (styleEntry.examples.length < 3 && characters.trim()) {
        styleEntry.examples.push(characters.trim());
      }
    }
  });

  result.styles = Array.from(styleSignatures.values()).sort((a, b) => b.fontSize - a.fontSize);

  if (format === 'json') {
    const jsonOutput = {
      fontFamilies: Object.fromEntries(result.fontFamilies),
      fontSizes: Object.fromEntries(result.fontSizes),
      fontWeights: Object.fromEntries(result.fontWeights),
      lineHeights: Object.fromEntries(result.lineHeights),
      letterSpacings: Object.fromEntries(result.letterSpacings),
      styles: result.styles,
    };
    console.log(JSON.stringify(jsonOutput, null, 2));
  } else {
    printTypography(result);
  }
}

function traverseNodes(node: FigmaNode, callback: (node: FigmaNode) => void): void {
  callback(node);
  if (node.children) {
    for (const child of node.children) {
      traverseNodes(child, callback);
    }
  }
}

function printTypography(result: TypographyResult): void {
  console.log('\n' + chalk.bold('Typography Analysis'));
  console.log(chalk.dim('━'.repeat(55)));

  // Font Families
  const families = Array.from(result.fontFamilies.entries()).sort((a, b) => b[1] - a[1]);
  console.log(chalk.bold(`\n🔤 FONT FAMILIES (${families.length})`));
  families.forEach(([family, count]) => {
    console.log(`  ${family.padEnd(30)} ${chalk.dim(`(${count} uses)`)}`);
  });

  // Font Sizes
  const sizes = Array.from(result.fontSizes.entries()).sort((a, b) => a[0] - b[0]);
  console.log(chalk.bold(`\n📏 FONT SIZES (${sizes.length} variations)`));
  sizes.forEach(([size, count]) => {
    const bar = '█'.repeat(Math.min(Math.ceil(count / 2), 20));
    console.log(`  ${(size + 'px').padEnd(8)} ${chalk.cyan(bar)} ${chalk.dim(`(${count})`)}`);
  });

  // Font Weights
  const weights = Array.from(result.fontWeights.entries()).sort((a, b) => a[0] - b[0]);
  const weightNames: Record<number, string> = {
    100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular',
    500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black'
  };
  console.log(chalk.bold(`\n⚖️  FONT WEIGHTS (${weights.length})`));
  weights.forEach(([weight, count]) => {
    const name = weightNames[weight] || '';
    console.log(`  ${weight} ${name ? chalk.dim(`(${name})`) : ''}`.padEnd(25) + chalk.dim(`(${count} uses)`));
  });

  // Line Heights
  const lineHeights = Array.from(result.lineHeights.entries()).sort((a, b) => {
    const aVal = parseFloat(a[0]) || 0;
    const bVal = parseFloat(b[0]) || 0;
    return aVal - bVal;
  });
  console.log(chalk.bold(`\n↕️  LINE HEIGHTS (${lineHeights.length})`));
  lineHeights.slice(0, 10).forEach(([lh, count]) => {
    console.log(`  ${lh.padEnd(12)} ${chalk.dim(`(${count} uses)`)}`);
  });
  if (lineHeights.length > 10) {
    console.log(chalk.dim(`  ... and ${lineHeights.length - 10} more`));
  }

  // Letter Spacings (if any)
  if (result.letterSpacings.size > 0) {
    const spacings = Array.from(result.letterSpacings.entries());
    console.log(chalk.bold(`\n🔠 LETTER SPACINGS (${spacings.length})`));
    spacings.forEach(([ls, count]) => {
      console.log(`  ${ls.padEnd(12)} ${chalk.dim(`(${count} uses)`)}`);
    });
  }

  // Type Scale Summary
  console.log(chalk.bold('\n📐 TYPE SCALE'));
  const sortedStyles = result.styles.slice(0, 10);
  sortedStyles.forEach(style => {
    const label = `${style.fontSize}px / ${style.fontWeight}`;
    const font = style.fontFamily.length > 20 ? style.fontFamily.slice(0, 17) + '...' : style.fontFamily;
    console.log(`  ${chalk.cyan(label.padEnd(15))} ${font.padEnd(22)} ${chalk.dim(`(${style.usageCount}x)`)}`);
    if (style.examples.length > 0) {
      const example = style.examples[0].slice(0, 40);
      console.log(`    ${chalk.dim('"' + example + (style.examples[0].length > 40 ? '...' : '') + '"')}`);
    }
  });

  console.log('');
}
