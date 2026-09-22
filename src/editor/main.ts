/**
 * Standalone project editor. Bundled into project-editor.html by
 * scripts/build-editor.ts; runs from file:// with no network access.
 */
import { deployment, normalizeBase, normalizeOrigin } from '../config/site.ts';
import { escapeHtml as e } from '../shared/html.ts';
import { assetPublicPath, routes, type ParsedAssetPath } from '../shared/paths.ts';
import type { RenderContext } from '../shared/render/context.ts';
import { STATUS_INFO, isStatus } from '../shared/schema.ts';
import type { AssetReference, ValidationIssue, ValidationResult } from '../shared/validate.ts';
import { EditorModel, type ProjectSnapshot } from './model.ts';
import {
  applyEol,
  detectEol,
  directoryHasFile,
  downloadText,
  ensureWritePermission,
  getFileFromDirectory,
  pickDirectory,
  pickOpenFile,
  pickSaveFile,
  readSource,
  sourceFromDrop,
  supportsDirectoryPicker,
  supportsFileSystemAccess,
  writeHandle,
  type FileSource,
} from './files.ts';
import { renderProjectForm } from './form.ts';
import { previewProject, renderPreview, type PreviewKind } from './preview.ts';

type Tab = 'form' | 'yaml' | 'card' | 'list' | 'detail';

interface AssetEntry {
  status: 'loading' | 'ok' | 'missing';
  url?: string;
}

const state = {
  model: null as EditorModel | null,
  source: null as FileSource | null,
  /** Text as loaded or last written (LF-normalized), used for conflict detection. */
  lastKnownText: '',
  eol: '\n' as '\n' | '\r\n',
  dirty: false,
  /** Set when the last save was only a download, so the on-disk file is still stale. */
  downloadedCopy: false,
  selected: -1,
  validation: null as ValidationResult | null,
  yamlInvalid: false,
  yamlErrors: [] as ValidationIssue[],
  folder: null as FileSystemDirectoryHandle | null,
  assets: new Map<string, AssetEntry>(),
  tab: 'form' as Tab,
  previewWidth: 'wide' as 'wide' | 'narrow',
  loadedIds: new Map<string, { draft: boolean }>(),
  listFilter: '',
};

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
};

const ctx: RenderContext = {
  origin: normalizeOrigin(deployment.origin),
  base: normalizeBase(deployment.base),
  preview: true,
  resolveImage: (parsed: ParsedAssetPath, rawPath: string) => {
    const entry = state.assets.get(rawPath);
    if (entry?.status === 'ok' && entry.url) return entry.url;
    if (!entry && state.folder) void loadAsset(rawPath);
    return null;
  },
};

// ---------------------------------------------------------------------------
// Messages and status

function setStatus(text: string, tone: 'info' | 'ok' | 'warn' | 'error' = 'info'): void {
  const el = $('status-message');
  el.textContent = text;
  el.dataset.tone = tone;
}

function updateFileIndicator(): void {
  const name = $('file-name');
  const stateEl = $('file-state');
  if (!state.model) {
    name.textContent = 'No file open';
    stateEl.textContent = '';
    stateEl.dataset.state = 'none';
    return;
  }
  name.textContent = state.source ? state.source.name : 'Untitled (not saved to a file)';
  if (state.dirty) {
    stateEl.textContent = state.downloadedCopy ? '● Unsaved changes (a copy was downloaded; the original file is not updated)' : '● Unsaved changes';
    stateEl.dataset.state = 'dirty';
  } else {
    stateEl.textContent = state.source?.kind === 'handle' ? 'All changes saved' : 'Loaded';
    stateEl.dataset.state = 'clean';
  }
  document.title = `${state.dirty ? '● ' : ''}${state.source?.name ?? 'projects.yaml'} — cowhill.dev editor`;
}

function markDirty(): void {
  state.dirty = true;
  updateFileIndicator();
}

// ---------------------------------------------------------------------------
// Assets

async function loadAsset(rawPath: string): Promise<void> {
  if (!state.folder) return;
  state.assets.set(rawPath, { status: 'loading' });
  const file = await getFileFromDirectory(state.folder, rawPath);
  if (file) {
    state.assets.set(rawPath, { status: 'ok', url: URL.createObjectURL(file) });
  } else {
    state.assets.set(rawPath, { status: 'missing' });
  }
  revalidate();
  renderPreviews();
}

function checkAsset(ref: AssetReference): string | null {
  const entry = state.assets.get(ref.path);
  if (!entry) {
    void loadAsset(ref.path);
    return null;
  }
  if (entry.status === 'missing') return `"${ref.path}" was not found in the opened folder`;
  return null;
}

async function awaitPendingAssets(): Promise<void> {
  const validation = state.validation;
  if (!validation || !state.folder) return;
  for (const ref of validation.assets) {
    if (!state.assets.has(ref.path)) await loadAsset(ref.path);
  }
  let tries = 0;
  while (validation.assets.some((ref) => state.assets.get(ref.path)?.status === 'loading') && tries < 100) {
    await new Promise((r) => setTimeout(r, 50));
    tries += 1;
  }
}

// ---------------------------------------------------------------------------
// Validation and messages

function revalidate(): void {
  if (!state.model) {
    state.validation = null;
    renderMessages();
    return;
  }
  state.validation = state.model.validate(state.folder ? checkAsset : undefined);
  renderMessages();
  updateSaveButtons();
}

function renderMessages(): void {
  const box = $('messages');
  const parts: string[] = [];
  if (state.yamlInvalid) {
    parts.push(`<div class="msg msg--error"><h3>YAML cannot be parsed</h3><ul>${state.yamlErrors.map((i) => `<li>${e(i.path ? i.path + ': ' : '')}${e(i.message)}</li>`).join('')}</ul><p>The form shows the last valid state and is locked until the YAML is fixed. You can download the unvalidated text from the YAML tab.</p></div>`);
  }
  const v = state.validation;
  if (v) {
    if (v.errors.length) {
      parts.push(`<div class="msg msg--error"><h3>${v.errors.length} error${v.errors.length === 1 ? '' : 's'} (saving is blocked)</h3><ul>${v.errors.map((i) => `<li><button type="button" class="msg-link" data-goto="${e(i.path)}">${e(i.path || 'document')}</button>: ${e(i.message)}</li>`).join('')}</ul></div>`);
    } else {
      parts.push(`<div class="msg msg--ok"><p>No validation errors.</p></div>`);
    }
    if (v.warnings.length) {
      parts.push(`<div class="msg msg--warn"><h3>Warnings</h3><ul>${v.warnings.map((i) => `<li>${e(i.path)}: ${e(i.message)}</li>`).join('')}</ul></div>`);
    }
    if (v.assets.length) {
      if (state.folder) {
        const loading = v.assets.filter((a) => state.assets.get(a.path)?.status !== 'ok' && state.assets.get(a.path)?.status !== 'missing').length;
        parts.push(`<div class="msg msg--info"><p>${v.assets.length} local file reference${v.assets.length === 1 ? '' : 's'} checked against the opened folder${loading ? ` (${loading} still loading)` : ''}.</p></div>`);
      } else {
        parts.push(`<div class="msg msg--info"><p>${v.assets.length} local file reference${v.assets.length === 1 ? '' : 's'} <strong>unverified</strong>: open the repository folder to check that the files exist. The website build checks them authoritatively.</p></div>`);
      }
    }
    const drafts = v.projects.filter((p) => p.draft).length;
    parts.push(`<p class="msg-summary">${v.projects.length} project${v.projects.length === 1 ? '' : 's'}, ${drafts} draft${drafts === 1 ? '' : 's'}.</p>`);
  }
  box.innerHTML = parts.join('');
}

function updateSaveButtons(): void {
  const canSave = !!state.model && !state.yamlInvalid && !!state.validation && state.validation.ok;
  ($('btn-save') as HTMLButtonElement).disabled = !canSave;
  ($('btn-save-as') as HTMLButtonElement).disabled = !canSave;
  ($('btn-download') as HTMLButtonElement).disabled = !canSave;
  $('btn-save').title = canSave ? '' : 'Fix the errors listed under Messages before saving.';
}

// ---------------------------------------------------------------------------
// Project list

function snapshots(): ProjectSnapshot[] {
  return state.model ? state.model.snapshots() : [];
}

function renderList(): void {
  const list = $('project-list');
  const items = snapshots();
  const filter = state.listFilter.trim().toLowerCase();
  const errorsByIndex = new Set<number>();
  for (const issue of state.validation?.errors ?? []) {
    const m = /^projects\[(\d+)\]/.exec(issue.path);
    if (m) errorsByIndex.add(Number(m[1]));
  }
  list.innerHTML = items
    .filter((s) => !filter || s.id.toLowerCase().includes(filter) || s.title.toLowerCase().includes(filter))
    .map(
      (s) => `<li><button type="button" class="project-item${s.index === state.selected ? ' is-selected' : ''}" data-index="${s.index}" aria-current="${s.index === state.selected ? 'true' : 'false'}">
        <span class="project-item__title">${e(s.title || '(untitled)')}</span>
        <span class="project-item__meta"><code>${e(s.id || '—')}</code>${s.draft ? ' <span class="pill pill--draft">draft</span>' : ''}${isStatus(s.status) ? ` <span class="pill">${e(STATUS_INFO[s.status].label)}</span>` : ''}${errorsByIndex.has(s.index) ? ' <span class="pill pill--error">errors</span>' : ''}</span>
      </button></li>`,
    )
    .join('');
  $('project-count').textContent = `${items.length} project${items.length === 1 ? '' : 's'}`;
  const hasSelection = state.selected >= 0 && state.selected < items.length;
  for (const id of ['btn-duplicate', 'btn-remove', 'btn-up', 'btn-down']) {
    ($(id) as HTMLButtonElement).disabled = !hasSelection || !state.model || state.yamlInvalid;
  }
  ($('btn-add') as HTMLButtonElement).disabled = !state.model || state.yamlInvalid;
  if (hasSelection) {
    ($('btn-up') as HTMLButtonElement).disabled = state.selected === 0;
    ($('btn-down') as HTMLButtonElement).disabled = state.selected === items.length - 1;
  }
}

// ---------------------------------------------------------------------------
// Form

function renderForm(): void {
  const panel = $('panel-form');
  if (!state.model) {
    panel.innerHTML = '<p class="empty">Open projects.yaml to start editing.</p>';
    return;
  }
  const snapshot = snapshots()[state.selected];
  if (!snapshot) {
    panel.innerHTML = '<p class="empty">Select a project on the left, or add one.</p>';
    return;
  }
  panel.innerHTML = renderProjectForm(state.model, snapshot);
  panel.classList.toggle('is-locked', state.yamlInvalid);
  const lock = $('form-lock');
  lock.hidden = !state.yamlInvalid;
}

function pathFrom(el: HTMLElement): (string | number)[] {
  return (el.dataset.path ?? '').split('.').filter(Boolean).map((p) => (/^\d+$/.test(p) ? Number(p) : p));
}

function applyFieldChange(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): void {
  if (!state.model || state.yamlInvalid) return;
  const i = state.selected;
  const kind = el.dataset.kind;
  if (kind === 'text') {
    let value = (el as HTMLInputElement).value;
    if (el.dataset.singleLine === 'true') value = value.replace(/\r?\n/g, ' ');
    const optional = el.dataset.optional === 'true';
    state.model.setScalar([i, ...pathFrom(el)], optional && value.trim() === '' ? undefined : value);
    if (el.dataset.path === 'status') {
      const hint = document.getElementById('f-status-hint');
      if (hint) hint.textContent = isStatus(value) ? STATUS_INFO[value].meaning : 'Choose a status.';
    }
  } else if (kind === 'bool') {
    state.model.setScalar([i, ...pathFrom(el)], (el as HTMLInputElement).checked);
  } else if (kind === 'tags') {
    const values = (el as HTMLInputElement).value.split(',').map((t) => t.trim()).filter(Boolean);
    state.model.setStringList([i, 'tags'], values);
  } else if (kind === 'thumb') {
    const src = (document.getElementById('f-thumb-src') as HTMLInputElement).value.trim();
    const alt = (document.getElementById('f-thumb-alt') as HTMLInputElement).value;
    state.model.setMapping([i, 'thumbnail'], src === '' && alt.trim() === '' ? undefined : { src, alt });
  } else if (kind === 'link-kind') {
    const value = (el as HTMLSelectElement).value;
    state.model.setScalar([i, ...pathFrom(el)], value === 'link' ? undefined : value);
  } else if (kind === 'primary') {
    const value = (el as HTMLInputElement).value;
    state.model.setPrimaryLink(i, value === 'none' ? null : Number(value));
  } else {
    return;
  }
  markDirty();
  revalidate();
  renderList();
  renderPreviews();
  syncYamlFromModel();
}

function handleFormAction(button: HTMLElement): void {
  if (!state.model || state.yamlInvalid) return;
  const i = state.selected;
  const action = button.dataset.action;
  const item = Number(button.dataset.item ?? -1);
  const dir = (Number(button.dataset.dir ?? 0) as -1 | 1) || 1;
  switch (action) {
    case 'clear-thumbnail':
      state.model.setMapping([i, 'thumbnail'], undefined);
      break;
    case 'add-screenshot':
      state.model.addListItem(i, 'screenshots', { src: '', alt: '' });
      break;
    case 'remove-screenshot':
      state.model.removeListItem(i, 'screenshots', item);
      break;
    case 'move-screenshot':
      state.model.moveListItem(i, 'screenshots', item, dir);
      break;
    case 'add-link':
      state.model.addListItem(i, 'links', { label: '', url: '' });
      break;
    case 'remove-link':
      state.model.removeListItem(i, 'links', item);
      break;
    case 'move-link':
      state.model.moveListItem(i, 'links', item, dir);
      break;
    default:
      return;
  }
  markDirty();
  revalidate();
  renderList();
  renderForm();
  renderPreviews();
  syncYamlFromModel();
}

// ---------------------------------------------------------------------------
// YAML tab

let yamlTimer: number | undefined;

function syncYamlFromModel(): void {
  if (!state.model || state.yamlInvalid) return;
  const area = $('yaml-text') as HTMLTextAreaElement;
  const text = state.model.toText();
  if (area.value !== text) area.value = text;
}

function applyYamlText(): void {
  const area = $('yaml-text') as HTMLTextAreaElement;
  const text = area.value;
  const result = EditorModel.fromText(text);
  if (!result.model) {
    state.yamlInvalid = true;
    state.yamlErrors = result.errors;
    renderMessages();
    renderList();
    renderForm();
    updateSaveButtons();
    $('btn-download-raw').hidden = false;
    return;
  }
  state.yamlInvalid = false;
  state.yamlErrors = [];
  state.model = result.model;
  $('btn-download-raw').hidden = true;
  if (state.selected >= state.model.count) state.selected = state.model.count - 1;
  state.dirty = applyEol(text, '\n') !== state.lastKnownText || state.dirty;
  updateFileIndicator();
  revalidate();
  renderList();
  renderForm();
  renderPreviews();
}

// ---------------------------------------------------------------------------
// Previews

function renderPreviews(): void {
  const container = $('preview-content');
  if (!state.model) {
    container.innerHTML = '';
    return;
  }
  const kind = state.tab;
  if (kind !== 'card' && kind !== 'list' && kind !== 'detail') return;
  const snapshot = snapshots()[state.selected];
  if (!snapshot) {
    container.innerHTML = '<p class="empty">Select a project to preview.</p>';
    return;
  }
  const { project, valid } = previewProject(snapshot.raw, snapshot.index);
  container.innerHTML = `${valid ? '' : '<p class="preview-note">This record has validation errors; the preview uses placeholders where needed.</p>'}${renderPreview(kind as PreviewKind, ctx, project)}`;
  $('preview-frame').dataset.width = state.previewWidth;
}

function handlePreviewClick(event: MouseEvent): void {
  const link = (event.target as HTMLElement).closest('a');
  if (!link) return;
  event.preventDefault();
  const href = link.getAttribute('href') ?? '';
  const notice = $('preview-link-notice');
  const isExternal = /^https?:\/\//i.test(href) && link.target === '_blank';
  if (isExternal) {
    notice.innerHTML = `<span>Preview links are inactive. This link opens <code>${e(href)}</code> in a new tab on the website.</span> <button type="button" class="button" id="btn-test-link">Test destination in a new tab</button>`;
    $('btn-test-link').addEventListener('click', () => {
      window.open(href, '_blank', 'noopener,noreferrer');
    });
  } else if (/^https?:\/\//i.test(href)) {
    notice.innerHTML = `<span>Preview links are inactive. On the website this navigates to <code>${e(href)}</code>.</span>`;
  } else if (href.startsWith('blob:')) {
    notice.innerHTML = `<span>Preview links are inactive. This resource is a local file loaded from the opened folder.</span>`;
  } else {
    notice.innerHTML = `<span>Preview links are inactive. On the website this opens <code>${e(href)}</code> (a catalog page).</span>`;
  }
  notice.hidden = false;
}

// ---------------------------------------------------------------------------
// Tabs

function setTab(tab: Tab): void {
  state.tab = tab;
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-tab]'))) {
    const active = button.dataset.tab === tab;
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.tabIndex = active ? 0 : -1;
  }
  $('panel-form').hidden = tab !== 'form';
  $('panel-yaml').hidden = tab !== 'yaml';
  $('panel-preview').hidden = !(tab === 'card' || tab === 'list' || tab === 'detail');
  if (tab === 'yaml') syncYamlFromModel();
  renderPreviews();
}

// ---------------------------------------------------------------------------
// Loading and saving

async function loadSource(source: FileSource): Promise<void> {
  let text: string;
  try {
    text = await readSource(source);
  } catch (err) {
    setStatus(`Could not read ${source.name}: ${(err as Error).message}`, 'error');
    return;
  }
  const result = EditorModel.fromText(text);
  state.source = source;
  state.eol = detectEol(text);
  state.lastKnownText = applyEol(text, '\n');
  state.dirty = false;
  state.downloadedCopy = false;
  state.assets.clear();
  state.loadedIds.clear();
  if (!result.model) {
    state.model = null;
    state.yamlInvalid = true;
    state.yamlErrors = result.errors;
    ($('yaml-text') as HTMLTextAreaElement).value = text;
    $('btn-download-raw').hidden = false;
    setStatus(`${source.name} has YAML errors; fix them in the YAML tab.`, 'error');
    showWorkspace();
    setTab('yaml');
    renderMessages();
    renderList();
    renderForm();
    updateFileIndicator();
    updateSaveButtons();
    return;
  }
  state.model = result.model;
  state.yamlInvalid = false;
  state.yamlErrors = [];
  $('btn-download-raw').hidden = true;
  for (const s of state.model.snapshots()) if (s.id) state.loadedIds.set(s.id, { draft: s.draft });
  state.selected = state.model.count > 0 ? 0 : -1;
  ($('yaml-text') as HTMLTextAreaElement).value = text;
  showWorkspace();
  revalidate();
  renderList();
  renderForm();
  setTab('form');
  updateFileIndicator();
  const mode = source.kind === 'handle' ? 'Direct saving is available.' : 'This browser cannot write back to the file; use Download YAML and replace projects.yaml in the repository.';
  setStatus(`Opened ${source.name}. ${mode}`, 'ok');
}

function confirmDiscard(): boolean {
  if (!state.dirty) return true;
  return window.confirm('You have unsaved changes. Discard them?');
}

async function openWithPicker(): Promise<void> {
  if (!confirmDiscard()) return;
  if (supportsFileSystemAccess()) {
    try {
      const source = await pickOpenFile();
      if (source) await loadSource(source);
      return;
    } catch (err) {
      setStatus(`The file picker is not available here (${(err as Error).message}); using the basic file chooser instead.`, 'warn');
    }
  }
  ($('file-input') as HTMLInputElement).click();
}

function serializeForSave(): string {
  if (!state.model) throw new Error('nothing to save');
  return applyEol(state.model.toText(), state.eol);
}

async function save(): Promise<void> {
  if (!state.model) return;
  if (state.yamlInvalid) {
    setStatus('The YAML tab has errors. Fix them (or download the unvalidated text) before saving.', 'error');
    return;
  }
  await awaitPendingAssets();
  revalidate();
  if (!state.validation?.ok) {
    setStatus('Fix the validation errors before saving; the repository file must stay valid.', 'error');
    return;
  }
  if (state.source?.kind !== 'handle') {
    if (supportsFileSystemAccess()) return saveAs();
    return download();
  }
  const handle = state.source.handle;
  const permission = await ensureWritePermission(handle);
  if (permission === 'denied') {
    setStatus('Write permission was not granted. Your edits are still here; use Save As or Download YAML.', 'warn');
    return;
  }
  let current: string;
  try {
    current = applyEol(await readSource(state.source), '\n');
  } catch (err) {
    setStatus(`Could not re-read the file to check for outside changes: ${(err as Error).message}. Use Save As or Download YAML.`, 'error');
    return;
  }
  if (current !== state.lastKnownText) {
    const choice = await conflictDialog();
    if (choice === 'reload') {
      if (window.confirm('Reload the file from disk and discard your unsaved edits?')) {
        await loadSource(state.source);
      }
      return;
    }
    if (choice === 'download') {
      download();
      return;
    }
    return;
  }
  const text = serializeForSave();
  try {
    await writeHandle(handle, text);
  } catch (err) {
    setStatus(`Saving failed: ${(err as Error).message}. Your edits are still here; try Save As or Download YAML.`, 'error');
    return;
  }
  state.lastKnownText = applyEol(text, '\n');
  state.dirty = false;
  state.downloadedCopy = false;
  updateFileIndicator();
  setStatus(`Saved to ${state.source.name}. Commit and push the change to publish it.`, 'ok');
}

async function saveAs(): Promise<void> {
  if (!state.model) return;
  if (state.yamlInvalid || !state.validation?.ok) {
    setStatus('Fix the errors before saving.', 'error');
    return;
  }
  if (!supportsFileSystemAccess()) return download();
  let target: FileSource | null;
  try {
    target = await pickSaveFile(state.source?.name ?? 'projects.yaml');
  } catch (err) {
    setStatus(`Save As is not available here (${(err as Error).message}). Use Download YAML.`, 'warn');
    return;
  }
  if (!target || target.kind !== 'handle') return;
  const text = serializeForSave();
  try {
    await writeHandle(target.handle, text);
  } catch (err) {
    setStatus(`Saving failed: ${(err as Error).message}. Use Download YAML instead.`, 'error');
    return;
  }
  state.source = target;
  state.lastKnownText = applyEol(text, '\n');
  state.dirty = false;
  state.downloadedCopy = false;
  updateFileIndicator();
  setStatus(`Saved to ${target.name}. Make sure it is the repository's projects.yaml before committing.`, 'ok');
}

function download(): void {
  if (!state.model || state.yamlInvalid || !state.validation?.ok) {
    setStatus('Fix the errors before downloading a valid file.', 'error');
    return;
  }
  downloadText(serializeForSave(), state.source?.name ?? 'projects.yaml');
  state.downloadedCopy = state.dirty;
  updateFileIndicator();
  setStatus("Downloaded a copy. Replace the repository's projects.yaml with it (the browser may have renamed it), then commit and push.", 'warn');
}

function downloadRaw(): void {
  const text = ($('yaml-text') as HTMLTextAreaElement).value;
  downloadText(text, 'projects.unvalidated.yaml');
  setStatus('Downloaded the unvalidated YAML text as projects.unvalidated.yaml. It has not been checked; do not commit it as projects.yaml until it validates.', 'warn');
}

function conflictDialog(): Promise<'reload' | 'download' | 'cancel'> {
  const dialog = $('conflict-dialog') as HTMLDialogElement;
  return new Promise((resolve) => {
    const done = (value: 'reload' | 'download' | 'cancel') => {
      dialog.close();
      resolve(value);
    };
    $('conflict-reload').onclick = () => done('reload');
    $('conflict-download').onclick = () => done('download');
    $('conflict-cancel').onclick = () => done('cancel');
    dialog.oncancel = (ev) => {
      ev.preventDefault();
      done('cancel');
    };
    dialog.showModal();
  });
}

async function openFolder(): Promise<void> {
  if (!supportsDirectoryPicker()) {
    setStatus('This browser cannot open folders. Local image references stay unverified here; the website build checks them.', 'warn');
    return;
  }
  let handle: FileSystemDirectoryHandle | null;
  try {
    handle = await pickDirectory();
  } catch (err) {
    setStatus(`Could not open a folder: ${(err as Error).message}`, 'error');
    return;
  }
  if (!handle) return;
  state.folder = handle;
  state.assets.clear();
  $('folder-name').textContent = handle.name;
  $('btn-open-from-folder').hidden = false;
  const hasYaml = await directoryHasFile(handle, 'projects.yaml');
  setStatus(
    hasYaml
      ? `Opened folder "${handle.name}". Local files under project-assets/ can now be previewed and checked.`
      : `Opened folder "${handle.name}", but it does not contain projects.yaml. Choose the repository root so project-assets/ paths resolve correctly.`,
    hasYaml ? 'ok' : 'warn',
  );
  revalidate();
  renderPreviews();
}

async function openFromFolder(): Promise<void> {
  if (!state.folder) return;
  if (!confirmDiscard()) return;
  try {
    const handle = await state.folder.getFileHandle('projects.yaml');
    await loadSource({ kind: 'handle', name: handle.name, handle });
  } catch {
    setStatus('projects.yaml was not found in the opened folder.', 'error');
  }
}

// ---------------------------------------------------------------------------
// Project operations

function selectProject(index: number): void {
  state.selected = index;
  renderList();
  renderForm();
  renderPreviews();
}

function addProject(): void {
  if (!state.model || state.yamlInvalid) return;
  const id = state.model.uniqueId('new-project');
  const index = state.model.addProject({ id, title: 'New project', summary: '', tags: [], status: 'active', draft: true });
  markDirty();
  revalidate();
  selectProject(index);
  syncYamlFromModel();
  setStatus(`Added "${id}" as a draft. Give it a unique id and fill in the required fields.`, 'info');
  (document.getElementById('f-title') as HTMLInputElement | null)?.focus();
}

function duplicateProject(): void {
  if (!state.model || state.yamlInvalid || state.selected < 0) return;
  const index = state.model.duplicateProject(state.selected);
  if (index === null) return;
  markDirty();
  revalidate();
  selectProject(index);
  syncYamlFromModel();
  setStatus('Duplicated as a draft with a new id.', 'info');
}

function removeProject(): void {
  if (!state.model || state.yamlInvalid || state.selected < 0) return;
  const snapshot = snapshots()[state.selected];
  if (!snapshot) return;
  if (!window.confirm(`Remove "${snapshot.title || snapshot.id || 'this project'}" from the catalog? This cannot be undone after saving.`)) return;
  state.model.removeProject(state.selected);
  markDirty();
  revalidate();
  selectProject(Math.min(state.selected, state.model.count - 1));
  syncYamlFromModel();
}

function moveProject(direction: -1 | 1): void {
  if (!state.model || state.yamlInvalid || state.selected < 0) return;
  const next = state.model.moveProject(state.selected, direction);
  if (next === state.selected) return;
  markDirty();
  revalidate();
  selectProject(next);
  syncYamlFromModel();
}

// ---------------------------------------------------------------------------
// Wiring

function showWorkspace(): void {
  $('welcome').hidden = true;
  $('workspace').hidden = false;
}

function init(): void {
  const fsAccess = supportsFileSystemAccess();
  $('capability-note').textContent = fsAccess
    ? 'This browser supports saving directly back to the selected file.'
    : 'This browser cannot write back to files. You can still open, edit, preview, and download the YAML, then replace projects.yaml in the repository.';
  $('btn-open-folder').hidden = !supportsDirectoryPicker();
  $('site-config').textContent = `${ctx.origin}${ctx.base === '/' ? '' : ctx.base}`;

  $('btn-open').addEventListener('click', () => void openWithPicker());
  $('btn-open-welcome').addEventListener('click', () => void openWithPicker());
  $('btn-open-basic').addEventListener('click', () => {
    if (confirmDiscard()) ($('file-input') as HTMLInputElement).click();
  });
  ($('file-input') as HTMLInputElement).addEventListener('change', (ev) => {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void loadSource({ kind: 'file', name: file.name, file });
  });
  $('btn-open-folder').addEventListener('click', () => void openFolder());
  $('btn-open-from-folder').addEventListener('click', () => void openFromFolder());
  $('btn-save').addEventListener('click', () => void save());
  $('btn-save-as').addEventListener('click', () => void saveAs());
  $('btn-download').addEventListener('click', () => download());
  $('btn-download-raw').addEventListener('click', () => downloadRaw());
  $('btn-add').addEventListener('click', addProject);
  $('btn-duplicate').addEventListener('click', duplicateProject);
  $('btn-remove').addEventListener('click', removeProject);
  $('btn-up').addEventListener('click', () => moveProject(-1));
  $('btn-down').addEventListener('click', () => moveProject(1));
  ($('list-filter') as HTMLInputElement).addEventListener('input', (ev) => {
    state.listFilter = (ev.target as HTMLInputElement).value;
    renderList();
  });
  $('project-list').addEventListener('click', (ev) => {
    const button = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-index]');
    if (button) selectProject(Number(button.dataset.index));
  });
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-tab]'))) {
    button.addEventListener('click', () => setTab(button.dataset.tab as Tab));
  }
  $('tab-list').addEventListener('keydown', (ev) => {
    const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-tab]'));
    const current = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
      ev.preventDefault();
      const next = (current + (ev.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next]?.focus();
      setTab(tabs[next]?.dataset.tab as Tab);
    }
  });
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-width]'))) {
    button.addEventListener('click', () => {
      state.previewWidth = button.dataset.width as 'wide' | 'narrow';
      for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-width]'))) {
        b.setAttribute('aria-pressed', b === button ? 'true' : 'false');
      }
      renderPreviews();
    });
  }

  const form = $('panel-form');
  form.addEventListener('input', (ev) => {
    const el = ev.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (!el.dataset.kind || el.dataset.kind === 'primary' || el.dataset.kind === 'bool' || el.tagName === 'SELECT') return;
    applyFieldChange(el);
  });
  form.addEventListener('change', (ev) => {
    const el = ev.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (!el.dataset.kind) return;
    if (el.dataset.kind === 'primary' || el.dataset.kind === 'bool' || el.tagName === 'SELECT' || (el as HTMLInputElement).type === 'date') {
      applyFieldChange(el);
    }
  });
  let idBefore = '';
  form.addEventListener('focusin', (ev) => {
    const el = ev.target as HTMLInputElement;
    if (el.id === 'f-id') idBefore = el.value;
  });
  form.addEventListener('focusout', (ev) => {
    const el = ev.target as HTMLInputElement;
    if (el.id !== 'f-id' || el.value === idBefore) return;
    const loaded = state.loadedIds.get(idBefore);
    if (loaded && !loaded.draft) {
      const keep = window.confirm(
        `"${idBefore}" is a published project. Changing its id changes the page URL from ${routes.project(ctx.base, idBefore)} to ${routes.project(ctx.base, el.value)} and breaks existing links.\n\nKeep the new id?`,
      );
      if (!keep) {
        el.value = idBefore;
        applyFieldChange(el);
      }
    }
  });
  form.addEventListener('click', (ev) => {
    const button = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (button) handleFormAction(button);
  });
  $('messages').addEventListener('click', (ev) => {
    const button = (ev.target as HTMLElement).closest<HTMLElement>('[data-goto]');
    if (!button) return;
    const m = /^projects\[(\d+)\]/.exec(button.dataset.goto ?? '');
    if (m) {
      selectProject(Number(m[1]));
      setTab('form');
    }
  });

  const yaml = $('yaml-text') as HTMLTextAreaElement;
  yaml.addEventListener('input', () => {
    window.clearTimeout(yamlTimer);
    yamlTimer = window.setTimeout(applyYamlText, 300);
  });
  $('btn-yaml-revert').addEventListener('click', () => {
    if (!state.model) return;
    if (!window.confirm('Replace the YAML text with the last valid state? Your raw edits will be lost (download them first if needed).')) return;
    state.yamlInvalid = false;
    state.yamlErrors = [];
    $('btn-download-raw').hidden = true;
    syncYamlFromModel();
    revalidate();
    renderList();
    renderForm();
  });

  $('preview-content').addEventListener('click', (ev) => handlePreviewClick(ev as MouseEvent));

  const dropZone = document.body;
  dropZone.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    document.body.classList.add('is-dragging');
  });
  dropZone.addEventListener('dragleave', () => document.body.classList.remove('is-dragging'));
  dropZone.addEventListener('drop', (ev) => {
    ev.preventDefault();
    document.body.classList.remove('is-dragging');
    if (!confirmDiscard()) return;
    void sourceFromDrop(ev).then((source) => {
      if (source) void loadSource(source);
    });
  });

  window.addEventListener('beforeunload', (ev) => {
    if (state.dirty) {
      ev.preventDefault();
      ev.returnValue = '';
    }
  });
  window.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
      ev.preventDefault();
      void save();
    }
  });

  updateFileIndicator();
  updateSaveButtons();
  renderList();
}

// Exposed for browser tests (mocked handles) and debugging.
(window as unknown as { cowhillEditor: unknown }).cowhillEditor = {
  loadText: (text: string, name = 'projects.yaml') => loadSource({ kind: 'file', name, file: new File([text], name, { type: 'application/yaml' }) }),
  loadHandle: (handle: FileSystemFileHandle) => loadSource({ kind: 'handle', name: handle.name, handle }),
  getText: () => (state.model ? state.model.toText() : null),
  getState: () => ({ dirty: state.dirty, yamlInvalid: state.yamlInvalid, selected: state.selected, valid: state.validation?.ok ?? null, source: state.source?.kind ?? null, folder: !!state.folder }),
  save,
  assetPublicPath,
};

init();
