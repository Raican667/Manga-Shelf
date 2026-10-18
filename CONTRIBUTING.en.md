# Contributing and maintenance

Technical reference: [Developer documentation](docs/DEVELOPMENT.en.md).

[Deutsch](CONTRIBUTING.md) | **English**

This document covers technical work on Manga-Regal. See the
[README](README.en.md) for the project overview and user installation, and the
[changelog](CHANGELOG.en.md) for the version history.

## Requirements

- Firefox 142 or newer
- Node.js for syntax and logic tests
- PowerShell 7 for `build.ps1`

There are no npm dependencies. Firefox loads the extension directly from the
repository files, so `manifest.json` must remain in the repository root.

## Project structure

```text
manifest.json               Firefox permissions and entry points
icons/                      Toolbar and extension-management icon
assets/placeholders/        Bundled local placeholder covers
shared/store.js             Data model, migrations, and local persistence
shared/sync.js              Compressed Firefox Sync transport
background/background.js   Toolbar, shortcut, and background events
content/overlay.js          Save form injected into the active website tab
content/overlay.css         Isolated styling for the save form
dashboard/                  Collection and settings interface
help/                       Built-in help and local illustrations
tests/                      Storage, UI-wiring, and background tests
build.ps1                   Validation and Firefox ZIP packaging
```

## Test locally in Firefox

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…**.
3. Select `manifest.json`.
4. Click **Reload** for the extension after changing files.
5. Use **Inspect** to check the extension console for runtime errors.

## Automated checks

```powershell
node .\tests\store.test.js
node .\tests\wiring.test.js
node .\tests\background.test.js
```

- `store.test.js` covers data migrations, bookmarks, covers, and Firefox Sync.
- `wiring.test.js` verifies connections between HTML, JavaScript, CSS, and help.
- `background.test.js` covers background startup, toolbar clicks, and fallbacks.

Run the complete validation and package build with:

```powershell
.\build.ps1
```

## Data model

The primary dataset is stored under `mangaRegalDataV1` in
`browser.storage.local`. Normal manga covers use keys prefixed with
`mangaRegalCoverV1:`. Custom placeholder images are stored separately under
`mangaRegalCustomPlaceholderV1:`. User interfaces access this data only through
the public `MangaStore` API.

A manga entry primarily contains:

- `id`, `title`, `url`, `source`, and `description`
- `currentChapter` and `chapterManual`
- `rating`, `tags`, and `status`
- `rereadOf` and `rereadRound` for linked re-reads
- `cover`, `favicon`, `created`, and `modified`
- optional `bookmarkId` and `folderPath` for local Firefox connections

When the persisted format changes, increment `DATA_VERSION` and add a
backward-compatible migration to `normalizeData()`.

## Firefox Sync

`shared/sync.js` creates a compact snapshot, compresses it with gzip, and splits
the Base64 data into pieces below Firefox's 8 KB per-item limit. The prepared
snapshot remains available locally under `mangaRegalCompressedSyncCacheV1`.

Covers, custom placeholder images, favicons, logs, bookmark IDs, and folder paths
must not enter the Sync snapshot. When adding synchronized manga fields, update
`compactItem()` and `expandItem()` together and cover the change with a test.

## Release checklist

1. Implement the focused change and add appropriate regression tests.
2. Increment the version in `manifest.json`.
3. Add current German and English release notes to `dashboard/app.js`.
4. Update `CHANGELOG.md` and `CHANGELOG.en.md` with the release date and changes.
5. Update the visible version and affected content in `help/index.html`,
   `help/index.en.html`, `help/settings.html`, and `help/settings.en.html`.
6. Update the version in `README.md`, `README.en.md` and `README.de.md`.
7. Review `DATA_VERSION` and migrations when the persisted format changes.
8. Run `build.ps1` successfully from start to finish.
9. Inspect the generated ZIP: `manifest.json` must be at the archive root.
10. Commit, push, and provide the validated package for Mozilla submission.

Generated ZIP/XPI files and the `build/` directory are not committed. GitHub
Actions repeats the checks and provides a time-limited test package as a workflow
artifact.

## Pull requests

- Keep changes small and focused on one concern.
- Preserve existing user data and local covers during migrations.
- Add all new user-facing text in German and English.
- Never commit secrets, cookies, backup files, or generated packages.
- For UI changes, test table and card views in both dark and light mode.
