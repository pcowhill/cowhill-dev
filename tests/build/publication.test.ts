import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildFixtureSite, buildFixtureSiteExpectingFailure, FIXTURE_ROOT, VARIANTS, TMP } from '../helpers/build-site.ts';
import { inspectDist } from '../../scripts/inspect-dist.ts';

const SENTINELS = ['DRAFTONLY', 'SENTINEL_DRAFT', 'secret-tag', 'sentinel-draft', 'Secret link'];

function read(dir: string, file: string): string {
  return fs.readFileSync(path.join(dir, file), 'utf8');
}
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

describe.each(Object.keys(VARIANTS) as (keyof typeof VARIANTS)[])('built output (%s base)', (name) => {
  const variant = VARIANTS[name];
  const prefix = variant.base === '/' ? '' : variant.base;
  let dist = '';
  beforeAll(() => {
    dist = buildFixtureSite(name, { force: true });
  });

  it('passes artifact inspection with no unpublished material', () => {
    const problems = inspectDist({ dist, origin: variant.origin, base: variant.base, forbiddenStrings: SENTINELS, projectsFile: path.join(FIXTURE_ROOT, 'projects.yaml'), repoRoot: FIXTURE_ROOT });
    expect(problems).toEqual([]);
  });

  it('generates real HTML pages for every published project and none for drafts', () => {
    for (const id of ['sentinel-published', 'sentinel-archived', 'sentinel-complete', 'sentinel-undated', 'sentinel-maintained', 'sentinel-featured-fourth', 'sentinel-recent', 'portfolio']) {
      expect(fs.existsSync(path.join(dist, 'projects', id, 'index.html')), id).toBe(true);
    }
    expect(fs.existsSync(path.join(dist, 'projects', 'sentinel-draft'))).toBe(false);
  });

  it('copies only assets referenced by published projects, including shared files', () => {
    expect(fs.existsSync(path.join(dist, 'assets/projects/sentinel-published/thumb.png'))).toBe(true);
    expect(fs.existsSync(path.join(dist, 'assets/projects/sentinel-published/inline.png'))).toBe(true);
    expect(fs.existsSync(path.join(dist, 'assets/projects/sentinel-published/notes.pdf'))).toBe(true);
    expect(fs.existsSync(path.join(dist, 'assets/projects/shared-pics/shared.png'))).toBe(true);
    expect(fs.existsSync(path.join(dist, 'assets/projects/sentinel-draft'))).toBe(false);
    expect(fs.existsSync(path.join(dist, 'project-assets'))).toBe(false);
  });

  it('keeps every text output free of draft sentinels, raw YAML and the editor', () => {
    const files = walk(dist);
    expect(files.some((f) => f.endsWith('projects.yaml') || f.endsWith('project-editor.html') || f.endsWith('.map'))).toBe(false);
    for (const file of files.filter((f) => /\.(html|js|css|xml|txt|json|svg)$/.test(f))) {
      const content = fs.readFileSync(file, 'utf8');
      for (const s of SENTINELS) expect(content, `${s} in ${file}`).not.toContain(s);
    }
    const searchData = /<script type="application\/json" id="catalog-data">(.*?)<\/script>/s.exec(read(dist, 'projects/index.html'));
    expect(searchData).not.toBeNull();
    const entries = JSON.parse(searchData![1]!) as { id: string; text: string }[];
    expect(entries.map((e) => e.id)).not.toContain('sentinel-draft');
    expect(entries.find((e) => e.id === 'sentinel-published')?.text).toContain('SENTINEL_DESCRIPTION');
  });

  it('writes base-aware links, canonicals, metadata and sitemap', () => {
    const detail = read(dist, 'projects/sentinel-published/index.html');
    expect(detail).toContain(`<link rel="canonical" href="${variant.origin}${prefix}/projects/sentinel-published/">`);
    expect(detail).toContain(`<meta property="og:image" content="${variant.origin}${prefix}/assets/projects/sentinel-published/thumb.png">`);
    expect(detail).toContain(`href="${prefix}/projects/"`);
    expect(detail).toContain(`href="${prefix}/projects/?tags=game"`);
    expect(detail).toContain(`src="${prefix}/assets/projects/sentinel-published/inline.png"`);
    expect(detail).toContain(`href="${prefix}/assets/projects/sentinel-published/notes.pdf" target="_blank" rel="noopener noreferrer"`);
    expect(detail).toContain(`href="${prefix}/assets/projects/sentinel-published/notes.pdf" download="notes.pdf"`);
    expect(detail).toContain('href="https://example.org/app" target="_blank" rel="noopener noreferrer"');
    expect(detail).toContain('href="https://github.com/example/alpha/releases/download/v1/alpha.zip" rel="noopener noreferrer"');
    expect(detail).not.toContain('alpha.zip" download');
    const undated = read(dist, 'projects/sentinel-undated/index.html');
    expect(undated).toContain(`<meta property="og:image" content="${variant.origin}${prefix}/generated/social-card.png">`);
    expect(undated).not.toContain('Resources');
    const notFound = read(dist, '404.html');
    expect(notFound).toContain(`href="${prefix}/"`);
    expect(notFound).toContain(`href="${prefix}/projects/"`);
    expect(notFound).toContain('<meta name="robots" content="noindex">');
    const sitemap = read(dist, 'sitemap.xml');
    expect(sitemap).toContain(`<loc>${variant.origin}${prefix}/projects/sentinel-archived/</loc>`);
    expect(sitemap).not.toContain('sentinel-draft');
    expect(read(dist, 'robots.txt')).toContain(`Sitemap: ${variant.origin}${prefix}/sitemap.xml`);
    for (const file of walk(dist).filter((f) => f.endsWith('.html'))) {
      const content = fs.readFileSync(file, 'utf8');
      if (prefix) expect(content, file).not.toMatch(/href="\/(projects|about|_astro|brand|generated)\b/);
      expect(content, file).not.toContain('href="/cowhill-dev/cowhill-dev');
    }
  });

  it('builds the homepage highlights from published, non-archived projects', () => {
    const home = read(dist, 'index.html');
    const featuredSection = /<section class="home-section" aria-labelledby="featured-heading">(.*?)<\/section>/s.exec(home)![1]!;
    const ids = [...featuredSection.matchAll(/data-id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(['sentinel-published', 'sentinel-complete', 'sentinel-featured-fourth']);
    const recentSection = /<section class="home-section" aria-labelledby="recent-heading">(.*?)<\/section>/s.exec(home)![1]!;
    const recentIds = [...recentSection.matchAll(/data-id="([^"]+)"/g)].map((m) => m[1]);
    expect(recentIds).toEqual(['sentinel-recent', 'sentinel-maintained', 'portfolio']);
    expect(recentIds).not.toContain('sentinel-archived');
    expect(home).toContain('aria-labelledby="tags-heading"');
  });
});

describe('sparse catalogs', () => {
  it('builds with zero projects and hides highlight sections', () => {
    const outDir = path.join(TMP, 'dist-empty');
    const { status, output } = buildFixtureSiteExpectingFailure({ PROJECTS_FILE: 'tests/fixtures/empty.yaml', SITE_ORIGIN: 'https://www.cowhill.dev', SITE_BASE: '/' });
    void outDir;
    expect(status, output).toBe(0);
    const home = fs.readFileSync(path.join(TMP, 'dist-fail', 'index.html'), 'utf8');
    expect(home).not.toContain('featured-heading');
    expect(home).not.toContain('recent-heading');
    expect(home).not.toContain('tags-heading');
    const catalog = fs.readFileSync(path.join(TMP, 'dist-fail', 'projects/index.html'), 'utf8');
    expect(catalog).toContain('No projects have been published yet');
    expect(fs.existsSync(path.join(TMP, 'dist-fail', 'projects/portfolio'))).toBe(false);
  });

  it('fails the build on an invalid catalog instead of producing partial output', () => {
    const { status, output } = buildFixtureSiteExpectingFailure({ PROJECTS_FILE: 'tests/fixtures/invalid-duplicate-key.yaml' });
    expect(status).not.toBe(0);
    expect(output).toMatch(/YAML syntax errors|unique/i);
  });
});
