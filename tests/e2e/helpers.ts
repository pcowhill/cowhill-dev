import { startStaticServer, type StaticServer } from '../helpers/static-server.ts';
import { VARIANTS, type VariantName } from '../helpers/build-site.ts';

export async function serve(name: VariantName): Promise<{ server: StaticServer; prefix: string; url: (path: string) => string }> {
  const variant = VARIANTS[name];
  const server = await startStaticServer(variant.outDir, variant.base);
  const prefix = variant.base === '/' ? '' : variant.base;
  return { server, prefix, url: (path: string) => `${server.url}${prefix}${path}` };
}
