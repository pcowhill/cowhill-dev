/** Detail page: point "All projects" back at the visitor's last catalog view. */
export const CATALOG_STATE_KEY = 'cowhill:catalog-search';

export function initDetail(): void {
  const back = document.getElementById('back-to-catalog') as HTMLAnchorElement | null;
  if (!back) return;
  let search = '';
  try {
    search = sessionStorage.getItem(CATALOG_STATE_KEY) ?? '';
  } catch {
    return;
  }
  if (search && search.startsWith('?')) {
    const url = new URL(back.href, location.href);
    url.search = search;
    back.href = url.toString();
  }
}
