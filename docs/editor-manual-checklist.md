# Editor manual checklist

Automated browser tests open the committed `project-editor.html` over
`file://` with network access blocked, exercise the classic file-input and
download paths, and drive **Save** through a mocked File System Access handle
(`tests/e2e/editor.spec.ts`). Native OS pickers and real overwrites cannot be
automated, so check the following by hand after changing the editor, in
Chrome or Edge on desktop unless noted.

Preparation: clone the repository, open `project-editor.html` by
double-clicking it (the address bar must start with `file://`).

1. **Open with the native picker.** Click *Open projects.yaml…*, choose the
   repository's `projects.yaml`. Expect the status line "Opened projects.yaml.
   Direct saving is available." Cancel the picker on a second attempt: nothing
   changes and no error appears.
2. **Direct save.** Change a title, click *Save*. Chrome asks for permission
   to save changes; allow it. Expect "Saved to projects.yaml" and "All changes
   saved". Run `git diff projects.yaml`: only the changed line differs, the
   header comment and other records are intact.
3. **Denied permission.** Repeat with a fresh page load and *block* the
   permission prompt. Expect a warning offering Save As / Download, edits kept.
4. **Outside-edit conflict.** With the file open in the editor and an unsaved
   change, edit `projects.yaml` in another program and save it. Click *Save*
   in the editor: the "file changed on disk" dialog must appear. Test all three
   choices (reload discards editor edits after a confirmation; download keeps
   the disk file untouched; cancel keeps everything).
5. **Save As.** Save to a new file name via the picker. The header then shows
   the new name; confirm the old file did not change.
6. **Open repository folder.** Click *Open repository folder…*, choose the
   repository root. Expect "Local files under project-assets/ can now be
   previewed and checked." Reference an existing image in a thumbnail: the
   card preview shows it. Reference a missing one: a validation error
   "was not found in the opened folder" appears and Save is blocked. Choose a
   wrong folder: the warning about the missing `projects.yaml` appears.
7. **Drag and drop.** Drop `projects.yaml` from a file manager onto the
   window. In Chrome the dropped file opens with direct saving available.
8. **Unsaved-changes warning.** Make a change and close the tab: the browser's
   leave-page prompt appears.
9. **Firefox or Safari (fallback path).** Open the editor; the welcome text
   must say the browser cannot write back. Open with *Choose file (basic)*,
   edit, *Download YAML*; the downloaded file contains the change, and the
   header indicator explains that the original file is not updated.
10. **Offline.** Disconnect from the network or use the browser's offline
    mode; every step above still works.

Record the browser and version used and any deviation before merging changes
to `src/editor/`.
