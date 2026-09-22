/** Small inline SVG accents derived from the supplied logo palette and stroke style. */
export const ICONS = {
  search:
    '<svg aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="1em" height="1em"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m10.5 10.5 3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  grid:
    '<svg aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="1em" height="1em"><rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor"/><rect x="9" y="2" width="5" height="5" rx="1" fill="currentColor"/><rect x="2" y="9" width="5" height="5" rx="1" fill="currentColor"/><rect x="9" y="9" width="5" height="5" rx="1" fill="currentColor"/></svg>',
  list:
    '<svg aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="1em" height="1em"><rect x="2" y="2.5" width="12" height="2.5" rx="1" fill="currentColor"/><rect x="2" y="6.75" width="12" height="2.5" rx="1" fill="currentColor"/><rect x="2" y="11" width="12" height="2.5" rx="1" fill="currentColor"/></svg>',
  arrow:
    '<svg aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="1em" height="1em"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M3 8h10M9 4l4 4-4 4"/></svg>',
  back:
    '<svg aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="1em" height="1em"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M13 8H3M7 4 3 8l4 4"/></svg>',
  /** A tiny sun-and-hill mark echoing the logo, used as a decorative placeholder. */
  hillMark:
    '<svg aria-hidden="true" focusable="false" viewBox="0 0 120 64" width="120" height="64"><circle cx="78" cy="26" r="16" fill="#F1DABA"/><path d="M0 60C24 54 44 34 66 32c20-2 36 8 54 20V64H0z" fill="#618064"/></svg>',
} as const;
