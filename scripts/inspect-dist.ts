/**
 * Inspects the built site before it is uploaded as the Pages artifact.
 * Fails when the output is incomplete or contains anything that must not be
 * published (the raw catalog, the editor, fixtures, drafts).
 *
 *   node scripts/inspect-dist.ts [--dist dist] [--expect-origin URL] [--expect-base /path]
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolveDeployment } from '../src/config/site.ts';
import { loadCatalog, projectsFilePath } from '../src/data/projects.ts';
import { absoluteUrl } from '../src/shared/paths.ts';

export interface InspectOptions {
  dist: string;
  origin: string;
  base: string;
  /** Strings that must not appear anywhere in text output (draft sentinels in tests). */
  forbiddenStrings?: string[];
  projectsFile?: string;
  /** Repository root used to resolve project-assets references. */
  repoRoot?: string;
}

export function inspectDist(options: InspectOptions): string[] {
  const problems: string[] = [];
  const { dist } = options;
  if (!fs.existsSync(dist)) return [`build output directory not found: ${dist}`];
  const files = walk(dist);
  const relative = files.map((f) => path.relative(dist, f).split(path.sep).join('/'));

  for (const required of ['index.html', 'projects/index.html', 'about/index.html', '404.html', 'sitemap.xml', 'robots.txt', 'brand/cowhill-logo-horizontal.svg', 'brand/cowhill-logo-stacked.svg', 'generated/favicon.svg', 'generated/social-card.png']) {
    if (!relative.includes(required)) problems.push(`missing required output file: ${required}`);
  }
  for (const forbidden of ['projects.yaml', 'project-editor.html']) {
    if (relative.some((f) => f === forbidden || f.endsWith('/' + forbidden))) problems.push(`forbidden file in output: ${forbidden}`);
  }
  for (const f of relative) {
    if (/\.map$/.test(f)) problems.push(`source map in output: ${f}`);
    if (/(^|\/)(tests?|fixtures?|src|scripts|node_modules)\//.test(f)) problems.push(`unexpected directory in output: ${f}`);
    if (/\.(ya?ml|ts|astro)$/.test(f)) problems.push(`source-like file in output: ${f}`);
  }

  const catalog = loadCatalog({ filePath: options.projectsFile ?? projectsFilePath(), repoRoot: options.repoRoot });
  for (const project of catalog.published) {
    if (!relative.includes(`projects/${project.id}/index.html`)) problems.push(`missing detail page for published project "${project.id}"`);
  }
  for (const project of catalog.all.filter((p) => p.draft)) {
    if (relative.includes(`projects/${project.id}/index.html`)) problems.push(`draft "${project.id}" has a published page`);
  }
  const publishedAssetPaths = new Set(catalog.publishedAssets.map((a) => `assets/projects/${a.parsed.projectId}/${a.parsed.relative}`));
  for (const expected of publishedAssetPaths) {
    if (!relative.includes(expected)) problems.push(`missing published asset: ${expected}`);
  }
  for (const f of relative.filter((f) => f.startsWith('assets/projects/'))) {
    if (!publishedAssetPaths.has(f)) problems.push(`asset copied without a published reference: ${f}`);
  }

  const expectedCanonical = absoluteUrl(options.origin, options.base, '');
  const home = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  if (!home.includes(`<link rel="canonical" href="${expectedCanonical}">`)) {
    problems.push(`homepage canonical does not match ${expectedCanonical}`);
  }
  const sitemap = fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
  if (!sitemap.includes(`<loc>${expectedCanonical}</loc>`)) problems.push(`sitemap does not use ${expectedCanonical}`);
  for (const project of catalog.published) {
    if (!sitemap.includes(`<loc>${absoluteUrl(options.origin, options.base, `projects/${project.id}/`)}</loc>`)) problems.push(`sitemap is missing "${project.id}"`);
  }
  for (const project of catalog.all.filter((p) => p.draft)) {
    if (sitemap.includes(`/projects/${project.id}/`)) problems.push(`sitemap lists draft "${project.id}"`);
  }

  // Every site-absolute reference must sit under the deployment base: a
  // root deployment must not keep a repository-path prefix and a
  // repository-path deployment must not emit root-relative references.
  const basePrefix = options.base === '/' ? '' : options.base;
  for (const file of files.filter((f) => f.endsWith('.html'))) {
    const content = fs.readFileSync(file, 'utf8');
    for (const match of content.matchAll(/\b(?:href|src|content|action)="(\/[^"/][^"]*|\/)"/g)) {
      const target = match[1]!;
      if (basePrefix && target !== basePrefix && target !== `${basePrefix}/` && !target.startsWith(`${basePrefix}/`)) {
        problems.push(`reference outside the base path ${basePrefix}/ in ${path.relative(dist, file)}: ${target}`);
      }
    }
  }

  const forbidden = [...(options.forbiddenStrings ?? [])];
  for (const draft of catalog.all.filter((p) => p.draft)) forbidden.push(`projects/${draft.id}/`, draft.title);
  const textFiles = files.filter((f) => /\.(html|js|css|xml|txt|json|svg)$/.test(f));
  for (const file of textFiles) {
    const content = fs.readFileSync(file, 'utf8');
    for (const needle of forbidden) {
      if (needle && content.includes(needle)) problems.push(`forbidden content "${needle}" found in ${path.relative(dist, file)}`);
    }
  }
  return problems;
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

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]).endsWith(path.join('scripts', 'inspect-dist.ts'));
if (isMain) {
  const deployment = resolveDeployment(process.env);
  const problems = inspectDist({
    dist: path.resolve(arg('--dist') ?? 'dist'),
    origin: arg('--expect-origin') ?? deployment.origin,
    base: arg('--expect-base') ?? deployment.base,
  });
  if (problems.length) {
    console.error('inspect-dist FAILED:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
  console.log(`inspect-dist ok: output is complete for ${absoluteUrl(deployment.origin, deployment.base, '')} and contains no unpublished material`);
}
