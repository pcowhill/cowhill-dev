/**
 * Path and URL conventions.
 *
 * Authored references are always portable, repository-relative paths of the
 * form `project-assets/<project-id>/<file>`; the deployment base prefix is
 * applied only when producing public URLs.
 */
import { normalizeBase } from '../config/site.ts';

/** Directory (relative to the repository root) that holds authored project files. */
export const ASSET_ROOT = 'project-assets';

/** Public path (under the deployment base) where published assets are copied. */
export const PUBLIC_ASSET_PREFIX = 'assets/projects';

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'] as const;

/** File types that may be referenced as downloadable/openable local resources. */
export const RESOURCE_EXTENSIONS = [
  ...IMAGE_EXTENSIONS,
  'pdf',
  'txt',
  'md',
  'csv',
  'json',
  'zip',
  'gz',
  'tar',
  '7z',
  'mp3',
  'wav',
  'ogg',
  'mp4',
  'webm',
  'pptx',
  'docx',
  'xlsx',
  'odt',
  'odp',
  'ods',
] as const;

const SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface ParsedAssetPath {
  /** Project id segment of the path. */
  projectId: string;
  /** Path below the project folder, using forward slashes. */
  relative: string;
  extension: string;
}

export interface AssetPathResult {
  ok: boolean;
  parsed?: ParsedAssetPath;
  error?: string;
}

/** Returns true when the value looks like a local asset reference rather than a URL. */
export function looksLikeAssetPath(value: string): boolean {
  return value.startsWith(`${ASSET_ROOT}/`) || value === ASSET_ROOT;
}

/**
 * Validates a portable local path. Rejects absolute paths, machine-specific
 * paths, traversal, backslashes, URL schemes, and unsupported file types.
 */
export function parseAssetPath(value: unknown, allowed: readonly string[] = RESOURCE_EXTENSIONS): AssetPathResult {
  if (typeof value !== 'string' || value.trim() === '') {
    return { ok: false, error: 'must be a non-empty path' };
  }
  const raw = value;
  if (raw !== raw.trim()) return { ok: false, error: 'must not have surrounding whitespace' };
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
    return { ok: false, error: `local paths must not use a URL scheme ("${raw}")` };
  }
  if (raw.includes('\\')) return { ok: false, error: 'use forward slashes, not backslashes' };
  if (raw.startsWith('/') || raw.startsWith('~') || /^[a-zA-Z]:/.test(raw)) {
    return { ok: false, error: `must be relative to the repository, not an absolute or machine-specific path ("${raw}")` };
  }
  if (!raw.startsWith(`${ASSET_ROOT}/`)) {
    return { ok: false, error: `must start with "${ASSET_ROOT}/" ("${raw}")` };
  }
  const segments = raw.split('/');
  if (segments.length < 3) {
    return { ok: false, error: `must be "${ASSET_ROOT}/<project-id>/<file>" ("${raw}")` };
  }
  for (const segment of segments.slice(1)) {
    if (segment === '' || segment === '.' || segment === '..') {
      return { ok: false, error: `must not contain empty, "." or ".." segments ("${raw}")` };
    }
    if (!SEGMENT_PATTERN.test(segment)) {
      return {
        ok: false,
        error: `path segment "${segment}" may only contain letters, digits, ".", "_" and "-" and must not start with "."`,
      };
    }
  }
  const projectId = segments[1] as string;
  const relative = segments.slice(2).join('/');
  const file = segments[segments.length - 1] as string;
  const dot = file.lastIndexOf('.');
  const extension = dot > 0 ? file.slice(dot + 1).toLowerCase() : '';
  if (!allowed.includes(extension)) {
    return {
      ok: false,
      error: `file type ".${extension || '?'}" is not supported here (allowed: ${allowed.map((e) => '.' + e).join(', ')})`,
    };
  }
  return { ok: true, parsed: { projectId, relative, extension } };
}

export function isImageExtension(extension: string): boolean {
  return (IMAGE_EXTENSIONS as readonly string[]).includes(extension.toLowerCase());
}

/** Joins a base path and a site-relative path into a single leading-slash path. */
export function withBase(base: string, path: string): string {
  const normalizedBase = normalizeBase(base);
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  if (normalizedBase === '/') return `/${cleanPath}`;
  return cleanPath === '' ? `${normalizedBase}/` : `${normalizedBase}/${cleanPath}`;
}

/** Public URL (path only) for a validated asset reference. */
export function assetPublicPath(base: string, parsed: ParsedAssetPath): string {
  return withBase(base, `${PUBLIC_ASSET_PREFIX}/${parsed.projectId}/${parsed.relative}`);
}

/** Absolute URL for a site-relative path. */
export function absoluteUrl(origin: string, base: string, path: string): string {
  return `${origin}${withBase(base, path)}`;
}

/** Site-relative routes, with trailing slashes so they match the generated directories. */
export const routes = {
  home: (base: string) => withBase(base, ''),
  projects: (base: string) => withBase(base, 'projects/'),
  project: (base: string, id: string) => withBase(base, `projects/${encodeURIComponent(id)}/`),
  about: (base: string) => withBase(base, 'about/'),
  notFound: (base: string) => withBase(base, '404.html'),
  tag: (base: string, tag: string) => `${withBase(base, 'projects/')}?tags=${encodeURIComponent(tag)}`,
};
