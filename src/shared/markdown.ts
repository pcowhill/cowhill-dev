/**
 * Safe Markdown rendering shared by the website and the editor.
 *
 * Safety comes from construction rather than post-hoc sanitizing: every piece
 * of output is produced by our own renderer, all text is escaped, raw HTML is
 * never passed through, link destinations are restricted to http(s), mailto,
 * fragments, and portable local asset paths, and images must be local assets.
 */
import { Marked, type Tokens, type Token } from 'marked';
import { escapeHtml } from './html.ts';
import { anchorAttrs, linkSuffix, resolveHref, type LinkContext } from './links.ts';
import { IMAGE_EXTENSIONS, looksLikeAssetPath, parseAssetPath, assetPublicPath, type ParsedAssetPath } from './paths.ts';

export interface MarkdownContext extends LinkContext {
  /**
   * Resolves a validated local asset to a URL for `<img src>`. Return null when
   * the file is not available (the editor without folder access); the renderer
   * then shows an explicit placeholder instead of a broken image.
   */
  resolveImage?: (parsed: ParsedAssetPath, rawPath: string) => string | null;
  /** Headings in descriptions are shifted so they never compete with the page title. */
  headingOffset?: number;
}

export interface MarkdownIssue {
  message: string;
}

export interface MarkdownAssetReference {
  path: string;
  parsed: ParsedAssetPath;
  role: 'image' | 'link';
}

const ALLOWED_LINK_SCHEMES = /^(https?|mailto):/i;

function isAllowedHref(href: string): boolean {
  const value = href.trim();
  if (value === '') return false;
  if (value.startsWith('#')) return true;
  if (looksLikeAssetPath(value)) return parseAssetPath(value).ok;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return ALLOWED_LINK_SCHEMES.test(value);
  if (value.startsWith('//')) return false;
  // Relative paths are not meaningful inside a project description.
  return false;
}

function createRenderer(ctx: MarkdownContext): Marked {
  const offset = ctx.headingOffset ?? 1;
  const marked = new Marked({ gfm: true, breaks: false, async: false });
  marked.use({
    renderer: {
      html(token: Tokens.HTML | Tokens.Tag) {
        // Raw HTML is displayed as text, never interpreted.
        return escapeHtml(token.text);
      },
      heading(token: Tokens.Heading) {
        const depth = Math.min(6, token.depth + offset);
        const text = this.parser.parseInline(token.tokens);
        return `<h${depth}>${text}</h${depth}>\n`;
      },
      link(token: Tokens.Link) {
        const text = this.parser.parseInline(token.tokens);
        if (!isAllowedHref(token.href)) {
          return `<span class="md-blocked-link" title="Link removed: unsupported destination">${text}</span>`;
        }
        const resolved = resolveHref(token.href, ctx);
        const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
        return `<a${anchorAttrs(resolved).value}${title}>${text}${linkSuffix(resolved).value}</a>`;
      },
      image(token: Tokens.Image) {
        const alt = escapeHtml(token.text ?? '');
        const parsed = looksLikeAssetPath(token.href) ? parseAssetPath(token.href, IMAGE_EXTENSIONS) : null;
        if (!parsed || !parsed.ok || !parsed.parsed) {
          return `<span class="md-blocked-image">[Image removed: only local project-assets images are allowed] ${alt}</span>`;
        }
        const resolved = ctx.resolveImage ? ctx.resolveImage(parsed.parsed, token.href) : assetPublicPath(ctx.base, parsed.parsed);
        if (resolved === null) {
          return `<span class="md-image-placeholder" role="img" aria-label="${alt}">Local image not loaded: ${escapeHtml(token.href)}</span>`;
        }
        const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
        return `<img src="${escapeHtml(resolved)}" alt="${alt}" loading="lazy"${title}>`;
      },
    },
  });
  return marked;
}

/** Renders trusted-shape Markdown to safe HTML. */
export function renderMarkdown(markdown: string, ctx: MarkdownContext): string {
  const marked = createRenderer(ctx);
  const output = marked.parse(markdown, { async: false });
  return typeof output === 'string' ? output : '';
}

function walk(tokens: Token[], visit: (token: Token) => void): void {
  for (const token of tokens) {
    visit(token);
    const children = (token as { tokens?: Token[] }).tokens;
    if (children) walk(children, visit);
    const items = (token as { items?: Token[] }).items;
    if (items) walk(items, visit);
    const rows = (token as Tokens.Table).rows;
    if (rows) for (const row of rows) for (const cell of row) walk(cell.tokens, visit);
    const header = (token as Tokens.Table).header;
    if (header) for (const cell of header) walk(cell.tokens, visit);
  }
}

/**
 * Reports Markdown constructs the catalog refuses (raw HTML, unsupported link
 * destinations, remote or invalid images) and collects local asset references.
 */
export function lintMarkdown(markdown: string): { issues: MarkdownIssue[]; assets: MarkdownAssetReference[] } {
  const issues: MarkdownIssue[] = [];
  const assets: MarkdownAssetReference[] = [];
  const marked = new Marked({ gfm: true });
  const tokens = marked.lexer(markdown);
  let htmlReported = false;
  walk(tokens, (token) => {
    if (token.type === 'html') {
      if (htmlReported) return;
      htmlReported = true;
      const snippet = (token as Tokens.HTML).text.trim().split('\n')[0] ?? '';
      issues.push({ message: `raw HTML is not allowed in Markdown (found "${snippet.slice(0, 40)}")` });
    } else if (token.type === 'link') {
      const href = (token as Tokens.Link).href;
      if (!isAllowedHref(href)) {
        issues.push({ message: `link destination "${href}" is not allowed (use http(s), mailto, #fragment, or project-assets/... paths)` });
      } else if (looksLikeAssetPath(href)) {
        const parsed = parseAssetPath(href);
        if (parsed.ok && parsed.parsed) assets.push({ path: href, parsed: parsed.parsed, role: 'link' });
      }
    } else if (token.type === 'image') {
      const href = (token as Tokens.Image).href;
      if (!looksLikeAssetPath(href)) {
        issues.push({ message: `image "${href}" must be a local project-assets/... path (remote images are not embedded)` });
      } else {
        const parsed = parseAssetPath(href, IMAGE_EXTENSIONS);
        if (!parsed.ok) issues.push({ message: `image "${href}": ${parsed.error}` });
        else if (parsed.parsed) assets.push({ path: href, parsed: parsed.parsed, role: 'image' });
      }
    }
  });
  return { issues, assets };
}

/** Plain text approximation of Markdown, used for search indexing and descriptions. */
export function markdownToPlainText(markdown: string): string {
  const marked = new Marked({ gfm: true });
  const tokens = marked.lexer(markdown);
  const parts: string[] = [];
  walk(tokens, (token) => {
    if (token.type === 'text' || token.type === 'codespan' || token.type === 'code') {
      const text = (token as Tokens.Text).text;
      if (typeof text === 'string' && !(token as { tokens?: Token[] }).tokens) parts.push(text);
    } else if (token.type === 'escape') {
      parts.push((token as Tokens.Escape).text);
    } else if (token.type === 'image' && !(token as { tokens?: Token[] }).tokens) {
      parts.push((token as Tokens.Image).text ?? '');
    }
  });
  return parts
    .join(' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
