import type { LinkContext } from '../links.ts';
import type { ParsedAssetPath } from '../paths.ts';
import { assetPublicPath, parseAssetPath, IMAGE_EXTENSIONS } from '../paths.ts';

/** Everything the shared renderers need to produce identical markup on the site and in the editor. */
export interface RenderContext extends LinkContext {
  /**
   * Resolves a validated local image reference to a URL. Returning null means
   * "not available here" (editor without folder access) and renders an explicit
   * "Local image not loaded" placeholder instead of a broken image.
   */
  resolveImage: (parsed: ParsedAssetPath, rawPath: string) => string | null;
  /** True inside the editor: shows editor-only indicators such as the draft badge. */
  preview: boolean;
}

/** Website context: every image resolves to its published URL under the base path. */
export function siteRenderContext(origin: string, base: string): RenderContext {
  return {
    origin,
    base,
    preview: false,
    resolveImage: (parsed) => assetPublicPath(base, parsed),
  };
}

/** Resolves an authored image path through the context, or null when unavailable/invalid. */
export function imageUrl(ctx: RenderContext, src: string): { url: string | null; error: string | null } {
  const parsed = parseAssetPath(src, IMAGE_EXTENSIONS);
  if (!parsed.ok || !parsed.parsed) return { url: null, error: parsed.error ?? 'invalid image path' };
  return { url: ctx.resolveImage(parsed.parsed, src), error: null };
}
