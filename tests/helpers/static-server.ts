/**
 * A small static server that behaves like GitHub Pages for a built site:
 * - serves a directory under a configurable base path ("/" or "/repo"),
 * - serves <dir>/index.html for directory URLs and redirects "/dir" to "/dir/",
 * - answers unknown paths with 404.html and a 404 status.
 * Used by the browser tests and the screenshot script.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
};

export interface StaticServer {
  url: string;
  port: number;
  close: () => Promise<void>;
}

export function startStaticServer(dir: string, base = '/', port = 0): Promise<StaticServer> {
  const normalizedBase = base === '/' ? '' : base.replace(/\/+$/, '');
  const server = http.createServer((req, res) => {
    const rawUrl = req.url ?? '/';
    const urlPath = decodeURIComponent(rawUrl.split('?')[0] ?? '/');
    const send = (status: number, file: string) => {
      const ext = path.extname(file).toLowerCase();
      res.writeHead(status, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    };
    const notFound = () => {
      const file = path.join(dir, '404.html');
      if (fs.existsSync(file)) send(404, file);
      else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
    };
    if (normalizedBase && !(urlPath === normalizedBase || urlPath.startsWith(normalizedBase + '/'))) {
      return notFound();
    }
    const relative = normalizedBase ? urlPath.slice(normalizedBase.length) : urlPath;
    if (relative === '') {
      res.writeHead(301, { Location: normalizedBase + '/' });
      return res.end();
    }
    const safe = path.normalize(relative).replace(/^(\.\.[/\\])+/, '');
    const full = path.join(dir, safe);
    if (!full.startsWith(dir)) return notFound();
    if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
      if (!urlPath.endsWith('/')) {
        res.writeHead(301, { Location: urlPath + '/' + (rawUrl.includes('?') ? '?' + rawUrl.split('?')[1] : '') });
        return res.end();
      }
      const index = path.join(full, 'index.html');
      if (fs.existsSync(index)) return send(200, index);
      return notFound();
    }
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return send(200, full);
    if (fs.existsSync(full + '.html')) return send(200, full + '.html');
    return notFound();
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        port: address.port,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}
