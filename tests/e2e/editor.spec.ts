/**
 * Editor tests run against the committed project-editor.html over file://
 * with every non-file request blocked. Tests marked "(mocked handle)" inject
 * a fake File System Access handle; real OS pickers and direct overwrites are
 * covered by the manual checklist in docs/editor-manual-checklist.md.
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const EDITOR = 'file://' + path.join(process.cwd(), 'project-editor.html');
const ROUNDTRIP = path.join(process.cwd(), 'tests', 'fixtures', 'roundtrip.yaml');
const ROUNDTRIP_TEXT = fs.readFileSync(ROUNDTRIP, 'utf8');

type EditorApi = {
  getText: () => string | null;
  getState: () => { dirty: boolean; yamlInvalid: boolean; selected: number; valid: boolean | null; source: string | null };
  loadText: (text: string, name?: string) => Promise<void>;
};
const api = (page: Page) => page.evaluate(() => (window as unknown as { cowhillEditor: EditorApi }).cowhillEditor.getState());
const text = (page: Page) => page.evaluate(() => (window as unknown as { cowhillEditor: EditorApi }).cowhillEditor.getText());

let attempted: string[] = [];
test.beforeEach(async ({ context, page }) => {
  attempted = [];
  await context.route(/^(?!file:).*/, (route) => {
    attempted.push(route.request().url());
    void route.abort();
  });
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto(EDITOR);
  (page as unknown as { __errors: string[] }).__errors = errors;
});
test.afterEach(async ({ page }) => {
  expect(attempted, 'no network requests are allowed').toEqual([]);
  expect((page as unknown as { __errors: string[] }).__errors).toEqual([]);
});

test('opens over file:// with no CDN or fetch dependency and explains the workflow', async ({ page }) => {
  await expect(page.locator('#welcome-title')).toBeVisible();
  await expect(page.locator('#btn-open-welcome')).toBeVisible();
  await expect(page.locator('.ed-help')).toContainText('Commit and push');
  await expect(page.locator('#site-config')).toHaveText('https://www.cowhill.dev');
  await expect(page.locator('#btn-save')).toBeDisabled();
  const html = fs.readFileSync(path.join(process.cwd(), 'project-editor.html'), 'utf8');
  expect(html).not.toMatch(/<script[^>]+src=/);
  expect(html).not.toMatch(/<link[^>]+href="https?:/);
  expect(html).not.toContain('schemaVersion: 1\nprojects:');
});

test('file-input fallback opens, edits update previews, and Download YAML preserves comments', async ({ page }) => {
  await page.setInputFiles('#file-input', ROUNDTRIP);
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('#project-count')).toHaveText('2 projects');
  await expect(page.locator('#file-state')).toHaveText('Loaded');
  expect((await api(page)).source).toBe('file');

  await page.fill('#f-title', 'Edited title');
  await expect(page.locator('#file-state')).toContainText('Unsaved changes');
  await page.click('[data-tab="card"]');
  await expect(page.locator('#preview-content .project-card__title')).toHaveText('Edited title');
  await expect(page.locator('#preview-content .draft-badge')).toHaveCount(0);
  await page.click('[data-tab="form"]');
  await page.check('[data-path="draft"]');
  await page.click('[data-tab="list"]');
  await expect(page.locator('#preview-content .catalog--list .draft-badge')).toHaveText('Draft — not published');
  await page.click('[data-tab="detail"]');
  await expect(page.locator('#preview-content .project-detail__title')).toHaveText('Edited title');
  await expect(page.locator('#preview-content .resource-link[target="_blank"] .link-icon--external')).toHaveCount(2);

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btn-download')]);
  expect(download.suggestedFilename()).toBe('roundtrip.yaml');
  const saved = fs.readFileSync(await download.path(), 'utf8');
  expect(saved).toContain('title: "Edited title"');
  expect(saved).toContain('draft: true');
  expect(saved).toContain('# Header comment line one');
  expect(saved).toContain('# comment inside links');
  await expect(page.locator('#file-state')).toContainText('a copy was downloaded; the original file is not updated');
  await expect(page.locator('#status-message')).toContainText(/replace the repository's projects.yaml/i);
});

test('preview links never navigate the editor; testing a destination is explicit', async ({ page }) => {
  await page.setInputFiles('#file-input', ROUNDTRIP);
  await page.click('[data-tab="card"]');
  await page.click('#preview-content .project-card__actions a.button--primary');
  await expect(page).toHaveURL(EDITOR);
  await expect(page.locator('#preview-link-notice')).toContainText('https://example.org/play');
  await expect(page.locator('#btn-test-link')).toBeVisible();
  await page.click('#preview-content .project-card__title a');
  await expect(page).toHaveURL(EDITOR);
  await expect(page.locator('#preview-link-notice')).toContainText('/projects/first/');
});

test('the Markdown cheat sheet is a collapsed legend that stays open across project switches', async ({ page }) => {
  await page.setInputFiles('#file-input', ROUNDTRIP);
  const sheet = page.locator('#f-md-cheatsheet');
  await expect(sheet).toHaveClass(/legend/);
  await expect(sheet.locator('summary')).toHaveText('Markdown cheat sheet');
  await expect(sheet.locator('dl').first()).toBeHidden();
  await sheet.locator('summary').click();
  await expect(sheet.locator('dt code').first()).toBeVisible();
  await expect(sheet).toContainText('# Section');
  await expect(sheet).toContainText('- First item');
  await expect(sheet).toContainText('[Link text](https://example.com/)');
  await expect(sheet).toContainText('![Alt text](project-assets/first/figure.png)');
  await expect(sheet).toContainText('```python');
  await expect(sheet).toContainText('| Feature | Status |');
  await expect(sheet).toContainText('$E = mc^2$');
  await expect(sheet).toContainText('math is not rendered');
  await page.click('.project-item[data-index="1"]');
  await expect(page.locator('#f-md-cheatsheet')).toHaveAttribute('open', '');
  await expect(page.locator('#f-md-cheatsheet')).toContainText('project-assets/second/figure.png');
});

test('tags used in the file are offered as chips that add or remove the tag', async ({ page }) => {
  await page.setInputFiles('#file-input', ROUNDTRIP);
  const chips = page.locator('#f-tag-suggestions [data-action="toggle-tag"]');
  await expect(chips).toHaveText(['alpha1', 'beta1']);
  await expect(chips.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await page.click('.project-item[data-index="1"]');
  await expect(page.locator('#f-tags')).toHaveValue('');
  await expect(chips.nth(0)).toHaveAttribute('aria-pressed', 'false');
  await chips.nth(0).click();
  await expect(page.locator('#f-tags')).toHaveValue('alpha');
  await expect(page.locator('#f-tag-suggestions [data-tag="alpha"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#f-tag-suggestions [data-tag="alpha"]')).toBeFocused();
  await expect(page.locator('#f-tag-suggestions [data-tag="alpha"] .f-tag-count')).toHaveText('2');
  await page.click('#f-tag-suggestions [data-tag="beta"]');
  await expect(page.locator('#f-tags')).toHaveValue('alpha, beta');
  await expect(page.locator('#file-state')).toContainText('Unsaved changes');
  expect(await text(page)).toContain('tags: [alpha, beta]\n    status: complete');
  // Clicking a pressed chip removes the tag; typing a new tag makes it available to other projects.
  await page.click('#f-tag-suggestions [data-tag="alpha"]');
  await expect(page.locator('#f-tags')).toHaveValue('beta');
  await page.fill('#f-tags', 'beta, Gamma');
  await expect(page.locator('#f-tag-suggestions [data-tag="Gamma"]')).toHaveAttribute('aria-pressed', 'true');
  await page.click('.project-item[data-index="0"]');
  await expect(page.locator('#f-tag-suggestions [data-tag="Gamma"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#f-tags')).toHaveValue('alpha, beta');
});

test('the detail preview uses the shared two-column layout when the frame is wide', async ({ browser }) => {
  // The preview frame, not the window, decides the layout: give it a wide desktop window.
  const context = await browser.newContext({ viewport: { width: 1800, height: 1000 } });
  await context.route(/^(?!file:).*/, (route) => void route.abort());
  const page = await context.newPage();
  await page.goto(EDITOR);
  await page.setInputFiles('#file-input', ROUNDTRIP);
  await page.click('[data-action="add-screenshot"]');
  await page.fill('#f-shot-0-src', 'project-assets/first/shot.png');
  await page.fill('#f-shot-0-alt', 'A shot');
  await page.click('[data-tab="detail"]');
  const article = page.locator('#preview-content .project-detail');
  await expect(article).toHaveClass(/project-detail--with-media/);
  const prose = await page.locator('#preview-content .prose').boundingBox();
  const media = await page.locator('#preview-content .project-detail__media').boundingBox();
  expect(media!.x).toBeGreaterThan(prose!.x + prose!.width);
  await page.click('[data-width="narrow"]');
  await expect(page.locator('#preview-frame')).toHaveCSS('width', '375px');
  const proseNarrow = await page.locator('#preview-content .prose').boundingBox();
  const mediaNarrow = await page.locator('#preview-content .project-detail__media').boundingBox();
  expect(mediaNarrow!.y).toBeGreaterThan(proseNarrow!.y + proseNarrow!.height - 1);
  await context.close();
});

test('invalid YAML locks the form, keeps raw text, offers recovery and reverts', async ({ page }) => {
  await page.setInputFiles('#file-input', ROUNDTRIP);
  await page.click('[data-tab="yaml"]');
  const yaml = page.locator('#yaml-text');
  await expect(yaml).toHaveValue(ROUNDTRIP_TEXT);
  await yaml.fill(ROUNDTRIP_TEXT + '\n  - id: broken\n    title: [unclosed\n');
  await expect(page.locator('#messages')).toContainText('YAML cannot be parsed');
  await expect(page.locator('#btn-save')).toBeDisabled();
  await expect(page.locator('#btn-download-raw')).toBeVisible();
  expect((await api(page)).yamlInvalid).toBe(true);
  await expect(yaml).toHaveValue(/unclosed/);
  await page.click('[data-tab="form"]');
  await expect(page.locator('#form-lock')).toBeVisible();
  await expect(page.locator('#f-title')).toHaveValue('Quoted: title with colon');
  await page.click('[data-tab="yaml"]');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btn-download-raw')]);
  expect(download.suggestedFilename()).toBe('projects.unvalidated.yaml');
  expect(fs.readFileSync(await download.path(), 'utf8')).toContain('[unclosed');
  page.once('dialog', (d) => d.accept());
  await page.click('#btn-yaml-revert');
  await expect(yaml).toHaveValue(ROUNDTRIP_TEXT);
  expect((await api(page)).yamlInvalid).toBe(false);
  await expect(page.locator('#form-lock')).toBeHidden();
});

test('validation errors block saving, unknown fields are preserved and reported', async ({ page }) => {
  await page.setInputFiles('#file-input', ROUNDTRIP);
  await page.click('[data-tab="yaml"]');
  await page.locator('#yaml-text').fill(ROUNDTRIP_TEXT.replace('status: complete', 'status: complete\n    mystery: kept # keep'));
  await expect(page.locator('#messages')).toContainText('unknown field "mystery"');
  await expect(page.locator('#btn-save')).toBeDisabled();
  await page.click('[data-tab="form"]');
  await page.click('.project-item[data-index="1"]');
  await expect(page.locator('.f-unknown')).toContainText('mystery');
  expect(await text(page)).toContain('mystery: kept # keep');
  await page.click('[data-tab="form"]');
  await page.click('.project-item[data-index="0"]');
  await page.fill('#f-id', 'first');
  await page.click('.project-item[data-index="1"]');
  await page.fill('#f-id', 'first');
  await expect(page.locator('#messages')).toContainText('duplicate id "first"');
  await expect(page.locator('#btn-save')).toBeDisabled();
});

test('add, duplicate, reorder and remove projects; new records start as drafts', async ({ page }) => {
  await page.setInputFiles('#file-input', ROUNDTRIP);
  await page.click('#btn-add');
  await expect(page.locator('#project-count')).toHaveText('3 projects');
  await expect(page.locator('.project-item.is-selected')).toContainText('draft');
  await expect(page.locator('[data-path="draft"]')).toBeChecked();
  await page.fill('#f-summary', 'Added summary');
  await page.click('.project-item[data-index="0"]');
  await page.click('#btn-duplicate');
  await expect(page.locator('#project-count')).toHaveText('4 projects');
  await expect(page.locator('#f-id')).toHaveValue('first-copy');
  await expect(page.locator('[data-path="draft"]')).toBeChecked();
  await page.click('#btn-down');
  const order = await page.locator('.project-item code').allTextContents();
  expect(order).toEqual(['first', 'second', 'first-copy', 'new-project']);
  page.once('dialog', (d) => d.accept());
  await page.click('#btn-remove');
  await expect(page.locator('#project-count')).toHaveText('3 projects');
  const out = await text(page);
  expect(out).toContain('# Header comment line one');
  expect(out).toContain('summary: Added summary');
  expect(out).not.toContain('first-copy');
});

test('changing a published project id warns; drafts do not', async ({ page }) => {
  await page.setInputFiles('#file-input', ROUNDTRIP);
  let message = '';
  page.once('dialog', (d) => {
    message = d.message();
    void d.dismiss();
  });
  await page.fill('#f-id', 'renamed');
  await page.locator('#f-title').focus();
  await expect.poll(() => message).toContain('changes the page URL');
  await expect(page.locator('#f-id')).toHaveValue('first');
});

test('Save with a mocked File System Access handle writes the file and detects outside edits (mocked handle)', async ({ page }) => {
  await page.evaluate((initial) => {
    const store = { text: initial, writes: [] as string[] };
    const handle = {
      kind: 'file',
      name: 'projects.yaml',
      getFile: async () => new File([store.text], 'projects.yaml'),
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      createWritable: async () => ({
        write: async (data: string) => {
          store.writes.push(data);
        },
        close: async () => {
          store.text = store.writes[store.writes.length - 1] ?? store.text;
        },
      }),
    };
    (window as unknown as { __store: typeof store }).__store = store;
    return (window as unknown as { cowhillEditor: { loadHandle: (h: unknown) => Promise<void> } }).cowhillEditor.loadHandle(handle);
  }, ROUNDTRIP_TEXT);
  await expect(page.locator('#file-state')).toHaveText('All changes saved');
  expect((await api(page)).source).toBe('handle');
  await page.fill('#f-title', 'Saved title');
  await page.click('#btn-save');
  await expect(page.locator('#status-message')).toContainText('Saved to projects.yaml');
  await expect(page.locator('#file-state')).toHaveText('All changes saved');
  const stored = await page.evaluate(() => (window as unknown as { __store: { text: string } }).__store.text);
  expect(stored).toContain('title: "Saved title"');
  expect(stored).toContain('# comment inside links');

  // Simulate an outside edit, then try to save again.
  await page.evaluate(() => {
    const store = (window as unknown as { __store: { text: string } }).__store;
    store.text = store.text.replace('Second summary', 'Changed elsewhere');
  });
  await page.fill('#f-title', 'Another edit');
  await page.click('#btn-save');
  await expect(page.locator('#conflict-dialog')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#conflict-download')]);
  expect(fs.readFileSync(await download.path(), 'utf8')).toContain('Another edit');
  const untouched = await page.evaluate(() => (window as unknown as { __store: { text: string } }).__store.text);
  expect(untouched).toContain('Changed elsewhere');
  expect(untouched).not.toContain('Another edit');
  expect((await api(page)).dirty).toBe(true);
});

test('warns before leaving with unsaved changes', async ({ page }) => {
  await page.setInputFiles('#file-input', ROUNDTRIP);
  await page.fill('#f-title', 'Unsaved');
  let prompted = false;
  page.once('dialog', (d) => {
    prompted = d.type() === 'beforeunload';
    void d.dismiss();
  });
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => prompted).toBe(true);
});
