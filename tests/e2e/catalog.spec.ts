import { test, expect, type Page } from '@playwright/test';
import { serve } from './helpers.ts';

let site: Awaited<ReturnType<typeof serve>>;
test.beforeAll(async () => {
  site = await serve('repo');
});
test.afterAll(async () => {
  await site.server.close();
});

async function visibleIds(page: Page): Promise<string[]> {
  return page.locator('#catalog-results .project-card:visible').evaluateAll((cards) => cards.map((c) => (c as HTMLElement).dataset.id ?? ''));
}

test('renders every published project without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(site.url('/projects/'));
  const ids = await page.locator('#catalog-results .project-card').evaluateAll((cards) => cards.map((c) => (c as HTMLElement).dataset.id));
  expect(ids).toHaveLength(8);
  expect(ids).not.toContain('sentinel-draft');
  await expect(page.locator('#catalog-apply')).toBeVisible();
  await expect(page.locator('.view-toggle')).toBeHidden();
  await context.close();
});

test('search, tag, status and sort filters update results, counts and the URL', async ({ page }) => {
  await page.goto(site.url('/projects/'));
  await expect(page.locator('#catalog-count')).toHaveText('8 projects');
  await expect(page.locator('#catalog-apply')).toBeHidden();

  await page.fill('#catalog-search', 'sentinel_description');
  await expect(page.locator('#catalog-count')).toHaveText('1 of 8 projects');
  expect(await visibleIds(page)).toEqual(['sentinel-published']);
  await expect(page).toHaveURL(/\?q=sentinel_description$/);

  await page.fill('#catalog-search', '');
  await expect(page.locator('#catalog-count')).toHaveText('8 projects');
  await expect(page).toHaveURL(/\/projects\/$/);

  await page.check('input[name="tags"][value="game"]');
  expect(await visibleIds(page)).toEqual(['sentinel-published', 'sentinel-archived']);
  await page.check('input[name="tags"][value="retro"]');
  expect(await visibleIds(page)).toEqual(['sentinel-archived']);
  await expect(page).toHaveURL(/tags=game%2Cretro/);

  await page.uncheck('input[name="tags"][value="game"]');
  await page.uncheck('input[name="tags"][value="retro"]');
  await page.uncheck('input[name="status"][value="archived"]');
  expect(await visibleIds(page)).not.toContain('sentinel-archived');
  await expect(page).toHaveURL(/status=active%2Cmaintained%2Cpaused%2Ccomplete/);
  await page.check('input[name="status"][value="archived"]');
  await expect(page).not.toHaveURL(/status=/);

  await page.selectOption('#catalog-sort', 'title');
  const byTitle = await visibleIds(page);
  expect(byTitle[0]).toBe('sentinel-archived');
  await expect(page).toHaveURL(/sort=title/);
  await page.selectOption('#catalog-sort', 'updated');
  const byUpdated = await visibleIds(page);
  expect(byUpdated[0]).toBe('sentinel-recent');
  expect(byUpdated[byUpdated.length - 1]).toBe('sentinel-undated');
  await page.selectOption('#catalog-sort', 'added');
  expect((await visibleIds(page))[0]).toBe('sentinel-recent');
});

test('no-results state and reset', async ({ page }) => {
  await page.goto(site.url('/projects/'));
  await page.fill('#catalog-search', 'zzzz-nothing');
  await expect(page.locator('#catalog-empty')).toBeVisible();
  await expect(page.locator('#catalog-count')).toHaveText('0 of 8 projects');
  await page.click('#catalog-empty [data-reset]');
  await expect(page.locator('#catalog-empty')).toBeHidden();
  await expect(page.locator('#catalog-search')).toHaveValue('');
  await expect(page).toHaveURL(/\/projects\/$/);
});

test('grid and list views toggle and persist in the URL', async ({ page }) => {
  await page.goto(site.url('/projects/'));
  await page.click('.view-toggle [data-view="list"]');
  await expect(page.locator('#catalog-results')).toHaveClass(/catalog--list/);
  await expect(page).toHaveURL(/view=list/);
  await page.reload();
  await expect(page.locator('#catalog-results')).toHaveClass(/catalog--list/);
  await expect(page.locator('.view-toggle [data-view="list"]')).toHaveAttribute('aria-pressed', 'true');
  await page.click('.view-toggle [data-view="grid"]');
  await expect(page.locator('#catalog-results')).toHaveClass(/catalog--grid/);
});

test('shareable URLs restore state and Back/Forward works without per-keystroke entries', async ({ page }) => {
  await page.goto(site.url('/projects/?q=beta&tags=web&status=maintained,active&sort=title&view=list'));
  await expect(page.locator('#catalog-search')).toHaveValue('beta');
  await expect(page.locator('input[name="tags"][value="web"]')).toBeChecked();
  await expect(page.locator('input[name="status"][value="archived"]')).not.toBeChecked();
  await expect(page.locator('#catalog-sort')).toHaveValue('title');
  expect(await visibleIds(page)).toEqual(['sentinel-maintained']);

  await page.goto(site.url('/projects/'));
  const before = await page.evaluate(() => history.length);
  await page.type('#catalog-search', 'gamma', { delay: 20 });
  await expect(page.locator('#catalog-count')).toHaveText('1 of 8 projects');
  const afterTyping = await page.evaluate(() => history.length);
  expect(afterTyping).toBe(before);
  await page.press('#catalog-search', 'Enter');
  await expect(page).toHaveURL(/q=gamma/);
  await page.check('input[name="tags"][value="experiment"]');
  await expect(page).toHaveURL(/tags=experiment/);
  await page.goBack();
  await expect(page).toHaveURL(/q=gamma$/);
  await expect(page.locator('input[name="tags"][value="experiment"]')).not.toBeChecked();
  expect(await visibleIds(page)).toEqual(['sentinel-recent']);
  await page.goForward();
  await expect(page.locator('input[name="tags"][value="experiment"]')).toBeChecked();
});

test('tag chips on cards and detail pages open the filtered catalog', async ({ page }) => {
  await page.goto(site.url('/projects/'));
  await page.click('.project-card[data-id="sentinel-published"] a.tag[data-tag="web"]');
  await expect(page).toHaveURL(/\/projects\/\?tags=web$/);
  expect(await visibleIds(page)).toEqual(['sentinel-recent', 'sentinel-published', 'sentinel-maintained']);
  await page.goto(site.url('/projects/sentinel-archived/'));
  await page.click('.project-detail a.tag[data-tag="retro"]');
  await expect(page).toHaveURL(/\/projects\/\?tags=retro$/);
  expect(await visibleIds(page)).toEqual(['sentinel-archived']);
});

test('detail page back link keeps the last catalog state', async ({ page }) => {
  await page.goto(site.url('/projects/?tags=tool&view=list'));
  await page.click('.project-card[data-id="sentinel-complete"] .project-card__title a');
  await expect(page).toHaveURL(/\/projects\/sentinel-complete\/$/);
  await expect(page.locator('#back-to-catalog')).toHaveAttribute('href', /\/projects\/\?tags=tool&view=list$/);
  await page.click('#back-to-catalog');
  await expect(page.locator('input[name="tags"][value="tool"]')).toBeChecked();
});

test('card actions: primary launches directly, otherwise View details', async ({ page }) => {
  await page.goto(site.url('/projects/'));
  const primary = page.locator('.project-card[data-id="sentinel-published"] .project-card__actions a.button--primary');
  await expect(primary).toHaveAttribute('href', 'https://example.org/app');
  await expect(primary).toHaveAttribute('target', '_blank');
  await expect(primary).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(primary.locator('svg.link-icon--external')).toHaveCount(1);
  await expect(primary.locator('.sr-only')).toHaveText(/opens in a new tab/);
  const details = page.locator('.project-card[data-id="sentinel-complete"] .project-card__actions a.button--primary');
  await expect(details).toHaveText(/View details/);
  await expect(details).toHaveAttribute('href', `${site.prefix}/projects/sentinel-complete/`);
  await expect(details.locator('svg')).toHaveCount(0);
  await expect(page.locator('.project-card a a')).toHaveCount(0);
});
