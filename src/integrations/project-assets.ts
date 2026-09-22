/**
 * Astro integration that publishes only the local files referenced by
 * published (non-draft) project records.
 *
 * - Authored files live in project-assets/<project-id>/..., outside public/.
 * - During `astro dev` the files are served from their source location.
 * - During `astro build` they are copied into dist/assets/projects/....
 * Draft-only files are never copied or served.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { AstroIntegration } from 'astro';
import { loadCatalog, REPO_ROOT } from '../data/projects.ts';
import { PUBLIC_ASSET_PREFIX } from '../shared/paths.ts';
import { normalizeBase } from '../config/site.ts';

function publishedFiles(): Map<string, string> {
  const catalog = loadCatalog();
  const map = new Map<string, string>();
  for (const ref of catalog.publishedAssets) {
    const publicRelative = `${PUBLIC_ASSET_PREFIX}/${ref.parsed.projectId}/${ref.parsed.relative}`;
    map.set(publicRelative, path.join(REPO_ROOT, ref.path.split('/').join(path.sep)));
  }
  return map;
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  json: 'application/json',
  zip: 'application/zip',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

export function projectAssets(): AstroIntegration {
  return {
    name: 'cowhill-project-assets',
    hooks: {
      'astro:config:setup': ({ updateConfig, config }) => {
        const base = normalizeBase(config.base);
        updateConfig({
          vite: {
            plugins: [
              {
                name: 'cowhill-project-assets-dev',
                configureServer(server) {
                  server.middlewares.use((req, res, next) => {
                    const url = (req.url ?? '').split('?')[0] ?? '';
                    const prefix = base === '/' ? `/${PUBLIC_ASSET_PREFIX}/` : `${base}/${PUBLIC_ASSET_PREFIX}/`;
                    if (!url.startsWith(prefix)) return next();
                    const relative = `${PUBLIC_ASSET_PREFIX}/${decodeURIComponent(url.slice(prefix.length))}`;
                    let files: Map<string, string>;
                    try {
                      files = publishedFiles();
                    } catch {
                      return next();
                    }
                    const source = files.get(relative);
                    if (!source || !fs.existsSync(source)) return next();
                    const ext = path.extname(source).slice(1).toLowerCase();
                    res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
                    fs.createReadStream(source).pipe(res);
                  });
                },
              },
            ],
          },
        });
      },
      'astro:build:done': async ({ dir, logger }) => {
        const outDir = path.resolve(dir.pathname.replace(/^\/([A-Za-z]:)/, '$1'));
        const files = publishedFiles();
        let count = 0;
        for (const [publicRelative, source] of files) {
          const target = path.join(outDir, publicRelative.split('/').join(path.sep));
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.copyFileSync(source, target);
          count += 1;
        }
        logger.info(`copied ${count} published project asset${count === 1 ? '' : 's'}`);
      },
    },
  };
}
