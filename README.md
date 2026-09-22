# cowhill.dev

The source of [cowhill.dev](https://www.cowhill.dev): a personal playground and
catalog of projects (games, tools, applications, experiments, libraries,
documents). It is separate from the professional portfolio at
[patrickcowhill.com](https://www.patrickcowhill.com).

The site is a static [Astro](https://astro.build) build. Every project page,
the searchable catalog, the sitemap and the social previews are generated from
one file: **`projects.yaml`** at the repository root.

> **This repository is public.** A project marked `draft: true` is excluded
> from the website, but its record and any files under `project-assets/` stay
> readable on GitHub. Draft means "not published", not "private". Never store
> secrets or sensitive unpublished material here.

The repository is configured for production at **https://www.cowhill.dev/**
(a root deployment on the custom domain, `deployment` in
`src/config/site.ts`). Whether that address is actually live depends on
manual steps outside this repository (domain verification, the repository's
Pages custom-domain setting, DNS in Route 53, certificate provisioning); until
they are completed and checked, GitHub serves the previous preview address
`https://www.patrickcowhill.com/cowhill-dev/`. The cutover, its checks and the
rollback are described in [docs/custom-domain.md](docs/custom-domain.md).

## Quick start

There are two ways to change the catalog. Both end with a commit to `main`,
which triggers the "Site" GitHub Actions workflow that validates, builds and
deploys the website.

### 1. Edit on GitHub

1. Open `projects.yaml` on GitHub and click the pencil icon.
2. Edit the YAML (the header of the file explains every field and includes a
   copyable template).
3. Commit directly to `main`.
4. Open the **Actions** tab. When the "Site" run is green, the change is live.
   If it is red, open the run and read the "Validate projects.yaml" step: it
   names the exact field and problem. Fix it and commit again; the previous
   version of the site stays online until a build succeeds.

### 2. Edit locally with the offline editor

1. Download the repository (Code → Download ZIP) or clone it.
2. Double-click **`project-editor.html`**. It opens in your browser from your
   disk, with no installation, server or network access needed.
3. Click **Open projects.yaml…** and choose the repository's `projects.yaml`.
   Optionally click **Open repository folder…** and choose the repository root
   so images in `project-assets/` show in previews and are checked for
   existence.
4. Edit with the form or the YAML tab, check the Card / List item / Detail
   page previews, then **Save**.
5. Commit and push `projects.yaml` (and any new files in `project-assets/`).

Important:

- **A local save changes nothing online** until the change is committed and
  pushed to `main`.
- In Chrome and Edge on desktop, **Save** writes directly back to the file you
  opened. Other browsers cannot write files: use **Download YAML** and replace
  the repository's `projects.yaml` with the downloaded file. Browsers may
  rename downloads (for example `projects (1).yaml`); make sure the file you
  commit is named `projects.yaml` at the repository root.
- The editor never commits, pushes, deploys, or asks for GitHub credentials.

## Editing projects

### A minimal project

```yaml
  - id: pixel-garden
    title: Pixel Garden
    summary: A tiny browser game about growing pixel plants.
    tags: [game, web]
    status: active
```

`id` must be unique, lowercase kebab-case, and stable: it becomes the URL
`/projects/pixel-garden/`. `tags` may be `[]`.

### Statuses

| status       | meaning                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------- |
| `active`     | Currently being developed or expanded.                                                   |
| `maintained` | Supported, without substantial active development.                                       |
| `paused`     | Work stopped for now, with a possible return.                                            |
| `complete`   | Achieved its original goals. Not deprecated; may still receive improvements.             |
| `archived`   | Deprecated, no longer used, or kept for historical reference. No maintenance commitment. |

These describe development, not uptime: an archived project that still works
keeps its launch link. Complete projects are normal entries and can be featured.
**Archived projects stay in the catalog** (visitors can hide them with the
status filter) **but are never highlighted on the homepage**, even with
`featured: true`.

### Featured, recent, drafts and dates

- `featured: true` puts a project in the homepage Featured section. Up to
  three are shown, in the order they appear in `projects.yaml`. Move a record
  up or down to change the order (the editor has ↑ / ↓ buttons).
- The homepage "Recently updated" section shows dated, non-archived projects
  that are not already featured. Sections without content are hidden.
- `draft: true` removes a project from the website entirely (pages, search
  data, sitemap, metadata). New records created in the editor start as drafts.
- `added` is the date the project joined this catalog; `updated` is the date
  of a meaningful project or catalog update. Both are optional `YYYY-MM-DD`
  values and are **never changed automatically**. "Recently updated" ordering
  uses `updated`, falling back to `added`; undated projects sort last.

### Multiline Markdown description

```yaml
    description: |
      Pixel Garden started as a weekend experiment with the Canvas API.

      ## How it works

      Plants grow on a timer. Water them by clicking, or let them wilt.

      ![The garden after a week](project-assets/pixel-garden/week-one.png)
```

Everything after `description: |` must be indented two spaces further than
`description`. Supported: paragraphs, headings (`#` becomes a section heading
below the page title), lists, emphasis, links, code, tables and **local**
images. Raw HTML, remote images and non-`http(s)` links are rejected by
validation.

### Notice

```yaml
    notice: Desktop recommended
```

A short single line shown on cards and the detail page. Other examples:
"Early prototype", "Requires a gamepad", "Windows only".

### Thumbnail and screenshots

1. Put the files in `project-assets/<id>/` (create the folder named after the
   project id). Keep images reasonably small; `.png`, `.jpg`, `.webp`, `.gif`,
   `.avif` and `.svg` are accepted.
2. Reference them with the repository-relative path:

```yaml
    thumbnail:
      src: project-assets/pixel-garden/thumbnail.png
      alt: A grid of pixel flowers
    screenshots:
      - src: project-assets/pixel-garden/menu.png
        alt: The main menu
        caption: The main menu on a phone.
      - src: project-assets/pixel-garden/week-one.png
        alt: A grown garden
```

Only files referenced by published projects are copied to the site (as
`/assets/projects/<id>/…`). Images are optional everywhere.

### Resources (links) and free-form labels

```yaml
    links:
      - label: Play
        url: https://pixelgarden.cowhill.dev/
        primary: true
      - label: View source
        url: https://github.com/pcowhill/pixel-garden
      - label: Watch trailer
        url: https://www.youtube.com/watch?v=xxxxxxxxxxx
      - label: Download release
        url: https://github.com/pcowhill/pixel-garden/releases/latest/download/pixel-garden-win.zip
        kind: download
      - label: Read the design notes
        url: project-assets/pixel-garden/design-notes.pdf
```

- `label` is free text: Play, Open tool, Watch demo, View presentation,
  Read PDF, Download slides, Download release, …
- `url` is an absolute `http(s)` URL, stored exactly as written (GitHub
  Releases, Dropbox, itch.io, YouTube, anything), or a local
  `project-assets/<id>/<file>` path for small files kept in this repository.
  Large files belong on an external host.
- `primary: true` on at most one link makes it the card's main button and the
  large button on the detail page. Without a primary link the card shows
  **View details**; the first link is never assumed to be primary.
- `kind: download` marks a file the visitor saves. Downloads get a download
  icon and wording; other links outside the catalog open in a new tab with an
  automatic "opens in a new tab" icon and screen-reader text. No per-project
  icon settings are needed.

### Validation

The build validates `projects.yaml` before generating anything: required
fields and types, unknown fields (with "did you mean" hints), duplicate ids and
duplicate YAML keys, calendar dates, status values, link formats, the single
primary link rule, Markdown safety, and every local file reference. Locally:

```powershell
npm run validate
```

The output names the record and field, for example
`projects[2].links[0].url: "www.example.com" must be an absolute http(s) URL`.
In GitHub Actions the same message appears in the failed "Validate
projects.yaml" step. The editor shows the same messages live and blocks
**Save** until they are fixed, so the repository file never becomes invalid
through the editor.

## Local development

Requirements: [Node.js 22 LTS](https://nodejs.org) (22.12 or newer) and npm.
The GitHub CLI is not required.

```powershell
# Windows PowerShell (same commands work in bash)
git clone https://github.com/pcowhill/cowhill-dev.git
cd cowhill-dev
npm ci                 # install exact dependency versions from package-lock.json
npm run dev            # local preview at http://localhost:4321/
npm run verify         # validate + editor check + typecheck + tests + build + inspect
npm run test:e2e       # browser tests (first time: npx playwright install chromium)
```

Other commands:

| command                    | purpose                                                              |
| -------------------------- | -------------------------------------------------------------------- |
| `npm run validate`         | Validate `projects.yaml` exactly like the build does.                |
| `npm run build`            | Production build into `dist/` (also regenerates derived branding).   |
| `npm run preview`          | Serve `dist/` locally.                                               |
| `npm run editor:build`     | Rebuild `project-editor.html` from `src/editor/` (see below).        |
| `npm run editor:check`     | Verify the committed editor matches its source (runs in CI).         |
| `npm run inspect-dist`     | Check the build output for missing pages or unpublished material.    |
| `node tests/screenshots/capture.ts` | Screenshot the built site and the editor into `tests/screenshots/out/`. |

Alternative-origin or repository-path builds for testing (the committed
configuration is a root deployment; a `/<repository>` base path remains fully
supported and is exercised by the tests):

```powershell
$env:SITE_ORIGIN = "https://www.patrickcowhill.com"; $env:SITE_BASE = "/cowhill-dev"; npm run build
```

### Where to change things

| what                           | where                                                            |
| ------------------------------ | ---------------------------------------------------------------- |
| Project records                | `projects.yaml` (only here)                                      |
| Project images and small files | `project-assets/<id>/`                                           |
| About page text                | `src/content/about.ts`                                           |
| Homepage heading and copy      | `src/content/home.ts`                                            |
| Site name, description, author | `src/config/site.ts` (`site`)                                    |
| Deployment origin and base     | `src/config/site.ts` (`deployment`), see docs/custom-domain.md   |
| Logos                          | `public/brand/` (supplied files; favicon and social image derive from them automatically) |
| Colors and spacing             | `src/shared/styles/tokens.css`                                   |
| Card, detail and Markdown look | `src/shared/styles/components.css` (shared with the editor)      |
| Layout, navigation, homepage   | `src/styles/site.css`, `src/layouts/`, `src/components/`, `src/pages/` |
| Editor                         | `src/editor/` → `npm run editor:build`                           |

### When to rebuild the editor

`project-editor.html` is a generated, committed file. Rebuild it **only when
its implementation changes**: anything in `src/editor/`, `src/shared/`,
`src/config/site.ts`, or the shared stylesheets. Editing `projects.yaml` never
requires a rebuild, and the editor never embeds the catalog. CI runs
`npm run editor:check` and fails if the committed file is stale, so run
`npm run editor:build` and commit the result together with source changes.
Output is deterministic and LF-normalized, so the check behaves the same on
Windows and Linux.

## Deployment

The **Site** workflow (`.github/workflows/site.yml`):

- **Pull requests** (and manual runs from other branches): validation, editor
  freshness, type checks, unit and publication tests, production build, output
  inspection, browser tests. No deployment, and no comparison with the live
  Pages configuration, so a change of address can be reviewed before the Pages
  settings change.
- **Pushes to `main`** (and manual runs from `main`): the production guard
  below, then the same checks, then the verified `dist/` artifact is uploaded
  with `actions/upload-pages-artifact` and deployed with `actions/deploy-pages`
  to the `github-pages` environment. The deployed artifact is the one that was
  tested, not a separate rebuild, and a failed step leaves the current site
  untouched.
- Deployment concurrency is serialized per branch and never cancels an
  in-progress production deploy.

The Pages site must use **GitHub Actions** as its source (repository Settings →
Pages → Build and deployment → Source: GitHub Actions).

### Origin and base path

The committed `deployment` setting in `src/config/site.ts` (origin
`https://www.cowhill.dev`, base `/`) is the address every link, asset URL,
canonical URL, sitemap entry and social preview is written for. GitHub decides
where the site is actually served (repository Settings → Pages → Custom
domain, plus DNS). On every run that can deploy (push to `main` or manual run
from `main`, the deploy job's own condition) the workflow reads the live Pages
configuration with `actions/configure-pages` and fails, before building, when
the reported hostname or base path differs from the committed values, so the
site can never deploy with URLs pointing at the wrong address. Pull requests
skip only that comparison. GitHub reports `http://` while "Enforce HTTPS" is
not enabled; the check accepts the committed `https://` origin for the same
host and prints a note, and never downgrades canonical URLs to `http://`.

Because the site is published by a GitHub Actions workflow, no `CNAME` file is
needed or used; the Pages setting is authoritative. The steps to make
`https://www.cowhill.dev/` live (and to roll back) are in
[docs/custom-domain.md](docs/custom-domain.md).

## Repository layout

```
projects.yaml            the catalog (only authored project metadata)
project-editor.html      standalone offline editor (generated, committed)
project-assets/<id>/     source images and small files (published selectively)
public/brand/            supplied logos (do not modify)
public/generated/        favicon and social image derived at build time (ignored)
src/config/site.ts       deployment origin/base and site copy
src/content/             About page and homepage text
src/shared/              schema, validation, catalog logic, links, Markdown, renderers, shared CSS
src/pages|layouts|components|styles|scripts   the website
src/data/projects.ts     loads and validates projects.yaml; removes drafts
src/integrations/        copies published project assets into the build
src/editor/              editor source
scripts/                 validate, brand generation, editor build, output inspection
tests/                   vitest unit + build tests, Playwright browser tests, fixtures
docs/                    custom-domain procedure, editor manual checklist, screenshots
```

## More documentation

- [docs/custom-domain.md](docs/custom-domain.md): making www.cowhill.dev live, checks and rollback.
- [docs/editor-manual-checklist.md](docs/editor-manual-checklist.md): manual
  checks for browser features automated tests cannot cover.
- [CLAUDE.md](CLAUDE.md): rules for AI-assisted changes.
