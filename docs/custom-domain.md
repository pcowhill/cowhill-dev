# Switching to www.cowhill.dev

The website currently deploys to the GitHub Pages preview address
`https://www.patrickcowhill.com/cowhill-dev/` (the `pcowhill.github.io` user
site has a custom domain, and GitHub serves project sites under it). The
eventual canonical address is `https://www.cowhill.dev/`, which today serves a
different page. **None of the steps below have been executed.** They change
DNS and live sites, so do them deliberately, in order, when ready.

## 1. Verify the domain on GitHub (recommended first)

GitHub recommends verifying a custom domain before assigning it to a
repository to prevent takeovers. In GitHub → Settings → Pages (account level)
→ "Add a domain", add `cowhill.dev` and create the `TXT` record GitHub shows in
the DNS provider (Route 53). Wait until GitHub reports it verified.

## 2. Point DNS at GitHub Pages

In the DNS zone for `cowhill.dev`, when ready to cut over:

- `www.cowhill.dev`: `CNAME` → `pcowhill.github.io` (the default Pages host
  for this account).
- `cowhill.dev` (apex): four `A` records and four `AAAA` records with GitHub
  Pages' published IP addresses (from GitHub's current documentation), or an
  `ALIAS`/`ANAME` record if the provider supports one. Route 53 supports alias
  records only to AWS resources, so use the `A`/`AAAA` records there.
- Do not use wildcard records.

Keep the existing records that serve the current page until the switch below
is complete, then remove them.

## 3. Assign the domain to this repository's Pages site

Repository → Settings → Pages → Custom domain: enter `www.cowhill.dev` and
save. GitHub creates the DNS check and, once the CNAME resolves, offers
**Enforce HTTPS** (it can take up to 24 hours to become available; enable it
when it does). Configuring `www` makes GitHub redirect the apex to `www`.

Because this site is published with a custom GitHub Actions workflow, GitHub
does **not** create or need a `CNAME` file in the repository, and an existing
one would be ignored. The setting in the repository's Pages configuration is
the authoritative one; do not rely on a `CNAME` file.

## 4. Switch the site's origin and base path

Edit `src/config/site.ts`:

```ts
export const deployment = {
  origin: 'https://www.cowhill.dev',
  base: '/',
};
```

Then rebuild the editor (its previews classify links with this setting) and
verify:

```
npm run editor:build
npm run verify
npm run test:e2e
```

Commit and push to `main`. The workflow reads the Pages configuration with
`actions/configure-pages` and fails if the committed origin/base do not match
what GitHub reports, so do steps 3 and 4 close together: after step 3 the old
setting fails the check, and before step 3 the new setting fails it. That is
intentional: canonical URLs, the sitemap and social previews must match the
real address.

## 5. Check the result

- `https://www.cowhill.dev/` serves the homepage over HTTPS with a valid
  certificate; `https://cowhill.dev/` redirects to `www`.
- `https://www.cowhill.dev/projects/portfolio/` loads directly and after
  refresh; `https://www.cowhill.dev/does-not-exist/` shows the branded 404.
- `view-source:` shows `<link rel="canonical" href="https://www.cowhill.dev/...">`
  and matching `og:url`; `https://www.cowhill.dev/sitemap.xml` lists the new
  URLs only.
- Old preview links such as `https://www.patrickcowhill.com/cowhill-dev/`:
  GitHub redirects a project site to its custom domain once one is set. Confirm
  the redirect, or accept that old preview links stop working; either way the
  preview URL should no longer be shared.
- The user site `pcowhill.github.io` / `www.patrickcowhill.com` is not touched
  by any of this.

## Rolling back

Remove the custom domain from the repository's Pages settings, restore the
previous `deployment` values in `src/config/site.ts`, rebuild the editor,
commit, and push. DNS records can be reverted independently.
