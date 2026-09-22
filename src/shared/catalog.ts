/**
 * Catalog logic: sorting, filtering, search, URL state and homepage selection.
 * Runs on the build side and in the browser.
 */
import { STATUSES, activityDate, isStatus, type Project, type Status } from './schema.ts';
import { normalizeTag } from './tags.ts';

export const SORT_KEYS = ['updated', 'added', 'title'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export const SORT_LABELS: Record<SortKey, string> = {
  updated: 'Recently updated',
  added: 'Recently added',
  title: 'Title (A to Z)',
};

export const VIEWS = ['grid', 'list'] as const;
export type View = (typeof VIEWS)[number];

export interface CatalogState {
  q: string;
  /** Normalized tag keys; a project must carry every selected tag (AND). */
  tags: string[];
  /** Statuses to show. Empty means all statuses (the default, which includes archived). */
  statuses: Status[];
  sort: SortKey;
  view: View;
}

export const DEFAULT_STATE: CatalogState = { q: '', tags: [], statuses: [], sort: 'updated', view: 'grid' };

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/** Minimal shape needed for sorting and filtering (works for Project and search entries). */
export interface CatalogEntry {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  status: Status;
  added?: string;
  updated?: string;
  index: number;
  /** Plain-text description for search. */
  text?: string;
}

function compareDateDesc(a: string | undefined, b: string | undefined): number {
  if (a === b) return 0;
  if (a === undefined) return 1; // undated after dated
  if (b === undefined) return -1;
  return a < b ? 1 : -1;
}

export function compareEntries(sort: SortKey): (a: CatalogEntry, b: CatalogEntry) => number {
  return (a, b) => {
    let result = 0;
    if (sort === 'updated') result = compareDateDesc(activityDate(a), activityDate(b));
    else if (sort === 'added') result = compareDateDesc(a.added, b.added);
    if (result !== 0) return result;
    result = collator.compare(a.title, b.title);
    if (result !== 0) return result;
    return a.index - b.index;
  };
}

export function sortEntries<T extends CatalogEntry>(entries: T[], sort: SortKey): T[] {
  return [...entries].sort(compareEntries(sort));
}

export function searchTokens(q: string): string[] {
  return q.toLocaleLowerCase('en').split(/\s+/).filter(Boolean);
}

/** Every search token must appear somewhere in title, summary, description or tags. */
export function matchesSearch(entry: CatalogEntry, q: string): boolean {
  const tokens = searchTokens(q);
  if (tokens.length === 0) return true;
  const haystack = [entry.title, entry.summary, entry.text ?? '', entry.tags.join(' ')].join('\n').toLocaleLowerCase('en');
  return tokens.every((token) => haystack.includes(token));
}

export function matchesTags(entry: CatalogEntry, tags: string[]): boolean {
  if (tags.length === 0) return true;
  const own = new Set(entry.tags.map(normalizeTag));
  return tags.every((tag) => own.has(normalizeTag(tag)));
}

export function matchesStatus(entry: CatalogEntry, statuses: Status[]): boolean {
  return statuses.length === 0 || statuses.includes(entry.status);
}

export function filterEntries<T extends CatalogEntry>(entries: T[], state: CatalogState): T[] {
  return sortEntries(
    entries.filter((e) => matchesSearch(e, state.q) && matchesTags(e, state.tags) && matchesStatus(e, state.statuses)),
    state.sort,
  );
}

/** Parses a query string (with or without the leading "?") into catalog state. */
export function parseCatalogState(search: string): CatalogState {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const q = (params.get('q') ?? '').trim();
  const tags = uniqueNormalized((params.get('tags') ?? '').split(',').map((t) => t.trim()).filter(Boolean));
  const statuses = uniqueStatuses((params.get('status') ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  const sortParam = params.get('sort');
  const sort = (SORT_KEYS as readonly string[]).includes(sortParam ?? '') ? (sortParam as SortKey) : DEFAULT_STATE.sort;
  const viewParam = params.get('view');
  const view = (VIEWS as readonly string[]).includes(viewParam ?? '') ? (viewParam as View) : DEFAULT_STATE.view;
  return { q, tags, statuses: statuses.length === STATUSES.length ? [] : statuses, sort, view };
}

function uniqueNormalized(tags: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const key = normalizeTag(tag);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

function uniqueStatuses(values: string[]): Status[] {
  const out: Status[] = [];
  for (const value of values) {
    const lower = value.toLowerCase();
    if (isStatus(lower) && !out.includes(lower)) out.push(lower);
  }
  return out;
}

/** Serializes state to a query string ("" when everything is default). */
export function serializeCatalogState(state: CatalogState): string {
  const params = new URLSearchParams();
  if (state.q.trim()) params.set('q', state.q.trim());
  if (state.tags.length) params.set('tags', state.tags.join(','));
  if (state.statuses.length && state.statuses.length !== STATUSES.length) {
    params.set('status', STATUSES.filter((s) => state.statuses.includes(s)).join(','));
  }
  if (state.sort !== DEFAULT_STATE.sort) params.set('sort', state.sort);
  if (state.view !== DEFAULT_STATE.view) params.set('view', state.view);
  const text = params.toString();
  return text ? `?${text}` : '';
}

export function isDefaultState(state: CatalogState): boolean {
  return serializeCatalogState(state) === '';
}

export interface HomepageSelection {
  featured: Project[];
  recent: Project[];
}

/**
 * Homepage highlights. Archived projects are never highlighted even when
 * flagged featured; drafts never reach this function. Recent entries exclude
 * anything already featured and require a date.
 */
export function selectHomepage(published: Project[], limits = { featured: 3, recent: 4 }): HomepageSelection {
  const eligible = published.filter((p) => p.status !== 'archived');
  const featured = eligible.filter((p) => p.featured).slice(0, limits.featured);
  const featuredIds = new Set(featured.map((p) => p.id));
  const recent = sortEntries(
    eligible.filter((p) => !featuredIds.has(p.id) && activityDate(p) !== undefined),
    'updated',
  ).slice(0, limits.recent);
  return { featured, recent };
}
