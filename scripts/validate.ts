/**
 * Validates projects.yaml exactly as the build does and prints readable
 * messages. Exit code 1 on any error so CI and pre-commit hooks can rely on it.
 */
import path from 'node:path';
import { loadCatalog, CatalogLoadError, projectsFilePath } from '../src/data/projects.ts';
import { formatIssues } from '../src/shared/validate.ts';

const file = projectsFilePath();
try {
  const catalog = loadCatalog({ filePath: file });
  const drafts = catalog.all.length - catalog.published.length;
  console.log(`ok: ${path.relative(process.cwd(), file)} is valid`);
  console.log(`   ${catalog.published.length} published project${catalog.published.length === 1 ? '' : 's'}, ${drafts} draft${drafts === 1 ? '' : 's'}, ${catalog.publishedAssets.length} published asset reference${catalog.publishedAssets.length === 1 ? '' : 's'}`);
  if (catalog.validation.warnings.length) {
    console.log(formatIssues(catalog.validation.warnings));
  }
} catch (err) {
  if (err instanceof CatalogLoadError) {
    console.error(`FAILED: ${err.message}`);
    if (err.result?.warnings.length) console.error(formatIssues(err.result.warnings));
    console.error('\nFix the lines above in projects.yaml and run "npm run validate" again.');
    process.exit(1);
  }
  throw err;
}
