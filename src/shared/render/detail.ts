import { html, raw, type SafeHtml } from '../html.ts';
import { renderProjectLink } from '../links.ts';
import { renderMarkdown } from '../markdown.ts';
import type { Project } from '../schema.ts';
import type { RenderContext } from './context.ts';
import { dateLine, draftBadge, imageOrPlaceholder, statusBadge, tagList } from './parts.ts';

/** The full body of a project detail page, from the title down to the resource list. */
export function renderDetail(ctx: RenderContext, project: Project): SafeHtml {
  const primary = project.primaryLink;
  const secondary = project.links.filter((l) => l !== primary);
  const heroImage = project.thumbnail && project.screenshots.length === 0 ? project.thumbnail : null;
  const description = project.description
    ? renderMarkdown(project.description, { origin: ctx.origin, base: ctx.base, resolveImage: ctx.resolveImage })
    : '';

  return html`<article class="project-detail" data-id="${project.id}">
  <header class="project-detail__header">
    ${draftBadge(ctx, project)}
    <p class="project-detail__meta">${statusBadge(project.status)}${dateLine(project, { verbose: true })}</p>
    <h1 class="project-detail__title">${project.title}</h1>
    <p class="project-detail__summary">${project.summary}</p>
    ${project.notice ? html`<p class="notice"><span class="notice__label">Note:</span> ${project.notice}</p>` : ''}
    ${
      primary || secondary.length
        ? html`<div class="project-detail__actions">${primary ? renderProjectLink(primary, ctx, { className: 'button button--primary button--large' }) : ''}${secondary
            .slice(0, primary ? 2 : 3)
            .map((link) => renderProjectLink(link, ctx, { className: 'button' }))}</div>`
        : ''
    }
    ${tagList(ctx, project.tags)}
  </header>
  ${heroImage ? html`<figure class="project-detail__hero">${imageOrPlaceholder(ctx, heroImage, { className: 'project-detail__hero-image', loading: 'eager' })}</figure>` : ''}
  ${description ? html`<section class="project-detail__section prose" aria-labelledby="about-heading"><h2 id="about-heading" class="sr-only">About this project</h2>${raw(description)}</section>` : ''}
  ${
    project.screenshots.length
      ? html`<section class="project-detail__section" aria-labelledby="screenshots-heading"><h2 id="screenshots-heading">Screenshots</h2><div class="screenshots">${project.screenshots.map(
          (shot) => html`<figure class="screenshot">${imageOrPlaceholder(ctx, shot, { className: 'screenshot__image' })}${shot.caption ? html`<figcaption>${shot.caption}</figcaption>` : ''}</figure>`,
        )}</div></section>`
      : ''
  }
  ${
    project.links.length
      ? html`<section class="project-detail__section" aria-labelledby="resources-heading"><h2 id="resources-heading">Resources</h2><ul class="resource-list">${project.links.map(
          (link) => html`<li class="resource-list__item${link === primary ? ' resource-list__item--primary' : ''}">${renderProjectLink(link, ctx, { className: 'resource-link' })}${link === primary ? html`<span class="resource-list__hint">Primary</span>` : ''}</li>`,
        )}</ul></section>`
      : ''
  }
</article>`;
}
