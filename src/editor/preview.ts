/** Preview rendering with the shared website components. */
import { renderCard } from '../shared/render/card.ts';
import { renderDetail } from '../shared/render/detail.ts';
import type { RenderContext } from '../shared/render/context.ts';
import { toProject, type Project, type ProjectRecord } from '../shared/schema.ts';
import { validateCatalog } from '../shared/validate.ts';

export type PreviewKind = 'card' | 'list' | 'detail';

/**
 * Builds a Project for previewing even when the record is not fully valid:
 * required text falls back to placeholders so the preview keeps updating.
 */
export function previewProject(raw: Record<string, unknown>, index: number): { project: Project; valid: boolean } {
  const single = validateCatalog({ schemaVersion: 1, projects: [raw] });
  if (single.ok && single.projects[0]) return { project: { ...single.projects[0], index }, valid: true };
  const record: ProjectRecord = {
    id: typeof raw.id === 'string' && raw.id ? raw.id : 'untitled',
    title: typeof raw.title === 'string' && raw.title ? raw.title : '(untitled project)',
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [],
    status: (['active', 'maintained', 'paused', 'complete', 'archived'] as const).includes(raw.status as never) ? (raw.status as ProjectRecord['status']) : 'active',
    description: typeof raw.description === 'string' ? raw.description : undefined,
    notice: typeof raw.notice === 'string' ? raw.notice : undefined,
    featured: raw.featured === true,
    draft: raw.draft === true,
    added: typeof raw.added === 'string' ? raw.added : undefined,
    updated: typeof raw.updated === 'string' ? raw.updated : undefined,
    thumbnail: isImage(raw.thumbnail) ? raw.thumbnail : undefined,
    screenshots: Array.isArray(raw.screenshots) ? raw.screenshots.filter(isImage) : [],
    links: Array.isArray(raw.links)
      ? raw.links
          .filter((l): l is Record<string, unknown> => typeof l === 'object' && l !== null)
          .filter((l) => typeof l.label === 'string' && typeof l.url === 'string' && (l.url as string).trim() !== '')
          .map((l) => ({
            label: l.label as string,
            url: l.url as string,
            primary: l.primary === true,
            kind: l.kind === 'download' ? ('download' as const) : ('link' as const),
          }))
      : [],
  };
  const project = toProject(record, index);
  // More than one primary: show none, matching the "never guess" rule.
  return { project, valid: false };
}

function isImage(value: unknown): value is { src: string; alt: string } {
  return typeof value === 'object' && value !== null && typeof (value as { src?: unknown }).src === 'string' && (value as { src: string }).src.trim() !== '';
}

export function renderPreview(kind: PreviewKind, ctx: RenderContext, project: Project): string {
  if (kind === 'detail') {
    return `<div class="project-page">${renderDetail(ctx, project).value}</div>`;
  }
  const card = renderCard(ctx, project, { headingLevel: 2 }).value;
  return `<div class="catalog catalog--${kind === 'list' ? 'list' : 'grid'} preview-catalog preview-catalog--${kind}">${card}</div>`;
}
