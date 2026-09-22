/**
 * Compares the committed deployment configuration (src/config/site.ts) with
 * the origin and base path GitHub reports for this repository's Pages site,
 * as exposed by actions/configure-pages. A mismatch would ship canonical
 * URLs, sitemap entries and social metadata pointing at the wrong address, so
 * the workflow fails instead of deploying.
 *
 * Host and base path must match exactly. GitHub reports "http://" for a Pages
 * site on which "Enforce HTTPS" is not enabled even when the host serves
 * HTTPS; configuring the site for https on the same host is accepted with a
 * note, because canonical URLs should not be downgraded to http.
 *
 *   node scripts/check-pages-config.ts --origin https://x.example --base-path /repo
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeBase, normalizeOrigin, resolveDeployment, type DeploymentConfig } from '../src/config/site.ts';

export interface PagesConfigComparison {
  ok: boolean;
  /** Human-readable explanation of a mismatch. */
  reason?: string;
  /** Non-blocking remark, e.g. the scheme difference. */
  note?: string;
}

function describe(config: DeploymentConfig): string {
  return `${config.origin}${config.base === '/' ? '' : config.base}/`;
}

export function comparePagesConfig(configured: DeploymentConfig, reportedOrigin: string, reportedBasePath: string): PagesConfigComparison {
  const reported: DeploymentConfig = { origin: normalizeOrigin(reportedOrigin), base: normalizeBase(reportedBasePath) };
  if (configured.base !== reported.base) {
    return { ok: false, reason: `base path differs: GitHub Pages serves ${describe(reported)} but the site is configured for ${describe(configured)}` };
  }
  if (configured.origin === reported.origin) return { ok: true };
  let configuredUrl: URL;
  let reportedUrl: URL;
  try {
    configuredUrl = new URL(configured.origin);
    reportedUrl = new URL(reported.origin);
  } catch {
    return { ok: false, reason: `origin differs: GitHub Pages serves ${describe(reported)} but the site is configured for ${describe(configured)}` };
  }
  if (configuredUrl.host !== reportedUrl.host) {
    return { ok: false, reason: `host differs: GitHub Pages serves ${describe(reported)} but the site is configured for ${describe(configured)}` };
  }
  if (configuredUrl.protocol === 'https:' && reportedUrl.protocol === 'http:') {
    return {
      ok: true,
      note: `GitHub reports ${describe(reported)} ("Enforce HTTPS" is not enabled for this Pages site); the site keeps https canonical URLs, which the host serves. Enable "Enforce HTTPS" in Settings → Pages when GitHub offers it.`,
    };
  }
  return { ok: false, reason: `scheme differs: GitHub Pages serves ${describe(reported)} but the site is configured for ${describe(configured)}` };
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const reportedOrigin = arg('--origin');
  const reportedBase = arg('--base-path');
  if (reportedOrigin === undefined || reportedBase === undefined) {
    console.error('usage: node scripts/check-pages-config.ts --origin <origin> --base-path <path>');
    process.exit(2);
  }
  const configured = resolveDeployment(process.env);
  const result = comparePagesConfig(configured, reportedOrigin, reportedBase);
  if (!result.ok) {
    console.error(`check:pages-config FAILED\n  ${result.reason}\nUpdate "deployment" in src/config/site.ts (see docs/custom-domain.md) so canonical URLs match the real address, then rebuild.`);
    process.exit(1);
  }
  if (result.note) console.log(`note: ${result.note}`);
  console.log(`check:pages-config ok: site is configured for ${describe(configured)}`);
}
