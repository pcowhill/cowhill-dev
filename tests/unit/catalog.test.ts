import { describe, expect, it } from 'vitest';
import { filterEntries, matchesSearch, parseCatalogState, serializeCatalogState, sortEntries, selectHomepage, DEFAULT_STATE, type CatalogEntry } from '../../src/shared/catalog.ts';
import { toProject, type Project } from '../../src/shared/schema.ts';
import { countTags, normalizeTag } from '../../src/shared/tags.ts';

function entry(id: string, extra: Partial<CatalogEntry> = {}): CatalogEntry {
  return { id, title: id, summary: '', tags: [], status: 'active', index: 0, ...extra };
}
function project(id: string, extra: Record<string, unknown> = {}, index = 0): Project {
  return toProject({ id, title: id, summary: '', tags: [], status: 'active', ...extra } as never, index);
}

describe('sorting', () => {
  const entries = [
    entry('b-old', { title: 'B', added: '2024-01-01', updated: '2024-02-01', index: 0 }),
    entry('undated', { title: 'A undated', index: 1 }),
    entry('c-new', { title: 'C', added: '2025-01-01', index: 2 }),
    entry('a-same', { title: 'A same', added: '2025-01-01', index: 3 }),
    entry('z-same', { title: 'a same', added: '2025-01-01', index: 4 }),
  ];
  it('recently updated uses updated then added, undated last, title then file order as tie-breakers', () => {
    expect(sortEntries(entries, 'updated').map((e) => e.id)).toEqual(['a-same', 'z-same', 'c-new', 'b-old', 'undated']);
  });
  it('recently added ignores updated', () => {
    expect(sortEntries(entries, 'added').map((e) => e.id)).toEqual(['a-same', 'z-same', 'c-new', 'b-old', 'undated']);
    const other = [entry('x', { added: '2020-01-01', updated: '2030-01-01', index: 0 }), entry('y', { added: '2021-01-01', index: 1 })];
    expect(sortEntries(other, 'added').map((e) => e.id)).toEqual(['y', 'x']);
    expect(sortEntries(other, 'updated').map((e) => e.id)).toEqual(['x', 'y']);
  });
  it('title sorts case-insensitively with numeric awareness', () => {
    const list = [entry('p10', { title: 'Project 10' }), entry('p2', { title: 'project 2' }), entry('b', { title: 'banana' }), entry('A', { title: 'Apple' })];
    expect(sortEntries(list, 'title').map((e) => e.id)).toEqual(['A', 'b', 'p2', 'p10']);
  });
});

describe('search and filters', () => {
  const list = [
    entry('alpha', { title: 'Alpha Game', summary: 'A puzzle', tags: ['Game', 'web'], text: 'built with TypeScript', status: 'active' }),
    entry('beta', { title: 'Beta', summary: 'Tool for budgets', tags: ['tool'], status: 'archived' }),
    entry('gamma', { title: 'Gamma', summary: '', tags: ['game', 'tool'], status: 'complete' }),
  ];
  it('matches case-insensitively across title, summary, description and tags with AND tokens', () => {
    expect(matchesSearch(list[0]!, 'ALPHA')).toBe(true);
    expect(matchesSearch(list[0]!, 'typescript puzzle')).toBe(true);
    expect(matchesSearch(list[0]!, 'typescript budgets')).toBe(false);
    expect(matchesSearch(list[1]!, 'tool')).toBe(true);
    expect(matchesSearch(list[1]!, '')).toBe(true);
  });
  it('requires every selected tag (AND) and normalizes case', () => {
    expect(filterEntries(list, { ...DEFAULT_STATE, tags: ['game'] }).map((e) => e.id)).toEqual(['alpha', 'gamma']);
    expect(filterEntries(list, { ...DEFAULT_STATE, tags: ['game', 'tool'] }).map((e) => e.id)).toEqual(['gamma']);
    expect(filterEntries(list, { ...DEFAULT_STATE, tags: ['GAME', 'web'] }).map((e) => e.id)).toEqual(['alpha']);
  });
  it('includes archived by default and can exclude it', () => {
    expect(filterEntries(list, DEFAULT_STATE).map((e) => e.id)).toContain('beta');
    expect(filterEntries(list, { ...DEFAULT_STATE, statuses: ['active', 'complete'] }).map((e) => e.id)).toEqual(['alpha', 'gamma']);
  });
});

describe('query parameters', () => {
  it('round-trips state and omits defaults', () => {
    const state = { q: 'hello world', tags: ['game', 'Web'], statuses: ['active', 'archived'] as const, sort: 'title' as const, view: 'list' as const };
    const search = serializeCatalogState({ ...state, statuses: [...state.statuses] });
    expect(search).toBe('?q=hello+world&tags=game%2CWeb&status=active%2Carchived&sort=title&view=list');
    const parsed = parseCatalogState(search);
    expect(parsed).toEqual({ q: 'hello world', tags: ['game', 'web'], statuses: ['active', 'archived'], sort: 'title', view: 'list' });
    expect(serializeCatalogState(DEFAULT_STATE)).toBe('');
  });
  it('ignores invalid values and treats all statuses as default', () => {
    const parsed = parseCatalogState('?sort=bogus&view=nope&status=active,maintained,paused,complete,archived,weird&tags=,, ,a,A');
    expect(parsed.sort).toBe('updated');
    expect(parsed.view).toBe('grid');
    expect(parsed.statuses).toEqual([]);
    expect(parsed.tags).toEqual(['a']);
  });
});

describe('tags', () => {
  it('normalizes case and surrounding whitespace only', () => {
    expect(normalizeTag('  Web  Apps ')).toBe('web apps');
    expect(normalizeTag('C++')).toBe('c++');
  });
  it('counts by normalized key and keeps the first spelling', () => {
    const counts = countTags([{ tags: ['Web', 'game'] }, { tags: ['web ', 'Tool'] }, { tags: ['tool', 'tool'] }]);
    expect(counts).toEqual([
      { key: 'tool', label: 'Tool', count: 2 },
      { key: 'web', label: 'Web', count: 2 },
      { key: 'game', label: 'game', count: 1 },
    ]);
  });
});

describe('homepage selection', () => {
  it('limits featured to three in file order, never archived, and dedupes recent', () => {
    const projects = [
      project('f1', { featured: true, added: '2026-01-01' }, 0),
      project('arch', { featured: true, status: 'archived', updated: '2026-09-01' }, 1),
      project('f2', { featured: true, status: 'complete', updated: '2026-08-01' }, 2),
      project('f3', { featured: true }, 3),
      project('f4', { featured: true, added: '2026-07-01' }, 4),
      project('recent', { updated: '2026-06-01' }, 5),
      project('undated', {}, 6),
    ];
    const { featured, recent } = selectHomepage(projects);
    expect(featured.map((p) => p.id)).toEqual(['f1', 'f2', 'f3']);
    expect(recent.map((p) => p.id)).toEqual(['f4', 'recent']);
  });
  it('shows one feature with one project and nothing repeated', () => {
    const { featured, recent } = selectHomepage([project('only', { featured: true, added: '2026-01-01' })]);
    expect(featured.map((p) => p.id)).toEqual(['only']);
    expect(recent).toEqual([]);
  });
  it('is empty with zero projects', () => {
    expect(selectHomepage([])).toEqual({ featured: [], recent: [] });
  });
});
