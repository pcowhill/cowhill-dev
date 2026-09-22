/** Minimal HTML string helpers shared by the website renderers and the editor. */

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Marks a string as already-safe HTML so the `html` template does not escape it. */
export class SafeHtml {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  toString(): string {
    return this.value;
  }
}

export function raw(value: string): SafeHtml {
  return new SafeHtml(value);
}

type HtmlValue = string | number | boolean | null | undefined | SafeHtml | HtmlValue[];

function renderValue(value: HtmlValue): string {
  if (value === null || value === undefined || value === false) return '';
  if (value === true) return '';
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(renderValue).join('');
  return escapeHtml(value);
}

/**
 * Tagged template that escapes every interpolated value unless it is wrapped
 * with `raw()`. Arrays are concatenated; null/undefined/false render nothing.
 */
export function html(strings: TemplateStringsArray, ...values: HtmlValue[]): SafeHtml {
  let out = '';
  strings.forEach((chunk, i) => {
    out += chunk;
    if (i < values.length) out += renderValue(values[i] as HtmlValue);
  });
  return new SafeHtml(out);
}

/** Builds an attribute string from a record, skipping null/undefined/false values. */
export function attrs(record: Record<string, string | number | boolean | null | undefined>): SafeHtml {
  const parts: string[] = [];
  for (const [name, value] of Object.entries(record)) {
    if (value === null || value === undefined || value === false) continue;
    if (value === true) {
      parts.push(name);
    } else {
      parts.push(`${name}="${escapeHtml(value)}"`);
    }
  }
  return new SafeHtml(parts.length ? ' ' + parts.join(' ') : '');
}
