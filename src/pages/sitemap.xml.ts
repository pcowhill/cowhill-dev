import type { APIRoute } from 'astro';
import { resolveDeployment } from '../config/site.ts';
import { getPublishedProjects } from '../data/projects.ts';
import { absoluteUrl } from '../shared/paths.ts';
import { escapeHtml } from '../shared/html.ts';

/** Sitemap of published pages only (drafts never reach this module). */
export const GET: APIRoute = () => {
  const { origin, base } = resolveDeployment(process.env);
  const pages = ['', 'projects/', 'about/', ...getPublishedProjects().map((p) => `projects/${p.id}/`)];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((path) => `  <url><loc>${escapeHtml(absoluteUrl(origin, base, path))}</loc></url>`).join('\n')}
</urlset>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
