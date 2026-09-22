# CLAUDE.md

Guidance for AI-assisted work in this repository (cowhill.dev, a static Astro
project catalog).

## Ground rules

- `projects.yaml` at the repository root is the **only** authored source of
  project metadata. Never introduce a second list of projects anywhere (no
  hard-coded featured lists, navigation entries, or duplicated records). The
  Portfolio navigation link is derived from the `portfolio` record.
- Do not modify `public/brand/cowhill-logo-horizontal.svg` or
  `public/brand/cowhill-logo-stacked.svg`. Derived artwork is generated at build
  time by `scripts/generate-brand.ts` into `public/generated/` (git-ignored).
- Publication boundaries: drafts (`draft: true`) are removed in
  `src/data/projects.ts` before any page, search data, sitemap or metadata is
  produced. `project-assets/` is never published wholesale; only files
  referenced by published records are copied (`src/integrations/project-assets.ts`).
  `projects.yaml`, `project-editor.html`, `src/`, `tests/` never ship in `dist/`.
- The repository is public. Drafts are hidden from the website, not private.
- Shared code (`src/shared/`) is used by the website, the build scripts, the
  tests and the standalone editor. Change link behavior, Markdown handling,
  validation or rendering there, not in one consumer.
- After changing anything under `src/shared/`, `src/editor/` or
  `src/config/site.ts`, run `npm run editor:build` and commit
  `project-editor.html`. CI fails if it is stale (`npm run editor:check`).
- Do not add analytics, tracking, external fonts, CDNs, third-party embeds or
  mandatory runtime network requests.
- Do not change DNS, the custom domain, Pages settings, Route 53, Lightsail,
  other repositories or infrastructure unless the owner explicitly asks. The
  domain switch is documented in `docs/custom-domain.md` and is a separate,
  deliberate procedure.
- Do not create scheduled or recurring autonomous sessions, check-ins or
  triggers for this repository.

## Verification commands

```
npm run validate        # projects.yaml schema, links, dates, assets
npm run editor:check    # committed project-editor.html matches its source
npm run typecheck       # astro check + tsc for scripts/tests/editor
npm test                # vitest: unit tests + fixture builds (root and repo base)
npm run build           # production build into dist/
npm run inspect-dist    # artifact inspection (no drafts/YAML/editor in output)
npm run test:e2e        # Playwright: site behaviour + editor over file://
npm run verify          # everything except the browser tests
```

Run `npm run verify` and `npm run test:e2e` before opening a pull request.

## Layout

- `src/config/site.ts` deployment origin/base and site copy.
- `src/shared/` schema, validation, YAML document helpers, catalog logic,
  link behaviour, Markdown, HTML renderers and shared CSS.
- `src/pages/`, `src/layouts/`, `src/components/`, `src/styles/` the website.
- `src/scripts/` browser scripts (catalog filtering, detail back link).
- `src/editor/` the standalone editor source; built to `project-editor.html`.
- `scripts/` build-time utilities; `tests/` vitest and Playwright suites with
  synthetic fixtures under `tests/fixtures/` (never real projects).
- `docs/` supporting documentation and screenshots.
