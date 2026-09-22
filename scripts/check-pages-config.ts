/**
 * Compares the committed deployment configuration (src/config/site.ts) with
 * the origin and base path GitHub reports for this repository's Pages site,
 * as exposed by actions/configure-pages. A mismatch would ship canonical
 * URLs, sitemap entries and social metadata pointing at the wrong address, so
 * the workflow fails instead of deploying.
 *
 *   node scripts/check-pages-config.ts --origin https://x.example --base-path /repo
 */
import { normalizeBase, normalizeOrigin, resolveDeployment } from '../src/config/site.ts';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const reportedOrigin = arg('--origin');
const reportedBase = arg('--base-path');
if (reportedOrigin === undefined || reportedBase === undefined) {
  console.error('usage: node scripts/check-pages-config.ts --origin <origin> --base-path <path>');
  process.exit(2);
}
const configured = resolveDeployment(process.env);
const reported = { origin: normalizeOrigin(reportedOrigin), base: normalizeBase(reportedBase) };
if (configured.origin !== reported.origin || configured.base !== reported.base) {
  console.error(`check:pages-config FAILED
  GitHub Pages serves this repository at: ${reported.origin}${reported.base === '/' ? '' : reported.base}/
  src/config/site.ts is configured for:    ${configured.origin}${configured.base === '/' ? '' : configured.base}/
Update "deployment" in src/config/site.ts (see docs/custom-domain.md) so canonical URLs match the real address, then rebuild.`);
  process.exit(1);
}
console.log(`check:pages-config ok: site is configured for ${configured.origin}${configured.base === '/' ? '' : configured.base}/`);
