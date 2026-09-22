/** Renders the project form as HTML. Event handling lives in main.ts. */
import { escapeHtml as e } from '../shared/html.ts';
import { STATUSES, STATUS_INFO, LINK_KINDS } from '../shared/schema.ts';
import { countTags, normalizeTag } from '../shared/tags.ts';
import { renderCheatSheet } from './cheatsheet.ts';
import type { EditorModel, ProjectSnapshot } from './model.ts';

function str(value: unknown): string {
  return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
}

function textField(opts: { id: string; label: string; path: string; value: string; hint?: string; optional?: boolean; type?: string; placeholder?: string; pattern?: string }): string {
  return `<div class="f-field">
  <label for="${opts.id}">${e(opts.label)}${opts.optional ? '' : ' <span class="f-required" aria-hidden="true">*</span>'}</label>
  <input id="${opts.id}" type="${opts.type ?? 'text'}" data-kind="text" data-path="${e(opts.path)}" data-optional="${opts.optional ? 'true' : 'false'}" value="${e(opts.value)}"${opts.placeholder ? ` placeholder="${e(opts.placeholder)}"` : ''}${opts.pattern ? ` pattern="${opts.pattern}"` : ''} autocomplete="off" spellcheck="false">
  ${opts.hint ? `<p class="f-hint">${opts.hint}</p>` : ''}
</div>`;
}

/** The string entries of a project's authored tag list (invalid values are ignored). */
export function tagStrings(tags: unknown): string[] {
  return Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string') : [];
}

/**
 * Every tag used anywhere in the open document, most used first, as chips that
 * add the tag to (or remove it from) the selected project. Tags already on the
 * project are shown pressed. Re-rendered on its own when the tag field changes.
 */
export function renderTagSuggestions(model: EditorModel, index: number): string {
  const counts = countTags(model.snapshots().map((s) => ({ tags: tagStrings(s.raw.tags) })));
  const current = new Set(tagStrings(model.getField(index, 'tags')).map(normalizeTag));
  if (counts.length === 0) {
    return `<div class="f-tag-suggestions" id="f-tag-suggestions"><p class="f-hint">No tags are used in this file yet. Tags you add here will be offered to other projects.</p></div>`;
  }
  return `<div class="f-tag-suggestions" id="f-tag-suggestions">
  <p class="f-hint" id="f-tag-suggestions-label">Tags used in this file. Click one to add it to this project, or click again to remove it.</p>
  <ul class="tag-list" aria-labelledby="f-tag-suggestions-label">${counts
    .map(
      (tag) =>
        `<li><button type="button" class="tag" data-action="toggle-tag" data-tag="${e(tag.label)}" aria-pressed="${current.has(tag.key) ? 'true' : 'false'}">${e(tag.label)}<span class="f-tag-count" aria-label="used by ${tag.count} project${tag.count === 1 ? '' : 's'}">${tag.count}</span></button></li>`,
    )
    .join('')}</ul>
</div>`;
}

export interface FormOptions {
  /** Keep the Markdown cheat sheet expanded across re-renders. */
  cheatSheetOpen?: boolean;
}

export function renderProjectForm(model: EditorModel, snapshot: ProjectSnapshot, options: FormOptions = {}): string {
  const i = snapshot.index;
  const get = (field: Parameters<EditorModel['getField']>[1]) => model.getField(i, field);
  const tags = get('tags');
  const tagText = Array.isArray(tags) ? tags.map(str).join(', ') : str(tags);
  const status = str(get('status'));
  const thumbnail = (get('thumbnail') ?? {}) as Record<string, unknown>;
  const screenshots = Array.isArray(get('screenshots')) ? (get('screenshots') as Record<string, unknown>[]) : [];
  const links = Array.isArray(get('links')) ? (get('links') as Record<string, unknown>[]) : [];
  const primaryIndex = links.findIndex((l) => l && l.primary === true);

  return `<div class="f-form" data-index="${i}">
${
  snapshot.unknownFields.length
    ? `<div class="f-unknown" role="alert"><strong>Unsupported fields preserved:</strong> ${snapshot.unknownFields.map((f) => `<code>${e(f)}</code>`).join(', ')}. They are kept exactly as written but the website build rejects them; rename or remove them in the YAML tab.</div>`
    : ''
}
<fieldset class="f-group">
  <legend>Basics</legend>
  ${textField({ id: 'f-id', label: 'ID', path: 'id', value: str(get('id')), hint: 'Lowercase kebab-case. Becomes the page URL /projects/&lt;id&gt;/.', placeholder: 'my-project' })}
  ${textField({ id: 'f-title', label: 'Title', path: 'title', value: str(get('title')) })}
  <div class="f-field">
    <label for="f-summary">Summary <span class="f-required" aria-hidden="true">*</span></label>
    <textarea id="f-summary" rows="2" data-kind="text" data-path="summary" data-optional="false" data-single-line="true">${e(str(get('summary')))}</textarea>
    <p class="f-hint">One or two plain sentences shown on cards.</p>
  </div>
  <div class="f-row">
    <div class="f-field">
      <label for="f-status">Status <span class="f-required" aria-hidden="true">*</span></label>
      <select id="f-status" data-kind="text" data-path="status" data-optional="false">
        ${STATUSES.map((s) => `<option value="${s}"${s === status ? ' selected' : ''}>${STATUS_INFO[s].label}</option>`).join('')}
        ${status && !(STATUSES as readonly string[]).includes(status) ? `<option value="${e(status)}" selected>${e(status)} (invalid)</option>` : ''}
      </select>
      <p class="f-hint" id="f-status-hint">${e((STATUSES as readonly string[]).includes(status) ? STATUS_INFO[status as (typeof STATUSES)[number]].meaning : 'Choose a status.')}</p>
    </div>
    <div class="f-field">
      <label for="f-tags">Tags</label>
      <input id="f-tags" type="text" data-kind="tags" value="${e(tagText)}" placeholder="game, web, python" autocomplete="off">
      <p class="f-hint">Comma separated. Matching ignores case and surrounding spaces.</p>
    </div>
  </div>
  ${renderTagSuggestions(model, i)}
  <div class="f-row f-row--checks">
    <label class="f-check"><input type="checkbox" data-kind="bool" data-path="featured"${get('featured') === true ? ' checked' : ''}> Featured on the homepage <span class="f-hint-inline">(up to three, never archived)</span></label>
    <label class="f-check"><input type="checkbox" data-kind="bool" data-path="draft"${get('draft') === true ? ' checked' : ''}> Draft <span class="f-hint-inline">(excluded from the website; still visible in the public repository)</span></label>
  </div>
</fieldset>

<fieldset class="f-group">
  <legend>Dates</legend>
  <div class="f-row">
    ${textField({ id: 'f-added', label: 'Added', path: 'added', value: str(get('added')), optional: true, type: 'date', hint: 'When the project was added to this catalog.' })}
    ${textField({ id: 'f-updated', label: 'Updated', path: 'updated', value: str(get('updated')), optional: true, type: 'date', hint: 'Last meaningful project or catalog update. Never changed automatically.' })}
  </div>
</fieldset>

<fieldset class="f-group">
  <legend>Notice and description</legend>
  ${textField({ id: 'f-notice', label: 'Notice', path: 'notice', value: str(get('notice')), optional: true, placeholder: 'Desktop recommended', hint: 'A short plain-text qualification shown on cards and the detail page.' })}
  <div class="f-field">
    <label for="f-description">Description (Markdown)</label>
    <textarea id="f-description" rows="10" class="f-mono" data-kind="text" data-path="description" data-optional="true" spellcheck="true">${e(str(get('description')))}</textarea>
    <p class="f-hint">Paragraphs, headings, lists, links, code, tables and local images: <code>![alt](project-assets/&lt;id&gt;/file.png)</code>. Raw HTML and remote images are rejected.</p>
  </div>
  ${renderCheatSheet(snapshot.id, { open: options.cheatSheetOpen })}
</fieldset>

<fieldset class="f-group">
  <legend>Images</legend>
  <div class="f-subgroup">
    <h4>Thumbnail</h4>
    <div class="f-row">
      <div class="f-field">
        <label for="f-thumb-src">Image path</label>
        <input id="f-thumb-src" type="text" data-kind="thumb" data-part="src" value="${e(str(thumbnail.src))}" placeholder="project-assets/${e(snapshot.id || 'my-project')}/thumbnail.png" autocomplete="off" spellcheck="false">
      </div>
      <div class="f-field">
        <label for="f-thumb-alt">Alt text</label>
        <input id="f-thumb-alt" type="text" data-kind="thumb" data-part="alt" value="${e(str(thumbnail.alt))}" placeholder="Describe the image" autocomplete="off">
      </div>
      <div class="f-field f-field--button"><button type="button" class="button" data-action="clear-thumbnail">Clear</button></div>
    </div>
  </div>
  <div class="f-subgroup">
    <h4>Screenshots</h4>
    <ol class="f-items">
      ${screenshots
        .map(
          (shot, j) => `<li class="f-item">
        <div class="f-row">
          <div class="f-field"><label for="f-shot-${j}-src">Image path</label><input id="f-shot-${j}-src" type="text" data-kind="text" data-path="screenshots.${j}.src" data-optional="false" value="${e(str(shot?.src))}" spellcheck="false" autocomplete="off"></div>
          <div class="f-field"><label for="f-shot-${j}-alt">Alt text</label><input id="f-shot-${j}-alt" type="text" data-kind="text" data-path="screenshots.${j}.alt" data-optional="false" value="${e(str(shot?.alt))}" autocomplete="off"></div>
        </div>
        <div class="f-row">
          <div class="f-field"><label for="f-shot-${j}-caption">Caption</label><input id="f-shot-${j}-caption" type="text" data-kind="text" data-path="screenshots.${j}.caption" data-optional="true" value="${e(str(shot?.caption))}" autocomplete="off"></div>
          <div class="f-item-tools">
            <button type="button" class="button" data-action="move-screenshot" data-item="${j}" data-dir="-1" aria-label="Move screenshot ${j + 1} up"${j === 0 ? ' disabled' : ''}>↑</button>
            <button type="button" class="button" data-action="move-screenshot" data-item="${j}" data-dir="1" aria-label="Move screenshot ${j + 1} down"${j === screenshots.length - 1 ? ' disabled' : ''}>↓</button>
            <button type="button" class="button button--danger" data-action="remove-screenshot" data-item="${j}">Remove</button>
          </div>
        </div>
      </li>`,
        )
        .join('')}
    </ol>
    <button type="button" class="button" data-action="add-screenshot">Add screenshot</button>
  </div>
</fieldset>

<fieldset class="f-group">
  <legend>Resources (links)</legend>
  <p class="f-hint">Any label works: Play, Open tool, View source, Watch demo, Read PDF, Download release… The primary resource becomes the card's main button; without one the card shows "View details".</p>
  <ol class="f-items">
    ${links
      .map(
        (link, j) => `<li class="f-item">
      <div class="f-row">
        <div class="f-field"><label for="f-link-${j}-label">Label</label><input id="f-link-${j}-label" type="text" data-kind="text" data-path="links.${j}.label" data-optional="false" value="${e(str(link?.label))}" autocomplete="off"></div>
        <div class="f-field f-field--wide"><label for="f-link-${j}-url">URL or local path</label><input id="f-link-${j}-url" type="text" data-kind="text" data-path="links.${j}.url" data-optional="false" value="${e(str(link?.url))}" placeholder="https://… or project-assets/${e(snapshot.id || 'my-project')}/file.pdf" spellcheck="false" autocomplete="off"></div>
      </div>
      <div class="f-row">
        <div class="f-field"><label for="f-link-${j}-kind">Kind</label><select id="f-link-${j}-kind" data-kind="link-kind" data-path="links.${j}.kind">${LINK_KINDS.map((k) => `<option value="${k}"${(str(link?.kind) || 'link') === k ? ' selected' : ''}>${k === 'link' ? 'Link (opens in a new tab when external)' : 'Download'}</option>`).join('')}</select></div>
        <label class="f-check f-check--inline"><input type="radio" name="primary" data-kind="primary" value="${j}"${primaryIndex === j ? ' checked' : ''}> Primary action</label>
        <div class="f-item-tools">
          <button type="button" class="button" data-action="move-link" data-item="${j}" data-dir="-1" aria-label="Move resource ${j + 1} up"${j === 0 ? ' disabled' : ''}>↑</button>
          <button type="button" class="button" data-action="move-link" data-item="${j}" data-dir="1" aria-label="Move resource ${j + 1} down"${j === links.length - 1 ? ' disabled' : ''}>↓</button>
          <button type="button" class="button button--danger" data-action="remove-link" data-item="${j}">Remove</button>
        </div>
      </div>
    </li>`,
      )
      .join('')}
  </ol>
  <div class="f-row">
    <button type="button" class="button" data-action="add-link">Add resource</button>
    ${links.length ? `<label class="f-check f-check--inline"><input type="radio" name="primary" data-kind="primary" value="none"${primaryIndex === -1 ? ' checked' : ''}> No primary action (card shows "View details")</label>` : ''}
  </div>
</fieldset>
</div>`;
}
