/**
 * Captures representative screenshots of the built site (dist/) and of the
 * committed editor opened over file://. Output: tests/screenshots/out/.
 * Usage: node tests/screenshots/capture.ts [base]   (default base: from site config)
 */
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { startStaticServer } from '../helpers/static-server.ts';
import { resolveDeployment } from '../../src/config/site.ts';

const root = process.cwd();
const out = path.join(root, 'tests', 'screenshots', 'out');
fs.mkdirSync(out, { recursive: true });
const { base } = resolveDeployment(process.env);
const server = await startStaticServer(path.join(root, 'dist'), base);
const prefix = base === '/' ? '' : base;
const browser = await chromium.launch();

const pages = [
  ['home', `${prefix}/`],
  ['projects', `${prefix}/projects/`],
  ['projects-list', `${prefix}/projects/?view=list`],
  ['project-portfolio', `${prefix}/projects/portfolio/`],
  ['about', `${prefix}/about/`],
  ['not-found', `${prefix}/does-not-exist/`],
] as const;

for (const [device, viewport] of [
  ['desktop', { width: 1280, height: 800 }],
  ['mobile', { width: 390, height: 844 }],
] as const) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  for (const [name, url] of pages) {
    await page.goto(server.url + url, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(out, `${name}-${device}.png`), fullPage: true });
  }
  await context.close();
}

const editorFile = path.join(root, 'project-editor.html');
if (fs.existsSync(editorFile)) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  await page.goto('file://' + editorFile);
  await page.screenshot({ path: path.join(out, 'editor-start.png'), fullPage: false });
  await context.close();
}

await browser.close();
await server.close();
console.log(`screenshots written to ${path.relative(root, out)}`);
