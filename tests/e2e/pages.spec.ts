import { test, expect } from '@playwright/test';
import { serve } from './helpers.ts';

for (const variant of ['root', 'repo'] as const) {
  test.describe(`site pages (${variant} base)`, () => {
    let site: Awaited<ReturnType<typeof serve>>;
    test.beforeAll(async () => {
      site = await serve(variant);
    });
    test.afterAll(async () => {
      await site.server.close();
    });

    test('homepage shows the intro, one featured section and working navigation', async ({ page }) => {
      await page.goto(site.url('/'));
      await expect(page.locator('h1')).toHaveText('Software from the hill.');
      await expect(page.locator('.hero__art img')).toHaveAttribute('src', `${site.prefix}/brand/cowhill-logo-stacked.svg`);
      await expect(page.locator('.site-logo img')).toHaveAttribute('src', `${site.prefix}/brand/cowhill-logo-horizontal.svg`);
      const featured = page.locator('[aria-labelledby="featured-heading"] .project-card');
      await expect(featured).toHaveCount(3);
      await expect(page.locator('[aria-labelledby="recent-heading"] .project-card')).toHaveCount(3);
      await expect(page.locator('[aria-labelledby="featured-heading"] [data-id="sentinel-archived"]')).toHaveCount(0);
      const logoResponse = await page.request.get(site.url('/brand/cowhill-logo-horizontal.svg'));
      expect(logoResponse.status()).toBe(200);
      const favicon = await page.request.get(site.url('/generated/favicon.svg'));
      expect(favicon.status()).toBe(200);
      await page.fill('#home-search', 'beta');
      await page.press('#home-search', 'Enter');
      await expect(page).toHaveURL(new RegExp(`${site.prefix}/projects/\\?q=beta$`));
      await expect(page.locator('#catalog-search')).toHaveValue('beta');
    });

    test('navigation links and portfolio derive from the catalog', async ({ page }) => {
      await page.goto(site.url('/about/'));
      await expect(page.locator('.site-nav a[aria-current="page"]')).toHaveText('About');
      await expect(page.locator('.about a')).toHaveAttribute('href', 'https://www.patrickcowhill.com/');
      await expect(page.locator('.about a')).toHaveAttribute('target', '_blank');
      await page.click('.site-nav a:text("Projects")');
      await expect(page).toHaveURL(new RegExp(`${site.prefix}/projects/$`));
      await page.click('.site-logo');
      await expect(page).toHaveURL(new RegExp(`${site.prefix}/$`));
    });

    test('detail pages load directly, refresh, and show all resources with correct behavior', async ({ page }) => {
      await page.goto(site.url('/projects/sentinel-published/'));
      await expect(page.locator('h1')).toHaveText('SENTINEL_PUBLISHED Alpha');
      await page.reload();
      await expect(page.locator('h1')).toHaveText('SENTINEL_PUBLISHED Alpha');
      await expect(page.locator('.status-badge')).toHaveText('Active');
      await expect(page.locator('.notice')).toContainText('Desktop recommended');
      await expect(page.locator('.resource-list__item')).toHaveCount(5);
      const pdf = page.locator('.resource-list a:has-text("Read PDF")');
      await expect(pdf).toHaveAttribute('href', `${site.prefix}/assets/projects/sentinel-published/notes.pdf`);
      await expect(pdf).toHaveAttribute('target', '_blank');
      const dl = page.locator('.resource-list a:has-text("Download notes")');
      await expect(dl).toHaveAttribute('download', 'notes.pdf');
      await expect(dl.locator('svg.link-icon--download')).toHaveCount(1);
      await expect(dl.locator('.sr-only')).toHaveText(/download/);
      const release = page.locator('.resource-list a:has-text("Download release")');
      await expect(release).not.toHaveAttribute('download', /.*/);
      await expect(release).not.toHaveAttribute('target', /.*/);
      const shot = page.locator('.screenshot img').first();
      await expect(shot).toHaveAttribute('src', `${site.prefix}/assets/projects/sentinel-published/shot-1.png`);
      const shotResponse = await page.request.get(site.url('/assets/projects/sentinel-published/shot-1.png'));
      expect(shotResponse.status()).toBe(200);
      await expect(page.locator('.prose img')).toHaveAttribute('src', `${site.prefix}/assets/projects/sentinel-published/inline.png`);
      await expect(page.locator('.prose h3').first()).toHaveText('Background');
      const sameSite = page.locator('.prose a:has-text("same-site link")');
      if (variant === 'repo') await expect(sameSite).not.toHaveAttribute('target', /.*/);
      else await expect(sameSite).toHaveAttribute('target', '_blank');
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${variant === 'repo' ? 'https://www.patrickcowhill.com/cowhill-dev' : 'https://www.cowhill.dev'}/projects/sentinel-published/`);
    });

    test('sparse detail page hides empty sections', async ({ page }) => {
      await page.goto(site.url('/projects/sentinel-undated/'));
      await expect(page.locator('h1')).toHaveText('SENTINEL_UNDATED Zeta');
      await expect(page.locator('#resources-heading')).toHaveCount(0);
      await expect(page.locator('#screenshots-heading')).toHaveCount(0);
      await expect(page.locator('.tag-list')).toHaveCount(0);
      await expect(page.locator('.project-detail__meta time')).toHaveCount(0);
    });

    test('unknown routes get the branded 404 with base-aware links', async ({ page }) => {
      const response = await page.goto(site.url('/projects/sentinel-draft/'));
      expect(response?.status()).toBe(404);
      await expect(page.locator('h1')).toHaveText('Page not found');
      await page.click('.not-found a:text("Browse projects")');
      await expect(page).toHaveURL(new RegExp(`${site.prefix}/projects/$`));
      const draftAsset = await page.request.get(site.url('/assets/projects/sentinel-draft/DRAFTONLY-secret.png'));
      expect(draftAsset.status()).toBe(404);
    });

    test('accessibility basics: skip link, landmarks, labels and focus', async ({ page }) => {
      await page.goto(site.url('/projects/'));
      await page.keyboard.press('Tab');
      await expect(page.locator('.skip-link')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('#main')).toBeFocused();
      await expect(page.locator('main')).toHaveCount(1);
      await expect(page.locator('header')).toHaveCount(1);
      await expect(page.locator('nav[aria-label="Main"]')).toHaveCount(1);
      await expect(page.locator('label[for="catalog-search"]')).toHaveCount(1);
      await expect(page.locator('img:not([alt])')).toHaveCount(0);
    });

    test('mobile layout has no horizontal overflow', async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: 375, height: 700 } });
      const page = await context.newPage();
      for (const path of ['/', '/projects/', '/projects/sentinel-published/']) {
        await page.goto(site.url(path));
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, path).toBeLessThanOrEqual(0);
      }
      await context.close();
    });
  });
}
