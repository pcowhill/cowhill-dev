import { defineConfig } from 'astro/config';
import { resolveDeployment } from './src/config/site.ts';
import { projectAssets } from './src/integrations/project-assets.ts';

const { origin, base } = resolveDeployment(process.env);

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  site: origin,
  base,
  trailingSlash: 'always',
  output: 'static',
  build: {
    format: 'directory',
    assets: '_astro',
  },
  // Lossless HTML-aware whitespace handling (Astro 7 defaults to JSX rules,
  // which can remove meaningful spaces between inline elements).
  compressHTML: true,
  integrations: [projectAssets()],
  vite: {
    build: {
      sourcemap: false,
    },
  },
});
