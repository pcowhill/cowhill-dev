/**
 * Project record schema shared by the website build, the validator, the
 * tests, and the standalone editor. `projects.yaml` is the only authored
 * source of project metadata; everything else is derived from it.
 */

export const SCHEMA_VERSION = 1;

export const STATUSES = ['active', 'maintained', 'paused', 'complete', 'archived'] as const;
export type Status = (typeof STATUSES)[number];

export interface StatusInfo {
  label: string;
  /** One-sentence meaning shown in tooltips, the editor, and documentation. */
  meaning: string;
}

export const STATUS_INFO: Record<Status, StatusInfo> = {
  active: { label: 'Active', meaning: 'Currently being developed or expanded.' },
  maintained: { label: 'Maintained', meaning: 'Supported, without substantial active development.' },
  paused: { label: 'Paused', meaning: 'Work stopped for now, with a possible return.' },
  complete: {
    label: 'Complete',
    meaning:
      'Achieved its original goals or completion criteria. Not deprecated, and it may still receive future improvements.',
  },
  archived: {
    label: 'Archived',
    meaning:
      'Deprecated, no longer used, or retained primarily for historical reference, without a maintenance commitment.',
  },
};

export function isStatus(value: unknown): value is Status {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

export const LINK_KINDS = ['link', 'download'] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export interface ProjectImage {
  /** Portable local path: project-assets/<project-id>/<file>. */
  src: string;
  /** Meaningful alternative text. Use an empty string only for purely decorative images. */
  alt: string;
}

export interface ProjectScreenshot extends ProjectImage {
  caption?: string;
}

export interface ProjectLink {
  label: string;
  /** Absolute http(s) URL or a portable local path under project-assets/<project-id>/. */
  url: string;
  primary?: boolean;
  kind?: LinkKind;
}

/** A project exactly as authored (after validation), with defaults NOT applied. */
export interface ProjectRecord {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  status: Status;
  description?: string;
  notice?: string;
  featured?: boolean;
  draft?: boolean;
  added?: string;
  updated?: string;
  thumbnail?: ProjectImage;
  screenshots?: ProjectScreenshot[];
  links?: ProjectLink[];
}

/** A project with defaults applied and derived values computed. */
export interface Project extends ProjectRecord {
  tags: string[];
  featured: boolean;
  draft: boolean;
  screenshots: ProjectScreenshot[];
  links: ProjectLink[];
  /** The single link flagged primary, if any. Never inferred. */
  primaryLink: ProjectLink | null;
  /** Position in projects.yaml (0-based), used for deterministic ordering. */
  index: number;
}

export interface CatalogDocument {
  schemaVersion: number;
  projects: ProjectRecord[];
}

/** Field metadata, used by validation, documentation, and the editor. */
export const PROJECT_FIELDS = [
  'id',
  'title',
  'summary',
  'tags',
  'status',
  'description',
  'notice',
  'featured',
  'draft',
  'added',
  'updated',
  'thumbnail',
  'screenshots',
  'links',
] as const;
export type ProjectField = (typeof PROJECT_FIELDS)[number];

export const REQUIRED_PROJECT_FIELDS: readonly ProjectField[] = ['id', 'title', 'summary', 'tags', 'status'];

export const IMAGE_FIELDS = ['src', 'alt'] as const;
export const SCREENSHOT_FIELDS = ['src', 'alt', 'caption'] as const;
export const LINK_FIELDS = ['label', 'url', 'primary', 'kind'] as const;
export const DOCUMENT_FIELDS = ['schemaVersion', 'projects'] as const;

/** Stable, lowercase, kebab-case identifier used in the detail URL. */
export const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Applies defaults and derived values to a validated record. */
export function toProject(record: ProjectRecord, index: number): Project {
  const links = record.links ?? [];
  const primary = links.filter((l) => l.primary === true);
  return {
    ...record,
    tags: record.tags ?? [],
    featured: record.featured === true,
    draft: record.draft === true,
    screenshots: record.screenshots ?? [],
    links,
    primaryLink: primary.length === 1 ? (primary[0] as ProjectLink) : null,
    index,
  };
}

/** Sort key for "recently updated": updated, falling back to added. */
export function activityDate(project: Pick<ProjectRecord, 'added' | 'updated'>): string | undefined {
  return project.updated ?? project.added;
}
