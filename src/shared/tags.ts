/** Tag matching ignores case and surrounding whitespace, nothing more. */
export function normalizeTag(tag: string): string {
  return tag.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
}

/** Display form: first spelling wins, whitespace trimmed. */
export interface TagCount {
  /** Normalized key used in URLs and matching. */
  key: string;
  /** Spelling shown to visitors (the first authored spelling). */
  label: string;
  count: number;
}

export function countTags(projects: { tags: string[] }[]): TagCount[] {
  const map = new Map<string, TagCount>();
  for (const project of projects) {
    const seen = new Set<string>();
    for (const tag of project.tags) {
      const key = normalizeTag(tag);
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = map.get(key);
      if (entry) entry.count += 1;
      else map.set(key, { key, label: tag.trim(), count: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, 'en'));
}
