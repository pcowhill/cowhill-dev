/**
 * Validation of the parsed projects.yaml data. Used by the build (authoritative),
 * the `npm run validate` command, the tests, and the standalone editor.
 */
import {
  DATE_PATTERN,
  DOCUMENT_FIELDS,
  ID_PATTERN,
  IMAGE_FIELDS,
  LINK_FIELDS,
  LINK_KINDS,
  PROJECT_FIELDS,
  REQUIRED_PROJECT_FIELDS,
  SCHEMA_VERSION,
  SCREENSHOT_FIELDS,
  STATUSES,
  isStatus,
  toProject,
  type CatalogDocument,
  type Project,
  type ProjectRecord,
} from './schema.ts';
import { normalizeTag } from './tags.ts';
import { IMAGE_EXTENSIONS, RESOURCE_EXTENSIONS, looksLikeAssetPath, parseAssetPath, type ParsedAssetPath } from './paths.ts';
import { lintMarkdown } from './markdown.ts';

export interface ValidationIssue {
  /** Dot path such as projects[2].links[0].url */
  path: string;
  message: string;
  /** Error blocks publication; warning is informational. */
  level: 'error' | 'warning';
}

export interface AssetReference {
  /** Authored path, e.g. project-assets/my-project/shot.png */
  path: string;
  parsed: ParsedAssetPath;
  projectId: string;
  role: 'thumbnail' | 'screenshot' | 'link' | 'markdown-image' | 'markdown-link';
  fieldPath: string;
}

export interface ValidationOptions {
  /**
   * Checks whether a referenced local file exists. Return an error message or
   * null when the file is fine. Omit the callback when files cannot be checked
   * (the editor in YAML-only mode); references are then reported as unverified.
   */
  checkAsset?: (reference: AssetReference) => string | null;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  /** Parsed document, only present when there are no errors. */
  document: CatalogDocument | null;
  /** All projects with defaults applied (including drafts), only when ok. */
  projects: Project[];
  /** Local files referenced by each project (including drafts). */
  assets: AssetReference[];
  /** True when asset existence could not be checked. */
  assetsUnverified: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  if (value instanceof Date) return 'a date value';
  return typeof value === 'object' ? 'a mapping' : typeof value;
}

function suggest(field: string, known: readonly string[]): string {
  const lower = field.toLowerCase();
  const match = known.find((k) => k.toLowerCase() === lower);
  if (match) return ` Did you mean "${match}"?`;
  return '';
}

export function isValidDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

function isAbsoluteHttpUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== '';
  } catch {
    return false;
  }
}

export function validateCatalog(data: unknown, options: ValidationOptions = {}): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const assets: AssetReference[] = [];
  let assetsUnverified = false;
  const error = (path: string, message: string) => errors.push({ path, message, level: 'error' });
  const warning = (path: string, message: string) => warnings.push({ path, message, level: 'warning' });

  if (!isPlainObject(data)) {
    error('', `the document must be a mapping with "schemaVersion" and "projects" (found ${describeType(data)})`);
    return finish();
  }

  for (const key of Object.keys(data)) {
    if (!(DOCUMENT_FIELDS as readonly string[]).includes(key)) {
      error(key, `unknown top-level field "${key}".${suggest(key, DOCUMENT_FIELDS)} Supported: ${DOCUMENT_FIELDS.join(', ')}`);
    }
  }
  if (data.schemaVersion !== SCHEMA_VERSION) {
    error('schemaVersion', `must be ${SCHEMA_VERSION} (found ${JSON.stringify(data.schemaVersion)})`);
  }
  if (!Array.isArray(data.projects)) {
    error('projects', `must be a list of projects (found ${describeType(data.projects)}). Use "projects: []" for an empty catalog`);
    return finish();
  }

  const records: ProjectRecord[] = [];
  const seenIds = new Map<string, number>();

  data.projects.forEach((item, index) => {
    const at = (field?: string) => `projects[${index}]${field ? '.' + field : ''}`;
    if (!isPlainObject(item)) {
      error(at(), `each project must be a mapping (found ${describeType(item)})`);
      return;
    }
    const record: Record<string, unknown> = {};
    for (const key of Object.keys(item)) {
      if (!(PROJECT_FIELDS as readonly string[]).includes(key)) {
        error(at(key), `unknown field "${key}".${suggest(key, PROJECT_FIELDS)} Supported fields: ${PROJECT_FIELDS.join(', ')}`);
      }
    }
    for (const field of REQUIRED_PROJECT_FIELDS) {
      if (!(field in item) || item[field] === null || item[field] === undefined) {
        error(at(field), `required field "${field}" is missing`);
      }
    }
    const label = typeof item.id === 'string' ? item.id : `#${index + 1}`;

    // id
    if (typeof item.id === 'string') {
      if (!ID_PATTERN.test(item.id)) {
        error(at('id'), `"${item.id}" must be lowercase kebab-case (letters, digits, single hyphens), e.g. "my-project"`);
      } else if (seenIds.has(item.id)) {
        error(at('id'), `duplicate id "${item.id}" (also used by projects[${seenIds.get(item.id)}])`);
      } else {
        seenIds.set(item.id, index);
      }
      record.id = item.id;
    } else if (item.id !== undefined && item.id !== null) {
      error(at('id'), `must be a string (found ${describeType(item.id)})`);
    }

    // title, summary
    for (const field of ['title', 'summary'] as const) {
      const value = item[field];
      if (value === undefined || value === null) continue;
      if (typeof value !== 'string') {
        error(at(field), `must be text (found ${describeType(value)})`);
      } else if (value.trim() === '') {
        error(at(field), 'must not be empty');
      } else {
        if (field === 'summary' && value.includes('\n')) {
          error(at(field), 'summary is plain text on a single line; put longer content in "description"');
        }
        record[field] = value;
      }
    }

    // tags
    if (item.tags !== undefined && item.tags !== null) {
      if (!Array.isArray(item.tags)) {
        error(at('tags'), `must be a list of strings, e.g. [game, web] (found ${describeType(item.tags)}). Use [] for no tags`);
      } else {
        const tags: string[] = [];
        const seen = new Set<string>();
        item.tags.forEach((tag, tagIndex) => {
          if (typeof tag !== 'string' || tag.trim() === '') {
            error(at(`tags[${tagIndex}]`), `each tag must be non-empty text (found ${JSON.stringify(tag)})`);
            return;
          }
          const normalized = normalizeTag(tag);
          if (seen.has(normalized)) {
            error(at(`tags[${tagIndex}]`), `tag "${tag}" repeats an earlier tag (tags match ignoring case and surrounding spaces)`);
            return;
          }
          seen.add(normalized);
          tags.push(tag);
        });
        record.tags = tags;
      }
    }

    // status
    if (item.status !== undefined && item.status !== null) {
      if (!isStatus(item.status)) {
        error(at('status'), `must be one of ${STATUSES.join(', ')} (found ${JSON.stringify(item.status)})`);
      } else {
        record.status = item.status;
      }
    }

    // description, notice
    if (item.description !== undefined && item.description !== null) {
      if (typeof item.description !== 'string') {
        error(at('description'), `must be Markdown text (found ${describeType(item.description)})`);
      } else {
        record.description = item.description;
        const lint = lintMarkdown(item.description);
        for (const issue of lint.issues) error(at('description'), issue.message);
        for (const ref of lint.assets) {
          if (typeof item.id === 'string') {
            assets.push({
              path: ref.path,
              parsed: ref.parsed,
              projectId: item.id,
              role: ref.role === 'image' ? 'markdown-image' : 'markdown-link',
              fieldPath: at('description'),
            });
          }
        }
      }
    }
    if (item.notice !== undefined && item.notice !== null) {
      if (typeof item.notice !== 'string') {
        error(at('notice'), `must be short plain text (found ${describeType(item.notice)})`);
      } else if (item.notice.includes('\n')) {
        error(at('notice'), 'notice is a short single line of plain text');
      } else if (item.notice.trim() !== '') {
        record.notice = item.notice;
      }
    }

    // booleans
    for (const field of ['featured', 'draft'] as const) {
      const value = item[field];
      if (value === undefined || value === null) continue;
      if (typeof value !== 'boolean') {
        error(at(field), `must be true or false (found ${JSON.stringify(value)})`);
      } else {
        record[field] = value;
      }
    }

    // dates
    for (const field of ['added', 'updated'] as const) {
      const value = item[field];
      if (value === undefined || value === null || value === '') continue;
      if (value instanceof Date) {
        error(at(field), 'dates must be written as plain YYYY-MM-DD text (quote the value if your YAML tool converts it)');
      } else if (typeof value !== 'string' || !isValidDate(value)) {
        error(at(field), `must be a real calendar date in YYYY-MM-DD form (found ${JSON.stringify(value)})`);
      } else {
        record[field] = value;
      }
    }
    if (record.added && record.updated && (record.updated as string) < (record.added as string)) {
      warning(at('updated'), `"updated" (${record.updated}) is earlier than "added" (${record.added})`);
    }

    // thumbnail
    if (item.thumbnail !== undefined && item.thumbnail !== null) {
      const image = validateImage(item.thumbnail, at('thumbnail'), IMAGE_FIELDS, error);
      if (image) {
        record.thumbnail = image;
        if (typeof item.id === 'string') {
          const parsed = parseAssetPath(image.src, IMAGE_EXTENSIONS);
          if (parsed.parsed) assets.push({ path: image.src, parsed: parsed.parsed, projectId: item.id, role: 'thumbnail', fieldPath: at('thumbnail.src') });
        }
      }
    }

    // screenshots
    if (item.screenshots !== undefined && item.screenshots !== null) {
      if (!Array.isArray(item.screenshots)) {
        error(at('screenshots'), `must be a list of images with src, alt and optional caption (found ${describeType(item.screenshots)})`);
      } else {
        const list: NonNullable<ProjectRecord['screenshots']> = [];
        item.screenshots.forEach((shot, shotIndex) => {
          const image = validateImage(shot, at(`screenshots[${shotIndex}]`), SCREENSHOT_FIELDS, error);
          if (!image) return;
          const entry: { src: string; alt: string; caption?: string } = { src: image.src, alt: image.alt };
          if (isPlainObject(shot) && shot.caption !== undefined && shot.caption !== null) {
            if (typeof shot.caption !== 'string') {
              error(at(`screenshots[${shotIndex}].caption`), `must be text (found ${describeType(shot.caption)})`);
            } else if (shot.caption.trim() !== '') {
              entry.caption = shot.caption;
            }
          }
          list.push(entry);
          if (typeof item.id === 'string') {
            const parsed = parseAssetPath(image.src, IMAGE_EXTENSIONS);
            if (parsed.parsed) assets.push({ path: image.src, parsed: parsed.parsed, projectId: item.id, role: 'screenshot', fieldPath: at(`screenshots[${shotIndex}].src`) });
          }
        });
        record.screenshots = list;
      }
    }

    // links
    if (item.links !== undefined && item.links !== null) {
      if (!Array.isArray(item.links)) {
        error(at('links'), `must be a list of resources with label and url (found ${describeType(item.links)})`);
      } else {
        const list: NonNullable<ProjectRecord['links']> = [];
        let primaryCount = 0;
        item.links.forEach((link, linkIndex) => {
          const lat = (field?: string) => at(`links[${linkIndex}]${field ? '.' + field : ''}`);
          if (!isPlainObject(link)) {
            error(lat(), `each resource must be a mapping with label and url (found ${describeType(link)})`);
            return;
          }
          for (const key of Object.keys(link)) {
            if (!(LINK_FIELDS as readonly string[]).includes(key)) {
              error(lat(key), `unknown field "${key}".${suggest(key, LINK_FIELDS)} Supported: ${LINK_FIELDS.join(', ')}`);
            }
          }
          const entry: { label: string; url: string; primary?: boolean; kind?: 'link' | 'download' } = { label: '', url: '' };
          if (typeof link.label !== 'string' || link.label.trim() === '') {
            error(lat('label'), 'must be non-empty text such as "Play", "View source", or "Download release"');
          } else {
            entry.label = link.label;
          }
          if (typeof link.url !== 'string' || link.url.trim() === '') {
            error(lat('url'), 'must be an absolute http(s) URL or a project-assets/<project-id>/<file> path');
          } else if (looksLikeAssetPath(link.url)) {
            const parsed = parseAssetPath(link.url, RESOURCE_EXTENSIONS);
            if (!parsed.ok) {
              error(lat('url'), parsed.error ?? 'invalid local path');
            } else {
              entry.url = link.url;
              if (parsed.parsed && typeof item.id === 'string') {
                assets.push({ path: link.url, parsed: parsed.parsed, projectId: item.id, role: 'link', fieldPath: lat('url') });
              }
            }
          } else if (!isAbsoluteHttpUrl(link.url)) {
            error(lat('url'), `"${link.url}" must be an absolute http(s) URL (e.g. https://example.com/app/) or a project-assets/... path`);
          } else {
            entry.url = link.url;
          }
          if (link.primary !== undefined && link.primary !== null) {
            if (typeof link.primary !== 'boolean') {
              error(lat('primary'), `must be true or false (found ${JSON.stringify(link.primary)})`);
            } else {
              entry.primary = link.primary;
              if (link.primary) primaryCount += 1;
            }
          }
          if (link.kind !== undefined && link.kind !== null) {
            if (typeof link.kind !== 'string' || !(LINK_KINDS as readonly string[]).includes(link.kind)) {
              error(lat('kind'), `must be "link" or "download" (found ${JSON.stringify(link.kind)})`);
            } else {
              entry.kind = link.kind as 'link' | 'download';
            }
          }
          if (entry.label && entry.url) list.push(entry);
        });
        if (primaryCount > 1) {
          error(at('links'), `only one resource may have "primary: true" (found ${primaryCount})`);
        }
        record.links = list;
      }
    }

    if (record.featured === true && record.draft === true) {
      warning(at('featured'), `"${label}" is a draft, so "featured" has no effect until it is published`);
    }
    if (record.featured === true && record.status === 'archived') {
      warning(at('featured'), `"${label}" is archived; archived projects stay in the catalog but are never highlighted on the homepage`);
    }
    if (record.thumbnail && typeof (record.thumbnail as { alt?: unknown }).alt === 'string' && (record.thumbnail as { alt: string }).alt.trim() === '') {
      warning(at('thumbnail.alt'), 'empty alt text hides the thumbnail from screen readers; describe the image unless it is purely decorative');
    }

    records.push(record as unknown as ProjectRecord);
  });

  // Asset references belonging to a project must live in that project's folder.
  for (const ref of assets) {
    if (ref.parsed.projectId !== ref.projectId) {
      warning(ref.fieldPath, `"${ref.path}" lives in another project's folder ("${ref.parsed.projectId}"); shared files are published whenever any published project references them`);
    }
  }

  if (options.checkAsset) {
    for (const ref of assets) {
      const problem = options.checkAsset(ref);
      if (problem) error(ref.fieldPath, problem);
    }
  } else if (assets.length > 0) {
    assetsUnverified = true;
  }

  return finish(records);

  function finish(records: ProjectRecord[] = []): ValidationResult {
    const ok = errors.length === 0;
    const document = ok ? { schemaVersion: SCHEMA_VERSION, projects: records } : null;
    return {
      ok,
      errors,
      warnings,
      document,
      projects: ok ? records.map((record, index) => toProject(record, index)) : [],
      assets,
      assetsUnverified,
    };
  }
}

function validateImage(
  value: unknown,
  path: string,
  fields: readonly string[],
  error: (path: string, message: string) => void,
): { src: string; alt: string } | null {
  if (!isPlainObject(value)) {
    error(path, `must be a mapping with "src" and "alt" (found ${describeType(value)})`);
    return null;
  }
  for (const key of Object.keys(value)) {
    if (!fields.includes(key)) {
      error(`${path}.${key}`, `unknown field "${key}".${suggest(key, fields)} Supported: ${fields.join(', ')}`);
    }
  }
  let ok = true;
  if (typeof value.src !== 'string' || value.src.trim() === '') {
    error(`${path}.src`, 'must be a project-assets/<project-id>/<file> image path');
    ok = false;
  } else {
    const parsed = parseAssetPath(value.src, IMAGE_EXTENSIONS);
    if (!parsed.ok) {
      error(`${path}.src`, parsed.error ?? 'invalid image path');
      ok = false;
    }
  }
  if (typeof value.alt !== 'string') {
    error(`${path}.alt`, 'alt text is required (use "" only for a purely decorative image)');
    ok = false;
  }
  if (!ok) return null;
  return { src: value.src as string, alt: value.alt as string };
}

/** Formats issues for terminal or editor display. */
export function formatIssues(issues: ValidationIssue[]): string {
  return issues.map((issue) => `${issue.level === 'error' ? 'error' : 'warning'}: ${issue.path ? issue.path + ': ' : ''}${issue.message}`).join('\n');
}
