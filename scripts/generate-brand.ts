/**
 * Derives the favicon and the shared social-preview image from the supplied
 * logos in public/brand/. The original SVG files are read, never modified;
 * generated files go to public/generated/ (ignored by git, rebuilt on every
 * build).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brandDir = path.join(root, 'public', 'brand');
const outDir = path.join(root, 'public', 'generated');

export const BRAND_FILES = {
  horizontal: 'cowhill-logo-horizontal.svg',
  stacked: 'cowhill-logo-stacked.svg',
} as const;

function readBrand(name: string): string {
  const file = path.join(brandDir, name);
  if (!fs.existsSync(file)) {
    throw new Error(`Required brand asset is missing: public/brand/${name}. Restore the supplied logo; it is not substituted.`);
  }
  return fs.readFileSync(file, 'utf8');
}

/** Extracts the inner markup of the <g id="landscape"> group (sun, cow, hill). */
function extractLandscape(svg: string): string {
  const match = /<g id="landscape">([\s\S]*?)<\/g>\s*<!-- Custom vector lettering/.exec(svg);
  if (!match) throw new Error('Could not find the landscape group in the stacked logo');
  return match[1] ?? '';
}

function extractInner(svg: string): { inner: string; viewBox: string } {
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1];
  const start = svg.indexOf('>', svg.indexOf('<svg')) + 1;
  const end = svg.lastIndexOf('</svg>');
  if (!viewBox || start <= 0 || end < 0) throw new Error('Unexpected SVG structure');
  return { inner: svg.slice(start, end), viewBox };
}

export function faviconSvg(stacked: string): string {
  const landscape = extractLandscape(stacked);
  // Crop around the sun and cow so the mark stays legible at 16-32px.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="212 4 136 120" width="136" height="120" role="img" aria-label="cowhill.dev">
<rect x="212" y="4" width="136" height="120" rx="20" fill="#FBF7EF"/>
${landscape.trim()}
</svg>
`;
}

export function socialSvg(stacked: string): string {
  const { inner, viewBox } = extractInner(stacked);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#FBF7EF"/>
<path d="M0 560C200 520 380 470 620 500s360 60 580 40V630H0z" fill="#DBE6D9"/>
<svg x="240" y="100" width="720" height="343" viewBox="${viewBox}">${inner}</svg>
<text x="600" y="530" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="30" fill="#4F5B57">Software from the hill.</text>
</svg>
`;
}

export async function generateBrand(): Promise<string[]> {
  const stacked = readBrand(BRAND_FILES.stacked);
  readBrand(BRAND_FILES.horizontal);
  fs.mkdirSync(outDir, { recursive: true });
  const written: string[] = [];
  const write = (name: string, data: string | Buffer) => {
    fs.writeFileSync(path.join(outDir, name), data);
    written.push(name);
  };
  const favicon = faviconSvg(stacked);
  write('favicon.svg', favicon);
  const faviconBuffer = Buffer.from(favicon);
  write('favicon-32.png', await sharp(faviconBuffer, { density: 300 }).resize(32, 32).png().toBuffer());
  write('favicon-192.png', await sharp(faviconBuffer, { density: 300 }).resize(192, 192).png().toBuffer());
  write('apple-touch-icon.png', await sharp(faviconBuffer, { density: 300 }).resize(180, 180).png().toBuffer());
  const social = socialSvg(stacked);
  write('social-card.png', await sharp(Buffer.from(social), { density: 96 }).resize(1200, 630).png().toBuffer());
  return written;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  generateBrand()
    .then((files) => console.log(`brand: generated ${files.join(', ')} in public/generated/`))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
