import type { APIRoute } from 'astro';
import { resolveDeployment } from '../config/site.ts';
import { absoluteUrl } from '../shared/paths.ts';

export const GET: APIRoute = () => {
  const { origin, base } = resolveDeployment(process.env);
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl(origin, base, 'sitemap.xml')}\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
