/**
 * Centralized link behavior. Every anchor the website or editor renders for a
 * project resource, navigation item, or Markdown link goes through here so
 * new-tab handling, rel attributes, download indicators, icons, and
 * screen-reader wording are consistent everywhere.
 */
import { normalizeBase } from '../config/site.ts';
import { attrs, html, raw, type SafeHtml } from './html.ts';
import { assetPublicPath, looksLikeAssetPath, parseAssetPath } from './paths.ts';
import type { ProjectLink } from './schema.ts';

export interface LinkContext {
  /** Origin of the catalog website, e.g. https://www.example.com */
  origin: string;
  /** Base path of the catalog website, "/" or "/repo". */
  base: string;
}

export type LinkBehavior =
  /** Navigation inside the catalog: same tab, no icon. */
  | 'internal'
  /** Navigation to an outside application or resource: new tab + icon. */
  | 'external'
  /** A file the visitor saves: download indicator, normal browser behavior. */
  | 'download'
  /** A non-navigational scheme such as mailto: same tab, no icon. */
  | 'plain';

export interface ResolvedLink {
  href: string;
  behavior: LinkBehavior;
  /** Value for the download attribute, when appropriate (same-origin resources only). */
  downloadAttr: string | boolean | null;
  /** True when the href is a local project asset that was resolved to a public URL. */
  isLocalAsset: boolean;
}

const ICON_EXTERNAL =
  '<svg class="link-icon link-icon--external" aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="1em" height="1em"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M6.5 3.5H4A1.5 1.5 0 0 0 2.5 5v7A1.5 1.5 0 0 0 4 13.5h7a1.5 1.5 0 0 0 1.5-1.5V9.5M9.5 2.5H13.5V6.5M13.5 2.5 7.5 8.5"/></svg>';

const ICON_DOWNLOAD =
  '<svg class="link-icon link-icon--download" aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="1em" height="1em"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M8 2.5v8M4.75 7.25 8 10.5l3.25-3.25M2.5 12.5h11"/></svg>';

export const NEW_TAB_TEXT = 'opens in a new tab';
export const DOWNLOAD_TEXT = 'download';

function pathUnderBase(pathname: string, base: string): boolean {
  const normalized = normalizeBase(base);
  if (normalized === '/') return true;
  return pathname === normalized || pathname.startsWith(`${normalized}/`);
}

/**
 * Decides whether an href is internal catalog navigation. Same host is not
 * enough: the path must also sit under the catalog's base path, because an
 * application can share the hostname during the preview deployment.
 */
export function isInternalHref(href: string, ctx: LinkContext): boolean {
  const value = href.trim();
  if (value === '' || value.startsWith('#')) return true;
  if (value.startsWith('//')) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
      const origin = normalizeOriginForCompare(ctx.origin);
      return url.origin === origin && pathUnderBase(url.pathname, ctx.base);
    } catch {
      return false;
    }
  }
  // Relative and site-absolute paths are produced by the site itself.
  return true;
}

function normalizeOriginForCompare(origin: string): string {
  try {
    return new URL(origin).origin;
  } catch {
    return origin;
  }
}

export function isPlainScheme(href: string): boolean {
  return /^(mailto|tel):/i.test(href.trim());
}

/** Resolves a raw href (from Markdown or navigation) into consistent behavior. */
export function resolveHref(href: string, ctx: LinkContext, kind: 'link' | 'download' = 'link'): ResolvedLink {
  const value = href.trim();
  if (looksLikeAssetPath(value)) {
    const parsed = parseAssetPath(value);
    if (parsed.ok && parsed.parsed) {
      const publicPath = assetPublicPath(ctx.base, parsed.parsed);
      if (kind === 'download') {
        const file = parsed.parsed.relative.split('/').pop() ?? '';
        return { href: publicPath, behavior: 'download', downloadAttr: file || true, isLocalAsset: true };
      }
      return { href: publicPath, behavior: 'external', downloadAttr: null, isLocalAsset: true };
    }
    return { href: '#', behavior: 'plain', downloadAttr: null, isLocalAsset: false };
  }
  if (kind === 'download') {
    const sameOrigin = isInternalHref(value, ctx);
    return { href: value, behavior: 'download', downloadAttr: sameOrigin ? true : null, isLocalAsset: false };
  }
  if (isPlainScheme(value)) return { href: value, behavior: 'plain', downloadAttr: null, isLocalAsset: false };
  return {
    href: value,
    behavior: isInternalHref(value, ctx) ? 'internal' : 'external',
    downloadAttr: null,
    isLocalAsset: false,
  };
}

/** Resolves an authored project resource. */
export function resolveProjectLink(link: ProjectLink, ctx: LinkContext): ResolvedLink {
  return resolveHref(link.url, ctx, link.kind === 'download' ? 'download' : 'link');
}

/** Attribute string for an anchor with the resolved behavior applied. */
export function anchorAttrs(resolved: ResolvedLink, extra: Record<string, string | boolean | null | undefined> = {}): SafeHtml {
  const base: Record<string, string | boolean | null | undefined> = { href: resolved.href };
  if (resolved.behavior === 'external') {
    base.target = '_blank';
    base.rel = 'noopener noreferrer';
  } else if (resolved.behavior === 'download') {
    if (resolved.downloadAttr !== null) {
      base.download = resolved.downloadAttr === true ? true : resolved.downloadAttr;
    }
    if (!resolved.isLocalAsset && resolved.downloadAttr === null) {
      // External host: the host decides how it responds; keep it a normal navigation
      // but never leak the referrer.
      base.rel = 'noopener noreferrer';
    }
  }
  return attrs({ ...base, ...extra });
}

/** The automatic icon and screen-reader wording for a behavior (empty for internal links). */
export function linkSuffix(resolved: ResolvedLink): SafeHtml {
  if (resolved.behavior === 'external') {
    return html`${raw(ICON_EXTERNAL)}<span class="sr-only"> (${NEW_TAB_TEXT})</span>`;
  }
  if (resolved.behavior === 'download') {
    return html`${raw(ICON_DOWNLOAD)}<span class="sr-only"> (${DOWNLOAD_TEXT})</span>`;
  }
  return raw('');
}

/** Label plus the automatic icon and screen-reader wording for the behavior. */
export function linkContent(label: string, resolved: ResolvedLink): SafeHtml {
  return html`<span class="link-label">${label}</span>${linkSuffix(resolved)}`;
}

/** Complete anchor element for an href. */
export function renderAnchor(
  href: string,
  label: string,
  ctx: LinkContext,
  options: { kind?: 'link' | 'download'; className?: string; extra?: Record<string, string | boolean | null | undefined> } = {},
): SafeHtml {
  const resolved = resolveHref(href, ctx, options.kind ?? 'link');
  return html`<a${anchorAttrs(resolved, { class: options.className ?? null, ...(options.extra ?? {}) })}>${linkContent(label, resolved)}</a>`;
}

/** Complete anchor element for an authored project resource. */
export function renderProjectLink(
  link: ProjectLink,
  ctx: LinkContext,
  options: { className?: string; extra?: Record<string, string | boolean | null | undefined> } = {},
): SafeHtml {
  const resolved = resolveProjectLink(link, ctx);
  return html`<a${anchorAttrs(resolved, { class: options.className ?? null, ...(options.extra ?? {}) })}>${linkContent(link.label, resolved)}</a>`;
}
