import { describe, expect, it } from 'vitest';
import { absoluteUrl, assetPublicPath, parseAssetPath, routes, withBase, IMAGE_EXTENSIONS } from '../../src/shared/paths.ts';
import { normalizeBase, normalizeOrigin, resolveDeployment } from '../../src/config/site.ts';

describe('base handling', () => {
  it('normalizes base values', () => {
    expect(normalizeBase('')).toBe('/');
    expect(normalizeBase('/')).toBe('/');
    expect(normalizeBase('cowhill-dev')).toBe('/cowhill-dev');
    expect(normalizeBase('/cowhill-dev/')).toBe('/cowhill-dev');
    expect(normalizeOrigin('https://www.cowhill.dev/')).toBe('https://www.cowhill.dev');
  });
  it('joins paths for root and repository bases', () => {
    expect(withBase('/', '')).toBe('/');
    expect(withBase('/', 'projects/')).toBe('/projects/');
    expect(withBase('/repo', '')).toBe('/repo/');
    expect(withBase('/repo', 'projects/x/')).toBe('/repo/projects/x/');
    expect(routes.project('/repo', 'my-id')).toBe('/repo/projects/my-id/');
    expect(routes.tag('/', 'c++')).toBe('/projects/?tags=c%2B%2B');
    expect(absoluteUrl('https://a.b', '/repo', 'about/')).toBe('https://a.b/repo/about/');
  });
  it('resolves deployment from the environment', () => {
    expect(resolveDeployment({ SITE_ORIGIN: 'http://localhost:4321/', SITE_BASE: '' })).toEqual({ origin: 'http://localhost:4321', base: '/' });
    expect(resolveDeployment({})).toEqual({ origin: 'https://www.cowhill.dev', base: '/' });
    expect(resolveDeployment({ SITE_ORIGIN: 'https://www.patrickcowhill.com', SITE_BASE: '/cowhill-dev/' })).toEqual({ origin: 'https://www.patrickcowhill.com', base: '/cowhill-dev' });
    expect(resolveDeployment({ SITE_BASE: '/cowhill-dev' })).toEqual({ origin: 'https://www.cowhill.dev', base: '/cowhill-dev' });
  });
});

describe('asset paths', () => {
  it('parses valid paths and produces public URLs', () => {
    const parsed = parseAssetPath('project-assets/my-project/img/shot.PNG', IMAGE_EXTENSIONS);
    expect(parsed.ok).toBe(true);
    expect(parsed.parsed).toEqual({ projectId: 'my-project', relative: 'img/shot.PNG', extension: 'png' });
    expect(assetPublicPath('/repo', parsed.parsed!)).toBe('/repo/assets/projects/my-project/img/shot.PNG');
    expect(assetPublicPath('/', parsed.parsed!)).toBe('/assets/projects/my-project/img/shot.PNG');
  });
  it('rejects unsafe paths with specific messages', () => {
    expect(parseAssetPath('project-assets/x/../y.png').error).toMatch(/"\.\."/);
    expect(parseAssetPath('/abs/x.png').error).toMatch(/absolute/);
    expect(parseAssetPath('project-assets\\x\\y.png').error).toMatch(/forward slashes/);
    expect(parseAssetPath('https://x/y.png').error).toMatch(/URL scheme/);
    expect(parseAssetPath('public/brand/x.svg').error).toMatch(/must start with "project-assets\/"/);
    expect(parseAssetPath('project-assets/x/y.html').error).toMatch(/not supported/);
    expect(parseAssetPath(' project-assets/x/y.png').error).toMatch(/whitespace/);
  });
});
