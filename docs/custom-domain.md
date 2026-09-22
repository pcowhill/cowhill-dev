# Moving to www.cowhill.dev

This document describes how the website moves from its inherited GitHub Pages
preview address to its own custom domain, and how to undo that move.

| | origin | base path | canonical homepage |
| --- | --- | --- | --- |
| Previous preview (inherited from the `pcowhill.github.io` user site) | `https://www.patrickcowhill.com` | `/cowhill-dev` | `https://www.patrickcowhill.com/cowhill-dev/` |
| Proposed production (this repository's `src/config/site.ts`) | `https://www.cowhill.dev` | `/` | `https://www.cowhill.dev/` |

**Proposed configuration versus verified live state.** The repository's
committed `deployment` values, the rebuilt editor, the tests and this document
describe the *intended* production address. Committing them does not change
where the site is served. Domain verification, the repository's Pages custom
domain setting, DNS in Route 53, certificate provisioning, "Enforce HTTPS" and
the first root-path deployment are separate manual steps performed by the
owner, and none of them is complete until the checks in step 7 pass. The
live site stays at the preview address until steps 4 to 6 are done.

The steps change DNS and live sites. Do them deliberately, in order, when
ready. The professional portfolio at `www.patrickcowhill.com`
(`pcowhill.github.io`), its Pages settings and its DNS records are not part
of this procedure and must not be changed.

## How the pieces fit together

- **Where the site is served** is decided by GitHub: the repository's
  Settings → Pages → *Custom domain* value plus the DNS records that point
  the domain at GitHub Pages.
- **Which addresses the site writes into its pages** (internal links, asset
  URLs, canonical URLs, `og:url`, sitemap, `robots.txt`) is decided by
  `deployment` in `src/config/site.ts`. The editor embeds the same values to
  classify links in previews, so it is rebuilt whenever they change.
- **The production guard** in `.github/workflows/site.yml` keeps the two in
  step. On every run that can deploy (a push to `main` or a manual run from
  `main`: the same condition as the deploy job) the workflow reads the live
  Pages configuration with `actions/configure-pages` and fails, before
  building or deploying, when the reported hostname or base path differs from
  the committed values. Pull requests and manual runs from other branches
  cannot deploy, so they run every validation, test, build and artifact check
  without that comparison. That is what makes a change of address reviewable
  before the live settings change.
- GitHub reports `http://` for a Pages site while "Enforce HTTPS" is not yet
  enabled. The guard accepts the committed `https://` origin for the same
  host and prints a note; canonical URLs are never downgraded to `http://`.
- **No `CNAME` file.** This site is published by a custom GitHub Actions
  workflow, so GitHub neither creates nor requires a `CNAME` file in the
  repository or in the artifact, and would ignore one. The DNS `CNAME`
  *record* for `www` in step 5 is a different thing and is required. Do not
  add a `CNAME` file.

## 1. Save the current DNS values and verify the domain on GitHub

1. In Route 53, open the `cowhill.dev` hosted zone and record every existing
   record (name, type, TTL, values, alias targets), in particular the apex
   `A` record pointing at the Lightsail address and whatever records serve
   `www.cowhill.dev` today. Keep this copy: it is the rollback (see below).
2. Verify the domain for the GitHub account: GitHub → profile Settings →
   *Code, planning, and automation* → Pages → *Add a domain* → `cowhill.dev`.
   GitHub shows an exact `TXT` record name (of the form
   `_github-pages-challenge-<account>.cowhill.dev`) and value. Create exactly
   that record in Route 53 (record type `TXT`, the value in double quotes as
   the console requires), wait until `dig TXT <name>` returns it, then click
   *Verify*. Verifying the apex also covers `www.cowhill.dev`.
3. **Retain the TXT record permanently.** GitHub re-checks it; removing it
   un-verifies the domain.

Verification prevents another account from claiming the domain for Pages. It
does not change where any site is served and can be done well ahead of the
cutover.

## 2. Prepare the pull request and get its checks green

The pull request changes `deployment` to the proposed production values,
rebuilds `project-editor.html`, conditions the production guard as described
above, and adds regression tests for the root deployment, for the retained
repository-path support (`SITE_ORIGIN`/`SITE_BASE`) and for the workflow
shape. Its "Site" run validates, type-checks, tests, builds for
`https://www.cowhill.dev/` and inspects the artifact, but does not compare
against the live Pages configuration and does not deploy. Locally the same
verification is:

```
npm ci
npm run editor:build
npm run verify
npm run test:e2e
```

Do not merge yet: while GitHub still serves the repository-path preview, a
push to `main` with the new values fails the production guard (intentionally,
nothing deploys and the preview stays online).

## 3. Set the custom domain in this repository's Pages settings

Repository → Settings → Pages:

- *Build and deployment* → *Source* stays **GitHub Actions**.
- *Custom domain*: enter `www.cowhill.dev` and **Save**. Do this **before**
  changing the traffic-routing DNS records in step 5. GitHub starts a DNS
  check that shows as pending or failing until step 5 propagates; that is
  expected.

From this moment GitHub reports `www.cowhill.dev` with an empty base path
for this repository, so the guard now accepts the new values and rejects the
old ones. GitHub documents that requests for a project site with a custom
domain are redirected to that domain, so expect the preview address
`https://www.patrickcowhill.com/cowhill-dev/` to stop serving the site here,
while the custom domain does not resolve to GitHub until step 5. Keep steps
3 to 5 close together.

## 4. Merge the pull request and deploy from main

Merge the pull request (a normal merge; no auto-merge, no bypass). The "Site"
run on `main` now runs the production guard against the saved setting, builds
the root-path site for `https://www.cowhill.dev/`, inspects it and deploys it
to the `github-pages` environment. Confirm in the Actions tab that the
*Check deployment origin and base path* step ran and passed and that the
deploy job succeeded.

If the run fails on the guard, the Pages setting was not saved or does not
match (`www` versus apex, or a stale base path). Fix the setting and re-run
the workflow from `main` with *Run workflow*; do not weaken the check. The
previous deployment stays in place while any run fails.

## 5. Point DNS at GitHub Pages (Route 53)

Use the values from GitHub's current documentation
([Managing a custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site));
at the time of writing they are the ones below. Check the documentation
before entering them.

1. **`www.cowhill.dev`**: delete the old routing records for `www` (whatever
   currently points it at Lightsail or elsewhere) and create one record:
   record name `www`, type `CNAME`, value `pcowhill.github.io` (the account's
   default Pages host: no `https://`, no trailing slash, no repository path,
   not `pcowhill.github.io/cowhill-dev`). A `CNAME` cannot coexist with other
   records of the same name, so nothing else may remain at `www`.
2. **`cowhill.dev` (apex)**: edit the existing `A` record set (record name
   left **blank** in the Route 53 console), remove the Lightsail address and
   enter GitHub Pages' four IPv4 addresses, one per line, in that single
   simple record set:

   ```
   185.199.108.153
   185.199.109.153
   185.199.110.153
   185.199.111.153
   ```

   To serve IPv6 as well, create one `AAAA` record set at the apex (name
   blank) with GitHub's four IPv6 addresses, one per line:

   ```
   2606:50c0:8000::153
   2606:50c0:8001::153
   2606:50c0:8002::153
   2606:50c0:8003::153
   ```

   Do not mix the Lightsail address with the GitHub addresses in one record
   set, do not keep a second apex `A`/`AAAA` record set, and do not create a
   wildcard (`*.cowhill.dev`) record.
3. Route 53 *alias* records are not an option for the apex here: an alias can
   target selected AWS resources or another record of the same type in the
   same hosted zone, but not an arbitrary external hostname such as
   `pcowhill.github.io`, and a `CNAME` is not allowed at the zone apex. Plain
   `A`/`AAAA` records with GitHub's addresses are the supported configuration.
4. Leave every other record in the zone unchanged: the `TXT` verification
   record from step 1, mail records, other subdomains, records that belong to
   Lightsail services other than this website, and any legacy redirect
   hostnames. The portfolio's zone and records are not involved at all.

DNS changes can take up to 24 hours to propagate; in practice Route 53
changes are visible within minutes, subject to the old records' TTL.

## 6. Certificate and HTTPS

After the `www` CNAME resolves to GitHub, the Pages settings page shows the
DNS check succeeded and GitHub requests a Let's Encrypt certificate for
`www.cowhill.dev` (and, with the apex pointed at GitHub, for `cowhill.dev`).
GitHub documents that the **Enforce HTTPS** checkbox can take up to 24 hours
to become available; enable it as soon as it is offered.

`.dev` is on the browser HSTS preload list: browsers refuse plain `http://`
for every `.dev` name. Between the DNS switch and the moment GitHub's
certificate is issued, browsers therefore show a certificate error for
`www.cowhill.dev` even though GitHub is already answering. This interruption
is expected and temporary, usually minutes, sometimes longer; do not react
to it by reverting DNS unless the certificate is still missing after GitHub's
24-hour window, and do not try to work around it by serving `http://`.

## 7. Check the result

- `dig www.cowhill.dev CNAME` returns `pcowhill.github.io`; `dig cowhill.dev
  A` (and `AAAA`, if configured) returns only GitHub's addresses.
- Repository Settings → Pages shows the domain's DNS check as successful,
  a certificate as issued, and **Enforce HTTPS** enabled.
- `https://www.cowhill.dev/` serves the homepage with a valid certificate;
  `https://cowhill.dev/` and `http://cowhill.dev/` redirect to
  `https://www.cowhill.dev/`.
- `https://www.cowhill.dev/projects/` filters work (`?q=`, `?tags=`),
  `https://www.cowhill.dev/projects/portfolio/` loads directly and after a
  refresh, `https://www.cowhill.dev/about/` loads, and
  `https://www.cowhill.dev/does-not-exist/` shows the branded 404 with
  working links.
- `view-source:` shows `<link rel="canonical" href="https://www.cowhill.dev/...">`
  and a matching `og:url`; `https://www.cowhill.dev/sitemap.xml` lists only
  `https://www.cowhill.dev/...` URLs and `https://www.cowhill.dev/robots.txt`
  points at that sitemap. No page references `/cowhill-dev/`.
- The Portfolio navigation item still points at
  `https://www.patrickcowhill.com/`, and `https://www.patrickcowhill.com/`
  itself is unchanged.
- Old preview links (`https://www.patrickcowhill.com/cowhill-dev/...`) are
  redirected by GitHub to the custom domain; the old base path is not
  preserved for deep links, so stop sharing preview URLs.

Only after these checks pass is the migration complete. Until then, describe
the custom domain as *proposed* or *in progress*, not as live.

## Rollback

Do the DNS step first: it is independent of the repository and restores the
previous site quickly.

1. **Restore routing DNS.** From the copy made in step 1, restore the apex
   `A` record set to the Lightsail address (replacing GitHub's four
   addresses), delete the apex `AAAA` record set if it was added for GitHub
   (Lightsail had none), and replace the `www` `CNAME` with the previous
   `www` records. Leave the `TXT` verification record in place.
2. **Return the repository to the preview address**, if the website should
   again be served at `https://www.patrickcowhill.com/cowhill-dev/`. This
   needs three coordinated changes, in this order:
   1. Remove `www.cowhill.dev` from this repository's Settings → Pages →
      *Custom domain* (clear the field and save). GitHub then serves the
      project site under the user site's domain again.
   2. Restore the previous `deployment` values (`origin:
      'https://www.patrickcowhill.com'`, `base: '/cowhill-dev'`) in
      `src/config/site.ts`, run `npm run editor:build`, and update the tests
      and documentation that assert the production values.
   3. Verify (`npm run verify`, `npm run test:e2e`), merge to `main`, and
      confirm the production guard passes and the deploy succeeds.
   Removing only the Pages setting while `main` still carries the
   `www.cowhill.dev` values makes the guard fail every production run
   (nothing deploys, the last deployment stays online), which is the safe
   failure mode but not a working rollback.
3. **Keep the domain verified** (do not delete the `TXT` record or remove the
   domain from the account's verified domains) and do not leave a Pages
   custom-domain setting pointing at a name whose DNS no longer resolves to
   GitHub: either the DNS and the setting both point at GitHub, or neither
   does. The portfolio's Pages settings and DNS are never part of a rollback.
