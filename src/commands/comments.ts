import chalk from 'chalk';
import { getComments, getFile, getFileNodes, parseFileKey, FigmaComment, FigmaNode } from '../api.js';

interface CommentsOptions {
  format?: 'json' | 'text';
  unresolved?: boolean;
  limit?: string;
  nodeId?: string;
  page?: string;
  since?: string;
  until?: string;
  nodePreview?: boolean;
}

interface CommentView {
  id: string;
  message: string;
  author: string;
  createdAt: string;
  resolved: boolean;
  resolvedAt?: string;
  nodeId?: string;
  page?: string;
  nodeTextPreview?: string;
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizeNodeId(nodeId: string): string {
  return nodeId.trim().replace(/-/g, ':');
}

function buildNodePageMap(document: FigmaNode): Map<string, string> {
  const map = new Map<string, string>();
  const pages = Array.isArray(document.children) ? document.children : [];

  for (const page of pages) {
    const pageName = page.name || 'Unknown page';

    const walk = (node: FigmaNode): void => {
      map.set(normalizeNodeId(node.id), pageName);
      if (!Array.isArray(node.children)) return;
      for (const child of node.children) {
        walk(child);
      }
    };

    walk(page);
  }

  return map;
}

function toCommentView(comment: FigmaComment): CommentView {
  return {
    id: comment.id,
    message: comment.message,
    author: comment.user?.handle || 'unknown',
    createdAt: comment.created_at,
    resolved: Boolean(comment.resolved_at),
    resolvedAt: comment.resolved_at,
    nodeId: comment.client_meta?.node_id,
  };
}

function collectNodeText(node: FigmaNode, out: string[]): void {
  if (node.type === 'TEXT') {
    const text = String(node.characters || '').trim();
    if (text) out.push(text);
  }

  if (!Array.isArray(node.children)) return;
  for (const child of node.children) {
    collectNodeText(child, out);
  }
}

function buildNodeTextPreview(node: FigmaNode, maxLength = 140): string | undefined {
  const parts: string[] = [];
  collectNodeText(node, parts);
  if (parts.length === 0) return undefined;

  const combined = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (!combined) return undefined;
  if (combined.length <= maxLength) return combined;
  return `${combined.slice(0, maxLength - 1)}…`;
}

function printComments(comments: CommentView[], fileKey: string, unresolvedOnly: boolean): void {
  const title = unresolvedOnly ? 'Unresolved Comments' : 'Comments';
  console.log(chalk.bold(`${title} (${comments.length})`));
  console.log(chalk.dim(`File: ${fileKey}`));
  console.log('');

  if (comments.length === 0) {
    console.log(chalk.yellow('No comments found for this filter.'));
    return;
  }

  comments.forEach((comment, index) => {
    const status = comment.resolved ? chalk.green('resolved') : chalk.yellow('open');
    const header = `${index + 1}. ${status} ${chalk.cyan('@' + comment.author)} ${chalk.dim(formatDate(comment.createdAt))}`;
    console.log(header);

    if (comment.nodeId) {
      console.log(`   ${chalk.dim(`node: ${comment.nodeId}`)}`);
    }
    if (comment.page) {
      console.log(`   ${chalk.dim(`page: ${comment.page}`)}`);
    }
    if (comment.nodeTextPreview) {
      console.log(`   ${chalk.dim(`node text: "${comment.nodeTextPreview}"`)}`);
    }

    const lines = comment.message.split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.length === 0) {
      console.log('   (empty)');
    } else {
      lines.forEach(line => console.log(`   ${line}`));
    }

    console.log('');
  });
}

export async function getDesignComments(fileKeyOrUrl: string, options: CommentsOptions): Promise<void> {
  const fileKey = parseFileKey(fileKeyOrUrl);
  const format = options.format || 'text';
  const isJson = format === 'json';
  const unresolvedOnly = Boolean(options.unresolved);
  const parsedLimit = options.limit ? parseInt(options.limit, 10) : NaN;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 100;
  const targetNodeId = options.nodeId ? normalizeNodeId(options.nodeId) : '';
  const targetPage = options.page?.trim().toLowerCase() || '';
  const includeNodePreview = options.nodePreview !== false;
  const since = options.since ? new Date(options.since) : null;
  const until = options.until ? new Date(options.until) : null;

  if (since && Number.isNaN(since.getTime())) {
    throw new Error(`Invalid --since date: ${options.since}`);
  }
  if (until && Number.isNaN(until.getTime())) {
    throw new Error(`Invalid --until date: ${options.until}`);
  }
  if (since && until && since > until) {
    throw new Error('--since must be earlier than --until');
  }

  if (!isJson) {
    console.log(chalk.dim(`Fetching comments for ${fileKey}...`));
  }

  const response = await getComments(fileKey);
  const allComments = response.comments.map(toCommentView);

  let pageMap = new Map<string, string>();
  if (targetPage) {
    const file = await getFile(fileKey);
    pageMap = buildNodePageMap(file.document);
  }

  let filtered = allComments
    .map((comment) => {
      if (comment.nodeId) {
        const normalized = normalizeNodeId(comment.nodeId);
        const page = pageMap.get(normalized);
        return { ...comment, page };
      }
      return comment;
    })
    .filter((comment) => (unresolvedOnly ? !comment.resolved : true))
    .filter((comment) => (targetNodeId ? normalizeNodeId(comment.nodeId || '') === targetNodeId : true))
    .filter((comment) => (targetPage ? (comment.page || '').toLowerCase().includes(targetPage) : true))
    .filter((comment) => (since ? new Date(comment.createdAt) >= since : true))
    .filter((comment) => (until ? new Date(comment.createdAt) <= until : true))
    .slice(0, limit);

  if (includeNodePreview) {
    const nodeIds = Array.from(new Set(
      filtered
        .map((comment) => comment.nodeId ? normalizeNodeId(comment.nodeId) : '')
        .filter(Boolean)
    ));

    if (nodeIds.length > 0) {
      const nodesResponse = await getFileNodes(fileKey, nodeIds).catch((error) => {
        if (!isJson) {
          console.log(chalk.dim(`Skipping node previews: ${error instanceof Error ? error.message : error}`));
        }
        return null;
      });
      if (!nodesResponse) {
        if (format === 'json') {
          console.log(JSON.stringify({
            fileKey,
            unresolvedOnly,
            nodeId: targetNodeId || undefined,
            page: targetPage || undefined,
            since: since?.toISOString(),
            until: until?.toISOString(),
            includeNodePreview,
            count: filtered.length,
            comments: filtered,
          }, null, 2));
          return;
        }
        printComments(filtered, fileKey, unresolvedOnly);
        return;
      }
      const previewByNode = new Map<string, string>();

      for (const nodeId of nodeIds) {
        const node = nodesResponse.nodes[nodeId]?.document;
        if (!node) continue;

        const preview = buildNodeTextPreview(node);
        if (preview) {
          previewByNode.set(nodeId, preview);
        }
      }

      filtered = filtered.map((comment) => {
        if (!comment.nodeId) return comment;
        const normalized = normalizeNodeId(comment.nodeId);
        return {
          ...comment,
          nodeTextPreview: previewByNode.get(normalized),
        };
      });
    }
  }

  if (format === 'json') {
    console.log(JSON.stringify({
      fileKey,
      unresolvedOnly,
      nodeId: targetNodeId || undefined,
      page: targetPage || undefined,
      since: since?.toISOString(),
      until: until?.toISOString(),
      includeNodePreview,
      count: filtered.length,
      comments: filtered,
    }, null, 2));
    return;
  }

  printComments(filtered, fileKey, unresolvedOnly);
}
