/*
 * Einblendung im aktuell geöffneten Webseiten-Tab.
 *
 * Das Skript erzeugt KEIN dauerhaft sichtbares Seitensymbol. Die Einblendung
 * erscheint ausschließlich nach einem Klick auf das Add-on-Symbol in der
 * Firefox-Werkzeugleiste oder nach dem konfigurierten Tastenkürzel.
 */
(function initializeOverlay() {
  'use strict';

  // DOM survives extension reloads; the old content-script listener does not.
  // Only a sentinel in THIS script context proves the message handler is alive.
  // Remove orphaned markup from earlier versions or incomplete initialization.
  if (globalThis.__mangaRegalOverlayReady && document.getElementById('manga-regal-host')?.shadowRoot?.getElementById('manga-regal-overlay')) return;
  document.getElementById('manga-regal-host')?.remove();
  document.getElementById('manga-regal-overlay')?.remove();

  let currentRating = 0;
  let currentCover = '';
  let failedQuickCover = '';
  let currentItemId = '';
  let pendingDraft = null;
  let pendingMatch = null;
  let pendingCandidates = [];
  let overlayLanguage = 'de';
  let currentCoverStored = false;
  let ratingMax = 10;
  let globalChapterDetection = true;
  let offerRereadOnUpdate = true;
  let autoTagRereads = true;
  let selectedTags = [];
  let enabledTagPresets = [];
  let tagsEdited = false;
  let tagSelectionBeforeOpen = [];
  let tagsEditedBeforeOpen = false;
  let chapterDetectionDisabled = false;
  // Ausgangswert des gefundenen Manga. Er wird gebraucht, damit das
  // Ausschalten der Automatik einen bereits erkannten neuen URL-Wert wirklich
  // wieder auf den gespeicherten Kapitelstand zuruecksetzt.
  let storedChapterBaseline = '';
  let storedChapterManual = false;
  let chapterManuallyChanged = false;
  // Anders als die globale Kapitelvorgabe gehoert diese Entscheidung direkt
  // zum Manga. Sie verhindert spaetere automatische Cover-Netzwerkaufrufe.
  let coverDetectionDisabled = false;
  // Nur eine bewusste Dateiauswahl oder Aenderung der Cover-Adresse darf eine
  // deaktivierte Automatik fuer genau diesen Speichervorgang ueberstimmen.
  let coverManuallyChanged = false;

  const overlayTranslations = {
    de: {
      title: 'Im Manga-Regal speichern', subtitle: 'Daten werden ausschließlich lokal in Firefox gespeichert.', fieldTitle: 'Titel', website: 'Webseite', tags: 'Tags', rating: 'Bewertung', chapter: 'Aktuelles Kapitel', chapterPlaceholder: 'Wird möglichst aus dem Link erkannt', chapterManualPlaceholder: 'Optional manuell eintragen', status: 'Status', active: 'Aktiv', reading: 'Lese ich gerade', dropped: 'Gedroppt', completed: 'Abgeschlossen', hold: 'On Hold', full: 'voll', coverUrl: 'Cover-Adresse', coverPlaceholder: 'Automatisch, falls verfügbar', chooseCover: 'Lokales Cover auswählen', openCollection: 'Sammlung öffnen', save: 'Im Regal speichern', confirmTitle: 'Bestehenden Manga aktualisieren?', confirmHint: 'Bewertung, Tags und Status des vorhandenen Eintrags bleiben erhalten.', replace: 'Bestehenden Eintrag aktualisieren', saveSeparate: 'Als neuen Eintrag speichern', cancel: 'Abbrechen', detected: 'Titel, Adresse und verfügbare Seitendaten wurden automatisch übernommen.', existing: 'Dieser Link ist bereits gespeichert. Deine Änderungen aktualisieren den vorhandenen Eintrag.', saved: 'Gespeichert.', chapterWord: 'Kapitel', oldUnknown: 'Bisheriges Kapitel unbekannt', newUnknown: 'Neuer Kapitelstand unbekannt', confirmText: (title) => `„${title}“ ist bereits im Manga-Regal. Soll der gespeicherte Weiterlesen-Link ersetzt werden?`, stars: (value) => `${value} von 10 Sternen`, localCoverReady: 'Lokales Cover ist vorbereitet.', separateSaved: 'Als separater Eintrag gespeichert.', coverDetected: 'Cover erkannt – wird beim Speichern lokal heruntergeladen.', coverStored: 'Cover ist lokal gespeichert.', coverKept: 'Vorhandenes lokales Cover wurde beibehalten.', coverMissing: 'Kein Cover erkannt. Du kannst eine Adresse eingeben oder eine Datei auswählen.', coverPreviewFailed: 'Die Vorschau ist blockiert. Beim Speichern wird der lokale Download versucht.', coverDownloading: 'Manga wird gespeichert und das Cover lokal gesichert …', coverDownloadFailed: 'Manga gespeichert; das Cover konnte nicht heruntergeladen werden.'
    },
    en: {
      title: 'Save to Manga Shelf', subtitle: 'All data is stored locally in Firefox.', fieldTitle: 'Title', website: 'Website', tags: 'Tags', rating: 'Rating', chapter: 'Current chapter', chapterPlaceholder: 'Detected from the link when possible', chapterManualPlaceholder: 'Optional manual entry', status: 'Status', active: 'Active', reading: 'Currently Reading', dropped: 'Dropped', completed: 'Completed', hold: 'On Hold', full: 'full', coverUrl: 'Cover URL', coverPlaceholder: 'Automatic when available', chooseCover: 'Choose local cover', openCollection: 'Open collection', save: 'Save to shelf', confirmTitle: 'Update existing manga?', confirmHint: 'The existing rating, tags, and status will be kept.', replace: 'Update existing entry', saveSeparate: 'Save as a new entry', cancel: 'Cancel', detected: 'Title, address, and available page data were detected automatically.', existing: 'This link is already saved. Your changes will update the existing entry.', saved: 'Saved.', chapterWord: 'Chapter', oldUnknown: 'Previous chapter unknown', newUnknown: 'New chapter unknown', confirmText: (title) => `“${title}” is already in Manga Shelf. Replace its Continue Reading link?`, stars: (value) => `${value} out of 10 stars`, localCoverReady: 'Local cover is ready.', separateSaved: 'Saved as a separate entry.', coverDetected: 'Cover detected – it will be downloaded locally when saved.', coverStored: 'Cover is stored locally.', coverKept: 'Existing local cover was kept.', coverMissing: 'No cover detected. Enter an address or choose a file.', coverPreviewFailed: 'The preview is blocked. A local download will be attempted when saving.', coverDownloading: 'Saving manga and storing its cover locally …', coverDownloadFailed: 'Manga saved; the cover could not be downloaded.'
    }
  };

  // Die Skala ist einstellbar; deshalb wird die Höchstzahl nicht fest in den
  // zugänglichen Sternetext geschrieben.
  overlayTranslations.de.stars = (value, maximum) => `${value} von ${maximum} Sternen`;
  overlayTranslations.en.stars = (value, maximum) => `${value} out of ${maximum} stars`;
  overlayTranslations.de.chapterAuto = 'Automatische Kapitelerkennung für diesen Manga';
  overlayTranslations.de.chapterAutoOn = 'Kapitel-Automatik für diesen Manga eingeschaltet';
  overlayTranslations.de.chapterAutoOff = 'Kapitel-Automatik für diesen Manga ausgeschaltet';
  overlayTranslations.de.chapterAutoGlobalOff = 'Kapitel-Automatik ist in den Einstellungen global ausgeschaltet';
  overlayTranslations.de.chapterFrozenHint = 'Nur der Weiterlesen-Link wird aktualisiert. Der gespeicherte Kapitelstand bleibt unverändert.';
  overlayTranslations.de.linkUpdatedChapterKept = (chapter) => `Weiterlesen-Link aktualisiert; Kapitel ${chapter || '–'} bleibt unverändert.`;
  overlayTranslations.en.chapterAuto = 'Automatic chapter detection for this manga';
  overlayTranslations.en.chapterAutoOn = 'Chapter detection enabled for this manga';
  overlayTranslations.en.chapterAutoOff = 'Chapter detection disabled for this manga';
  overlayTranslations.en.chapterAutoGlobalOff = 'Chapter detection is disabled globally in Settings';
  overlayTranslations.en.chapterFrozenHint = 'Only the Continue Reading link will be updated. The stored chapter remains unchanged.';
  overlayTranslations.en.linkUpdatedChapterKept = (chapter) => `Continue Reading link updated; chapter ${chapter || '–'} remains unchanged.`;
  overlayTranslations.de.coverAuto = 'Automatische Cover-Erkennung für diesen Manga';
  overlayTranslations.de.coverAutoOn = 'Cover-Automatik für diesen Manga eingeschaltet';
  overlayTranslations.de.coverAutoOff = 'Cover-Automatik für diesen Manga ausgeschaltet';
  overlayTranslations.de.coverAutoOffStored = 'Lokales Cover bleibt erhalten · Automatik ausgeschaltet';
  overlayTranslations.de.coverManualPlaceholder = 'Optional manuell eintragen';
  overlayTranslations.en.coverAuto = 'Automatic cover detection for this manga';
  overlayTranslations.en.coverAutoOn = 'Cover detection enabled for this manga';
  overlayTranslations.en.coverAutoOff = 'Cover detection disabled for this manga';
  overlayTranslations.en.coverAutoOffStored = 'Local cover is preserved · automatic detection disabled';
  overlayTranslations.en.coverManualPlaceholder = 'Optional manual entry';
  overlayTranslations.de.saveSeparate = 'Als Re-Read neu anlegen';
  overlayTranslations.de.separateSaved = 'Als neuer Re-Read gespeichert.';
  overlayTranslations.de.updateTarget = 'Welchen Lesestand aktualisieren?';
  overlayTranslations.de.mainProgress = 'Hauptstand';
  overlayTranslations.de.rereadProgress = (round) => `Re-Read${round ? ` #${round}` : ''}`;
  overlayTranslations.de.recommended = 'empfohlen';
  overlayTranslations.de.rereadHint = 'Der Re-Read bleibt mit dem Hauptstand verbunden und kann künftig gezielt aktualisiert werden.';
  overlayTranslations.en.saveSeparate = 'Create as a new re-read';
  overlayTranslations.en.separateSaved = 'Saved as a new re-read.';
  overlayTranslations.en.updateTarget = 'Which reading progress should be updated?';
  overlayTranslations.en.mainProgress = 'Main progress';
  overlayTranslations.en.rereadProgress = (round) => `Re-read${round ? ` #${round}` : ''}`;
  overlayTranslations.en.recommended = 'recommended';
  overlayTranslations.en.rereadHint = 'The re-read stays linked to the main progress and can be updated separately later.';
  overlayTranslations.de.close = 'Schließen';
  overlayTranslations.en.close = 'Close';
  overlayTranslations.de.coverPreview = 'Cover-Vorschau';
  overlayTranslations.en.coverPreview = 'Cover preview';
  Object.assign(overlayTranslations.de, { coverAccess: 'Cover-Domain freigeben', coverPermission: 'Manga gespeichert. Für den Cover-Download kannst du die Bild-Domain freigeben.' });
  Object.assign(overlayTranslations.en, { coverAccess: 'Allow cover domain', coverPermission: 'Manga saved. You can allow the image domain to download its cover.' });
  Object.assign(overlayTranslations.de, { details: 'Details', quickEmpty: 'Neuer Manga', chapterShort: 'Kap.', noCover: 'Kein Cover', localOnly: 'Lokal in deinem Browser' });
  Object.assign(overlayTranslations.en, { details: 'Details', quickEmpty: 'New manga', chapterShort: 'Ch.', noCover: 'No cover', localOnly: 'Local to your browser' });
  Object.assign(overlayTranslations.de, { chooseTags: 'Tags anpassen', noTags: 'Keine Tags ausgewählt', noTagPresets: 'Keine Tags aktiviert. Aktiviere Tags in den Einstellungen.', finishTags: 'Tags übernehmen', removeTag: (tag) => `Tag „${tag}“ entfernen` });
  Object.assign(overlayTranslations.en, { chooseTags: 'Adjust tags', noTags: 'No tags selected', noTagPresets: 'No tags enabled. Enable tags in Settings.', finishTags: 'Apply tags', removeTag: (tag) => `Remove tag “${tag}”` });

  function ot(key, ...args) {
    const value = overlayTranslations[overlayLanguage][key] ?? overlayTranslations.de[key] ?? key;
    if (typeof value === 'function') return value(...args);
    return globalThis.MangaPlatform?.isChrome && typeof value === 'string'
      ? value.replaceAll('Firefox', 'Chrome') : value;
  }

  // A selector prefix protects the page from us, but does not protect our
  // unstyled properties from page rules. Shadow DOM is the cascade boundary;
  // the sole exposed host is hardened against author styles with inline resets.
  const host = document.createElement('div');
  host.id = 'manga-regal-host';
  host.style.setProperty('all', 'initial', 'important');
  for (const [property, value] of Object.entries({ position: 'fixed', inset: '0', display: 'block',
    'z-index': '2147483647', 'pointer-events': 'none', visibility: 'hidden', direction: 'ltr', 'unicode-bidi': 'isolate' })) {
    host.style.setProperty(property, value, 'important');
  }
  const shadow = host.attachShadow({ mode: 'open' });
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = browser.runtime.getURL('content/overlay.css');
  const reveal = () => host.style.setProperty('visibility', 'visible', 'important');
  stylesheet.addEventListener('load', reveal);
  stylesheet.addEventListener('error', () => {
    console.error('Manga Shelf: overlay stylesheet could not be loaded');
    browser.runtime.sendMessage({ type: 'manga-regal:open-dashboard' }).catch(console.warn);
  });
  const root = document.createElement('div');
  root.id = 'manga-regal-overlay';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <div class="mr-backdrop" data-mr-close></div>
    <section class="mr-panel" role="dialog" aria-modal="true" aria-labelledby="mr-title">
      <header class="mr-header">
        <div class="mr-brand">
          <button class="mr-logo mr-collection-link" type="button" data-mr-open-collection data-mr-aria-label="openCollection">
            <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5c6-2 10 0 12 4 2-4 6-6 12-4v21c-6-2-10 0-12 3-2-3-6-5-12-3V5Z"/><path d="M16 9v20M7 10c3-1 5 0 7 2M25 10c-3-1-5 0-7 2"/></svg>
          </button>
          <div><h2 id="mr-title"><button class="mr-title-link mr-collection-link" type="button" data-mr-open-collection data-mr-i18n="title" data-mr-aria-label="openCollection">Im Manga-Regal speichern</button></h2><p class="mr-subtitle" data-mr-i18n="subtitle">Daten werden ausschließlich lokal in Firefox gespeichert.</p></div>
        </div>
        <button class="mr-icon-button" type="button" data-mr-close aria-label="Schließen" data-mr-aria-label="close">×</button>
      </header>
      <form class="mr-body" id="mr-form">
        <p class="mr-note" id="mr-note">Titel, Adresse und verfügbare Seitendaten wurden automatisch übernommen.</p>
        <section class="mr-quick-summary" id="mr-quick-summary" hidden aria-live="polite"><div class="mr-quick-art"><img id="mr-quick-cover" alt="" referrerpolicy="no-referrer"><span id="mr-quick-no-cover" aria-hidden="true">▧</span></div><div class="mr-quick-copy"><h3 id="mr-quick-title"></h3><a id="mr-quick-url" target="_blank" rel="noopener noreferrer"></a><div class="mr-quick-pills"><span id="mr-quick-chapter"></span><span class="mr-quick-status" id="mr-quick-status"></span></div><div class="mr-quick-tags" id="mr-quick-tags"></div></div></section>
        <button class="mr-button mr-primary mr-quick-save" id="mr-quick-save" type="button" data-mr-i18n="save" hidden>Im Regal speichern</button>
        <details class="mr-entry-details" id="mr-entry-details" open><summary data-mr-i18n="details">Details</summary><div class="mr-detail-fields">
        <label class="mr-field"><span data-mr-i18n="fieldTitle">Titel</span><input id="mr-entry-title" type="text" required></label>
        <label class="mr-field"><span data-mr-i18n="website">Webseite</span><input id="mr-entry-url" type="url" required></label>
        <div class="mr-field" id="mr-tags-field"><span id="mr-tags-label" data-mr-i18n="tags">Tags</span><div class="mr-selected-tags" id="mr-selected-tags" aria-live="polite"></div><button class="mr-button mr-tag-trigger" id="mr-choose-tags" type="button" aria-expanded="false" aria-controls="mr-tag-picker" data-mr-i18n="chooseTags">Tags anpassen</button><dialog class="mr-tag-picker" id="mr-tag-picker" hidden aria-labelledby="mr-tag-picker-title"><h3 id="mr-tag-picker-title" data-mr-i18n="chooseTags">Tags anpassen</h3><div class="mr-tag-options" id="mr-tag-options"></div><div class="mr-tag-actions"><button class="mr-button" id="mr-cancel-tags" type="button" data-mr-i18n="cancel">Abbrechen</button><button class="mr-button mr-primary" id="mr-finish-tags" type="button" data-mr-i18n="finishTags">Tags übernehmen</button></div></dialog></div>
        <span class="mr-label" data-mr-i18n="rating">Bewertung</span>
        <div class="mr-stars" id="mr-stars" aria-label="Bewertung mit zehn Sternen"></div>
        <div class="mr-row">
          <div class="mr-field"><label class="mr-field-label" for="mr-entry-chapter" data-mr-i18n="chapter">Aktuelles Kapitel</label><div class="mr-chapter-control mr-with-auto" id="mr-chapter-control"><input id="mr-entry-chapter" type="text" placeholder="Wird möglichst aus dem Link erkannt" data-mr-placeholder="chapterPlaceholder"><button class="mr-chapter-auto" id="mr-chapter-auto" type="button" role="switch" aria-checked="true"><span aria-hidden="true">↻</span></button></div></div>
          <label class="mr-field"><span data-mr-i18n="status">Status</span><select id="mr-entry-status"><option value="active" data-mr-i18n="active">Aktiv</option><option id="mr-reading-option" value="reading">Lese ich gerade (max. 5)</option><option value="hold">On Hold</option><option value="dropped" data-mr-i18n="dropped">Gedroppt</option></select></label>
        </div>
        <div class="mr-field"><label class="mr-field-label" for="mr-entry-cover-url" data-mr-i18n="coverUrl">Cover-Adresse</label><div class="mr-chapter-control mr-with-auto" id="mr-cover-control"><input id="mr-entry-cover-url" type="url" placeholder="Automatisch, falls verfügbar" data-mr-placeholder="coverPlaceholder"><button class="mr-chapter-auto mr-cover-auto" id="mr-cover-auto" type="button" role="switch" aria-checked="true"><span aria-hidden="true">↻</span></button></div></div>
        <div class="mr-cover-row">
          <img class="mr-cover" id="mr-cover-preview" alt="Cover-Vorschau" data-mr-alt="coverPreview" referrerpolicy="no-referrer">
          <div class="mr-cover-controls"><label class="mr-file"><span data-mr-i18n="chooseCover">Lokales Cover auswählen</span><input id="mr-cover-file" type="file" accept="image/*"></label><span class="mr-cover-status" id="mr-cover-status"></span><button class="mr-button" id="mr-cover-access" type="button" data-mr-i18n="coverAccess" hidden>Cover-Domain freigeben</button></div>
        </div>
        </div></details>
        <p class="mr-quick-storage" id="mr-quick-storage" hidden></p>
        <div class="mr-actions">
          <button class="mr-button" id="mr-open-dashboard" type="button" data-mr-i18n="openCollection">Sammlung öffnen</button>
          <button class="mr-button mr-primary" type="submit" data-mr-i18n="save">Im Regal speichern</button>
        </div>
        <p class="mr-message" id="mr-message" role="status"></p>
      </form>
    </section>
    <div class="mr-confirm-layer" id="mr-update-confirm" hidden>
      <section class="mr-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="mr-confirm-title" aria-describedby="mr-confirm-text">
        <span class="mr-confirm-icon" aria-hidden="true">↻</span>
        <h3 id="mr-confirm-title" data-mr-i18n="confirmTitle">Bestehenden Manga aktualisieren?</h3>
        <p id="mr-confirm-text"></p>
        <label class="mr-confirm-target" id="mr-confirm-target-control" hidden><span data-mr-i18n="updateTarget">Welchen Lesestand aktualisieren?</span><select id="mr-update-target"></select></label>
        <div class="mr-chapter-change"><span id="mr-old-chapter"></span><b>→</b><span id="mr-new-chapter"></span></div>
        <p class="mr-confirm-hint" id="mr-confirm-hint" data-mr-i18n="confirmHint">Bewertung, Tags und Status des vorhandenen Eintrags bleiben erhalten.</p>
        <div class="mr-confirm-actions">
          <button class="mr-button mr-primary" id="mr-replace-existing" type="button" data-mr-i18n="replace">Bestehenden Eintrag aktualisieren</button>
          <button class="mr-button" id="mr-save-separate" type="button" data-mr-i18n="saveSeparate">Als neuen Eintrag speichern</button>
          <button class="mr-text-button" id="mr-cancel-update" type="button" data-mr-i18n="cancel">Abbrechen</button>
        </div>
      </section>
    </div>`;
  shadow.append(root);
  document.documentElement.appendChild(host);
  // Privileged CSS delivery + CSSOM avoids the visited page's style-src CSP.
  // The resource link is only a fallback for previews/older background contexts.
  browser.runtime.sendMessage({ type: 'manga-regal:overlay-css' }).then((response) => {
    if (response?.cssText && typeof CSSStyleSheet === 'function') {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(response.cssText);
      shadow.adoptedStyleSheets = [sheet];
      reveal();
    } else shadow.prepend(stylesheet);
  }).catch(() => shadow.prepend(stylesheet));

  const byId = (id) => root.querySelector(`#${id}`);
  const titleInput = byId('mr-entry-title');
  const urlInput = byId('mr-entry-url');
  const tagPicker = byId('mr-tag-picker');
  byId('mr-quick-cover').addEventListener('error', () => {
    failedQuickCover = currentCover;
    byId('mr-quick-cover').hidden = true;
    byId('mr-quick-no-cover').hidden = false;
  });
  byId('mr-quick-cover').addEventListener('load', () => { failedQuickCover = ''; });
  byId('mr-quick-save').addEventListener('click', () => byId('mr-form').requestSubmit());
  byId('mr-form').addEventListener('invalid', () => { byId('mr-entry-details').open = true; }, true);
  byId('mr-form').addEventListener('input', () => renderQuickSummary());
  byId('mr-form').addEventListener('change', () => renderQuickSummary());

  /** Only enabled presets are offered as new choices. Existing assignments
   * remain removable even after a preset is disabled or deleted in Settings.
   * Use DOM text nodes: custom tag names are user data, never HTML. */
  function renderTags() {
    renderQuickSummary();
    const chips = byId('mr-selected-tags');
    chips.replaceChildren();
    chips.hidden = selectedTags.length === 0;
    for (const tag of selectedTags) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'mr-tag-chip';
      chip.classList.toggle('mr-reread-tag', tag.toLowerCase() === (MangaStore.REREAD_TAG || 'Re-Read').toLowerCase());
      chip.textContent = `${tag} ×`;
      chip.setAttribute('aria-label', ot('removeTag', tag));
      chip.addEventListener('click', () => toggleTag(tag, false));
      chips.append(chip);
    }
    const options = byId('mr-tag-options');
    options.replaceChildren();
    const available = MangaStore.cleanTags([...enabledTagPresets, ...selectedTags]);
    if (!available.length) options.textContent = ot('noTagPresets');
    for (const tag of available) {
      const label = document.createElement('label');
      label.classList.toggle('mr-reread-tag', tag.toLowerCase() === (MangaStore.REREAD_TAG || 'Re-Read').toLowerCase());
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selectedTags.some((selected) => selected.toLowerCase() === tag.toLowerCase());
      checkbox.addEventListener('change', () => {
        // Preserve keyboard focus after rebuilding choices.
        toggleTag(tag, checkbox.checked);
        [...options.querySelectorAll('input')][available.indexOf(tag)]?.focus();
      });
      const text = document.createElement('span');
      text.textContent = tag;
      label.append(checkbox, text);
      options.append(label);
    }
  }
  function toggleTag(tag, selected) {
    selectedTags = selected ? MangaStore.cleanTags([...selectedTags, tag])
      : selectedTags.filter((value) => value.toLowerCase() !== tag.toLowerCase());
    tagsEdited = true;
    renderTags();
  }
  function closeTagPicker(cancel = false) {
    if (cancel) {
      selectedTags = [...tagSelectionBeforeOpen];
      tagsEdited = tagsEditedBeforeOpen;
      renderTags();
    }
    if (tagPicker.open) tagPicker.close();
    tagPicker.hidden = true;
    byId('mr-choose-tags').setAttribute('aria-expanded', 'false');
  }
  byId('mr-choose-tags').addEventListener('click', () => {
    tagSelectionBeforeOpen = [...selectedTags];
    tagsEditedBeforeOpen = tagsEdited;
    tagPicker.hidden = false;
    tagPicker.showModal();
    byId('mr-choose-tags').setAttribute('aria-expanded', 'true');
    (tagPicker.querySelector('input') || byId('mr-finish-tags')).focus();
  });
  byId('mr-cancel-tags').addEventListener('click', () => {
    closeTagPicker(true);
    byId('mr-choose-tags').focus();
  });
  tagPicker.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeTagPicker(true);
    byId('mr-choose-tags').focus();
  });
  byId('mr-finish-tags').addEventListener('click', () => {
    closeTagPicker();
    byId('mr-choose-tags').focus();
  });
  const chapterInput = byId('mr-entry-chapter');
  const chapterControl = byId('mr-chapter-control');
  const chapterAutoButton = byId('mr-chapter-auto');
  const statusInput = byId('mr-entry-status');
  const coverUrlInput = byId('mr-entry-cover-url');
  const coverAutoButton = byId('mr-cover-auto');
  const coverPreview = byId('mr-cover-preview');
  const coverStatus = byId('mr-cover-status');
  byId('mr-cover-access').addEventListener('click', async () => {
    try {
      await browser.runtime.sendMessage({ type: 'manga-regal:request-cover-access', itemId: currentItemId });
    } catch { showMessage(ot('coverDownloadFailed'), 'warning'); }
  });
  window.addEventListener('focus', async () => {
    if (!globalThis.MangaPlatform?.isChrome || !currentItemId || root.hidden) return;
    const stored = await MangaStore.getStoredCover(currentItemId);
    if (stored) { currentCover = stored; currentCoverStored = true; renderCover(); }
  });
  const message = byId('mr-message');
  coverPreview.addEventListener('load', () => { coverPreview.style.visibility = 'visible'; });
  coverPreview.addEventListener('error', () => {
    coverPreview.style.visibility = 'hidden';
    coverStatus.textContent = ot('coverPreviewFailed');
    coverStatus.className = 'mr-cover-status mr-cover-warning';
  });

  /** Übernimmt die im Adminbereich gewählte Sprache und Darstellung. */
  function applyOverlayPreferences(settings) {
    overlayLanguage = settings.language === 'en' ? 'en' : 'de';
    ratingMax = settings.ratingScale === 5 ? 5 : 10;
    root.dataset.ratingScale = String(ratingMax);
    globalChapterDetection = settings.chapterDetectionEnabled !== false;
    offerRereadOnUpdate = settings.offerRereadOnUpdate !== false;
    autoTagRereads = settings.autoTagRereads !== false;
    root.lang = overlayLanguage;
    applyTheme(settings);
    root.querySelectorAll('[data-mr-i18n]').forEach((node) => { node.textContent = ot(node.dataset.mrI18n); });
    root.querySelectorAll('[data-mr-placeholder]').forEach((node) => { node.placeholder = ot(node.dataset.mrPlaceholder); });
    root.querySelectorAll('[data-mr-aria-label]').forEach((node) => { node.setAttribute('aria-label', ot(node.dataset.mrAriaLabel)); });
    root.querySelectorAll('[data-mr-alt]').forEach((node) => { node.alt = ot(node.dataset.mrAlt); });
    const names = settings.categoryNames || {};
    const custom = Object.fromEntries((settings.customCategories || []).map((category) => [category.id, category.name]));
    const defaults = { active: ot('active'), reading: ot('reading'), hold: ot('hold'), dropped: ot('dropped'), completed: ot('completed') };
    const statuses = ['active', 'reading', 'hold', 'dropped', 'completed', ...(settings.customCategories || []).map((category) => category.id)];
    statusInput.replaceChildren(...statuses.map((status) => {
      const option = document.createElement('option');
      option.value = status;
      option.textContent = names[status] || custom[status] || defaults[status] || status;
      if (status === 'reading') option.id = 'mr-reading-option';
      return option;
    }));
    root.dataset.defaultNewStatus = statuses.includes(settings.defaultNewStatus) ? settings.defaultNewStatus : 'active';
    root.dataset.chapterDetectionEnabled = String(globalChapterDetection);
    byId('mr-stars').setAttribute('aria-label', `${ot('rating')}: ${ratingMax} ${overlayLanguage === 'en' ? 'stars' : 'Sterne'}`);
  }

  function applyTheme(settings) {
    const previous = root.dataset.mangaTheme;
    const theme = globalThis.MangaThemes?.apply(root, settings)
      || { id: settings.colorMode || 'dark', mode: settings.colorMode || 'dark', glass: false };
    root.classList.toggle('mr-light', theme.mode === 'light');
    byId('mr-quick-summary').hidden = !theme.glass;
    byId('mr-quick-save').hidden = !theme.glass;
    byId('mr-quick-storage').hidden = !theme.glass;
    if (previous !== theme.id) byId('mr-entry-details').open = !theme.glass;
  }

  // Summary uses the same form state and saved image, not a second data model.
  // User-controlled titles/tags are always text nodes, never interpolated HTML.
  function renderQuickSummary() {
    byId('mr-quick-title').textContent = titleInput.value || ot('quickEmpty');
    const link = byId('mr-quick-url');
    try {
      const url = new URL(urlInput.value);
      link.textContent = url.host + ' ↗';
      if (/^https?:$/.test(url.protocol)) link.href = url.href;
      else link.removeAttribute('href');
    } catch { link.textContent = ''; link.removeAttribute('href'); }
    byId('mr-quick-chapter').textContent = `${ot('chapterShort')} ${byId('mr-entry-chapter').value || '—'}`;
    byId('mr-quick-status').textContent = byId('mr-entry-status').selectedOptions[0]?.textContent || '';
    byId('mr-quick-tags').replaceChildren(...selectedTags.slice(0, 3).map((tag) => {
      const chip = document.createElement('span');
      chip.textContent = tag;
      if (tag.toLowerCase() === 're-read') chip.className = 'mr-reread-tag';
      return chip;
    }));
    const image = byId('mr-quick-cover');
    if (currentCover && image.getAttribute('src') !== currentCover) image.src = currentCover;
    if (!currentCover) image.removeAttribute('src');
    const visibleCover = Boolean(currentCover) && failedQuickCover !== currentCover;
    image.hidden = !visibleCover;
    byId('mr-quick-no-cover').hidden = visibleCover;
    byId('mr-quick-storage').textContent = currentCoverStored ? `✓ ${ot('coverStored')}` : ot('localOnly');
  }

  browser.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'local' || !changes[MangaStore.STORAGE_KEY]) return;
    MangaStore.load().then((data) => applyTheme(data.settings)).catch(() => {});
  });

  /** Die globale Vorgabe und die dauerhafte Manga-Ausnahme gelten gemeinsam. */
  function detectedChapter(url) {
    return globalChapterDetection && !chapterDetectionDisabled
      ? MangaStore.chapterFromUrl(url)
      : '';
  }

  /**
   * Der kleine quadratische Knopf bleibt unabhängig von der Sterneskala immer
   * direkt hinter dem Kapitelfeld. Grün bedeutet: URLs werden ausgewertet.
   * Ist die globale Erkennung aus, bleibt der Knopf sichtbar, aber deaktiviert.
   */
  function renderChapterAutoButton() {
    const enabled = globalChapterDetection && !chapterDetectionDisabled;
    chapterControl.classList.add('mr-with-auto');
    chapterAutoButton.disabled = !globalChapterDetection;
    chapterAutoButton.setAttribute('aria-checked', String(enabled));
    chapterAutoButton.classList.toggle('mr-on', enabled);
    chapterAutoButton.classList.toggle('mr-off', globalChapterDetection && chapterDetectionDisabled);
    const label = !globalChapterDetection
      ? ot('chapterAutoGlobalOff')
      : enabled ? ot('chapterAutoOn') : ot('chapterAutoOff');
    chapterAutoButton.title = `${ot('chapterAuto')}: ${label}`;
    chapterAutoButton.setAttribute('aria-label', label);
    chapterInput.placeholder = enabled
      ? ot('chapterPlaceholder')
      : ot('chapterManualPlaceholder');
  }

  /**
   * Verwendet bewusst dieselbe Form und Farblogik wie der Kapitelknopf.
   * Die Schalterstellung wird spaeter zusammen mit dem Manga gespeichert.
   */
  function renderCoverAutoButton() {
    const enabled = !coverDetectionDisabled;
    coverAutoButton.setAttribute('aria-checked', String(enabled));
    coverAutoButton.classList.toggle('mr-on', enabled);
    coverAutoButton.classList.toggle('mr-off', !enabled);
    const label = enabled ? ot('coverAutoOn') : ot('coverAutoOff');
    coverAutoButton.title = `${ot('coverAuto')}: ${label}`;
    coverAutoButton.setAttribute('aria-label', label);
    coverUrlInput.placeholder = enabled ? ot('coverPlaceholder') : ot('coverManualPlaceholder');
  }

  /** Liest sichere, öffentlich sichtbare Metadaten aus der aktuellen Seite. */
  function pageMetadata() {
    const meta = (selector) => document.querySelector(selector)?.content?.trim() || '';
    const favicon = document.querySelector('link[rel~="icon"]')?.href || '';
    const absoluteAddress = (value) => {
      try { return value ? new URL(value, location.href).href : ''; } catch { return ''; }
    };
    let structuredImage = '';
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const parsed = JSON.parse(script.textContent || '{}');
        const entries = Array.isArray(parsed) ? parsed : [parsed, ...(parsed['@graph'] || [])];
        const image = entries.map((entry) => entry?.image).find(Boolean);
        structuredImage = typeof image === 'string' ? image : image?.url || image?.contentUrl || '';
        if (structuredImage) break;
      } catch { /* Ungültige Seitendaten werden ignoriert. */ }
    }
    const coverImage = document.querySelector('img[itemprop="image"], .manga-cover img, .series-cover img, .book-cover img, [class*="cover-image"]');
    return {
      title: meta('meta[property="og:title"]') || document.title || location.hostname,
      url: location.href,
      description: meta('meta[name="description"]') || meta('meta[property="og:description"]'),
      cover: absoluteAddress(
        meta('meta[property="og:image"]')
        || meta('meta[property="og:image:secure_url"]')
        || meta('meta[name="twitter:image"]')
        || meta('meta[name="twitter:image:src"]')
        || document.querySelector('link[rel="image_src"]')?.href
        || structuredImage
        || coverImage?.currentSrc
        || coverImage?.src
      ),
      favicon: absoluteAddress(favicon)
    };
  }

  /** Zeigt die ausgewählte Bewertung optisch an. */
  function renderStars() {
    byId('mr-stars').replaceChildren(...Array.from({ length: ratingMax }, (_, index) => {
      const value = index + 1;
      const button = document.createElement('button');
      button.className = 'mr-star' + (value <= currentRating ? ' mr-on' : '');
      button.type = 'button';
      button.dataset.rating = String(value);
      button.setAttribute('aria-label', ot('stars', value, ratingMax));
      button.textContent = '★';
      return button;
    }));
  }

  /** Aktualisiert die Cover-Vorschau oder blendet einen neutralen Platzhalter ein. */
  function renderCover() {
    renderQuickSummary();
    byId('mr-cover-access').hidden = !(globalThis.MangaPlatform?.isChrome && currentItemId && !currentCoverStored && /^https?:/.test(currentCover));
    if (currentCover) coverPreview.src = currentCover;
    else coverPreview.removeAttribute('src');
    coverPreview.style.visibility = currentCover ? 'visible' : 'hidden';
    coverStatus.textContent = currentCoverStored
      ? (coverDetectionDisabled ? ot('coverAutoOffStored') : ot('coverStored'))
      : currentCover ? ot('coverDetected') : coverDetectionDisabled ? ot('coverAutoOff') : ot('coverMissing');
    coverStatus.className = `mr-cover-status${currentCoverStored ? ' mr-cover-success' : ''}`;
  }

  /** Zeigt eine kurze Rückmeldung an, ohne alert()-Fenster der Webseite zu benutzen. */
  function showMessage(text, kind = '') {
    message.textContent = text;
    message.className = `mr-message${kind ? ` mr-${kind}` : ''}`;
  }

  /** Füllt das Formular aus Seitendaten oder einem bereits gespeicherten Manga. */
  async function prepareForm() {
    const metadata = pageMetadata();
    const data = await MangaStore.load();
    applyOverlayPreferences(data.settings);
    const existing = data.items.find((item) => item.url === metadata.url);
    const related = existing || MangaStore.findLikelyMatch(data.items, {
      ...metadata,
      currentChapter: globalChapterDetection ? MangaStore.chapterFromUrl(metadata.url) : ''
    });
    const matched = existing || related;

    chapterDetectionDisabled = matched?.chapterDetectionDisabled === true;
    storedChapterBaseline = String(matched?.currentChapter || '');
    storedChapterManual = matched?.chapterManual === true;
    chapterManuallyChanged = false;
    coverDetectionDisabled = matched?.coverDetectionDisabled === true;
    coverManuallyChanged = false;

    currentItemId = existing?.id || '';
    currentRating = matched?.rating || 0;
    const storedCover = related ? await MangaStore.getStoredCover(related.id) : '';
    currentCoverStored = Boolean(storedCover);
    // Bei einer neuen Kapitelseite ist deren frisch erkannte Cover-Adresse
    // verlässlicher als eine alte, früher möglicherweise mit 403 gescheiterte
    // Remote-Adresse des importierten Lesezeichens.
    // Eine abgeschaltete Automatik darf beim spaeteren Kapitelbesuch keine
    // neue Seitenadresse als Coverkandidat uebernehmen. Das lokale Bild oder
    // die bereits gespeicherte Adresse bleiben unveraendert.
    currentCover = storedCover
      || (coverDetectionDisabled ? matched?.cover : metadata.cover || matched?.cover)
      || '';
    titleInput.value = matched?.title || metadata.title;
    urlInput.value = existing?.url || metadata.url;
    selectedTags = MangaStore.cleanTags(matched?.tags || []);
    enabledTagPresets = MangaStore.cleanTags(data.settings.tagPresets || []);
    tagsEdited = false;
    closeTagPicker();
    renderTags();
    const chapterAutoEnabled = globalChapterDetection && !chapterDetectionDisabled;
    chapterInput.value = existing?.currentChapter
      || (chapterAutoEnabled ? detectedChapter(metadata.url) : matched?.currentChapter || '');
    statusInput.value = matched?.status || root.dataset.defaultNewStatus || 'active';
    const readingCount = data.items.filter((item) => item.status === 'reading').length;
    const readingLimit = MangaStore.getReadingLimit(data);
    const readingOption = byId('mr-reading-option');
    const readingName = data.settings.categoryNames?.reading || ot('reading');
    readingOption.disabled = readingCount >= readingLimit && matched?.status !== 'reading';
    readingOption.textContent = readingOption.disabled
      ? `${readingName} (${readingCount}/${readingLimit} – ${ot('full')})`
      : `${readingName} (${readingCount}/${readingLimit})`;
    if (readingOption.disabled && !matched && statusInput.value === 'reading') statusInput.value = 'active';
    coverUrlInput.value = currentCover.startsWith('data:') ? '' : currentCover;
    byId('mr-note').textContent = existing
      ? ot('existing')
      : ot('detected');
    root.dataset.description = matched?.description || metadata.description;
    root.dataset.favicon = matched?.favicon || metadata.favicon;
    showMessage('');
    renderStars();
    renderChapterAutoButton();
    renderCoverAutoButton();
    renderCover();
  }

  async function openOverlay() {
    await prepareForm();
    root.classList.add('mr-open');
    root.setAttribute('aria-hidden', 'false');
    setTimeout(() => (root.dataset.glassTheme === 'true' ? byId('mr-quick-save') : titleInput).focus(), 0);
  }

  function closeOverlay() {
    closeTagPicker();
    closeUpdateConfirmation();
    root.classList.remove('mr-open');
    root.setAttribute('aria-hidden', 'true');
  }

  async function toggleOverlay() {
    if (root.classList.contains('mr-open')) closeOverlay();
    else await openOverlay();
  }

  /** Sammelt den sichtbaren Formularinhalt in einem speicherbaren Objekt. */
  function draftFromForm() {
    const inferredChapter = detectedChapter(urlInput.value);
    const enteredChapter = chapterInput.value.trim();
    return {
      id: currentItemId,
      title: titleInput.value,
      url: urlInput.value,
      tags: [...selectedTags],
      tagsEdited,
      currentChapter: enteredChapter || inferredChapter,
      chapterManual: !globalChapterDetection || chapterDetectionDisabled
        ? (chapterManuallyChanged ? Boolean(enteredChapter) : storedChapterManual)
        : Boolean(enteredChapter && enteredChapter !== inferredChapter),
      chapterDetectionDisabled,
      // Reine Laufzeitinformation: Nur eine echte Eingabe des Benutzers darf
      // einen eingefrorenen Kapitelstand ersetzen.
      chapterManualChange: chapterManuallyChanged,
      coverDetectionDisabled,
      // Nur Laufzeitinformation fuer saveDraft; normalizeItem uebernimmt
      // dieses Hilfsfeld absichtlich nicht in den Datensatz.
      coverManualChange: coverManuallyChanged,
      rating: currentRating,
      status: statusInput.value,
      // Bei einem exakten Kapitelupdate genügt der getrennte lokale Speicher;
      // das Base64-Bild muss nicht erneut geschrieben werden.
      cover: currentItemId && currentCoverStored ? '' : (currentCover || coverUrlInput.value.trim()),
      description: root.dataset.description || '',
      favicon: root.dataset.favicon || ''
    };
  }

  /**
   * Übernimmt ein bereits erfolgreich dargestelltes Vorschaubild ohne einen
   * zweiten Netzwerkaufruf. Bei fremden Bilddomains kann Firefox das Auslesen
   * des Canvas aus Sicherheitsgründen sperren; dann liefert die Funktion leer
   * zurück und saveDraft verwendet automatisch die Netzwerk-Fallbacks.
   */
  function captureVisibleCover() {
    if (!currentCover || !coverPreview.complete || !coverPreview.naturalWidth) return '';
    try {
      const scale = Math.min(1, 900 / coverPreview.naturalWidth, 1200 / coverPreview.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(coverPreview.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(coverPreview.naturalHeight * scale));
      canvas.getContext('2d').drawImage(coverPreview, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.84);
    } catch {
      return '';
    }
  }

  /**
   * Legt beim Kapitelupdate eindeutig fest, welche Coverquelle weiterlebt.
   * Ein bereits lokal gespeichertes Cover wird nicht erneut in den Datensatz
   * geschrieben. Fehlt es, gewinnt die aktuelle Kapitelseite vor einer alten
   * Remote-Adresse des importierten Lesezeichens.
   */
  function coverForChapterUpdate(storedCover, existingItem, incomingDraft) {
    if (storedCover) return '';
    if (incomingDraft?.coverDetectionDisabled && !incomingDraft?.coverManualChange) {
      return existingItem?.cover || '';
    }
    return incomingDraft?.cover || existingItem?.cover || '';
  }

  /** Speichert einen vorbereiteten Datensatz und aktualisiert die Formular-ID. */
  async function saveDraft(draft, successText = ot('saved')) {
    const allowCoverRequest = draft.coverDetectionDisabled !== true || draft.coverManualChange === true;
    const coverWasStored = currentCoverStored;
    showMessage(allowCoverRequest ? ot('coverDownloading') : ot('coverAutoOff'));
    const capturedCover = allowCoverRequest && !coverWasStored && /^https?:/i.test(String(draft.cover || ''))
      ? captureVisibleCover()
      : '';
    // Das Bedienfeld-Hilfsflag darf nicht Teil des dauerhaften Datenvertrags
    // werden. Dauerhaft ist nur coverDetectionDisabled.
    const {
      coverManualChange: _coverManualChange,
      chapterManualChange: _chapterManualChange,
      ...persistentDraft
    } = draft;
    const preparedDraft = capturedCover ? { ...persistentDraft, cover: capturedCover } : persistentDraft;
    await MangaStore.upsertItem(preparedDraft);
    const normalizedUrl = MangaStore.normalizeItem(preparedDraft).url;
    const savedData = await MangaStore.load();
    const savedItem = preparedDraft.id
      ? savedData.items.find((item) => item.id === preparedDraft.id)
      : savedData.items.find((item) => item.url === normalizedUrl);
    currentItemId = savedItem?.id || preparedDraft.id || '';
    chapterDetectionDisabled = savedItem?.chapterDetectionDisabled === true;
    storedChapterBaseline = String(savedItem?.currentChapter || '');
    storedChapterManual = savedItem?.chapterManual === true;
    chapterManuallyChanged = false;
    coverDetectionDisabled = savedItem?.coverDetectionDisabled === true;
    coverManuallyChanged = false;
    // Importierte Einträge bleiben echte Firefox-Lesezeichen. Nach einem
    // Kapitelwechsel wird deshalb auch deren ursprünglicher Bookmark-Knoten
    // auf Titel und Weiterlesen-Adresse des Datensatzes aktualisiert.
    if (savedItem?.bookmarkId) {
      try {
        await browser.runtime.sendMessage({ type: 'manga-regal:update-linked-bookmark', itemId: savedItem.id });
      } catch { /* Der Manga-Datensatz bleibt auch ohne Bookmark-Zugriff sicher gespeichert. */ }
    }
    let coverResult;
    let storedCover = await MangaStore.getStoredCover(currentItemId);
    if (storedCover) {
      coverResult = { ok: true, status: 'existing' };
    } else if (savedItem?.cover && allowCoverRequest) {
      try {
        // Der erste Netzwerkversuch läuft bewusst im geöffneten Manga-Tab.
        // Cloudflare erhält so den normalen Referrer und – falls vorhanden –
        // die bereits vom Benutzer erworbene cf_clearance-Sitzung. Das Add-on
        // liest oder speichert den Cookie selbst zu keinem Zeitpunkt.
        await MangaStore.cacheCover(savedItem, { referrerUrl: location.href, force: draft.coverManualChange === true });
        coverResult = { ok: true, status: 'downloaded' };
      } catch (pageError) {
        try {
          coverResult = await browser.runtime.sendMessage({ type: 'manga-regal:cache-cover', itemId: currentItemId, force: draft.coverManualChange === true });
        } catch (backgroundError) {
          coverResult = { ok: false, status: 'failed', message: `${pageError.message}; ${backgroundError.message}` };
        }
      }
    } else if (coverDetectionDisabled) {
      coverResult = { ok: true, status: 'disabled' };
    } else {
      coverResult = { ok: true, status: 'missing' };
    }
    storedCover = await MangaStore.getStoredCover(currentItemId);
    if (storedCover) {
      currentCover = storedCover;
      currentCoverStored = true;
      renderCover();
    }
    renderCoverAutoButton();
    if (coverResult?.status === 'existing') {
      showMessage(`${successText} ${coverWasStored ? ot('coverKept') : ot('coverStored')}`, 'success');
    } else if (coverResult?.status === 'downloaded') {
      showMessage(`${successText} ${ot('coverStored')}`, 'success');
    } else if (coverResult?.status === 'disabled') {
      showMessage(`${successText} ${ot('coverAutoOff')}`, 'success');
    } else if (coverResult?.status === 'missing') {
      showMessage(`${successText} ${ot('coverMissing')}`, 'success');
    } else if (coverResult?.status === 'permission-required') {
      renderCover();
      showMessage(ot('coverPermission'), 'success');
    } else {
      showMessage(ot('coverDownloadFailed'), 'warning');
    }
  }

  function updateCandidateLabel(item, recommendedId) {
    const kind = item.rereadOf
      ? ot('rereadProgress', item.rereadRound)
      : ot('mainProgress');
    const chapter = item.currentChapter ? `${ot('chapterWord')} ${item.currentChapter}` : ot('oldUnknown');
    return `${kind} · ${chapter}${item.id === recommendedId ? ` · ${ot('recommended')}` : ''}`;
  }

  /** Aktualisiert Text und Kapitelvergleich fuer den ausgewaehlten Lesestand. */
  function renderUpdateConfirmation() {
    if (!pendingMatch || !pendingDraft) return;
    const keepStoredChapter = pendingDraft.chapterDetectionDisabled === true && pendingDraft.chapterManualChange !== true;
    const displayedChapter = keepStoredChapter ? pendingMatch.currentChapter : pendingDraft.currentChapter;
    byId('mr-confirm-text').textContent = ot('confirmText', pendingMatch.title);
    byId('mr-old-chapter').textContent = pendingMatch.currentChapter ? `${ot('chapterWord')} ${pendingMatch.currentChapter}` : ot('oldUnknown');
    byId('mr-new-chapter').textContent = displayedChapter ? `${ot('chapterWord')} ${displayedChapter}` : ot('newUnknown');
    byId('mr-confirm-hint').textContent = keepStoredChapter ? ot('chapterFrozenHint') : ot('confirmHint');
  }

  /** Öffnet den Vergleichsdialog und erlaubt die Korrektur der Vorauswahl. */
  function openUpdateConfirmation(match, draft, candidates = []) {
    pendingMatch = match;
    pendingDraft = draft;
    pendingCandidates = candidates.length ? candidates : [match];
    const targetControl = byId('mr-confirm-target-control');
    const targetSelect = byId('mr-update-target');
    targetControl.hidden = pendingCandidates.length < 2;
    // Keine HTML-Zeichenfolge: Titel und Kapitel stammen aus Webseiten und
    // werden deshalb als reiner Text in echte Option-Elemente geschrieben.
    targetSelect.replaceChildren(...pendingCandidates.map((candidate) => {
      const option = document.createElement('option');
      option.value = candidate.id;
      option.textContent = updateCandidateLabel(candidate, match.id);
      return option;
    }));
    targetSelect.value = match.id;
    const rereadButton = byId('mr-save-separate');
    rereadButton.hidden = !offerRereadOnUpdate;
    rereadButton.title = ot('rereadHint');
    renderUpdateConfirmation();
    byId('mr-update-confirm').hidden = false;
    setTimeout(() => byId('mr-replace-existing').focus(), 0);
  }

  function closeUpdateConfirmation() {
    const confirmation = byId('mr-update-confirm');
    if (confirmation) confirmation.hidden = true;
    pendingDraft = null;
    pendingMatch = null;
    pendingCandidates = [];
  }

  /** Verkleinert ein lokales Cover vor dem Speichern, um Speicherplatz zu sparen. */
  function imageFileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file?.type.startsWith('image/')) {
        reject(new Error('Bitte eine Bilddatei auswählen.'));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Das Bild konnte nicht gelesen werden.'));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error('Das Bildformat wird nicht unterstützt.'));
        image.onload = () => {
          const scale = Math.min(1, 900 / image.width, 1200 / image.height);
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-mr-close]')) closeOverlay();
    const star = event.target.closest('[data-rating]');
    if (star) {
      currentRating = Number(star.dataset.rating);
      renderStars();
    }
  });

  chapterAutoButton.addEventListener('click', () => {
    if (!globalChapterDetection) return;
    chapterDetectionDisabled = !chapterDetectionDisabled;
    if (chapterDetectionDisabled && !chapterManuallyChanged) {
      // Der bereits automatisch aus der neuen URL erkannte Wert darf beim
      // Ausschalten nicht versehentlich als manuelle Aenderung weiterleben.
      chapterInput.value = storedChapterBaseline;
    } else if (!chapterDetectionDisabled && !chapterInput.value.trim()) {
      chapterInput.value = MangaStore.chapterFromUrl(urlInput.value);
    }
    renderChapterAutoButton();
    showMessage(chapterDetectionDisabled ? ot('chapterAutoOff') : ot('chapterAutoOn'),
      chapterDetectionDisabled ? 'warning' : 'success');
  });

  chapterInput.addEventListener('input', () => {
    chapterManuallyChanged = true;
  });

  coverAutoButton.addEventListener('click', () => {
    coverDetectionDisabled = !coverDetectionDisabled;
    renderCoverAutoButton();
    renderCover();
    showMessage(coverDetectionDisabled ? ot('coverAutoOff') : ot('coverAutoOn'),
      coverDetectionDisabled ? 'warning' : 'success');
  });

  byId('mr-cover-file').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      currentCover = await imageFileToDataUrl(file);
      currentCoverStored = false;
      coverManuallyChanged = true;
      coverUrlInput.value = '';
      renderCover();
      showMessage(ot('localCoverReady'), 'success');
    } catch (error) {
      showMessage(error.message, 'error');
    } finally {
      event.target.value = '';
    }
  });

  coverUrlInput.addEventListener('input', () => {
    currentCover = coverUrlInput.value.trim();
    currentCoverStored = false;
    coverManuallyChanged = true;
    renderCover();
  });

  urlInput.addEventListener('blur', () => {
    if (!chapterInput.value.trim()) {
      chapterInput.value = detectedChapter(urlInput.value);
    }
  });

  byId('mr-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const draft = draftFromForm();
      const stored = await MangaStore.load();
      const normalizedUrl = MangaStore.normalizeItem(draft).url;
      const exact = stored.items.find((item) => item.url === normalizedUrl);

      if (!currentItemId && !exact) {
        const candidates = MangaStore.findLikelyMatches(stored.items, draft);
        const likelyMatch = MangaStore.findLikelyMatch(stored.items, draft);
        if (likelyMatch) {
          openUpdateConfirmation(likelyMatch, draft, candidates);
          return;
        }
      }

      await saveDraft({ ...draft, id: currentItemId || exact?.id || '' });
    } catch (error) {
      showMessage(error.message, 'error');
    }
  });

  byId('mr-replace-existing').addEventListener('click', async () => {
    if (!pendingDraft || !pendingMatch) return;
    const oldChapter = pendingMatch.currentChapter;
    const keepStoredChapter = pendingDraft.chapterDetectionDisabled === true
      && pendingDraft.chapterManualChange !== true;
    const newChapter = keepStoredChapter ? pendingMatch.currentChapter : pendingDraft.currentChapter;
    try {
      const storedCover = await MangaStore.getStoredCover(pendingMatch.id);
      currentCoverStored = Boolean(storedCover);
      currentCover = storedCover || pendingDraft.cover || pendingMatch.cover || currentCover;
      // Nur URL, Kapitel und neue Seitendaten wechseln. Persönliche Einordnung
      // wie Bewertung, Tags, Status und ein vorhandenes lokales Cover bleiben.
      await saveDraft({
        ...pendingMatch,
        tags: pendingDraft.tagsEdited ? pendingDraft.tags : pendingMatch.tags,
        id: pendingMatch.id,
        url: pendingDraft.url,
        currentChapter: newChapter,
        chapterManual: keepStoredChapter ? pendingMatch.chapterManual : pendingDraft.chapterManual,
        chapterDetectionDisabled: pendingDraft.chapterDetectionDisabled,
        chapterManualChange: pendingDraft.chapterManualChange,
        coverDetectionDisabled: pendingDraft.coverDetectionDisabled,
        coverManualChange: pendingDraft.coverManualChange,
        cover: coverForChapterUpdate(storedCover, pendingMatch, pendingDraft),
        description: pendingDraft.description || pendingMatch.description,
        favicon: pendingDraft.favicon || pendingMatch.favicon
      }, keepStoredChapter
        ? ot('linkUpdatedChapterKept', oldChapter)
        : `Bestehender Eintrag aktualisiert${newChapter ? `: Kapitel ${oldChapter || '–'} → ${newChapter}` : '.'}`);
      closeUpdateConfirmation();
    } catch (error) {
      closeUpdateConfirmation();
      showMessage(error.message, 'error');
    }
  });

  byId('mr-update-target').addEventListener('change', (event) => {
    const selected = pendingCandidates.find((item) => item.id === event.target.value);
    if (!selected) return;
    pendingMatch = selected;
    renderUpdateConfirmation();
  });

  byId('mr-save-separate').addEventListener('click', async () => {
    if (!pendingDraft || !pendingMatch || !offerRereadOnUpdate) return;
    try {
      const stored = await MangaStore.load();
      const rootId = pendingMatch.rereadOf || pendingMatch.id;
      const round = Math.max(0, ...stored.items
        .filter((item) => item.rereadOf === rootId)
        .map((item) => Number(item.rereadRound) || 0)) + 1;
      const rereadTag = MangaStore.REREAD_TAG || 'Re-Read';
      const existingTags = MangaStore.cleanTags(pendingDraft.tags || []);
      const tags = autoTagRereads
        ? MangaStore.cleanTags([...existingTags, rereadTag])
        : existingTags;
      const draft = {
        ...pendingDraft,
        id: globalThis.crypto?.randomUUID?.() || `reread-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        forceNew: true,
        rereadOf: rootId,
        rereadRound: round,
        tags
      };
      closeUpdateConfirmation();
      await saveDraft(draft, ot('separateSaved'));
    } catch (error) {
      closeUpdateConfirmation();
      showMessage(error.message, 'error');
    }
  });

  byId('mr-cancel-update').addEventListener('click', closeUpdateConfirmation);

  // Header and footer share the existing background navigation route.
  function openCollection() {
    browser.runtime.sendMessage({ type: 'manga-regal:open-dashboard' });
    closeOverlay();
  }
  byId('mr-open-dashboard').addEventListener('click', openCollection);
  root.querySelectorAll('[data-mr-open-collection]').forEach((button) => {
    button.addEventListener('click', openCollection);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !root.classList.contains('mr-open')) return;
    if (!tagPicker.hidden) {
      event.preventDefault();
      closeTagPicker(true);
      byId('mr-choose-tags').focus();
      return;
    }
    if (!byId('mr-update-confirm').hidden) closeUpdateConfirmation();
    else closeOverlay();
  });

  // Nachrichten kommen vom Werkzeugleisten-Symbol oder vom Tastenkürzel.
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request?.type !== 'manga-regal:toggle-overlay') return false;
    // Explicit async acknowledgement works in both browsers. Without it Chrome
    // can report a closed channel and the background opens the fallback tab.
    toggleOverlay().then(() => sendResponse?.({ ok: true }), (error) => {
      console.error('Manga-Regal: popup initialization failed', error);
      showMessage(error.message, 'error');
      sendResponse?.({ ok: false, message: String(error.message) });
    });
    return true;
  });
  globalThis.__mangaRegalOverlayReady = true;
})();
