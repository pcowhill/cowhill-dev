import { describe, expect, it } from 'vitest';
import { comparePagesConfig } from '../../scripts/check-pages-config.ts';

const configured = { origin: 'https://www.patrickcowhill.com', base: '/cowhill-dev' };

describe('comparePagesConfig', () => {
  it('accepts an exact match', () => {
    expect(comparePagesConfig(configured, 'https://www.patrickcowhill.com', '/cowhill-dev')).toEqual({ ok: true });
    expect(comparePagesConfig({ origin: 'https://www.cowhill.dev', base: '/' }, 'https://www.cowhill.dev', '')).toEqual({ ok: true });
  });
  it('accepts https configuration when GitHub reports http for the same host, with a note', () => {
    const result = comparePagesConfig(configured, 'http://www.patrickcowhill.com', '/cowhill-dev');
    expect(result.ok).toBe(true);
    expect(result.note).toMatch(/Enforce HTTPS/);
  });
  it('rejects a different host, base path, or an http configuration', () => {
    expect(comparePagesConfig(configured, 'https://pcowhill.github.io', '/cowhill-dev').reason).toMatch(/host differs/);
    expect(comparePagesConfig(configured, 'https://www.patrickcowhill.com', '').reason).toMatch(/base path differs/);
    expect(comparePagesConfig({ origin: 'http://www.patrickcowhill.com', base: '/cowhill-dev' }, 'https://www.patrickcowhill.com', '/cowhill-dev').reason).toMatch(/scheme differs/);
  });
});
