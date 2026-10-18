# Developer documentation

[Deutsch](DEVELOPMENT.md) | **English**

Technical reference for the current repository, not a roadmap.
[Overview](../README.en.md) · [Maintenance](../CONTRIBUTING.en.md) · [History](../CHANGELOG.en.md)

## Runtime and modules

Manifest V3 extension with JavaScript, HTML and CSS. No server, SQL database,
framework or npm build is required. Modules expose globals rather than ES imports.

| Module | Responsibility |
| --- | --- |
| `manifest.json`, `_locales/` | Firefox permissions, entry points, localized metadata |
| `shared/platform.js` | Detects Chrome from missing Gecko configuration; browser name/search adapter |
| `shared/store.js` / `MangaStore` | Normalization, storage, matching, covers, bookmarks and backups |
| `shared/sync.js` / `MangaSync` | Consent, compressed snapshots, sync transport and restore |
| `background/background.js` | Toolbar, shortcuts, messages, bookmark events and sync scheduling |
| `background/service-worker.js` | Chrome worker; loads shared modules with `importScripts` |
| `content/overlay.js`, `.css` | Save form and metadata from the current website DOM |
| `dashboard/` | Collection, editing and settings |
| `help/` | Local German/English user guides |
| `scripts/`, `build.ps1` | Packaging and release notes |

Firefox loads background scripts in manifest order. Chrome uses a service worker.
Dashboard/content scripts have separate JS contexts; globals are not shared state.

## Overlay and messages

Toolbar/`toggle-manga-regal` sends `manga-regal:toggle-overlay` to an HTTP(S) tab.
Without a receiver, the background injects CSS, platform, store and overlay scripts,
then sends again. Protected pages/injection failure open the dashboard instead.
The overlay is injected UI, not `action.default_popup`. CSS is scoped to
`#manga-regal-overlay`, not Shadow DOM. A context sentinel prevents duplicate
initialization; orphaned DOM after extension reload is removed. The tag picker
uses a native dialog. Opening/closing acknowledges messages asynchronously.

| Message | Effect |
| --- | --- |
| `manga-regal:toggle-overlay` | Content script toggles overlay |
| `manga-regal:open-dashboard` | Background opens/reuses collection tab |
| `manga-regal:cache-cover` | Background caches item cover |
| `manga-regal:update-linked-bookmark` | Background updates linked bookmark |

Chrome returns `true` for known background messages and responds with
`sendResponse`; unknown messages do not claim the channel. Failures contain
`ok: false` and a message. Payloads are defined in `handleMessage()` and callers.

## Local storage

Storage is inside the extension's browser profile, not a configurable Windows
directory. Uninstalling can delete it. Schema `DATA_VERSION = 20` is independent
of the extension release version.

| Key | Content |
| --- | --- |
| `mangaRegalDataV1` | `{version, items, customTags, logs, settings, updatedAt}` |
| `mangaRegalCoverV1:<itemId>` | Cover image data URL |
| `mangaRegalCustomPlaceholderV1:<id>` | Custom image for arcane/city/forest/cosmic |
| `mangaRegalBookmarkExportStateV1` | Profile-local bookmark export state |
| `mangaRegalSyncStateV1` | Last sync revision/status/sizes |
| `mangaRegalCompressedSyncCacheV1` | Compressed snapshot/signature |
| `mangaRegalChromeSyncConsentV1` | Device-local consent |

`load()` normalizes/migrates data and clears cover addresses identical to chapter
URLs. `save()` normalizes, sets `updatedAt` and writes the main dataset.
`update(mutator)` performs read-modify-write of the whole dataset. There is no
cross-context lock, transaction or compare-and-swap: concurrent updates may lose
changes. Cover and dataset writes are not atomic together.

### Items and settings

| Fields | Meaning |
| --- | --- |
| `id`, `title`, `url`, `source`, `description` | Identity and page metadata; HTTP(S) URLs only |
| `currentChapter`, `chapterManual` | String chapter and manual-maintenance flag |
| `chapterDetectionDisabled`, `coverDetectionDisabled` | Persistent automation exceptions |
| `rating`, `tags`, `status` | Rating, cleaned tags, category |
| `rereadOf`, `rereadRound` | Primary entry ID and re-read number |
| `cover`, `favicon` | Image address/metadata; local bytes stored separately |
| `bookmarkId`, `folderPath` | Profile-local bookmark connection |
| `created`, `modified` | Unix epoch milliseconds |

Statuses: reading/active/hold/dropped/completed; `all` is an aggregate view, not
an item status. Custom statuses use `custom-…`. Reading limit is 1–50 and checked
on creation/transition. Item normalization clamps ratings to 0–10; active scale
is 5 or 10. Switching to 5 clamps values above 5 after confirmation, not
proportionally. Defaults: five stars, English, dark mode, active category.

`setPreferences()` handles category views/names/order, tags, placeholder mappings,
language/theme, rating scale, import, search, automation, onboarding, sync and
the legacy `showSupportButton` field. The support button and its switch are removed.
Image bytes are not settings. Changed settings log
previous/new values; unchanged values produce no entries. Other event logs are
not all bilingual. Log fields: id/time/level/area/message/details. Newest first;
`limitLogs !== false` retains 100, otherwise growth is unbounded.

## Save, chapters and re-reads

Overlay reads page title/URL/description/cover candidates; it does not crawl manga
catalogs. `chapterFromUrl()` parses known URL patterns, not publication status.
`upsertItem()` updates the first match by ID **or** URL. `forceNew: true` bypasses
matching and is not stored. Omitted fields remain on updates.

`findLikelyMatches()` scores title/series URL across source changes.
`findLikelyMatch()` prefers primary progress for a higher incoming chapter,
otherwise a suitable re-read; the user can override. `rereadOf` is structural,
while the visible Re-Read tag is optional. Tag dialogs offer enabled presets plus
existing assignments. New tags are created in Settings. Form selections remain
in memory until Save; Cancel does not write.

## Covers and placeholders

`cacheCover()` returns existing local data first. Disabled automation prevents
remote download unless forced. Changing cover URL may invalidate cache in upsert.
Download uses timed `fetch()`: valid page referrer enables credentials/include
and strict-origin-when-cross-origin; otherwise omit/no-referrer. XHR fallback
exists only without page referrer and with XHR available. Chrome workers have no
XHR/FileReader. Cloudflare/cookie/hotlink restrictions can still block downloads;
no guaranteed access-protection bypass exists.

`normalizeCoverBlob()` checks 8 MiB, MIME and file signatures; store encodes a data
URL, not a general resize operation. Overlay/background have other capture paths.
Collection images load through `IntersectionObserver`; this is distinct from
when remote downloads happen. Four bundled placeholders support tag mappings and
custom local replacements. Disabling them preserves mappings/images. Neither
cover nor placeholder bytes are synced.

## Bookmarks and backups

Historically named `getFirefoxBookmarkFolders()`, `getFirefoxBookmarks()`,
`importFirefoxBookmarks()` and `exportToFirefoxBookmarks()` use browser.bookmarks
in Chrome too; names/keys are not browser detection.
Import recursively selects folder IDs, bookmark IDs or title/URL keywords.
Only website links are accepted; URL matching prevents duplicate imports.
Optional folder ratings/default category apply; bookmarks have no guaranteed cover.

Export creates a replacement root/category tree, completes it and removes the
previous managed tree when replacing. Chrome parent is `'2'`; Firefox uses its
default folder. `all` is not duplicated. Bookmark fields are exported, not
ratings/covers/tag metadata. Change events update linked entries; removal unlinks
without deleting manga.
`exportData()` includes `localCovers` and `customPlaceholderCovers`.
`importData()` replaces, not merges, the dataset and restores images.
Chrome consent is excluded from backup.

## Sync contract

Local data stays uncompressed; an additional snapshot cache is gzip/Base64.
Snapshot `{v,s,t,i}` means schema/settings/custom tags/compact item arrays.
Array positions:

```text
id, title, url, description, currentChapter, chapterManual, tags, rating,
status, created, modified, chapterDetectionDisabled, coverDetectionDisabled,
rereadOf, rereadRound
```

Sync limits title/URL/description/chapter to 300/1500/500/100 characters and tags
to 50 per item. Cover/favicon/bookmark ID/folder path/logs are excluded.
Settings/custom tags are included, with onboardingComplete/syncEnabled true.
`prepare()` serializes, signs, compresses and reuses unchanged cache.
`upload()` writes revision-marked `mangaRegalSyncV1:chunk:…` and `…:meta` keys.
Budget: 8,192 bytes per key/value, 512 keys, 102,400 total; safety threshold
98,000 and payload target 7,400 characters. Other keys count. Old own keys are
removed first; failure attempts rollback. This is not atomic.

`readRemote()` verifies chunk revision/length and supports uncompressed legacy
formats. `restore()` replaces the collection, retaining local cover/bookmark
metadata for matching IDs only. No field merge/conflict-free multi-device editing.
Firefox consent uses optional manifest data permissions; Chrome uses local
confirmation. Imported syncEnabled is not consent. Browser sync services are
separate. Chrome uses alarms, Firefox timers; local changes prepare/upload,
remote changes schedule restore. Quotas/propagation delays remain external limits.

## Security and permissions

Permissions: activeTab/bookmarks/search/scripting/storage/tabs/unlimitedStorage
and `<all_urls>` hosts; Chrome adds alarms. User action triggers overlay injection,
but broad host access remains for images. Unlimited storage does not remove sync
quotas. Use `textContent` for untrusted DOM text. Dynamic lists use DOM creation
and text/value properties, not HTML parsing. Only the static overlay shell uses
an HTML literal without interpolation. Validate messages/imports; no credentials/secrets in code or logs.
There is no support button or remote widget script. Search opens
the selected service. No proprietary telemetry or payment server is implemented.

## Development and releases

PowerShell 7, Node.js for checks, Firefox 142+/Chrome 148+. CI uses Node 24.
Firefox packaging skips Node checks if Node is absent; do not omit it for validation.

```powershell
.\build.ps1
.\build.ps1 -Browser firefox
.\build.ps1 -Browser chrome
node .\scripts\release-notes.js
```

Chrome configuration derives from Firefox: remove Gecko settings, set worker,
PNG icons, alarms/minimum version and staged locales. Do not maintain generated
packages as separate source code.

| Test | Coverage |
| --- | --- |
| store.test.js | Model, migrations, covers, bookmarks, sync, settings logs |
| wiring.test.js | HTML/JS wiring, help, versions |
| background.test.js | Firefox background, toolbar/fallback |
| chrome.test.js | API-mocked worker, import, messages, covers, sync alarms |
| overlay-tags.test.js | Optional Chromium tags/cancellation/reinjection/no support button |
| dashboard-tags.test.js | Optional Chromium form tags/removed support elements |
| dom-rendering.test.js | Optional Chromium markup-shaped input/table/cards/settings/logs/import |

First four run during build. UI tests require Playwright and a Chromium executable
as the first argument; isolated mocks/fixtures do not replace installed-extension tests.

Release: update manifest/current README/help/version assertions; increment schema
only for data-contract changes. Add DE/EN changelog and dashboard patch notes.
Build/test both browsers, push commit and matching `v<manifest.version>` tag,
then verify workflow/assets. Source-code ZIPs are not browser packages.
`release.yml` runs on tags/manual dispatch. New releases use changelog notes;
existing releases replace ZIPs with `--clobber` but do not update release text.
A normal push does **not** replace ZIPs. Same-version replacements may differ
from tagged source; prefer a new patch version for traceability.

## Diagnostics and maintenance boundaries

- Collection instead of overlay: HTTP(S) tab, protected page, injection/message errors.
- Missing cover: cache key, URL, automation flag, HTTP status and visibility observer separately.
- Missing sync: consent vs syncEnabled, quotas, revisions, scheduler; backup before forced restore.
- Old download: commit/version/workflow/asset contents; push alone is insufficient.

Stable IDs/keys/array positions require migration before changes. Each setting
needs default, normalization, write path, UI state, translations and tests.
Messages need both browser response paths. Failure handling must not silently
replace the last valid local dataset.

Reference separated from user help/procedures, following
[Diátaxis](https://www.diataxis.fr/reference/).
