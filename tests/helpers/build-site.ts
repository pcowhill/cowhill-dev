/**
 * Builds the website from the synthetic fixture catalog into a temporary
 * directory, for publication and browser tests. Two variants are used:
 * a root deployment and a repository-path deployment.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const REPO = process.cwd();
export const FIXTURE_ROOT = path.join(REPO, 'tests', 'fixtures', 'repo');
export const TMP = path.join(REPO, 'tests', '.tmp');

export const VARIANTS = {
  root: { origin: 'https://www.cowhill.dev', base: '/', outDir: path.join(TMP, 'dist-root') },
  repo: { origin: 'https://www.patrickcowhill.com', base: '/cowhill-dev', outDir: path.join(TMP, 'dist-repo') },
} as const;
export type VariantName = keyof typeof VARIANTS;

export function buildFixtureSite(name: VariantName, options: { force?: boolean } = {}): string {
  const variant = VARIANTS[name];
  const stamp = path.join(variant.outDir, '.fixture-build');
  if (!options.force && fs.existsSync(stamp) && process.env.E2E_REUSE_BUILD === '1') return variant.outDir;
  fs.rmSync(variant.outDir, { recursive: true, force: true });
  if (!fs.existsSync(path.join(REPO, 'public', 'generated', 'favicon.svg'))) {
    const brand = spawnSync(process.execPath, ['scripts/generate-brand.ts'], { cwd: REPO, stdio: 'pipe' });
    if (brand.status !== 0) throw new Error(`brand generation failed:\n${brand.stderr}`);
  }
  const result = spawnSync('npx', ['astro', 'build', '--outDir', variant.outDir], {
    cwd: REPO,
    stdio: 'pipe',
    encoding: 'utf8',
    env: {
      ...process.env,
      PROJECTS_FILE: path.join(FIXTURE_ROOT, 'projects.yaml'),
      COWHILL_ROOT: FIXTURE_ROOT,
      SITE_ORIGIN: variant.origin,
      SITE_BASE: variant.base,
      ASTRO_TELEMETRY_DISABLED: '1',
    },
  });
  if (result.status !== 0) throw new Error(`astro build (${name}) failed:\n${result.stdout}\n${result.stderr}`);
  fs.writeFileSync(stamp, new Date().toISOString());
  return variant.outDir;
}

export function buildFixtureSiteExpectingFailure(env: Record<string, string>): { status: number | null; output: string } {
  const outDir = path.join(TMP, 'dist-fail');
  const result = spawnSync('npx', ['astro', 'build', '--outDir', outDir], {
    cwd: REPO,
    stdio: 'pipe',
    encoding: 'utf8',
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', ...env },
  });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}
