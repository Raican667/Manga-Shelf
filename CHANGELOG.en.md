# Changelog

[Deutsch](CHANGELOG.md) | **English**

All notable changes to Manga-Regal are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
versions follow [Semantic Versioning](https://semver.org/).

## [0.20.20] – 2026-10-26

### Added

- Select backup folder button with visible destination in Settings → Technical & Data → Data backup.
- Chrome uses its real directory picker with profile-local handle storage.
- Firefox on Windows uses an optional native-messaging helper. Separate helper ZIP includes installer, source and unregister script that preserves backups.
- Per-extension ownership indexes protect unrelated files during retention; new files complete before old files are removed.

### Fixed

- Removed JSON data-URL downloads, eliminating the reported Firefox Access denied error in downloads.download.
- Missing folders/revoked access never silently fall back to Downloads. Legacy verbose errors no longer display embedded backup contents.

### Quality assurance

- Compiled Windows helper tested through real framed stdio, Unicode/full JSON, retention, extension allowlist and path validation; no registration in the user's profile.
- Real Chromium directory I/O and IndexedDB handle persistence tested in an isolated profile. Native folder dialogs and signed store upgrades are not automated.
- Combined English/German release notes cover 0.20.15–0.20.20.

## [0.20.19] – 2026-10-26

### Improved

- Settings grouped into Appearance, Tag Presets and Technical & Data. Backups, Sync, browser integration, bookmark export and both logs are in the technical tab.
- Keyboard-accessible tabs, German/English names and section retention through autosave. Switching sections alone retains existing forms and unsaved inputs.
- Editable backup count, default 7, replaces the fixed dropdown. Invalid input turns red and is not saved; internal upper bound is 365.
- Backup destination integration is unchanged in this version; the Firefox helper and Chrome directory-access implementation are not included yet.

### Quality assurance

- UI tests cover grouping, keyboard navigation, narrow layout, write-free section switching and count validation.

## [0.20.18] – 2026-10-26

### Fixed

- Shadow DOM isolates the save popup from page CSS, preventing global page rules from hiding or displacing titles, covers and form controls.
- Packaged styles delivered by the background avoid page style-src restrictions.
- Hardened host, explicit text direction and hidden-until-styled initialization.

### Quality assurance

- All six themes tested with hostile page CSS, strict CSP, ten stars, tags and a narrow viewport.
- Tag selection, reinjection, help and standard theme previews remain covered. Persistence, cover storage and Sync logic are unchanged.

## [0.20.17] – 2026-10-26

### Added

- Opt-in daily JSON file backups including settings and local artwork in Downloads/MangaShelf/Backups. Download permission is requested only on activation.
- Retain 5–10 files, default 7. Only after a successful download are the oldest own backup files permanently removed.
- Backup status, manual downloads and startup catch-up; configuration stays device-local.
- Assign ratings directly beside visibility in each real category row, including custom categories.

### Fixed

- Empty, smaller or not-yet-connected local data cannot automatically replace the existing Sync snapshot.
- Enabling or manually running Sync offers an explicit snapshot choice; overwriting requires additional confirmation.
- Automatic restore pauses for unsynced local changes or smaller remote collections. Choices are bound to the inspected revision.
- Uploads no longer remove all active Sync keys first. Previous transport and pre-restore metadata remain local for recovery diagnostics.

### Quality assurance

- Isolated tests cover storage removal, unchanged remote data, permission denial, interrupted downloads and safe oldest-first cleanup.
- Help distinguishes temporary Firefox installs from store updates. Simulated browser APIs, not a signed-store upgrade test.

## [0.20.16] – 2026-10-26

### Added

- Visibility control before each layout dropdown for built-in and custom categories. Hiding only removes the tab; at least one remains visible.
- Reorder categories directly in the top navigation. Order is persisted once on drop; settings arrows and drag handles remain available.
- Route exact star ratings to real categories. Confirmed rules move existing matches and apply to new entries and changed ratings.
- Rating and category choices for folder, manual and keyword imports, with per-folder overrides and active rating rules taking priority.

### Quality assurance

- Atomic rejection when an operation exceeds the Reading limit instead of silently moving part of the selection.
- Regression tests for visibility, routing, manual exceptions, import, backup, sync and upgrade persistence with five and ten stars.
- Updated German/English help and developer documentation.

## [0.20.15] – 2026-10-20

### Fixed

- Explicit per-category table views now survive loading when an older global preference selects cards.
- An intentionally empty import keyword is no longer replaced with “chapter” on load.

### Quality assurance

- Mandatory upgrade regression test for the 0.20.9 data schema: settings, categories, order, tags, search engines, ratings, chapters, logs and separately stored images are retained.
- Covers fresh script contexts, repeated reads, schema migration and update events without restarting onboarding.

## [0.20.14] – 2026-10-20

### Added

- Theme dropdown with Light Mode, Dark Mode, Coral Dark, Coral Light, Blue Light and Blue Dark replaces the light/dark switch.
- Shared colors across the collection, settings, save form and all German/English help pages.
- Four glass forms with larger cover previews, quick save and collapsible details. Classic forms remain available.
- Existing color choices migrate compatibly; theme IDs remain included in backups and sync.

### Improved

- Removed per-card blur surfaces, coalesced duplicate refreshes and cached custom placeholder artwork.
- Batched cover geometry reads and briefly debounced rapid search input. Writes arriving during refresh are replayed rather than dropped.
- Replaced large fixed theme backgrounds with bounded decoration at the document top, including settings.
- Native decoding of stored covers replaces per-byte JavaScript loops. No additional HTTP requests or changes to stored covers.
- Stale decoding results are discarded before allocating blob URLs; scrollbar width stays stable across views.
- Regression coverage for all themes, five/ten stars, saves with closed details, 422 manga, native scrolling and settings autosave.

## [0.20.13] – 2026-10-20 – local preview

### Fixed

- Removed per-card and large-surface backdrop blurs to reduce repeated GPU composition; all six themes remain available.
- Coalesced storage notifications and explicit refreshes. Writes arriving during an active read trigger another read instead of being dropped.
- Unchanged theme tokens are not rewritten after unrelated data changes.
- Custom placeholder artwork is read only initially and when changed.
- Cover geometry reads are batched before DOM writes; rapid search input is briefly debounced.
- Added a 422-manga table/card performance regression test. Local ZIPs only; no GitHub release.

## [0.20.12] – 2026-10-20 – local preview

### Added

- Theme dropdown with Light Mode, Dark Mode, Coral Dark, Coral Light, Blue Light and Blue Dark replaces the light/dark switch.
- Shared colors and surfaces across the collection, settings, save form and German/English help pages.
- Four glass form designs with a larger cover preview, quick save and collapsible details. Classic forms remain available.
- Compatible migration of previous color choices, theme ID in backups and sync, and regression coverage for all six themes.
- Local test ZIPs only; not published on GitHub yet.

## [0.20.11] – 2026-10-19

### Added

- Optional Chrome setting “Automatically load covers from all websites” under Settings → Interface.
- A one-time voluntary HTTP/HTTPS all-sites grant replaces individual cover-domain prompts. Limited access remains the default.
- Switching off revokes broad host access. Local covers remain stored; individual domains may need permission again.
- The switch reflects actual browser grants, including external revocation. Consent is never synchronized or enabled from backups.
- Tests cover grant, denial, revocation and preserved local covers. Firefox permissions are unchanged.

## [0.20.10] – 2026-10-19

### Changed

- Chrome no longer requires permanent access to all websites; the save form uses `activeTab` and `scripting`.
- Additional cover-download access is optional and requested only for the concrete image domain after an explicit click.
- Manga entries remain saved when cover access is declined. Existing local covers remain available without another download.
- Firefox permissions are unchanged. Both browser packages use version 0.20.10.
- Added regression coverage for missing, granted and revoked cover access and the permission page.

## [0.20.9] – 2026-10-18

### Security

- Replaced dynamic HTML assignments in the collection and save popup with DOM creation and text/value properties.
- Custom category names in status selectors are no longer interpreted as HTML.
- Added regression tests for markup-shaped titles, tags, categories, search engines, logs and bookmarks.
- Static checks prevent new dynamic HTML assignments; the overlay shell remains an immutable literal.

## [0.20.8] – 2026-10-18

### Changed

- Changed Firefox ID to `manga-shelf@local.example`. Separate installation; transfer an existing collection using JSON backup.
- ZIP filenames and build/release references use `manga-shelf` instead of `manga-regal`.

- Changed the project license to GPL-3.0-only. Previous MIT grants remain in effect.
- Public baseline with fresh Git history; no old private records are migrated.
- English default README, German as the second option and new public download links.
- Removed the support button and its settings switch.
- Restricted CI permissions, pinned Actions to commit hashes and added security guidance.

## [0.20.7] – 2026-10-10

### Changed

- Settings logs identify the setting and its previous and new values. Unchanged saves do not add entries.
- Browser-neutral labels for bookmark import, export and the import visibility setting in German and English.

### Fixed

- Dynamic Chrome messages no longer mention Firefox; Chrome Sync instructions no longer refer to a Mozilla account.
- Added automated Chrome import tests for folders, keywords and individual bookmarks, including ratings, chapter progress and duplicate prevention.

## [0.20.6] – 2026-10-10

### Added

- Optional Ko-fi support button before bookmark import in the collection and at the top of the save popup.
- Persistent “Show Ko-fi button” setting completely hides both buttons without leaving empty space.
- German and English labels. Ko-fi opens in a new tab only when clicked; no external widget scripts or automatic payment prompts.

## [0.20.5] – 2026-10-09

### Changed

- Add and edit manga now use “Adjust tags” instead of a free-text tag field.
- Consistent compact tag picker for forms, table rows and cards, with green Re-Read highlighting.
- Only enabled presets and existing assignments are offered. Create new tags in Settings.
- Form tags are persisted only when saving the manga; cancelling the picker changes nothing.

## [0.20.4] – 2026-10-09

### Changed

- Published the current popup tag picker as a new version: compact tag chips, no empty-selection hint, and green Re-Read highlighting.
- Updated version references, help and Firefox/Chrome download links to 0.20.4.

## [0.20.3] – 2026-10-09

### Changed

- Redesigned the save popup's tag picker with compact wrapping chips in a subtle dashed container.
- Removed the unnecessary “No tags selected” hint; an empty selection shows the selection button directly.
- Highlighted Re-Read in green in the save popup, both in the picker and selected tags.
- Improved selected, keyboard-focus and hover states with coordinated light and dark appearances.
- Selection, Cancel and Apply behavior remain unchanged and have been retested.

## [0.20.2] – 2026-10-09

### Fixed

- Orphaned popup markup after an extension update no longer blocks initialization in an already-open tab.
- Opening and closing the save popup explicitly acknowledge the message channel, avoiding Chrome's collection fallback caused by a missing response.
- Injection errors are logged in the background instead of silently swallowed.
- Regression test verifies reinitialization with existing markup and responses when opening and closing.

## [0.20.1] – 2026-10-09

### Changed

- Removed the save popup's free-text tag input. “Adjust tags” opens a checkbox picker with enabled presets, Cancel, and Apply.
- Existing tags stay visible and removable. Explicit changes are also applied when updating a chapter.
- Settings link to the version history in the selected language. GitHub release notes have clearly separated English and German sections, with English first.
- Tested tag selection, removal, applying changes, and cancellation with Escape in a real Chrome UI test.

## [0.20.0] – 2026-10-09

### Added

- Shared codebase with separate Firefox and Chrome packages; Chrome 148 or newer.
- Chrome service worker, PNG icons, default search engine integration, and shortcut configuration through Chrome.
- German and English confirmation dialog for Chrome Sync. Consent stays device-local and is neither imported nor synchronized.
- Chrome package descriptions name Chrome instead of Firefox.
- Worker-compatible local cover storage and alarm-based automatic Chrome Sync tasks.
- Automated Chrome worker, message channel, cover cache, and package configuration tests.

### Notes

- Sync connects devices using the same browser only. Use JSON backups to transfer between Firefox and Chrome.
- Existing Firefox identifiers remain stable; no separate repository is required.

## [0.19.20] – 2026-10-09

### Changed

- Revised the welcome dialog with clear step headings, bookmark import guidance, and an explanation of local storage and optional Sync.
- New installations start in English, including the welcome dialog. Existing language choices are preserved.
- The English display name is now “Manga Shelf”. The German name remains “Manga-Regal”; technical identifiers and existing data are unchanged.
- Made the dialog scrollable in small windows and added accessible labels.
- Logs keep the latest 100 entries by default. The switch next to “Clear log” disables automatic deletion of old entries; turning it back on removes older entries.

## [0.19.19] – 2026-10-09

### Added

- The icon and title in the save popup header now open the collection.
- Keyboard access, visible focus, and German/English labels for both shortcuts.

## [0.19.18] – 2026-10-08

### Documentation

- Updated the general and settings guides to the current feature set.
- Updated the German and English help pages in parallel and connected them with language switches.
- Replaced the illustrations for the save form, collection, settings, and local cover/Sync storage.
- Added guidance for title-based re-read matching, Cloudflare covers, placeholder assignment, and troubleshooting.

### Changed

- Updated the Firefox package, README, and patch log to version 0.19.18.

## [0.19.17] – 2026-10-08

### Added

- Each of the four placeholder artworks can be replaced with a local JPG, PNG,
  or WebP image and restored individually.
- A slider can hide placeholder covers completely.
- Custom placeholder images are included in JSON backups.

### Privacy

- Custom placeholder images remain excluded from Firefox Sync.

## [0.19.16] – 2026-10-08

### Added

- `Re-Read` is available as an enabled default in the **Edit tags** dialog.
- Existing installations receive the preset through a data migration.

## [0.19.15] – 2026-10-08

### Added

- Separate re-read progress entries can be linked to a primary reading progress.
- Chapter logic suggests the primary entry or re-read based on the incoming chapter.
- The save target can still be changed manually before updating.
- The re-read option and automatic Re-Read tag can be configured separately.

## [0.19.14] – 2026-10-01

### Changed

- Added Mozilla's `data_collection_permissions` declaration to the manifest.
- Firefox Sync requests optional data types only when explicitly enabled and
  remains fully disabled without consent.
- Increased the minimum supported version to Firefox 142.

## [0.19.13] – 2026-09-27

### Fixed

- Disabling chapter detection for a manga now reliably freezes its stored chapter
  while an existing entry is updated.
- The URL can still be updated, and the chapter can be changed manually afterward.

## [0.19.12] – 2026-09-27

### Fixed

- Removed the unsupported Manifest V3 property `background.persistent`.

## [0.19.11] – 2026-09-27

### Added

- Cover detection can be disabled permanently per manga from the save form.
- Existing local covers remain visible and unchanged.

### Changed

- Realigned category management and moved remove/reset controls to the end of
  each row.

## [0.19.10] – 2026-09-27

### Fixed

- Stabilized the toolbar icon, background startup, and active-tab overlay.
- The collection opens as a fallback on protected Firefox pages.
- Corrected invalid form nesting around the chapter control.

## [0.19.9] – 2026-09-27

### Added

- Chapter detection can be disabled permanently per manga from the control next
  to the chapter field; manual input remains available.

## [0.19.8] – 2026-09-26

### Added

- Global setting for disabling automatic chapter detection from URLs.
- Manual chapters remain available regardless of the global setting.

## [0.19.7] – 2026-09-26

### Changed

- Increased table-cover visibility while keeping the remaining columns compact.
- Card covers now show the complete artwork in a proportional image column.

## [0.19.6] – 2026-09-26

### Fixed

- Firefox imports without a real cover now remain empty.
- Existing entries whose cover incorrectly matches the chapter URL are repaired
  when loaded.

## [0.19.5] – 2026-09-26

### Fixed

- Chapter updates for imported bookmarks preserve IDs, ratings, tags, category,
  and existing local covers.
- The linked Firefox bookmark is updated to the new chapter URL.

## [0.19.4] – 2026-09-26

### Changed

- Existing visible cover previews are preferred for local storage.
- The active manga tab may use its current session and normal page referrer for
  Cloudflare-protected images.
- Cloudflare cookies are never read, stored, or synchronized.

## [0.19.3] – 2026-09-26

### Fixed

- Locally stored covers now render reliably through short-lived Blob URLs.
- Failed images fall back to the appropriate placeholder in a controlled way.

## [0.19.2] – 2026-09-26

### Added

- `XMLHttpRequest` takes over cover downloads when `fetch()` fails.
- Common image formats are recognized despite an incorrect Content-Type header.

## [0.19.1] – 2026-09-26

### Fixed

- Covers and local placeholders load when their frame enters the viewport.

### Added

- Placeholder-tag assignment through draggable chips and four cover cards.

## [0.19.0] – 2026-09-26

### Added

- Four local placeholder covers for manga without custom artwork.
- Automatic artwork selection by manga tag and fixed assignment per tag.
- Placeholders use the same visibility-based lazy loading as real covers.

## [0.18.1] – 2026-09-26

### Changed

- Reordered settings: appearance and tag presets come first, followed by backup
  and Firefox integration sections.

## [0.18.0] – 2026-09-26

### Added

- The collection can be exported back to a regular Firefox bookmark tree with
  category folders.
- Repeated exports replace only the folder managed by Manga-Regal.

## [0.17.1] – 2026-09-26

### Added

- General and settings guides are connected through shared help tabs.
- A slider can disable the startup dialog completely.

## [0.17.0] – 2026-09-26

### Added

- Dedicated help covering every setting.
- Separate tabs for the import/error log and patch log.

## [0.16.3] – 2026-09-26

### Fixed

- The Actions column is no longer clipped.
- Rating-column width adapts to five or ten stars.
- Edit and remove icons are aligned consistently.

## [0.16.2] – 2026-09-26

### Changed

- New installations use five stars by default.
- Existing installations retain their saved rating scale.

## [0.16.1] – 2026-09-26

### Added

- A persistent prepared compressed Sync cache speeds up repeated synchronization.

## [0.16.0] – 2026-09-26

### Added

- The complete Firefox Sync snapshot is gzip-compressed and split into
  size-limited transport chunks.

### Changed

- When changing from ten to five stars, ratings above five are capped at five;
  lower ratings remain unchanged.
