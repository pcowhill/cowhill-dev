/**
 * Browser behavior for the catalog page: search, filters, sorting, grid/list
 * view, shareable query parameters and Back/Forward restoration. The page is
 * fully rendered before this runs, so every project stays reachable without it.
 */
import {
  DEFAULT_STATE,
  filterEntries,
  parseCatalogState,
  serializeCatalogState,
  type CatalogEntry,
  type CatalogState,
} from '../shared/catalog.ts';
import { STATUSES, type Status } from '../shared/schema.ts';

export const CATALOG_STATE_KEY = 'cowhill:catalog-search';

export function initCatalog(): void {
  document.documentElement.classList.add('js');
  const dataEl = document.getElementById('catalog-data');
  const results = document.getElementById('catalog-results');
  const form = document.getElementById('catalog-controls') as HTMLFormElement | null;
  if (!dataEl || !results || !form) return;

  const entries = JSON.parse(dataEl.textContent || '[]') as CatalogEntry[];
  const cards = new Map<string, HTMLElement>();
  for (const card of Array.from(results.querySelectorAll<HTMLElement>('.project-card'))) {
    const id = card.dataset.id;
    if (id) cards.set(id, card);
  }

  const searchInput = form.querySelector<HTMLInputElement>('#catalog-search');
  const sortSelect = form.querySelector<HTMLSelectElement>('#catalog-sort');
  const statusBoxes = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="status"]'));
  const tagBoxes = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="tags"]'));
  const countEl = document.getElementById('catalog-count');
  const emptyEl = document.getElementById('catalog-empty');
  const viewButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.view-toggle [data-view]'));
  const applyButton = document.getElementById('catalog-apply');
  if (applyButton) applyButton.hidden = true; // filtering is live once JavaScript runs

  const availableStatuses = new Set(statusBoxes.map((b) => b.value as Status));
  let state: CatalogState = parseCatalogState(location.search);

  function normalizeState(next: CatalogState): CatalogState {
    // Statuses that exist on the page decide whether the selection is "all".
    const present = STATUSES.filter((s) => availableStatuses.size === 0 || availableStatuses.has(s));
    const statuses = next.statuses.filter((s) => present.includes(s));
    const all = present.length === 0 || statuses.length === 0 || present.every((s) => statuses.includes(s));
    return { ...next, statuses: all ? [] : statuses };
  }

  function syncControls(): void {
    if (searchInput && searchInput.value !== state.q) searchInput.value = state.q;
    if (sortSelect) sortSelect.value = state.sort;
    for (const box of statusBoxes) box.checked = state.statuses.length === 0 || state.statuses.includes(box.value as Status);
    for (const box of tagBoxes) box.checked = state.tags.includes(box.value);
    for (const button of viewButtons) button.setAttribute('aria-pressed', button.dataset.view === state.view ? 'true' : 'false');
  }

  function readControls(): CatalogState {
    const checkedStatuses = statusBoxes.filter((b) => b.checked).map((b) => b.value as Status);
    return normalizeState({
      q: searchInput?.value ?? '',
      tags: tagBoxes.filter((b) => b.checked).map((b) => b.value),
      statuses: statusBoxes.length === 0 ? [] : checkedStatuses.length === statusBoxes.length ? [] : checkedStatuses,
      sort: (sortSelect?.value as CatalogState['sort']) ?? DEFAULT_STATE.sort,
      view: state.view,
    });
  }

  function render(): void {
    const visible = filterEntries(entries, state);
    const visibleIds = new Set(visible.map((e) => e.id));
    for (const [id, card] of cards) card.hidden = !visibleIds.has(id);
    // Reorder DOM nodes to match the sort without re-rendering them.
    for (const entry of visible) {
      const card = cards.get(entry.id);
      if (card) results!.appendChild(card);
    }
    results!.classList.toggle('catalog--grid', state.view === 'grid');
    results!.classList.toggle('catalog--list', state.view === 'list');
    if (countEl) {
      const total = entries.length;
      const filtered = visible.length !== total;
      countEl.textContent = filtered
        ? `${visible.length} of ${total} project${total === 1 ? '' : 's'}`
        : `${total} project${total === 1 ? '' : 's'}`;
    }
    if (emptyEl) emptyEl.hidden = visible.length !== 0;
    for (const card of cards.values()) {
      for (const tagLink of Array.from(card.querySelectorAll<HTMLAnchorElement>('.tag[data-tag]'))) {
        tagLink.setAttribute('aria-pressed', state.tags.includes(tagLink.dataset.tag ?? '') ? 'true' : 'false');
      }
    }
    try {
      sessionStorage.setItem(CATALOG_STATE_KEY, serializeCatalogState(state));
    } catch {
      /* storage may be unavailable */
    }
  }

  function commit(next: CatalogState, mode: 'push' | 'replace'): void {
    state = normalizeState(next);
    syncControls();
    render();
    const search = serializeCatalogState(state);
    const url = `${location.pathname}${search}${location.hash}`;
    const current = `${location.pathname}${location.search}${location.hash}`;
    if (url === current) return;
    if (mode === 'push') history.pushState({ catalog: search }, '', url);
    else history.replaceState({ catalog: search }, '', url);
  }

  // Typing updates results immediately but only replaces the current history entry.
  let typingTimer: number | undefined;
  searchInput?.addEventListener('input', () => {
    window.clearTimeout(typingTimer);
    typingTimer = window.setTimeout(() => commit(readControls(), 'replace'), 120);
  });
  // A committed search (Enter, blur after typing) becomes a history entry.
  searchInput?.addEventListener('change', () => {
    window.clearTimeout(typingTimer);
    commit(readControls(), 'push');
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    window.clearTimeout(typingTimer);
    commit(readControls(), 'push');
  });
  for (const box of [...statusBoxes, ...tagBoxes]) {
    box.addEventListener('change', () => commit(readControls(), 'push'));
  }
  sortSelect?.addEventListener('change', () => commit(readControls(), 'push'));
  for (const button of viewButtons) {
    button.addEventListener('click', () => commit({ ...state, view: (button.dataset.view as CatalogState['view']) ?? 'grid' }, 'push'));
  }
  for (const reset of Array.from(document.querySelectorAll<HTMLElement>('#catalog-reset, [data-reset]'))) {
    reset.addEventListener('click', () => commit({ ...DEFAULT_STATE, view: state.view }, 'push'));
  }
  // Tag chips on cards toggle that tag instead of reloading the page.
  results.addEventListener('click', (event) => {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a.tag[data-tag]');
    if (!link) return;
    event.preventDefault();
    const tag = link.dataset.tag ?? '';
    const tags = state.tags.includes(tag) ? state.tags.filter((t) => t !== tag) : [...state.tags, tag];
    commit({ ...state, tags }, 'push');
  });
  window.addEventListener('popstate', () => {
    state = normalizeState(parseCatalogState(location.search));
    syncControls();
    render();
  });

  state = normalizeState(state);
  syncControls();
  render();
}
