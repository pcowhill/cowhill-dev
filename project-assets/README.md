# project-assets

Source images and small resource files for catalog projects live here, one
folder per project id:

```
project-assets/
  my-project/
    thumbnail.png
    screenshot-1.png
    slides.pdf
```

Reference them from `projects.yaml` with the repository-relative path, for
example `project-assets/my-project/thumbnail.png`.

This directory is **not** copied to the website wholesale. During the build only
files referenced by published (non-draft) projects are copied to
`/assets/projects/<id>/...`. Files referenced only by drafts stay out of the
site, but remember that this repository is public, so they are still visible on
GitHub.
