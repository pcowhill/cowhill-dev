import { describe, expect, it } from 'vitest';
import { renderCard } from '../../src/shared/render/card.ts';
import { renderDetail } from '../../src/shared/render/detail.ts';
import { siteRenderContext } from '../../src/shared/render/context.ts';
import { toProject } from '../../src/shared/schema.ts';

const ctx = siteRenderContext('https://www.patrickcowhill.com', '/cowhill-dev');
const project = (extra: Record<string, unknown> = {}) => toProject({ id: 'demo', title: 'Demo <Title>', summary: 'Sum & mary', tags: ['Web', 'game'], status: 'complete', ...extra } as never, 0);

describe('card', () => {
  it('uses View details when no primary link exists and never nests links', () => {
    const html = renderCard(ctx, project({ links: [{ label: 'Source', url: 'https://g.h/x' }] })).value;
    expect(html).toContain('View details');
    expect(html).toContain('href="/cowhill-dev/projects/demo/"');
    expect(html).not.toMatch(/<a[^>]*>[^<]*<a/);
    expect(html).toContain('Demo &lt;Title&gt;');
    expect(html).toContain('Sum &amp; mary');
    expect(html).not.toContain('project-card__media');
    expect(html).toContain('data-tags="web game"');
  });
  it('renders the primary action with the external treatment and a details link', () => {
    const html = renderCard(ctx, project({ links: [{ label: 'Play', url: 'https://g.h/play', primary: true }] })).value;
    expect(html).toContain('Play</span><svg class="link-icon link-icon--external"');
    expect(html).toContain('>Details<span class="sr-only"> about Demo &lt;Title&gt;</span></a>');
  });
  it('shows a draft badge only in preview mode', () => {
    const draft = project({ draft: true });
    expect(renderCard(ctx, draft).value).not.toContain('Draft — not published');
    expect(renderCard({ ...ctx, preview: true }, draft).value).toContain('Draft — not published');
  });
  it('renders a thumbnail or an explicit placeholder', () => {
    const withImage = project({ thumbnail: { src: 'project-assets/demo/t.png', alt: 'Thumb' } });
    expect(renderCard(ctx, withImage).value).toContain('<img class="project-card__image" src="/cowhill-dev/assets/projects/demo/t.png" alt="Thumb"');
    const placeholder = renderCard({ ...ctx, resolveImage: () => null }, withImage).value;
    expect(placeholder).toContain('Local image not loaded');
    expect(placeholder).not.toContain('<img');
  });
});

describe('detail', () => {
  it('hides absent sections and renders present ones', () => {
    const minimal = renderDetail(ctx, project()).value;
    expect(minimal).not.toContain('Resources');
    expect(minimal).not.toContain('Screenshots');
    expect(minimal).not.toContain('class="notice"');
    expect(minimal).toContain('status-badge--complete');
    const full = renderDetail(
      ctx,
      project({
        notice: 'Early prototype',
        description: 'Hello **world**',
        added: '2026-01-02',
        updated: '2026-02-03',
        screenshots: [{ src: 'project-assets/demo/s.png', alt: 'S', caption: 'Cap' }],
        links: [
          { label: 'Play', url: 'https://g.h/play', primary: true },
          { label: 'Slides', url: 'project-assets/demo/slides.pdf', kind: 'download' },
        ],
      }),
    ).value;
    expect(full).toContain('Early prototype');
    expect(full).toContain('<strong>world</strong>');
    expect(full).toContain('<figcaption>Cap</figcaption>');
    expect(full).toContain('Resources');
    expect(full).toContain('download="slides.pdf"');
    expect(full).toContain('datetime="2026-02-03"');
    expect(full).toContain('datetime="2026-01-02"');
    expect(full).toContain('resource-list__hint">Primary');
  });
  it('marks the media column so screenshots or the thumbnail can sit beside the text', () => {
    const textOnly = renderDetail(ctx, project({ description: 'Words' })).value;
    expect(textOnly).not.toContain('project-detail--with-media');
    expect(textOnly).not.toContain('project-detail__media');
    const withShots = renderDetail(ctx, project({ screenshots: [{ src: 'project-assets/demo/s.png', alt: 'S' }] })).value;
    expect(withShots).toContain('class="project-detail project-detail--with-media"');
    expect(withShots).toContain('<section class="project-detail__section project-detail__media" aria-labelledby="screenshots-heading">');
    expect(withShots).not.toContain('project-detail__hero');
    const thumbOnly = renderDetail(ctx, project({ thumbnail: { src: 'project-assets/demo/t.png', alt: 'T' } })).value;
    expect(thumbOnly).toContain('project-detail--with-media');
    expect(thumbOnly).toContain('<figure class="project-detail__hero project-detail__media">');
    // Source order stays description, media, resources so narrow layouts read naturally.
    const ordered = renderDetail(ctx, project({ description: 'Words', screenshots: [{ src: 'project-assets/demo/s.png', alt: 'S' }], links: [{ label: 'Play', url: 'https://g.h/play' }] })).value;
    expect(ordered.indexOf('about-heading')).toBeLessThan(ordered.indexOf('screenshots-heading'));
    expect(ordered.indexOf('screenshots-heading')).toBeLessThan(ordered.indexOf('resources-heading'));
  });
});
