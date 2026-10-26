/* Prüft, ob die JavaScript-Dateien nur tatsächlich vorhandene HTML-IDs nutzen. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');

function htmlIds(source) {
  return new Set([...source.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
}

function referencedIds(source, expression) {
  return [...source.matchAll(expression)].map((match) => match[1]);
}

const dashboardHtml = fs.readFileSync(path.join(root, 'dashboard/index.html'), 'utf8');
const dashboardJs = fs.readFileSync(path.join(root, 'dashboard/app.js'), 'utf8');
const dashboardCss = fs.readFileSync(path.join(root, 'dashboard/styles.css'), 'utf8');
const storeJs = fs.readFileSync(path.join(root, 'shared/store.js'), 'utf8');
const syncJs = fs.readFileSync(path.join(root, 'shared/sync.js'), 'utf8');
const dashboardIds = htmlIds(dashboardHtml);
assert.match(storeJs, /language: 'en'/, 'Neue Sammlungen starten nicht auf Englisch');
assert.match(storeJs, /language: input\.settings\?\.language === 'de' \? 'de' : 'en'/, 'Explizite deutsche Sprachwahl muss erhalten bleiben');
assert.match(dashboardHtml, /id="onboardingDialog"[^>]*aria-labelledby="welcomeTitle"/, 'Begrüßungsdialog hat keinen zugänglichen Titel');
for (const key of ['welcomeStepOneTitle', 'welcomeStepTwoTitle', 'welcomeStepThreeTitle', 'welcomeImportText', 'welcomeStorage']) {
  assert.equal([...dashboardJs.matchAll(new RegExp(`${key}:`, 'g'))].length, 2, `${key} muss auf Deutsch und Englisch vorhanden sein`);
}
const dashboardReferences = referencedIds(dashboardJs, /getElementById\('([^']+)'\)/g);
const missingDashboardIds = [...new Set(dashboardReferences.filter((id) => !dashboardIds.has(id)))];
assert.deepEqual(missingDashboardIds, [], `Fehlende Dashboard-IDs: ${missingDashboardIds.join(', ')}`);
assert.match(dashboardHtml, /<table class="collection-table">/, 'Manga-Tabelle besitzt keine eigene Layoutklasse');
assert.match(dashboardHtml, /<col class="col-rating">/, 'Dynamische Bewertungsspalte fehlt');
assert.match(dashboardJs, /dataset\.ratingScale = String\(ratingMax\(\)\)/, 'Sterneanzahl wird nicht an das Tabellenlayout übergeben');
assert.match(dashboardJs, /URL\.createObjectURL\(new Blob/, 'Lokale Cover werden nicht als kompakte Blob-URL dargestellt');
assert.match(dashboardJs, /revokeCoverObjectUrls\(\)/, 'Temporäre Cover-URLs werden nicht freigegeben');
assert.doesNotMatch(dashboardJs, /class="(?:card-cover )?cover-image"[^>]*loading="lazy"/, 'Native und eigene Cover-Lazy-Logik dürfen nicht gleichzeitig aktiv sein');
assert.match(dashboardJs, /const savedData = await MangaStore\.upsertItem\(/, 'Bearbeiten-Dialog übernimmt den gespeicherten Datensatz nicht');

// Die Navigationszähler müssen auch in der Einstellungsansicht aktualisiert
// werden. renderCollection() läuft dort absichtlich nicht, render() dagegen
// immer. Dieser Test verhindert, dass die sichtbaren Werte wieder bei 0 bleiben.
const renderSection = dashboardJs.slice(
  dashboardJs.indexOf('function render()'),
  dashboardJs.indexOf('async function reload()')
);
assert.match(
  renderSection,
  /renderCategoryNavigation\(\);[\s\S]*renderCounts\(\);/,
  'Kategoriezähler werden in den Einstellungen nicht aktualisiert'
);

const overlayJs = fs.readFileSync(path.join(root, 'content/overlay.js'), 'utf8');
assert.doesNotMatch(overlayJs, /id="mr-entry-tags"/, 'Freitextfeld für Tags darf nicht mehr im Pop-up vorhanden sein');
assert.match(overlayJs, /enabledTagPresets = MangaStore\.cleanTags\(data\.settings\.tagPresets/, 'Tag-Auswahl muss die aktivierten Einstellungen verwenden');
assert.match(overlayJs, /tags: pendingDraft\.tagsEdited \? pendingDraft\.tags : pendingMatch\.tags/, 'Bewusste Tag-Änderungen gehen beim Kapitelupdate verloren');
const iconSvg = fs.readFileSync(path.join(root, 'icons/manga-regal.svg'), 'utf8');
assert.match(iconSvg, /<svg[^>]*viewBox="0 0 64 64"[^>]*width="64"[^>]*height="64"/, 'Firefox-Symbol besitzt nicht alle von Firefox benötigten SVG-Abmessungen');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const germanLocale = JSON.parse(fs.readFileSync(path.join(root, '_locales/de/messages.json'), 'utf8'));
const englishLocale = JSON.parse(fs.readFileSync(path.join(root, '_locales/en/messages.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3, 'Firefox-Paket muss Manifest V3 verwenden');
assert.equal(manifest.version, '0.20.21', 'Manifest-Version entspricht nicht dem aktuellen Hilfestand');
assert.equal(manifest.default_locale, 'de', 'Deutsche Standard-Lokalisierung fehlt im Manifest');
assert.equal(manifest.name, '__MSG_extensionName__', 'Add-on-Name verwendet die Firefox-Lokalisierung nicht');
assert.equal(manifest.description, '__MSG_extensionDescription__', 'Add-on-Beschreibung verwendet die Firefox-Lokalisierung nicht');
assert.equal(manifest.action.default_title, '__MSG_actionTitle__', 'Toolbar-Text verwendet die Firefox-Lokalisierung nicht');
assert.equal(manifest.commands['toggle-manga-regal'].description, '__MSG_commandDescription__', 'Kürzelbeschreibung verwendet die Firefox-Lokalisierung nicht');
assert.equal(germanLocale.extensionName.message, 'Manga-Regal', 'Deutscher lokalisierter Add-on-Name fehlt');
assert.equal(englishLocale.extensionName.message, 'Manga Shelf', 'Englischer Add-on-Name ist nicht Manga Shelf');
assert.match(englishLocale.extensionDescription.message, /Save, rate, tag/, 'Englische Add-on-Beschreibung fehlt');
assert.equal(Object.prototype.hasOwnProperty.call(manifest.background || {}, 'persistent'), false, 'Manifest V3 darf background.persistent nicht enthalten');
assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, '142.0', 'Firefox-Dateneinwilligung setzt plattformübergreifend mindestens Firefox 142 voraus');
assert.deepEqual(
  manifest.browser_specific_settings.gecko.data_collection_permissions.required,
  ['none'],
  'Lokale Nutzung darf keine verpflichtende Datenübertragung verlangen'
);
assert.deepEqual(
  manifest.browser_specific_settings.gecko.data_collection_permissions.optional,
  ['bookmarksInfo', 'browsingActivity', 'technicalAndInteraction', 'websiteActivity', 'websiteContent'],
  'Optionale Firefox-Sync-Datentypen sind nicht vollständig deklariert'
);
assert.match(dashboardJs, /MangaSync\.requestConsent\(\)/, 'Firefox Sync fordert die optionale Datenfreigabe nicht an');
assert.match(syncJs, /await requireConsent\(\);[\s\S]*browser\.storage\.sync\.get/, 'Firefox Sync darf ohne Datenfreigabe nicht gelesen werden');
assert.match(syncJs, /await requireConsent\(\);[\s\S]*browser\.storage\.sync\.set/, 'Firefox Sync darf ohne Datenfreigabe nicht beschrieben werden');
assert.deepEqual(Object.keys(manifest.action.default_icon), ['16', '32', '48', '64'], 'Toolbar-Symbol stellt Firefox nicht alle benötigten Größen bereit');
assert.match(overlayJs, /function captureVisibleCover\(\)/, 'Bereits sichtbare Cover werden nicht ohne zweiten Download übernommen');
assert.match(overlayJs, /function coverForChapterUpdate\(/, 'Kapitelupdates besitzen keine eindeutige Cover-Priorität');
assert.match(overlayJs, /cacheCover\(savedItem, \{ referrerUrl: location\.href, force:/, 'Cover werden nicht zuerst aus dem geöffneten Manga-Tab geladen');
assert.match(overlayJs, /manga-regal:update-linked-bookmark/, 'Importierte Firefox-Lesezeichen werden beim Kapitelupdate nicht weitergeführt');
const backgroundJs = fs.readFileSync(path.join(root, 'background/background.js'), 'utf8');
assert.match(backgroundJs, /browser\.bookmarks\.update\(item\.bookmarkId/, 'Der Hintergrund aktualisiert verknüpfte Lesezeichen nicht');
const overlayTemplate = overlayJs.match(/root\.innerHTML = `([\s\S]*?)`;/)?.[1] || '';
assert.ok(overlayTemplate, 'The overlay shell must be a static literal');
assert.ok(!overlayTemplate.includes('${'), 'Overlay shell must not interpolate dynamic values');
assert.doesNotMatch(dashboardJs, /\.(?:innerHTML|outerHTML)\s*=|insertAdjacentHTML\s*\(/, 'Dashboard must render dynamic data using DOM nodes');
assert.equal((overlayJs.match(/\.innerHTML\s*=/g) || []).length, 1, 'Only the static overlay shell may use innerHTML');
const overlayIds = htmlIds(overlayTemplate);
const overlayReferences = referencedIds(overlayJs, /byId\('([^']+)'\)/g);
const missingOverlayIds = [...new Set(overlayReferences.filter((id) => !overlayIds.has(id)))];
assert.deepEqual(missingOverlayIds, [], `Fehlende Overlay-IDs: ${missingOverlayIds.join(', ')}`);

// Die lokale Hilfe gehört zum Paket. Alle eingebundenen Bilder und Skripte
// müssen deshalb auch ohne Internetverbindung vorhanden sein.
const helpHtml = fs.readFileSync(path.join(root, 'help/index.html'), 'utf8');
const settingsHelpHtml = fs.readFileSync(path.join(root, 'help/settings.html'), 'utf8');
const englishHelpHtml = fs.readFileSync(path.join(root, 'help/index.en.html'), 'utf8');
const englishSettingsHelpHtml = fs.readFileSync(path.join(root, 'help/settings.en.html'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const englishReadme = fs.readFileSync(path.join(root, 'README.en.md'), 'utf8');
const germanReadme = fs.readFileSync(path.join(root, 'README.de.md'), 'utf8');
assert.equal(readme, englishReadme, 'Default README must match the English edition');
assert.match(readme, /# Manga Shelf/);
assert.match(readme, /\*\*English\*\* · \[Deutsch\]\(README\.de\.md\)/);
assert.match(germanReadme, /\[English\]\(README\.md\) · \*\*Deutsch\*\*/);
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
const englishChangelog = fs.readFileSync(path.join(root, 'CHANGELOG.en.md'), 'utf8');
const helpAssets = [...helpHtml.matchAll(/(?:src|href)="([^"#?]+)"/g)]
  .map((match) => match[1])
  .filter((asset) => !asset.startsWith('../dashboard/'));
const missingHelpAssets = helpAssets.filter((asset) => !fs.existsSync(path.resolve(root, 'help', asset)));
assert.deepEqual(missingHelpAssets, [], `Fehlende Hilfe-Dateien: ${missingHelpAssets.join(', ')}`);
const settingsHelpAssets = [...settingsHelpHtml.matchAll(/(?:src|href)="([^"#?]+)"/g)]
  .map((match) => match[1])
  .filter((asset) => !asset.startsWith('../dashboard/'));
const missingSettingsHelpAssets = settingsHelpAssets.filter((asset) => !fs.existsSync(path.resolve(root, 'help', asset)));
assert.deepEqual(missingSettingsHelpAssets, [], `Fehlende Einstellungs-Hilfe-Dateien: ${missingSettingsHelpAssets.join(', ')}`);
assert.match(dashboardHtml, /href="\.\.\/help\/settings\.html"/, 'Einstellungs-Hilfe ist nicht verknüpft');
assert.match(helpHtml, /href="settings\.html"/, 'Detailseite fehlt in der Haupthilfe');
assert.match(dashboardHtml, /id="showPatchlogTab"/, 'Patchlog-Reiter fehlt in den Einstellungen');
assert.match(dashboardHtml, /id="showOnboardingSetting"/, 'Schalter für den Startdialog fehlt');
assert.match(dashboardHtml, /id="chapterDetectionSetting"/, 'Schalter für die Kapitel-Link-Erkennung fehlt');
assert.match(dashboardHtml, /id="offerRereadSetting"/, 'Schalter für die Re-Read-Option fehlt');
assert.match(dashboardHtml, /id="autoTagRereadsSetting"/, 'Schalter für den automatischen Re-Read-Tag fehlt');
assert.match(dashboardJs, /chapterDetectionEnabled/, 'Dashboard berücksichtigt die Kapitel-Link-Erkennung nicht');
assert.match(overlayJs, /function detectedChapter\(url\)/, 'Tab-Formular berücksichtigt die Kapitel-Link-Erkennung nicht');
assert.match(overlayJs, /id="mr-chapter-auto"/, 'Einzelne Kapitel-Automatik fehlt im Speicher-Pop-up');
assert.match(overlayJs, /chapterAutoButton\.disabled = !globalChapterDetection/, 'Einzelschalter berücksichtigt die globale Einstellung nicht');
assert.match(overlayJs, /chapterDetectionDisabled/, 'Kapitel-Automatik wird nicht pro Manga gespeichert');
assert.match(overlayJs, /chapterInput\.value = storedChapterBaseline/, 'Ausschalten der Kapitel-Automatik stellt den gespeicherten Kapitelstand nicht wieder her');
assert.match(overlayJs, /keepStoredChapter \? pendingMatch\.currentChapter : pendingDraft\.currentChapter/, 'Ein Link-Update kann den eingefrorenen Kapitelstand weiterhin überschreiben');
assert.match(overlayJs, /chapterFrozenHint/, 'Der Update-Dialog erklärt den eingefrorenen Kapitelstand nicht');
assert.match(overlayTemplate, /id="mr-update-target"/, 'Auswahl des zu aktualisierenden Lesestands fehlt');
assert.match(overlayJs, /findLikelyMatches/, 'Der Dialog erhält nicht alle erkannten Lesestände');
assert.match(overlayJs, /rereadOf: rootId/, 'Ein neuer Re-Read wird nicht mit dem Hauptstand verbunden');
assert.match(storeJs, /incomingChapter > primaryChapter/, 'Höhere Kapitel werden nicht dem Hauptstand vorgeschlagen');
assert.match(dashboardCss, /\.tag\.reread-tag/, 'Der Re-Read-Tag besitzt keinen sichtbaren Indikator');
assert.doesNotMatch(overlayTemplate, /<label[^>]*for="mr-entry-chapter"[^>]*>[^<]*<button/, 'Der Kapitelknopf darf nicht in einem Label verschachtelt sein');
const overlayCss = fs.readFileSync(path.join(root, 'content/overlay.css'), 'utf8');
assert.match(overlayJs, /attachShadow\(\{ mode: 'open' \}\)/, 'Overlay needs a CSS isolation boundary');
assert.match(overlayJs, /adoptedStyleSheets/, 'Overlay styles must support strict page CSP');
assert.match(overlayTemplate, /class="mr-chapter-control mr-with-auto"[^>]*><input id="mr-entry-chapter"[^>]*><button class="mr-chapter-auto"/, 'Kapitelknopf steht nicht unmittelbar hinter dem Kapitelfeld');
assert.match(overlayTemplate, /id="mr-cover-control"[^>]*><input id="mr-entry-cover-url"[^>]*><button class="mr-chapter-auto mr-cover-auto"/, 'Cover-Automatik steht nicht unmittelbar hinter dem Coverfeld');
assert.match(overlayJs, /coverDetectionDisabled/, 'Cover-Automatik wird nicht dauerhaft pro Manga gespeichert');
assert.match(overlayJs, /force: draft\.coverManualChange === true/, 'Eine bewusste manuelle Cover-Aenderung kann die Automatik nicht kontrolliert ueberstimmen');
assert.match(storeJs, /item\?\.coverDetectionDisabled === true && options\.force !== true/, 'Zentrale Cover-Ladelogik respektiert die Manga-Ausnahme nicht');
assert.match(overlayCss, /grid-template-columns: minmax\(0, 1fr\) 34px/, 'Kapitelknopf besitzt keine kompakte feste Breite');
// Ten-star typography may shrink in glass themes; chapter geometry must not.
assert.doesNotMatch(overlayCss, /data-rating-scale[^{}]*\.mr-(?:chapter|row|field)/, 'Kapitelknopf darf nicht mehr von der Sterneskala abhängen');
assert.doesNotMatch(overlayCss, /grid-template-areas/, 'Das stabile Formular darf nicht erneut in ein gemeinsames Bereichsraster gezwungen werden');
assert.match(dashboardHtml, /id="exportFirefoxBookmarks"/, 'Rückexport zu Firefox-Lesezeichen fehlt');
assert.match(dashboardHtml, /id="placeholderTagMap"/, 'Tag-Zuordnung für Platzhalter-Cover fehlt');
assert.match(dashboardHtml, /id="placeholderCoversEnabledSetting"[^>]*role="switch"/, 'Schalter für Platzhalter-Cover fehlt');
assert.match(dashboardJs, /MangaStore\.exportToFirefoxBookmarks/, 'Rückexport-Knopf ist nicht mit der Speicherlogik verbunden');
assert.match(dashboardJs, /placeholderCoverByTag/, 'Platzhalter-Cover werden nicht anhand der Tags zugeordnet');
assert.match(dashboardJs, /data-placeholder-upload/, 'Die vier Platzhalterbilder koennen nicht lokal ersetzt werden');
assert.match(dashboardJs, /saveCustomPlaceholderCover/, 'Eigene Platzhalterbilder sind nicht mit dem lokalen Speicher verbunden');
assert.match(dashboardJs, /placeholderCoversEnabled === false/, 'Deaktivierte Platzhalter werden in der Sammlung nicht berücksichtigt');
assert.match(storeJs, /customPlaceholderCovers/, 'Eigene Platzhalterbilder fehlen in der JSON-Sicherung');
assert.match(dashboardCss, /\.appearance-panel\{[^}]*order:1/, 'Oberfläche steht nicht an erster Stelle');
assert.match(dashboardCss, /\.collection-table \.row-cover\{width:62px;height:86px/, 'Tabellen-Cover sind nicht ausreichend groß');
assert.match(dashboardCss, /\.manga-card\{grid-template-columns:150px minmax\(0,1fr\);min-height:260px\}/, 'Kachel-Cover besitzen keine proportionale Bildspalte');
assert.match(dashboardCss, /\.card-cover-frame \.card-cover,\.card-cover\{[^}]*object-fit:contain/, 'Kachel-Cover werden weiterhin unkontrolliert zugeschnitten');
assert.match(dashboardCss, /\.tag-preset-panel\{[^}]*order:2/, 'Tag-Vorauswahl steht nicht an zweiter Stelle');
assert.match(dashboardCss, /\.backup-panel\{order:3\}[\s\S]*\.bookmark-export-panel\{order:6\}/, 'Die vier unteren Kacheln sind nicht korrekt geordnet');
assert.match(dashboardJs, /showOnboardingOnStartup && !data\.settings\.onboardingComplete/, 'Startdialog berücksichtigt den Schalter nicht');
assert.match(helpHtml, /class="help-tabs"/, 'Hilfe-Tabs fehlen in der allgemeinen Anleitung');
assert.match(settingsHelpHtml, /class="help-tabs"/, 'Hilfe-Tabs fehlen in der Einstellungsanleitung');
assert.match(englishHelpHtml, /class="help-tabs"/, 'Help tabs are missing from the English guide');
assert.match(englishSettingsHelpHtml, /class="help-tabs"/, 'Help tabs are missing from the English settings guide');
for (const [filename, source] of [['help/index.html', helpHtml], ['help/index.en.html', englishHelpHtml], ['help/settings.html', settingsHelpHtml], ['help/settings.en.html', englishSettingsHelpHtml]]) {
  assert.match(source, /Version 0\.20\.21/, `${filename} ist nicht auf dem aktuellen Versionsstand`);
}
assert.match(dashboardJs, /language === 'en' \? '\.en' : ''/, 'Dashboard routes English users to German help pages');
assert.match(germanReadme, /\[Änderungsverlauf\]\(CHANGELOG\.md\)/, 'Deutsche README verlinkt die Versionshistorie nicht');
assert.match(germanReadme, /\[English\]\(README\.md\)/, 'Deutsche README verlinkt die englische Fassung nicht');
assert.match(englishReadme, /\[Deutsch\]\(README\.de\.md\)/, 'Englische README verlinkt die deutsche Fassung nicht');
assert.match(changelog, /## \[0\.20\.21\]/, 'Aktuelle Version fehlt im zentralen Changelog');
assert.match(englishChangelog, /## \[0\.20\.21\]/, 'Current version is missing from the English changelog');
assert.doesNotMatch(dashboardJs, /version: '0\.19\.16'/, 'Alte Versionshistorie wurde nicht aus app.js entfernt');

for (const filename of ['arcane-library.jpg', 'moon-city.jpg', 'forest-shrine.jpg', 'cosmic-gate.jpg']) {
  assert.ok(fs.existsSync(path.join(root, 'assets', 'placeholders', filename)), `Platzhalter-Cover fehlt: ${filename}`);
}

console.log(`Oberflächen-Verknüpfungen und lokale Hilfe erfolgreich geprüft (${dashboardReferences.length + overlayReferences.length} Referenzen).`);
