import { describe, expect, it } from 'vitest';
import { isInternalHref, resolveHref, resolveProjectLink, renderProjectLink, renderAnchor, NEW_TAB_TEXT } from '../../src/shared/links.ts';

const ctx = { origin: 'https://www.patrickcowhill.com', base: '/cowhill-dev' };
const rootCtx = { origin: 'https://www.cowhill.dev', base: '/' };

describe('link classification', () => {
  it('treats only origin + base path as internal', () => {
    expect(isInternalHref('https://www.patrickcowhill.com/cowhill-dev/about/', ctx)).toBe(true);
    expect(isInternalHref('https://www.patrickcowhill.com/cowhill-dev', ctx)).toBe(true);
    expect(isInternalHref('https://www.patrickcowhill.com/', ctx)).toBe(false);
    expect(isInternalHref('https://www.patrickcowhill.com/cowhill-devil/', ctx)).toBe(false);
    expect(isInternalHref('https://tools.cowhill.dev/app/', rootCtx)).toBe(false);
    expect(isInternalHref('https://www.cowhill.dev/projects/x/', rootCtx)).toBe(true);
    expect(isInternalHref('http://www.cowhill.dev/', rootCtx)).toBe(false);
    expect(isInternalHref('/cowhill-dev/projects/', ctx)).toBe(true);
    expect(isInternalHref('#main', ctx)).toBe(true);
    expect(isInternalHref('//evil.example/x', ctx)).toBe(false);
  });

  it('renders external anchors with target, rel, icon and screen-reader text', () => {
    const html = renderAnchor('https://example.org/app', 'Play', ctx, { className: 'button' }).value;
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('link-icon--external');
    expect(html).toContain(`(${NEW_TAB_TEXT})`);
    expect(html).toContain('aria-hidden="true"');
  });

  it('renders internal anchors without new-tab treatment', () => {
    const html = renderAnchor('/cowhill-dev/projects/', 'Projects', ctx).value;
    expect(html).not.toContain('target=');
    expect(html).not.toContain('link-icon');
  });

  it('resolves local asset resources under the base path', () => {
    const resolved = resolveProjectLink({ label: 'Read PDF', url: 'project-assets/demo/notes.pdf' }, ctx);
    expect(resolved).toMatchObject({ href: '/cowhill-dev/assets/projects/demo/notes.pdf', behavior: 'external', isLocalAsset: true });
    const dl = resolveProjectLink({ label: 'Download', url: 'project-assets/demo/notes.pdf', kind: 'download' }, ctx);
    expect(dl).toMatchObject({ href: '/cowhill-dev/assets/projects/demo/notes.pdf', behavior: 'download', downloadAttr: 'notes.pdf' });
    const html = renderProjectLink({ label: 'Download', url: 'project-assets/demo/notes.pdf', kind: 'download' }, ctx).value;
    expect(html).toContain('download="notes.pdf"');
    expect(html).toContain('link-icon--download');
    expect(html).toContain('(download)');
    expect(html).not.toContain('target="_blank"');
  });

  it('resolves local assets and the portfolio link correctly for the root deployment', () => {
    const resolved = resolveProjectLink({ label: 'Read PDF', url: 'project-assets/demo/notes.pdf' }, rootCtx);
    expect(resolved).toMatchObject({ href: '/assets/projects/demo/notes.pdf', behavior: 'external', isLocalAsset: true });
    expect(resolved.href).not.toContain('/cowhill-dev/');
    expect(resolveProjectLink({ label: 'Visit portfolio', url: 'https://www.patrickcowhill.com/' }, rootCtx).behavior).toBe('external');
    expect(resolveHref('https://www.cowhill.dev/about/', rootCtx).behavior).toBe('internal');
    expect(renderAnchor('/projects/', 'Projects', rootCtx).value).toBe('<a href="/projects/"><span class="link-label">Projects</span></a>');
  });

  it('does not add a download attribute or new-tab icon to external downloads', () => {
    const html = renderProjectLink({ label: 'Download release', url: 'https://github.com/x/y/releases/download/v1/y.zip', kind: 'download' }, ctx).value;
    expect(html).not.toContain('download=');
    expect(html).not.toContain('download ');
    expect(html).not.toContain('target=');
    expect(html).toContain('link-icon--download');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('keeps mailto links plain', () => {
    expect(resolveHref('mailto:a@b.c', ctx).behavior).toBe('plain');
  });

  it('escapes labels and attributes', () => {
    const html = renderProjectLink({ label: '<b>x</b>', url: 'https://e.org/?a=1&b="2"' }, ctx).value;
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('href="https://e.org/?a=1&amp;b=&quot;2&quot;"');
  });
});
