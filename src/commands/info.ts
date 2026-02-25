import chalk from 'chalk';
import { getFile, getVersions, getComments, parseFileKey } from '../api.js';

interface FileInfo {
  name: string;
  lastModified: string;
  version: string;
  thumbnailUrl: string;
  pages: Array<{
    name: string;
    childCount: number | null;
    topLevelItems: Array<{ id: string; name: string; type: string }>;
  }>;
  components: number;
  styles: number;
  recentVersions: Array<{ label: string; createdAt: string; user: string }>;
  comments: { total: number; unresolved: number };
}

export async function getFileInfo(
  fileKeyOrUrl: string,
  options: { format?: 'json' | 'text'; depth?: number; page?: string }
): Promise<void> {
  const fileKey = parseFileKey(fileKeyOrUrl);
  const format = options.format || 'text';
  const isJson = format === 'json';
  const depth = Number.isFinite(options.depth) && options.depth! > 0 ? Math.floor(options.depth!) : 2;
  const pageFilter = options.page?.trim().toLowerCase() || '';

  if (!isJson) {
    console.log(chalk.dim(`Fetching file info for ${fileKey} (depth=${depth})...`));
  }

  // Fetch file data with enough depth to include page item counts by default.
  const [file, versions, comments] = await Promise.all([
    getFile(fileKey, { depth }),
    getVersions(fileKey).catch(() => ({ versions: [] })),
    getComments(fileKey).catch(() => ({ comments: [] })),
  ]);

  const info: FileInfo = {
    name: file.name,
    lastModified: file.lastModified,
    version: file.version,
    thumbnailUrl: file.thumbnailUrl,
    pages: [],
    components: Object.keys(file.components).length,
    styles: Object.keys(file.styles).length,
    recentVersions: versions.versions.slice(0, 5).map(v => ({
      label: v.label || 'Untitled',
      createdAt: v.created_at,
      user: v.user.handle,
    })),
    comments: {
      total: comments.comments.length,
      unresolved: comments.comments.filter(c => !c.resolved_at).length,
    },
  };

  // Get page info
  const canvas = file.document.children;
  if (canvas) {
    for (const page of canvas) {
      info.pages.push({
        name: page.name,
        childCount: Array.isArray(page.children) ? page.children.length : null,
        topLevelItems: Array.isArray(page.children)
          ? page.children.map((child) => ({
            id: String(child.id).replace(/-/g, ':'),
            name: child.name,
            type: child.type,
          }))
          : [],
      });
    }
  }

  if (pageFilter) {
    info.pages = info.pages.filter((page) => page.name.toLowerCase().includes(pageFilter));
    if (info.pages.length === 0) {
      throw new Error(`No pages found matching "${options.page}".`);
    }
  }

  if (isJson) {
    console.log(JSON.stringify(info, null, 2));
  } else {
    printFileInfo(info, fileKey, Boolean(pageFilter));
  }
}

function printFileInfo(info: FileInfo, fileKey: string, showTopLevelItems: boolean): void {
  console.log('');
  console.log(chalk.bold(info.name));
  console.log(chalk.dim('━'.repeat(50)));

  console.log(`\n${chalk.bold('File Details')}`);
  console.log(`  Key:           ${chalk.cyan(fileKey)}`);
  console.log(`  Last Modified: ${formatDate(info.lastModified)}`);
  console.log(`  Version:       ${info.version}`);
  console.log(`  Figma URL:     ${chalk.dim(`https://figma.com/file/${fileKey}`)}`);

  console.log(`\n${chalk.bold('Contents')}`);
  console.log(`  Pages:      ${info.pages.length}`);
  console.log(`  Components: ${info.components}`);
  console.log(`  Styles:     ${info.styles}`);

  if (info.pages.length > 0) {
    console.log(`\n${chalk.bold('Pages')}`);
    info.pages.forEach((page, i) => {
      const countLabel = page.childCount === null ? 'unknown' : String(page.childCount);
      console.log(`  ${i + 1}. ${page.name} ${chalk.dim(`(${countLabel} items)`)}`);
      if (showTopLevelItems && page.topLevelItems.length > 0) {
        page.topLevelItems.forEach((item) => {
          console.log(`     - ${item.name} ${chalk.dim(`(${item.id}) ${item.type}`)}`);
        });
      }
    });
  }

  if (info.recentVersions.length > 0) {
    console.log(`\n${chalk.bold('Recent Versions')}`);
    info.recentVersions.forEach(v => {
      console.log(`  • ${v.label} ${chalk.dim(`- ${formatDate(v.createdAt)} by ${v.user}`)}`);
    });
  }

  console.log(`\n${chalk.bold('Comments')}`);
  console.log(`  Total:      ${info.comments.total}`);
  console.log(`  Unresolved: ${info.comments.unresolved > 0 ? chalk.yellow(info.comments.unresolved) : chalk.green(info.comments.unresolved)}`);

  console.log('');
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
