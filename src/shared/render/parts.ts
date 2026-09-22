import { html, raw, type SafeHtml } from '../html.ts';
import { routes } from '../paths.ts';
import { STATUS_INFO, type Project, type Status } from '../schema.ts';
import { normalizeTag } from '../tags.ts';
import { ICONS } from './icons.ts';
import { imageUrl, type RenderContext } from './context.ts';

export function statusBadge(status: Status): SafeHtml {
  const info = STATUS_INFO[status];
  return html`<span class="status-badge status-badge--${status}" title="${info.meaning}">${info.label}</span>`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function dateLine(project: Project, options: { verbose?: boolean } = {}): SafeHtml {
  const parts: SafeHtml[] = [];
  if (project.updated) {
    parts.push(html`<span class="date"><span class="date__label">Updated</span> <time datetime="${project.updated}">${formatDate(project.updated)}</time></span>`);
  }
  if (project.added && (options.verbose || !project.updated)) {
    parts.push(html`<span class="date"><span class="date__label">Added</span> <time datetime="${project.added}">${formatDate(project.added)}</time></span>`);
  }
  return raw(parts.map((p) => p.value).join(''));
}

/** Tag chips that open the filtered catalog. */
export function tagList(ctx: RenderContext, tags: string[], options: { label?: string } = {}): SafeHtml {
  if (tags.length === 0) return raw('');
  return html`<ul class="tag-list" aria-label="${options.label ?? 'Tags'}">${tags.map(
    (tag) => html`<li><a class="tag" href="${routes.tag(ctx.base, normalizeTag(tag))}" data-tag="${normalizeTag(tag)}">${tag.trim()}</a></li>`,
  )}</ul>`;
}

export function draftBadge(ctx: RenderContext, project: Project): SafeHtml {
  if (!ctx.preview || !project.draft) return raw('');
  return html`<span class="draft-badge" role="status">Draft — not published</span>`;
}

/** Image element or explicit placeholder; never a broken image. */
export function imageOrPlaceholder(
  ctx: RenderContext,
  image: { src: string; alt: string },
  options: { className?: string; loading?: 'lazy' | 'eager'; sizes?: string } = {},
): SafeHtml {
  const { url } = imageUrl(ctx, image.src);
  if (url === null) {
    return html`<span class="image-placeholder ${options.className ?? ''}" role="img" aria-label="${image.alt || 'Image'}"><span class="image-placeholder__text">Local image not loaded</span><span class="image-placeholder__path">${image.src}</span></span>`;
  }
  return html`<img class="${options.className ?? ''}" src="${url}" alt="${image.alt}" loading="${options.loading ?? 'lazy'}" decoding="async">`;
}

export function hillMark(): SafeHtml {
  return raw(ICONS.hillMark);
}
