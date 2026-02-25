import chalk from 'chalk';
import { getFile, parseFileKey, FigmaNode } from '../api.js';
import { findPageNode } from '../utils/nodes.js';

interface ComponentInfo {
  id: string;
  name: string;
  description: string;
  type: 'COMPONENT' | 'COMPONENT_SET';
  page: string;
  variants?: string[];
}

export async function listComponents(
  fileKeyOrUrl: string,
  options: { format?: 'json' | 'text'; page?: string }
): Promise<void> {
  const fileKey = parseFileKey(fileKeyOrUrl);
  const format = options.format || 'text';
  const isJson = format === 'json';
  const pageFilter = options.page?.trim();

  if (!isJson) {
    console.log(chalk.dim(`Fetching components from ${fileKey}...`));
  }

  const file = await getFile(fileKey);
  if (!isJson) {
    console.log(chalk.green(`File: ${file.name}\n`));
  }

  const components: ComponentInfo[] = [];

  // Traverse pages
  let pages = file.document.children || [];
  if (pageFilter) {
    const page = findPageNode(file.document, pageFilter);
    pages = [page];
  }
  for (const page of pages) {
    traverseNodes(page, (node) => {
      if (node.type === 'COMPONENT') {
        const componentData = file.components[node.id];
        components.push({
          id: node.id,
          name: node.name,
          description: componentData?.description || '',
          type: 'COMPONENT',
          page: page.name,
        });
      } else if (node.type === 'COMPONENT_SET') {
        const variants = node.children?.filter(c => c.type === 'COMPONENT').map(c => c.name) || [];
        components.push({
          id: node.id,
          name: node.name,
          description: '',
          type: 'COMPONENT_SET',
          page: page.name,
          variants,
        });
      }
    });
  }

  if (isJson) {
    console.log(JSON.stringify({
      fileKey,
      page: pageFilter || undefined,
      count: components.length,
      components,
    }, null, 2));
  } else {
    printComponents(components);
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

function printComponents(components: ComponentInfo[]): void {
  if (components.length === 0) {
    console.log(chalk.yellow('No components found in this file'));
    return;
  }

  console.log(chalk.bold(`Found ${components.length} components\n`));

  // Group by page
  const byPage = new Map<string, ComponentInfo[]>();
  for (const comp of components) {
    if (!byPage.has(comp.page)) byPage.set(comp.page, []);
    byPage.get(comp.page)!.push(comp);
  }

  for (const [page, pageComponents] of byPage) {
    console.log(chalk.bold.underline(page));

    // Separate component sets from standalone components
    const sets = pageComponents.filter(c => c.type === 'COMPONENT_SET');
    const standalone = pageComponents.filter(c => c.type === 'COMPONENT' && !isVariant(c.name));

    for (const set of sets) {
      console.log(`  ${chalk.cyan('◆')} ${set.name} ${chalk.dim(`(${set.variants?.length || 0} variants)`)}`);
      if (set.variants && set.variants.length <= 5) {
        set.variants.forEach(v => {
          console.log(`      ${chalk.dim('└')} ${v}`);
        });
      } else if (set.variants && set.variants.length > 5) {
        set.variants.slice(0, 3).forEach(v => {
          console.log(`      ${chalk.dim('└')} ${v}`);
        });
        console.log(`      ${chalk.dim(`└ ... and ${set.variants.length - 3} more`)}`);
      }
    }

    for (const comp of standalone) {
      console.log(`  ${chalk.green('●')} ${comp.name}${comp.description ? chalk.dim(` - ${comp.description.slice(0, 40)}`) : ''}`);
    }

    console.log('');
  }

  // Summary
  const sets = components.filter(c => c.type === 'COMPONENT_SET').length;
  const standalone = components.filter(c => c.type === 'COMPONENT').length;

  console.log(chalk.dim('━'.repeat(40)));
  console.log(`${chalk.cyan('◆')} Component Sets: ${sets}`);
  console.log(`${chalk.green('●')} Standalone Components: ${standalone}`);
}

function isVariant(name: string): boolean {
  // Variants typically have property=value format
  return name.includes('=');
}
