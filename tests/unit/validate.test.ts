import { describe, expect, it } from 'vitest';
import { validateCatalog, isValidDate } from '../../src/shared/validate.ts';
import { parseYamlText } from '../../src/shared/yaml-doc.ts';
import fs from 'node:fs';

function base(overrides: Record<string, unknown> = {}) {
  return { id: 'demo', title: 'Demo', summary: 'A demo.', tags: [], status: 'active', ...overrides };
}
function doc(...projects: Record<string, unknown>[]) {
  return { schemaVersion: 1, projects };
}
function errorsOf(data: unknown) {
  return validateCatalog(data).errors.map((e) => `${e.path}: ${e.message}`);
}

describe('validateCatalog', () => {
  it('accepts a minimal valid project and applies defaults', () => {
    const result = validateCatalog(doc(base()));
    expect(result.ok).toBe(true);
    expect(result.projects[0]).toMatchObject({ featured: false, draft: false, links: [], screenshots: [], primaryLink: null, index: 0 });
  });

  it('accepts zero projects', () => {
    expect(validateCatalog({ schemaVersion: 1, projects: [] }).ok).toBe(true);
  });

  it('rejects non-mapping documents and wrong schema versions', () => {
    expect(errorsOf([])[0]).toMatch(/must be a mapping/);
    expect(errorsOf({ schemaVersion: 2, projects: [] })[0]).toMatch(/schemaVersion: must be 1/);
    expect(errorsOf({ schemaVersion: 1, projects: 'nope' })[0]).toMatch(/projects: must be a list/);
  });

  it('reports missing required fields with paths', () => {
    const errors = errorsOf(doc({ id: 'x' }));
    expect(errors).toEqual(expect.arrayContaining([expect.stringMatching(/projects\[0\]\.title: required/), expect.stringMatching(/summary: required/), expect.stringMatching(/tags: required/), expect.stringMatching(/status: required/)]));
  });

  it('rejects unknown fields with suggestions instead of dropping them', () => {
    const errors = errorsOf(doc(base({ Title: 'x', extra: 1 })));
    expect(errors).toEqual(expect.arrayContaining([expect.stringMatching(/unknown field "Title".*Did you mean "title"/), expect.stringMatching(/unknown field "extra"/)]));
    expect(errorsOf({ schemaVersion: 1, projects: [], foo: 1 })[0]).toMatch(/unknown top-level field "foo"/);
  });

  it('enforces kebab-case unique ids', () => {
    expect(errorsOf(doc(base({ id: 'Bad_ID' })))[0]).toMatch(/kebab-case/);
    expect(errorsOf(doc(base({ id: 'a--b' })))[0]).toMatch(/kebab-case/);
    const errors = errorsOf(doc(base({ id: 'same' }), base({ id: 'same' })));
    expect(errors).toEqual([expect.stringMatching(/projects\[1\]\.id: duplicate id "same" \(also used by projects\[0\]\)/)]);
  });

  it('detects duplicate YAML keys while parsing', () => {
    const parsed = parseYamlText(fs.readFileSync('tests/fixtures/invalid-duplicate-key.yaml', 'utf8'));
    expect(parsed.document).toBeNull();
    expect(parsed.errors[0]?.message).toMatch(/unique/i);
    expect(parsed.errors[0]?.path).toMatch(/line \d+/);
  });

  it('validates every status and keeps complete distinct from archived', () => {
    for (const status of ['active', 'maintained', 'paused', 'complete', 'archived']) {
      const result = validateCatalog(doc(base({ status })));
      expect(result.ok).toBe(true);
      expect(result.projects[0]?.status).toBe(status);
    }
    expect(errorsOf(doc(base({ status: 'done' })))[0]).toMatch(/must be one of active, maintained, paused, complete, archived/);
  });

  it('validates dates as real calendar dates in YYYY-MM-DD', () => {
    expect(isValidDate('2024-02-29')).toBe(true);
    expect(isValidDate('2023-02-29')).toBe(false);
    expect(isValidDate('2024-13-01')).toBe(false);
    expect(isValidDate('24-01-01')).toBe(false);
    expect(errorsOf(doc(base({ added: '2024/01/01' })))[0]).toMatch(/added: must be a real calendar date/);
    expect(errorsOf(doc(base({ updated: new Date() })))[0]).toMatch(/plain YYYY-MM-DD text/);
    const result = validateCatalog(doc(base({ added: '2024-05-01', updated: '2024-01-01' })));
    expect(result.ok).toBe(true);
    expect(result.warnings[0]?.message).toMatch(/earlier than "added"/);
  });

  it('normalizes tags for duplicate detection but preserves spelling', () => {
    expect(errorsOf(doc(base({ tags: ['Web', ' web '] })))[0]).toMatch(/repeats an earlier tag/);
    const result = validateCatalog(doc(base({ tags: ['Web Apps', 'tool'] })));
    expect(result.projects[0]?.tags).toEqual(['Web Apps', 'tool']);
    expect(errorsOf(doc(base({ tags: 'web' })))[0]).toMatch(/must be a list of strings/);
    expect(errorsOf(doc(base({ tags: [''] })))[0]).toMatch(/non-empty text/);
  });

  it('checks link formats, kinds and the primary limit', () => {
    expect(errorsOf(doc(base({ links: [{ label: 'x', url: 'ftp://x' }] })))[0]).toMatch(/absolute http\(s\) URL/);
    expect(errorsOf(doc(base({ links: [{ label: 'x', url: 'javascript:alert(1)' }] })))[0]).toMatch(/absolute http\(s\) URL/);
    expect(errorsOf(doc(base({ links: [{ label: 'x', url: 'www.example.com' }] })))[0]).toMatch(/absolute http\(s\) URL/);
    expect(errorsOf(doc(base({ links: [{ label: '', url: 'https://e.com' }] })))[0]).toMatch(/label: must be non-empty/);
    expect(errorsOf(doc(base({ links: [{ label: 'x', url: 'https://e.com', kind: 'embed' }] })))[0]).toMatch(/must be "link" or "download"/);
    expect(errorsOf(doc(base({ links: [{ label: 'x', url: 'https://e.com', primary: 'yes' }] })))[0]).toMatch(/primary: must be true or false/);
    expect(errorsOf(doc(base({ links: [{ label: 'x', url: 'https://e.com', icon: 'star' }] })))[0]).toMatch(/unknown field "icon"/);
    const two = errorsOf(doc(base({ links: [{ label: 'a', url: 'https://a.com', primary: true }, { label: 'b', url: 'https://b.com', primary: true }] })));
    expect(two[0]).toMatch(/only one resource may have "primary: true" \(found 2\)/);
    const none = validateCatalog(doc(base({ links: [{ label: 'a', url: 'https://a.com' }] })));
    expect(none.projects[0]?.primaryLink).toBeNull();
  });

  it('rejects unsafe or non-portable asset paths', () => {
    const bad = ['/etc/passwd', 'C:\\Users\\me\\pic.png', '../secret.png', 'project-assets/../x.png', 'project-assets/demo/../../x.png', 'project-assets/demo/.hidden.png', 'file:///tmp/x.png', 'http://example.com/x.png', 'project-assets/demo/x.exe', 'project-assets/x.png', 'project-assets/demo/sub dir/x.png'];
    for (const src of bad) {
      const errors = errorsOf(doc(base({ thumbnail: { src, alt: 'a' } })));
      expect(errors.length, src).toBeGreaterThan(0);
      expect(errors[0], src).toMatch(/thumbnail\.src/);
    }
    expect(validateCatalog(doc(base({ thumbnail: { src: 'project-assets/demo/pic.png', alt: 'a' } }))).ok).toBe(true);
    expect(errorsOf(doc(base({ thumbnail: { src: 'project-assets/demo/pic.png' } })))[0]).toMatch(/alt text is required/);
    expect(errorsOf(doc(base({ links: [{ label: 'x', url: 'project-assets/demo/app.html' }] })))[0]).toMatch(/not supported here/);
    expect(validateCatalog(doc(base({ links: [{ label: 'x', url: 'project-assets/demo/slides.pdf' }] }))).ok).toBe(true);
  });

  it('collects asset references and marks them unverified without a checker', () => {
    const result = validateCatalog(
      doc(base({ thumbnail: { src: 'project-assets/demo/t.png', alt: 't' }, screenshots: [{ src: 'project-assets/demo/s.png', alt: 's', caption: 'c' }], description: '![i](project-assets/demo/i.png) [pdf](project-assets/demo/d.pdf)', links: [{ label: 'pdf', url: 'project-assets/demo/notes.pdf' }] })),
    );
    expect(result.ok).toBe(true);
    expect(result.assetsUnverified).toBe(true);
    expect(result.assets.map((a) => a.role).sort()).toEqual(['link', 'markdown-image', 'markdown-link', 'screenshot', 'thumbnail']);
    const checked = validateCatalog(doc(base({ thumbnail: { src: 'project-assets/demo/t.png', alt: 't' } })), { checkAsset: (ref) => `${ref.path} is missing` });
    expect(checked.ok).toBe(false);
    expect(checked.errors[0]?.message).toMatch(/missing/);
  });

  it('rejects raw HTML, remote images and unsafe links in Markdown', () => {
    expect(errorsOf(doc(base({ description: 'Hello <script>alert(1)</script>' })))[0]).toMatch(/raw HTML is not allowed/);
    expect(errorsOf(doc(base({ description: '<div>block</div>' })))[0]).toMatch(/raw HTML is not allowed/);
    expect(errorsOf(doc(base({ description: '![x](https://evil.example/x.png)' })))[0]).toMatch(/must be a local project-assets/);
    expect(errorsOf(doc(base({ description: '[x](javascript:alert(1))' })))[0]).toMatch(/not allowed/);
    expect(validateCatalog(doc(base({ description: 'Use `a < b` and 2 > 1. [ok](https://ok.example) [mail](mailto:a@b.c)' }))).ok).toBe(true);
  });

  it('rejects multiline summaries and notices, and type errors', () => {
    expect(errorsOf(doc(base({ summary: 'a\nb' })))[0]).toMatch(/single line/);
    expect(errorsOf(doc(base({ notice: 'a\nb' })))[0]).toMatch(/single line/);
    expect(errorsOf(doc(base({ featured: 'yes' })))[0]).toMatch(/featured: must be true or false/);
    expect(errorsOf(doc(base({ title: 42 })))[0]).toMatch(/title: must be text/);
    expect(errorsOf(doc(base({ screenshots: { src: 'x' } })))[0]).toMatch(/screenshots: must be a list/);
    expect(errorsOf(doc(base({ links: [{ label: 'x', url: 'https://a.b' }, 'oops'] })))[0]).toMatch(/links\[1\]: each resource must be a mapping/);
  });

  it('warns about featured drafts and featured archived projects', () => {
    const result = validateCatalog(doc(base({ id: 'a', featured: true, draft: true }), base({ id: 'b', featured: true, status: 'archived' })));
    expect(result.ok).toBe(true);
    expect(result.warnings.map((w) => w.message)).toEqual([expect.stringMatching(/draft/), expect.stringMatching(/never highlighted/)]);
  });
});
