/**
 * Single source of truth for where the website is published.
 *
 * Every internal link, asset URL, canonical URL, sitemap entry, and the
 * search-page navigation is derived from `deployment` below. The values are
 * the production configuration for the custom domain `www.cowhill.dev`
 * served at the site root; the earlier repository-path preview
 * (`https://www.patrickcowhill.com/cowhill-dev/`) is documented in
 * docs/custom-domain.md, which also describes the cutover and the rollback.
 *
 * `origin` is the scheme + host with no trailing slash.
 * `base` is the path prefix the site is served under: "/" for a root
 * deployment or "/<repository-name>" for a repository-path preview.
 *
 * On production-deploy-capable runs (pushes to main and manual runs from
 * main) the CI workflow compares these values with what GitHub reports for
 * the repository's Pages site and fails the build on a mismatch, so a
 * deployment can never ship canonical URLs that point somewhere else. Pull
 * requests build and test with these values without that comparison, so a
 * change of address can be reviewed before the Pages settings are changed.
 *
 * For local experiments you can override both values with environment
 * variables without editing this file:
 *   SITE_ORIGIN=http://localhost:4321 SITE_BASE=/ npm run build
 */
export const deployment = {
  origin: 'https://www.cowhill.dev',
  base: '/',
};

export const site = {
  name: 'cowhill.dev',
  tagline: 'Software from the hill.',
  description:
    'A personal collection of games, tools, and experiments by Patrick Cowhill. Browse what I am building and explore past projects.',
  author: 'Patrick Cowhill',
  /** The project id whose primary link is used for the Portfolio navigation item. */
  portfolioProjectId: 'portfolio',
  /** Public repository, used for documentation links only. */
  repository: 'https://github.com/pcowhill/cowhill-dev',
};

/** Normalizes a base path to the form "/" or "/segment/segment" (no trailing slash). */
export function normalizeBase(base: string | undefined | null): string {
  const trimmed = (base ?? '').trim();
  if (trimmed === '' || trimmed === '/') return '/';
  let value = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  while (value.length > 1 && value.endsWith('/')) value = value.slice(0, -1);
  return value;
}

/** Normalizes an origin to "scheme://host[:port]" with no trailing slash. */
export function normalizeOrigin(origin: string | undefined | null): string {
  const trimmed = (origin ?? '').trim();
  if (trimmed === '') return '';
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
}

export interface DeploymentConfig {
  origin: string;
  base: string;
}

/**
 * Resolves the effective deployment configuration: environment overrides win,
 * otherwise the committed values above are used.
 */
export function resolveDeployment(env: Record<string, string | undefined> = {}): DeploymentConfig {
  const origin = normalizeOrigin(env.SITE_ORIGIN) || normalizeOrigin(deployment.origin);
  const base = normalizeBase(env.SITE_BASE !== undefined ? env.SITE_BASE : deployment.base);
  return { origin, base };
}
