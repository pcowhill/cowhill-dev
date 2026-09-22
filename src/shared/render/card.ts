import { html, raw, type SafeHtml } from '../html.ts';
import { renderProjectLink } from '../links.ts';
import { routes } from '../paths.ts';
import type { Project } from '../schema.ts';
import { normalizeTag } from '../tags.ts';
import type { RenderContext } from './context.ts';
import { dateLine, draftBadge, imageOrPlaceholder, statusBadge, tagList } from './parts.ts';

export interface CardOptions {
  /** Heading level for the title (h2 in the catalog, h3 inside homepage sections). */
  headingLevel?: 2 | 3;
}

/**
 * One project card. The same markup serves the grid and the list view; the
 * containing element switches layout with the `catalog--list` class.
 */
export function renderCard(ctx: RenderContext, project: Project, options: CardOptions = {}): SafeHtml {
  const level = options.headingLevel ?? 2;
  const detailHref = routes.project(ctx.base, project.id);
  const primary = project.primaryLink;
  const media = project.thumbnail
    ? html`<div class="project-card__media">${imageOrPlaceholder(ctx, project.thumbnail, { className: 'project-card__image' })}</div>`
    : raw('');
  const tagKeys = project.tags.map(normalizeTag).join(' ');
  return html`<article class="project-card${project.thumbnail ? '' : ' project-card--no-image'}" data-id="${project.id}" data-status="${project.status}" data-tags="${tagKeys}" data-added="${project.added ?? ''}" data-updated="${project.updated ?? ''}" data-title="${project.title}">
  ${draftBadge(ctx, project)}
  ${media}
  <div class="project-card__body">
    <p class="project-card__meta">${statusBadge(project.status)}${dateLine(project)}</p>
    ${raw(`<h${level} class="project-card__title"><a href="${detailHref}">${escapeTitle(project.title)}</a></h${level}>`)}
    <p class="project-card__summary">${project.summary}</p>
    ${project.notice ? html`<p class="project-card__notice">${project.notice}</p>` : ''}
    ${tagList(ctx, project.tags)}
  </div>
  <div class="project-card__actions">
    ${
      primary
        ? html`${renderProjectLink(primary, ctx, { className: 'button button--primary' })}<a class="button button--quiet" href="${detailHref}">Details<span class="sr-only"> about ${project.title}</span></a>`
        : html`<a class="button button--primary" href="${detailHref}">View details<span class="sr-only"> about ${project.title}</span></a>`
    }
  </div>
</article>`;
}

function escapeTitle(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The catalog container. `items` are card strings; the class switches grid/list layout. */
export function renderCatalogList(cards: SafeHtml[], view: 'grid' | 'list'): SafeHtml {
  return html`<div class="catalog catalog--${view}" id="catalog-results">${cards}</div>`;
}
