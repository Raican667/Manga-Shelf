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
The overlay is injected UI, not action.default_popup. The exposed host
is #manga-regal-host with inline important resets. An open Shadow Root contains
#manga-regal-overlay and isolates all descendants from page author rules.
manga-regal:overlay-css returns the packaged stylesheet from the background;
CSSStyleSheet.replaceSync/adoptedStyleSheets avoid page style-src restrictions.
A static web-accessible CSS link is retained for preview/older-context fallback.
The host stays invisible until styles load. Theme tokens remain on the inner
root; no page html/body styles are changed. This is CSS isolation, not a security
boundary against page JavaScript. A context sentinel prevents duplicate
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
98,000 and payload target 7,400 characters. Other keys count. Common keys are
replaced without clearing active metadata first; obsolete keys are removed
afterward, or before writing only if needed for quota. A previous transport
snapshot is retained locally and failed writes attempt rollback. Not atomic.

`readRemote()` verifies chunk revision/length and supports uncompressed legacy
formats. `restore()` replaces the collection, retaining local cover/bookmark
metadata for matching IDs only. No field merge/conflict-free multi-device editing.
Firefox consent uses optional manifest data permissions; Chrome uses local
confirmation. Imported syncEnabled is not consent. Browser sync services are
separate. Chrome uses alarms, Firefox timers; local changes prepare/upload,
remote changes schedule restore. Quotas/propagation delays remain external limits.

## Security and permissions

Permissions: activeTab/bookmarks/search/scripting/storage/tabs/unlimitedStorage
Firefox retains `<all_urls>` hosts. Chrome adds alarms but no required host permissions:
`activeTab` + `scripting` inject the overlay only on user action. Chrome declares
HTTP(S) optional hosts because cover CDNs are not known in advance. Only the saved
cover's exact scheme/hostname (`https://cdn.example.org/*`) is requested by default.
The optional Automatically Load Covers From All Websites switch explicitly requests
both `http://*/*` and `https://*/*` in its synchronous click handler. Turning it off
calls `permissions.remove` for both patterns; specific domains may need permission
again. Permission state is read with `permissions.contains`, not stored as a synced
preference. Imports and backups cannot grant access. The switch reflects external
permission additions/removals and stays off after denial. No grant is requested on
startup, rendering, lazy loading or saving settings. Existing local images are kept.

Content-script cover requests still obey page CORS. If they fail, the Chrome
extension-side fallback checks `permissions.contains` before any network attempt.
A missing grant returns `permission-required`, not a failed manga save. The form's
Allow Cover Domain button opens `dashboard/cover-permissions.html?item=ID`. The page
resolves the saved item and calls `permissions.request` directly in its click handler,
before any await. Denial preserves the saved entry. Existing local covers bypass both
network access and permission checks. A manual retry can explicitly override a cover
automation switch, but cannot bypass consent. Server restrictions and redirects to
another unapproved image host can still block a download; local files remain an alternative.
Host grants can be revoked in Chrome's extension site-access settings. Unlimited storage does not remove sync
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
| cover-permissions.test.js | Exact host consent, direct gesture, denial/grant, cached and missing covers |
| cover-permissions-ui.test.js | Optional Chromium permission UI in English/German; durable saves without host access |
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

## Settings navigation

Three static tabpanels retain all controls and event bindings: appearance, tags, technical. currentSettingsSection is transient UI state, optionally initialized by ?view=admin&settings=technical. Switching toggles hidden/aria-selected/tabIndex without replacing form nodes or writing preferences. Arrow keys and Home/End implement roving tab focus. Logs/patchlog remain a nested tablist in the technical panel. The global save button still reads all settings controls. Backup count is a text input with immediate aria-invalid/customValidity validation; only positive integers through 365 persist, default 7. The backend rejects invalid configure requests independently. The folder implementation is described in the following section.

## Daily files and Sync loss protection

shared/backups.js schedules device-local daily backups (default 7, valid 1..365). shared/backup-target.js writes through the optional downloads permission to MangaShelf/Backups relative to the browser download directory. No nativeMessaging host, filesystem handles, directory picker or external executable.

Firefox background pages use Blob URLs retained until completion. Chrome service workers use UTF-8/base64 data URLs because createObjectURL is unavailable there. API errors never expose JSON payloads. The downloads.download result is only a download ID, not a successful file: search must confirm complete and exists before success/retention. A persisted pending ID can be recovered on restart. Journal mangaShelfBackupDownloadsV1 is local-only, separate from collection/Sync. Cleanup checks recorded IDs, extension ownership and exact relative path/unique filename before removeFile. No scanning/deletion of unrelated downloads; cleared history leaves unlocatable files untouched. Daily backup settings and collection data remain intact when switching from the former helper implementation.

Tests: backup-downloads.test.js exercises both URL paths, Unicode/full JSON, completion failure, retention and ownership mismatch; backups.test.js covers scheduling; backup-sync-ui.test.js covers the permission prompt, full export and count field in the real dashboard with mocked browser APIs.

MangaSync.plan reports local/remote counts and the remote revision after validating the full snapshot. Unknown remote revisions and smaller local collections require an explicit revision-bound allowReplaceRevision decision; force only bypasses content-cache checks. The UI does not enable Sync until choosing restore/upload; upload needs additional confirmation. Automatic restore rejects smaller remote collections or unsynced local edits. Metadata is retained in mangaRegalPreSyncRecoveryV1 before a nonempty local restore; previous transport values in mangaRegalRemoteRecoveryV1 before upload. These device-only diagnostic fallbacks are not independent backups and do not survive uninstall.

Temporary add-on removal can clear Firefox extension storage, unlike a normal store update. External backup files survive extension removal; use a separate test profile and a JSON export before testing. No protection can recover data already removed before a backup existed. Sync remains a revisioned snapshot protocol, not transactional multi-device merging. Tests: backups.test.js, sync-safety.test.js and backup-sync-ui.test.js.

## Category routing and visibility

settings.hiddenCategories contains validated built-in/custom view IDs. Only navigation is filtered; status pickers, stored items and bookmark exports retain the full category model. The UI rejects hiding the last visible tab; normalization recovers malformed all-hidden backups by exposing All. Top-nav drag writes categoryOrder once on drop and retains hidden entries in that order. Settings arrows remain the keyboard-accessible alternative.

settings.ratingCategoryRules maps exact integer scores (1..ratingScale) to real statuses; All is not a destination. applyRatingCategory is shared by upsertItem, patchItem and bookmark import. Rules run on creation or explicit rating changes, not ordinary load, sync restore or chapter-only updates. Applying rules in settings explicitly reroutes existing matches after UI confirmation. Removing a rule does not revert earlier moves. Reducing the rating scale removes out-of-range rules and applies the remaining rules to clamped ratings. Deleting a category removes dangling rule/visibility references during normalization.

Import options accept rating/status defaults plus folderRatings/folderStatuses overrides. Selected nested folders override selected parents; rules take precedence over explicit import categories. Reimports update existing URL matches without duplicating them. assertReadingCapacity rejects an entire overfull operation before save; no partial import or rule configuration is committed. JSON backup and compressed Sync include both new settings, but not image bytes. No new permissions or schema version are required. tests/categories.test.js and tests/categories-ui.test.js cover routing, visibility, import modes, 5/10 stars, rollback and responsive layouts.

## Upgrade persistence contract

The extension version in the manifest is independent of DATA_VERSION in shared/store.js. An update must retain the extension identity, the mangaRegalDataV1 storage key and the separate cover/placeholder keys. Keep each repository’s existing Firefox ID; public and legacy/private distributions have different identities.

MangaStore.load normalizes existing data. Defaults fill absent preferences; explicit false values, empty keywords and valid per-category table choices must not be mistaken for missing values. Legacy colorMode supplies the initial theme only when no valid theme is saved. A schema migration writes the normalized data once; subsequent reads are idempotent. A manifest version bump alone does not require a schema bump or storage rewrite.

runtime.onInstalled opens the collection only for reason=install, not update. Onboarding completion is stored, not inferred from the manifest version. Normal updates do not call importData, clear storage or delete image keys. Explicit JSON restoration replaces the collection; enabling/restoring Sync can intentionally apply remote preferences. Browser permission grants are device-managed and cannot be migrated through a settings snapshot.

Run node tests/upgrade.test.js (also required by build.ps1). It uses isolated script contexts and a schema-20 fixture representing 0.20.9, checks all fixture preferences and manga, ensures read-only loads do not write/remove data, preserves separate image keys, and verifies legacy schema migration is idempotent. tests/background.test.js checks the update event does not launch first-install onboarding. These are automated simulations, not a signed-store update test. Test a real store upgrade with the same store listing/extension ID; reinstalling or changing IDs is not an upgrade.

## Theme contract

`shared/themes.js` defines six stable theme IDs and shared tokens. `MangaThemes.apply(root, settings)` writes only to the supplied extension-owned root. The injected overlay never sets tokens on the visited page’s html/body. `shared/page-themes.css` loads only in extension pages; overlay selectors remain scoped under `#manga-regal-overlay`.

MangaStore validates `settings.theme`. Legacy `colorMode` is migrated without losing the previous light/dark choice and remains a compatibility field. JSON backups and compressed sync snapshots retain the theme ID. Glass themes reuse the same form and persistence path: Quick Save calls `requestSubmit()`. There is no separate save model or new cover-download path. Classic themes keep details permanently open.

`tests/themes.test.js` covers migration, validation, backup and sync. `tests/themes-ui.test.js` covers all themes, tags, real saves with closed details, narrow 10-star forms and all four help pages. Captures are in `build/theme-preview/`. Theme and performance changes were tested locally first and published together in 0.20.14.

Performance: `tests/performance.test.js` uses isolated API fixtures with 422 entries. Run it with a Chromium executable and `--assert-optimized`. It checks that cards have no backdrop blur, a settings write has at most one refresh read, unchanged themes are not reapplied, and cached artwork is invalidated on image changes. Timings are diagnostic, not hardware-independent guarantees. Dashboard refreshes share a pending promise and replay storage notifications that arrive during a read. Custom-artwork revisions avoid rereading image payloads on unrelated writes. Theme tokens are cached per DOM root with a WeakMap.

Scrolling: theme gradients are bounded document backgrounds rather than fixed viewport layers. Cached `data:image` covers are decoded via the browser’s native data-URL fetch/Blob path (no HTTP request). A render epoch is checked after decoding and before allocating an object URL, so stale results cannot leak URLs or replace the current cover set. `tests/scrolling.test.js` uses native wheel input with 422 cached image entries, checks monotonic document scrolling, stable dimensions after lazy image loads, settings autosave scroll position and the theme-switch scrollbar gutter. There is no wheel interception, synthetic scrolling or JavaScript momentum.
