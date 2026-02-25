import chalk from 'chalk';
import { getFile, getFileNodes, parseFileKey, FigmaNode, FigmaFill } from '../api.js';

interface AuditResult {
  score: number;
  issues: Array<{ severity: 'error' | 'warning' | 'info'; message: string; details?: string }>;
  stats: {
    totalNodes: number;
    components: number;
    componentInstances: number;
    detachedInstances: number;
    frames: number;
    textNodes: number;
    uniqueColors: number;
    uniqueFonts: number;
    uniqueFontSizes: number;
    stylesUsed: number;
    unstyled: number;
  };
}

function normalizeNodeId(nodeId: string): string {
  return nodeId.trim().replace(/-/g, ':');
}

export async function runAudit(
  fileKeyOrUrl: string,
  options: { format?: 'json' | 'text'; nodeId?: string; page?: string }
): Promise<void> {
  const fileKey = parseFileKey(fileKeyOrUrl);
  const format = options.format || 'text';
  const isJson = format === 'json';
  const nodeId = options.nodeId ? normalizeNodeId(options.nodeId) : '';
  const pageFilter = options.page?.trim();

  if (nodeId && pageFilter) {
    throw new Error('Use either --node-id or --page, not both.');
  }

  if (!isJson) {
    console.log(chalk.dim(`Auditing file ${fileKey}...`));
  }

  const file = await getFile(fileKey);
  let auditRoot: FigmaNode = file.document;

  if (nodeId) {
    const nodeResponse = await getFileNodes(fileKey, [nodeId]);
    const nodeData = nodeResponse.nodes[nodeId];
    if (!nodeData?.document) {
      throw new Error(`Node ${nodeId} not found in file.`);
    }
    auditRoot = nodeData.document;
    if (!isJson) {
      console.log(chalk.green(`File: ${file.name} (node ${nodeId})\n`));
    }
  } else if (pageFilter) {
    const pages = Array.isArray(file.document.children) ? file.document.children : [];
    const lower = pageFilter.toLowerCase();
    const page = pages.find(p => p.name.toLowerCase() === lower)
      || pages.find(p => p.name.toLowerCase().includes(lower));

    if (!page) {
      const pageNames = pages.map(p => p.name).slice(0, 12).join(', ');
      throw new Error(`Page "${pageFilter}" not found. Available pages: ${pageNames}`);
    }

    auditRoot = page;
    if (!isJson) {
      console.log(chalk.green(`File: ${file.name} (page "${page.name}")\n`));
    }
  } else {
    if (!isJson) {
      console.log(chalk.green(`File: ${file.name}\n`));
    }
  }

  const result: AuditResult = {
    score: 100,
    issues: [],
    stats: {
      totalNodes: 0,
      components: 0,
      componentInstances: 0,
      detachedInstances: 0,
      frames: 0,
      textNodes: 0,
      uniqueColors: 0,
      uniqueFonts: 0,
      uniqueFontSizes: 0,
      stylesUsed: 0,
      unstyled: 0,
    },
  };

  const colors = new Set<string>();
  const fonts = new Set<string>();
  const fontSizes = new Set<number>();
  const stylesUsed = new Set<string>();
  const unstyledNodes: string[] = [];

  // Traverse the document
  traverseNodes(auditRoot, (node) => {
    result.stats.totalNodes++;

    // Count node types
    if (node.type === 'COMPONENT') result.stats.components++;
    if (node.type === 'INSTANCE') result.stats.componentInstances++;
    if (node.type === 'FRAME') result.stats.frames++;
    if (node.type === 'TEXT') {
      result.stats.textNodes++;

      // Check for font info
      const style = node.style as Record<string, unknown> | undefined;
      if (style) {
        if (style.fontFamily) fonts.add(String(style.fontFamily));
        if (style.fontSize) fontSizes.add(Number(style.fontSize));
      }
    }

    // Check for colors
    if (node.fills && Array.isArray(node.fills)) {
      for (const fill of node.fills as FigmaFill[]) {
        if (fill.type === 'SOLID' && fill.color) {
          const hex = rgbaToHex(fill.color.r, fill.color.g, fill.color.b, fill.color.a ?? 1);
          colors.add(hex);
        }
      }
    }

    // Check for styles
    const styles = node.styles as Record<string, string> | undefined;
    if (styles) {
      for (const styleId of Object.values(styles)) {
        stylesUsed.add(styleId);
      }
    }

    // Check for unstyled elements that should have styles
    if ((node.type === 'TEXT' || node.type === 'RECTANGLE' || node.type === 'ELLIPSE') && !styles) {
      if (node.fills && (node.fills as FigmaFill[]).some(f => f.type === 'SOLID')) {
        unstyledNodes.push(node.name);
      }
    }
  });

  result.stats.uniqueColors = colors.size;
  result.stats.uniqueFonts = fonts.size;
  result.stats.uniqueFontSizes = fontSizes.size;
  result.stats.stylesUsed = stylesUsed.size;
  result.stats.unstyled = unstyledNodes.length;

  // Generate issues based on stats
  // Color consistency
  if (colors.size > 20) {
    result.issues.push({
      severity: 'warning',
      message: `High color count (${colors.size} unique colors)`,
      details: 'Consider consolidating into a design system palette',
    });
    result.score -= 10;
  }

  // Font consistency
  if (fonts.size > 3) {
    result.issues.push({
      severity: 'warning',
      message: `Too many font families (${fonts.size})`,
      details: Array.from(fonts).slice(0, 5).join(', '),
    });
    result.score -= 10;
  }

  // Font size consistency
  if (fontSizes.size > 10) {
    result.issues.push({
      severity: 'info',
      message: `Many font sizes (${fontSizes.size} variations)`,
      details: 'Consider using a type scale',
    });
    result.score -= 5;
  }

  // Component usage
  const componentRatio = result.stats.componentInstances / Math.max(result.stats.totalNodes, 1);
  if (componentRatio < 0.1 && result.stats.totalNodes > 50) {
    result.issues.push({
      severity: 'warning',
      message: 'Low component usage',
      details: `Only ${(componentRatio * 100).toFixed(1)}% of nodes are component instances`,
    });
    result.score -= 10;
  }

  // Unstyled elements
  if (unstyledNodes.length > 10) {
    result.issues.push({
      severity: 'info',
      message: `${unstyledNodes.length} elements without styles`,
      details: 'Consider applying shared styles for consistency',
    });
    result.score -= 5;
  }

  // No components defined
  if (result.stats.components === 0 && result.stats.totalNodes > 20) {
    result.issues.push({
      severity: 'warning',
      message: 'No components defined',
      details: 'Creating components enables reusability',
    });
    result.score -= 15;
  }

  // Check defined styles vs file styles
  const definedStylesCount = Object.keys(file.styles).length;
  if (definedStylesCount === 0 && result.stats.totalNodes > 10) {
    result.issues.push({
      severity: 'warning',
      message: 'No styles defined in file',
      details: 'Styles help maintain design consistency',
    });
    result.score -= 10;
  }

  result.score = Math.max(0, result.score);

  // Output
  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printAuditResult(result, file.name, Array.from(colors), Array.from(fonts), Array.from(fontSizes));
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

function rgbaToHex(r: number, g: number, b: number, a: number): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function printAuditResult(
  result: AuditResult,
  fileName: string,
  colors: string[],
  fonts: string[],
  fontSizes: number[]
): void {
  console.log(chalk.bold('Design System Audit'));
  console.log(chalk.dim('━'.repeat(50)));

  const scoreColor = result.score >= 80 ? chalk.green : result.score >= 60 ? chalk.yellow : chalk.red;
  console.log(`\nScore: ${scoreColor(result.score + '/100')}\n`);

  // Stats
  console.log(chalk.bold('Statistics'));
  console.log(`  Total Nodes:        ${result.stats.totalNodes}`);
  console.log(`  Components:         ${result.stats.components}`);
  console.log(`  Instances:          ${result.stats.componentInstances}`);
  console.log(`  Frames:             ${result.stats.frames}`);
  console.log(`  Text Nodes:         ${result.stats.textNodes}`);

  // Colors
  console.log(chalk.bold('\nColors') + chalk.dim(` (${colors.length} unique)`));
  const colorDisplay = colors.slice(0, 12).map(c => {
    try {
      return chalk.hex(c)('■');
    } catch {
      return chalk.gray('■');
    }
  }).join(' ');
  console.log(`  ${colorDisplay}${colors.length > 12 ? chalk.dim(' ...') : ''}`);

  // Typography
  console.log(chalk.bold('\nTypography'));
  console.log(`  Fonts: ${fonts.length <= 3 ? chalk.green(fonts.join(', ')) : chalk.yellow(fonts.join(', '))}`);
  const sortedSizes = fontSizes.sort((a, b) => a - b);
  console.log(`  Sizes: ${sortedSizes.slice(0, 8).map(s => s + 'px').join(', ')}${sortedSizes.length > 8 ? '...' : ''}`);

  // Component Health
  console.log(chalk.bold('\nComponent Health'));
  const instanceRatio = result.stats.componentInstances / Math.max(result.stats.totalNodes, 1) * 100;
  console.log(`  Component Usage: ${instanceRatio >= 10 ? chalk.green(instanceRatio.toFixed(1) + '%') : chalk.yellow(instanceRatio.toFixed(1) + '%')}`);
  console.log(`  Styled Elements: ${result.stats.stylesUsed > 0 ? chalk.green(result.stats.stylesUsed + ' styles used') : chalk.yellow('No styles used')}`);

  // Issues
  if (result.issues.length > 0) {
    console.log(chalk.bold('\nIssues'));
    result.issues.forEach(issue => {
      const icon = issue.severity === 'error' ? chalk.red('✗') : issue.severity === 'warning' ? chalk.yellow('⚠') : chalk.blue('ℹ');
      console.log(`  ${icon} ${issue.message}${issue.details ? chalk.dim(` - ${issue.details}`) : ''}`);
    });
  } else {
    console.log(chalk.green('\n✓ No issues found'));
  }

  console.log('');
}
