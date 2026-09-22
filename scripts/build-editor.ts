/**
 * Builds project-editor.html: a single self-contained file with the editor's
 * JavaScript (including the YAML parser, Markdown renderer, shared validation
 * and rendering code), CSS, and branding inlined. No network access is needed
 * to open it.
 *
 *   node scripts/build-editor.ts          # write project-editor.html
 *   node scripts/build-editor.ts --check  # verify the committed file is current
 *
 * The output is deterministic for a given source tree and dependency set, and
 * line endings are normalized to LF so the check is stable on Windows and CI.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { faviconSvg } from './generate-brand.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(root, 'project-editor.html');

function read(relative: string): string {
  return fs.readFileSync(path.join(root, relative), 'utf8').replace(/\r\n/g, '\n');
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

/** Strips the XML prolog and marks the logo decorative for the header. */
function inlineLogo(svg: string): string {
  return svg
    .replace(/<\?xml[^>]*\?>\s*/, '')
    .replace(/aria-labelledby="[^"]*"/, 'aria-hidden="true" focusable="false"')
    .replace(/<title id="logo-title">.*?<\/title>\s*/s, '')
    .replace(/<desc id="logo-description">.*?<\/desc>\s*/s, '');
}

export async function buildEditorHtml(): Promise<string> {
  const result = await build({
    entryPoints: [path.join(root, 'src/editor/main.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: ['es2022'],
    minify: true,
    legalComments: 'inline',
    sourcemap: false,
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false' },
  });
  const js = result.outputFiles[0]?.text ?? '';
  if (!js) throw new Error('esbuild produced no output');
  // Guard: the bundle must never embed the catalog itself.
  if (/schemaVersion:\s*1\s*\n\s*projects:/.test(js)) throw new Error('The editor bundle must not embed projects.yaml');

  const css = [read('src/shared/styles/tokens.css'), read('src/shared/styles/components.css'), read('src/editor/editor.css')].join('\n');
  const logo = inlineLogo(read('public/brand/cowhill-logo-horizontal.svg'));
  const favicon = 'data:image/svg+xml;utf8,' + encodeURIComponent(faviconSvg(read('public/brand/cowhill-logo-stacked.svg')));
  const template = read('src/editor/template.html');
  // `</script>` inside the bundle would terminate the inline script early.
  const safeJs = js.replace(/<\/script/gi, '<\\/script');
  const html = template
    .replace('{{CSS}}', () => css)
    .replace('{{LOGO}}', () => logo)
    .replace('{{FAVICON}}', () => favicon)
    .replace('{{JS}}', () => safeJs);
  return normalizeLineEndings(html);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const check = process.argv.includes('--check');
  buildEditorHtml()
    .then((html) => {
      if (check) {
        if (!fs.existsSync(OUTPUT)) {
          console.error('editor:check FAILED: project-editor.html is missing. Run "npm run editor:build" and commit the result.');
          process.exit(1);
        }
        const current = normalizeLineEndings(fs.readFileSync(OUTPUT, 'utf8'));
        if (current !== html) {
          console.error('editor:check FAILED: project-editor.html is out of date. Run "npm run editor:build" and commit the result.');
          process.exit(1);
        }
        console.log(`editor:check ok: project-editor.html is current (${(html.length / 1024).toFixed(0)} KB)`);
        return;
      }
      fs.writeFileSync(OUTPUT, html, 'utf8');
      console.log(`editor:build wrote project-editor.html (${(html.length / 1024).toFixed(0)} KB)`);
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.stack ?? err.message : err);
      process.exit(1);
    });
}
