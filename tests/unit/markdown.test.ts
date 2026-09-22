import { describe, expect, it } from 'vitest';
import { lintMarkdown, markdownToPlainText, renderMarkdown } from '../../src/shared/markdown.ts';

const ctx = { origin: 'https://www.patrickcowhill.com', base: '/cowhill-dev' };

describe('renderMarkdown', () => {
  it('renders common Markdown and shifts headings below the page title', () => {
    const html = renderMarkdown('# Top\n\nText with **bold** and `code`.\n\n- a\n- b\n\n| h |\n|---|\n| c |', ctx);
    expect(html).toContain('<h2>Top</h2>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<li>a</li>');
    expect(html).toContain('<table>');
  });

  it('never emits raw HTML', () => {
    const html = renderMarkdown('Hello <script>alert(1)</script> <img src=x onerror=alert(1)>\n\n<div>block</div>', ctx);
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<div');
    expect(html).toContain('&lt;script&gt;');
  });

  it('applies shared link behavior to Markdown links', () => {
    const html = renderMarkdown('[out](https://example.org) [in](https://www.patrickcowhill.com/cowhill-dev/about/) [bad](javascript:alert(1)) [data](data:text/html,hi) [rel](../x)', ctx);
    expect(html).toContain('href="https://example.org" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain('(opens in a new tab)');
    expect(html).toContain('href="https://www.patrickcowhill.com/cowhill-dev/about/">in</a>');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('data:');
    expect(html).not.toContain('href="../x"');
    expect(html).toContain('md-blocked-link');
  });

  it('only embeds local images and applies the base path', () => {
    const html = renderMarkdown('![Alt](project-assets/demo/pic.png "T") ![Remote](https://evil.example/x.png) ![Bad](project-assets/demo/../x.png)', ctx);
    expect(html).toContain('<img src="/cowhill-dev/assets/projects/demo/pic.png" alt="Alt" loading="lazy" title="T">');
    expect(html).not.toContain('evil.example/x.png"');
    expect((html.match(/md-blocked-image/g) ?? []).length).toBe(2);
  });

  it('shows a placeholder when a local image cannot be resolved', () => {
    const html = renderMarkdown('![Alt](project-assets/demo/pic.png)', { ...ctx, resolveImage: () => null });
    expect(html).toContain('Local image not loaded');
    expect(html).not.toContain('<img');
  });

  it('links to local resources under the base path', () => {
    const html = renderMarkdown('[Slides](project-assets/demo/slides.pdf)', ctx);
    expect(html).toContain('href="/cowhill-dev/assets/projects/demo/slides.pdf" target="_blank"');
  });
});

describe('lintMarkdown', () => {
  it('reports raw HTML, bad links and remote images and collects assets', () => {
    const { issues, assets } = lintMarkdown('<b>x</b>\n\n[a](ftp://x) ![i](https://r/x.png) ![ok](project-assets/p/ok.png) [d](project-assets/p/d.pdf) [bad](project-assets/p/x.exe)');
    expect(issues.map((i) => i.message)).toEqual([
      expect.stringMatching(/raw HTML/),
      expect.stringMatching(/link destination "ftp:\/\/x" is not allowed/),
      expect.stringMatching(/image "https:\/\/r\/x.png" must be a local/),
      expect.stringMatching(/link destination "project-assets\/p\/x.exe" is not allowed/),
    ]);
    expect(assets.map((a) => `${a.role}:${a.path}`)).toEqual(['image:project-assets/p/ok.png', 'link:project-assets/p/d.pdf']);
  });
  it('accepts angle brackets that are not tags', () => {
    expect(lintMarkdown('if a < b and c > d then <not a tag').issues).toEqual([]);
  });
});

describe('markdownToPlainText', () => {
  it('strips formatting for search', () => {
    expect(markdownToPlainText('# Title\n\nSome **bold** text with [a link](https://x.y) and `code`.\n\n![alt words](project-assets/p/i.png)')).toBe('Title Some bold text with a link and code . alt words');
  });
});
