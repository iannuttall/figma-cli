import chalk from 'chalk';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { getFile, getImages, parseFileKey, FigmaNode } from '../api.js';
import { PNG } from 'pngjs';
import { parseNodeIdsCsv } from '../utils/nodes.js';

interface ExportOptions {
  format?: 'png' | 'jpg' | 'svg' | 'pdf';
  scale?: number;
  retina?: boolean;
  output?: string;
  components?: boolean;
  frames?: boolean;
  nodeIds?: string;
  crop?: string;
}

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function resolveExportScale(scaleOption?: number, retina?: boolean): number {
  const scale = scaleOption ?? (retina ? 3 : 2);
  if (!Number.isFinite(scale) || scale < 1 || scale > 4) {
    throw new Error('Scale must be between 1 and 4.');
  }
  return scale;
}

export function parseCropRect(value: string): CropRect {
  const parts = value.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    throw new Error('Invalid --crop value. Expected format: x,y,width,height');
  }

  const [x, y, width, height] = parts;
  if (width <= 0 || height <= 0) {
    throw new Error('Crop width and height must be greater than 0.');
  }

  return { x, y, width, height };
}

function applyPngCrop(buffer: Buffer, crop: CropRect): Buffer {
  const image = PNG.sync.read(buffer);
  const x = Math.max(0, Math.floor(crop.x));
  const y = Math.max(0, Math.floor(crop.y));
  const width = Math.max(1, Math.floor(crop.width));
  const height = Math.max(1, Math.floor(crop.height));

  const maxWidth = Math.max(0, image.width - x);
  const maxHeight = Math.max(0, image.height - y);
  const finalWidth = Math.min(width, maxWidth);
  const finalHeight = Math.min(height, maxHeight);

  if (finalWidth <= 0 || finalHeight <= 0) {
    throw new Error('Crop rectangle falls outside exported image bounds.');
  }

  const cropped = new PNG({ width: finalWidth, height: finalHeight });
  PNG.bitblt(image, cropped, x, y, finalWidth, finalHeight, 0, 0);
  return PNG.sync.write(cropped);
}

export async function exportAssets(fileKeyOrUrl: string, options: ExportOptions): Promise<void> {
  const fileKey = parseFileKey(fileKeyOrUrl);
  const format = options.format || 'png';
  const scale = resolveExportScale(options.scale, options.retina);
  const outputDir = options.output || './figma-exports';
  const crop = options.crop?.trim() ? parseCropRect(options.crop) : undefined;
  if (crop && format !== 'png') {
    throw new Error('--crop is currently supported only when --format png.');
  }

  console.log(chalk.dim(`Fetching file ${fileKey}...`));

  const file = await getFile(fileKey);
  console.log(chalk.green(`File: ${file.name}`));

  // Collect node IDs to export
  const nodesToExport: Array<{ id: string; name: string; type: string }> = [];

  if (options.nodeIds) {
    // Export specific nodes
    const ids = parseNodeIdsCsv(options.nodeIds);
    for (const id of ids) {
      nodesToExport.push({ id, name: id, type: 'node' });
    }
  } else {
    // Traverse document to find exportable nodes
    traverseNodes(file.document, (node) => {
      if (options.components && node.type === 'COMPONENT') {
        nodesToExport.push({ id: node.id, name: node.name, type: 'component' });
      }
      if (options.frames && node.type === 'FRAME' && !node.name.startsWith('_')) {
        nodesToExport.push({ id: node.id, name: node.name, type: 'frame' });
      }
      // Also check for component sets
      if (options.components && node.type === 'COMPONENT_SET') {
        nodesToExport.push({ id: node.id, name: node.name, type: 'component-set' });
      }
    });

    // If nothing specified, export top-level frames
    if (!options.components && !options.frames && nodesToExport.length === 0) {
      const canvases = Array.isArray(file.document.children) ? file.document.children : [];
      for (const canvas of canvases) {
        if (canvas?.children) {
          for (const frame of canvas.children) {
            if (frame.type === 'FRAME' || frame.type === 'COMPONENT') {
              nodesToExport.push({ id: frame.id, name: frame.name, type: frame.type.toLowerCase() });
            }
          }
        }
      }
    }
  }

  if (nodesToExport.length === 0) {
    console.log(chalk.yellow('No nodes found to export'));
    return;
  }

  console.log(chalk.dim(`Found ${nodesToExport.length} nodes to export`));

  // Create output directory
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Batch export (Figma API allows multiple IDs per request)
  const batchSize = 50;
  let exported = 0;

  for (let i = 0; i < nodesToExport.length; i += batchSize) {
    const batch = nodesToExport.slice(i, i + batchSize);
    const ids = batch.map(n => n.id);

    console.log(chalk.dim(`Exporting batch ${Math.floor(i / batchSize) + 1}...`));

    try {
      const imagesResponse = await getImages(fileKey, ids, { format, scale });

      for (const node of batch) {
        const imageUrl = imagesResponse.images[node.id];
        if (imageUrl) {
          const filename = sanitizeFilename(node.name) + '.' + format;
          const filepath = join(outputDir, filename);

          // Download the image
          const response = await fetch(imageUrl);
          if (response.ok) {
            const rawBuffer = Buffer.from(await response.arrayBuffer());
            const finalBuffer = crop ? applyPngCrop(rawBuffer, crop) : rawBuffer;
            writeFileSync(filepath, finalBuffer);
            console.log(chalk.green(`  ✓ ${filename}`));
            exported++;
          } else {
            console.log(chalk.red(`  ✗ ${node.name} - download failed`));
          }
        } else {
          console.log(chalk.yellow(`  ⚠ ${node.name} - no image URL`));
        }
      }
    } catch (error) {
      console.log(chalk.red(`Batch export failed: ${error}`));
    }
  }

  console.log('');
  console.log(chalk.green(`Exported ${exported}/${nodesToExport.length} assets to ${outputDir}`));
}

function traverseNodes(node: FigmaNode, callback: (node: FigmaNode) => void): void {
  callback(node);
  if (node.children) {
    for (const child of node.children) {
      traverseNodes(child, callback);
    }
  }
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}
