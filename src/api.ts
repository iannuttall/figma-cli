import { getFigmaToken } from './auth.js';

const BASE_URL = 'https://api.figma.com/v1';

function getToken(): string {
  const token = getFigmaToken();
  if (!token) {
    throw new Error('FIGMA_TOKEN is not configured. Run `fig auth` or export FIGMA_TOKEN in your shell.');
  }
  return token;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const url = `${BASE_URL}${endpoint}`;
  const headers = new Headers(options.headers);
  headers.set('X-Figma-Token', token);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Figma API error (${response.status}): ${error}`);
  }

  return response.json() as Promise<T>;
}

// File endpoints
export async function getFile(fileKey: string, options: { depth?: number; nodeIds?: string[] } = {}) {
  let endpoint = `/files/${fileKey}`;
  const params = new URLSearchParams();

  if (options.depth) params.append('depth', options.depth.toString());
  if (options.nodeIds?.length) params.append('ids', options.nodeIds.join(','));

  if (params.toString()) endpoint += `?${params}`;

  return request<FigmaFileResponse>(endpoint);
}

export async function getFileNodes(fileKey: string, nodeIds: string[]) {
  const params = new URLSearchParams({ ids: nodeIds.join(',') });
  return request<FigmaNodesResponse>(`/files/${fileKey}/nodes?${params}`);
}

export async function getFileMeta(fileKey: string) {
  return request<FigmaFileMetaResponse>(`/files/${fileKey}/meta`);
}

// Image endpoints
export async function getImages(fileKey: string, nodeIds: string[], options: { format?: 'jpg' | 'png' | 'svg' | 'pdf'; scale?: number } = {}) {
  const params = new URLSearchParams({
    ids: nodeIds.join(','),
    format: options.format || 'png',
    scale: (options.scale || 1).toString(),
  });
  return request<FigmaImagesResponse>(`/images/${fileKey}?${params}`);
}

export async function getImageFills(fileKey: string) {
  return request<FigmaImageFillsResponse>(`/files/${fileKey}/images`);
}

// Variables endpoints
export async function getLocalVariables(fileKey: string) {
  return request<FigmaVariablesResponse>(`/files/${fileKey}/variables/local`);
}

export async function getPublishedVariables(fileKey: string) {
  return request<FigmaVariablesResponse>(`/files/${fileKey}/variables/published`);
}

// Components & Styles
export async function getTeamComponents(teamId: string, options: { pageSize?: number } = {}) {
  const params = new URLSearchParams();
  if (options.pageSize) params.append('page_size', options.pageSize.toString());
  const query = params.toString() ? `?${params}` : '';
  return request<FigmaComponentsResponse>(`/teams/${teamId}/components${query}`);
}

export async function getTeamStyles(teamId: string, options: { pageSize?: number } = {}) {
  const params = new URLSearchParams();
  if (options.pageSize) params.append('page_size', options.pageSize.toString());
  const query = params.toString() ? `?${params}` : '';
  return request<FigmaStylesResponse>(`/teams/${teamId}/styles${query}`);
}

export async function getFileComponents(fileKey: string) {
  return request<FigmaFileComponentsResponse>(`/files/${fileKey}/components`);
}

export async function getFileStyles(fileKey: string) {
  return request<FigmaFileStylesResponse>(`/files/${fileKey}/styles`);
}

// Comments
export async function getComments(fileKey: string) {
  return request<FigmaCommentsResponse>(`/files/${fileKey}/comments`);
}

// Version history
export async function getVersions(fileKey: string) {
  return request<FigmaVersionsResponse>(`/files/${fileKey}/versions`);
}

// Types
export interface FigmaFileResponse {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  version: string;
  document: FigmaNode;
  components: Record<string, FigmaComponent>;
  styles: Record<string, FigmaStyle>;
}

export interface FigmaNodesResponse {
  name: string;
  nodes: Record<string, { document: FigmaNode; components: Record<string, FigmaComponent>; styles: Record<string, FigmaStyle> }>;
}

export interface FigmaFileMetaResponse {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  version: string;
}

export interface FigmaImagesResponse {
  images: Record<string, string>;
}

export interface FigmaImageFillsResponse {
  images: Record<string, string>;
}

export interface FigmaVariablesResponse {
  status: number;
  meta: {
    variables: Record<string, FigmaVariable>;
    variableCollections: Record<string, FigmaVariableCollection>;
  };
}

export interface FigmaVariable {
  id: string;
  name: string;
  key: string;
  variableCollectionId: string;
  resolvedType: 'BOOLEAN' | 'FLOAT' | 'STRING' | 'COLOR';
  valuesByMode: Record<string, unknown>;
  remote: boolean;
  description: string;
  scopes: string[];
}

export interface FigmaVariableCollection {
  id: string;
  name: string;
  key: string;
  modes: Array<{ modeId: string; name: string }>;
  defaultModeId: string;
  remote: boolean;
}

export interface FigmaComponentsResponse {
  meta: {
    components: FigmaComponentMeta[];
  };
}

export interface FigmaStylesResponse {
  meta: {
    styles: FigmaStyleMeta[];
  };
}

export interface FigmaFileComponentsResponse {
  meta: {
    components: FigmaComponentMeta[];
  };
}

export interface FigmaFileStylesResponse {
  meta: {
    styles: FigmaStyleMeta[];
  };
}

export interface FigmaComponentMeta {
  key: string;
  name: string;
  description: string;
  node_id: string;
  thumbnail_url: string;
  created_at: string;
  updated_at: string;
  containing_frame?: { name: string; nodeId: string };
}

export interface FigmaStyleMeta {
  key: string;
  name: string;
  description: string;
  style_type: 'FILL' | 'TEXT' | 'EFFECT' | 'GRID';
  node_id: string;
  thumbnail_url: string;
}

export interface FigmaCommentsResponse {
  comments: FigmaComment[];
}

export interface FigmaComment {
  id: string;
  message: string;
  created_at: string;
  user: { handle: string; img_url: string };
  resolved_at?: string;
  client_meta?: { node_id?: string };
}

export interface FigmaVersionsResponse {
  versions: FigmaVersion[];
}

export interface FigmaVersion {
  id: string;
  created_at: string;
  label: string;
  description: string;
  user: { handle: string };
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  fills?: FigmaFill[];
  strokes?: FigmaFill[];
  effects?: FigmaEffect[];
  style?: Record<string, unknown>;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  characters?: string;
  [key: string]: unknown;
}

export interface FigmaComponent {
  key: string;
  name: string;
  description: string;
}

export interface FigmaStyle {
  key: string;
  name: string;
  styleType: 'FILL' | 'TEXT' | 'EFFECT' | 'GRID';
  description: string;
}

export interface FigmaFill {
  type: string;
  color?: { r: number; g: number; b: number; a: number };
  opacity?: number;
}

export interface FigmaEffect {
  type: string;
  visible: boolean;
  radius?: number;
  color?: { r: number; g: number; b: number; a: number };
  offset?: { x: number; y: number };
}

// Helper to parse file key from URL
export function parseFileKey(input: string): string {
  const trimmedInput = input.trim();

  if (/^[a-zA-Z0-9]+$/.test(trimmedInput)) {
    return trimmedInput;
  }

  // First, try parsing as a URL so query params/fragments do not matter.
  try {
    const url = new URL(trimmedInput);
    const match = url.pathname.match(/\/(?:file|design|proto|board|slides)\/([a-zA-Z0-9]+)/);
    if (match) {
      return match[1];
    }
  } catch {
    // Not a URL; continue to regex fallback.
  }

  // Fallback for partial URLs/strings.
  const fallback = trimmedInput.match(/figma\.com\/(?:file|design|proto|board|slides)\/([a-zA-Z0-9]+)/);
  if (fallback) {
    return fallback[1];
  }

  // If it's already just a key embedded in text, return the first plausible token.
  const keyMatch = trimmedInput.match(/\b([a-zA-Z0-9]{10,})\b/);
  if (keyMatch) {
    return keyMatch[1];
  }

  throw new Error(`Invalid Figma file key or URL: ${input}`);
}
