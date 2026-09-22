/**
 * Build-time loader for projects.yaml. This is the only place the website
 * reads project metadata. Drafts are removed here, before any page, search
 * data, metadata, or sitemap entry is generated.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseYamlText } from '../shared/yaml-doc.ts';
import { formatIssues, validateCatalog, type AssetReference, type ValidationResult } from '../shared/validate.ts';
import type { Project } from '../shared/schema.ts';
import { site } from '../config/site.ts';

/**
 * Repository root. Astro and every npm script run from the repository root, and
 * the bundled build code lives under dist/, so the working directory is the
 * reliable anchor. COWHILL_ROOT overrides it for tests.
 */
export const REPO_ROOT = path.resolve(process.env.COWHILL_ROOT ?? process.cwd());

/** Path of the authored catalog. Tests may point PROJECTS_FILE at a fixture. */
export function projectsFilePath(env: Record<string, string | undefined> = process.env): string {
  const override = env.PROJECTS_FILE;
  return override ? path.resolve(REPO_ROOT, override) : path.join(REPO_ROOT, 'projects.yaml');
}

export interface LoadedCatalog {
  /** Every valid record, drafts included (never exposed to pages). */
  all: Project[];
  /** Records that are published (draft is false). */
  published: Project[];
  /** Local files referenced by published projects. */
  publishedAssets: AssetReference[];
  validation: ValidationResult;
  filePath: string;
}

export class CatalogLoadError extends Error {
  readonly result: ValidationResult | null;
  constructor(message: string, result: ValidationResult | null) {
    super(message);
    this.name = 'CatalogLoadError';
    this.result = result;
  }
}

export function checkAssetExists(repoRoot: string): (ref: AssetReference) => string | null {
  return (ref) => {
    const full = path.join(repoRoot, ref.path.split('/').join(path.sep));
    if (!fs.existsSync(full)) return `"${ref.path}" does not exist (expected file at ${path.relative(repoRoot, full)})`;
    if (!fs.statSync(full).isFile()) return `"${ref.path}" is not a file`;
    return null;
  };
}

/** Loads and validates the catalog, throwing a readable error when invalid. */
export function loadCatalog(options: { filePath?: string; repoRoot?: string } = {}): LoadedCatalog {
  const filePath = options.filePath ?? projectsFilePath();
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  if (!fs.existsSync(filePath)) {
    throw new CatalogLoadError(`projects file not found: ${filePath}`, null);
  }
  const text = fs.readFileSync(filePath, 'utf8');
  const parsed = parseYamlText(text);
  if (parsed.errors.length > 0) {
    throw new CatalogLoadError(`projects.yaml has YAML syntax errors:\n${formatIssues(parsed.errors)}`, null);
  }
  const validation = validateCatalog(parsed.data, { checkAsset: checkAssetExists(repoRoot) });
  if (!validation.ok) {
    throw new CatalogLoadError(`projects.yaml failed validation:\n${formatIssues(validation.errors)}`, validation);
  }
  const all = validation.projects;
  const published = all.filter((p) => !p.draft);
  const publishedIds = new Set(published.map((p) => p.id));
  const publishedAssets = validation.assets.filter((a) => publishedIds.has(a.projectId));
  return { all, published, publishedAssets, validation, filePath };
}

let cached: LoadedCatalog | null = null;

/** Cached catalog for Astro pages (one parse per build). */
export function getCatalog(): LoadedCatalog {
  if (!cached) cached = loadCatalog();
  return cached;
}

export function getPublishedProjects(): Project[] {
  return getCatalog().published;
}

export function getPortfolioLink(): { href: string; label: string } | null {
  const project = getPublishedProjects().find((p) => p.id === site.portfolioProjectId);
  if (!project || !project.primaryLink) return null;
  return { href: project.primaryLink.url, label: project.primaryLink.label };
}
