import { describe, expect, it } from 'vitest';
import { comparePagesConfig } from '../../scripts/check-pages-config.ts';
import { deployment, resolveDeployment } from '../../src/config/site.ts';

/** The production configuration this repository ships (root deployment on the custom domain). */
const production = { origin: 'https://www.cowhill.dev', base: '/' };
/** The earlier repository-path preview, still supported through SITE_ORIGIN/SITE_BASE. */
const preview = { origin: 'https://www.patrickcowhill.com', base: '/cowhill-dev' };

describe('comparePagesConfig', () => {
  it('ships the root deployment on the custom domain as the committed configuration', () => {
    expect(resolveDeployment({})).toEqual(production);
    expect(deployment).toEqual(production);
  });
  it('accepts an exact match for root and repository-path deployments', () => {
    expect(comparePagesConfig(production, 'https://www.cowhill.dev', '')).toEqual({ ok: true });
    expect(comparePagesConfig(production, 'https://www.cowhill.dev', '/')).toEqual({ ok: true });
    expect(comparePagesConfig(preview, 'https://www.patrickcowhill.com', '/cowhill-dev')).toEqual({ ok: true });
  });
  it('accepts https configuration when GitHub reports http for the same host, with a note', () => {
    for (const [configured, base] of [[production, ''], [preview, '/cowhill-dev']] as const) {
      const result = comparePagesConfig(configured, configured.origin.replace('https:', 'http:'), base);
      expect(result.ok).toBe(true);
      expect(result.note).toMatch(/Enforce HTTPS/);
    }
  });
  it('rejects the root configuration while GitHub still serves the repository-path preview', () => {
    const stillPreview = comparePagesConfig(production, 'https://www.patrickcowhill.com', '/cowhill-dev');
    expect(stillPreview.ok).toBe(false);
    expect(stillPreview.reason).toMatch(/base path differs/);
    const domainNotSaved = comparePagesConfig(production, 'https://pcowhill.github.io', '/cowhill-dev');
    expect(domainNotSaved.ok).toBe(false);
    expect(domainNotSaved.reason).toMatch(/base path differs/);
    const apexOnly = comparePagesConfig(production, 'https://cowhill.dev', '');
    expect(apexOnly.ok).toBe(false);
    expect(apexOnly.reason).toMatch(/host differs/);
  });
  it('rejects the preview configuration once GitHub serves the custom domain', () => {
    const result = comparePagesConfig(preview, 'https://www.cowhill.dev', '');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/base path differs/);
  });
  it('rejects a different host, base path, or an http configuration', () => {
    expect(comparePagesConfig(preview, 'https://pcowhill.github.io', '/cowhill-dev').reason).toMatch(/host differs/);
    expect(comparePagesConfig(preview, 'https://www.patrickcowhill.com', '').reason).toMatch(/base path differs/);
    expect(comparePagesConfig({ origin: 'http://www.cowhill.dev', base: '/' }, 'https://www.cowhill.dev', '').reason).toMatch(/scheme differs/);
    expect(comparePagesConfig(production, '', '').ok).toBe(false);
  });
});
