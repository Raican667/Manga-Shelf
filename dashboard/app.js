/*
 * Vollständige Sammlungsansicht des Add-ons.
 *
 * Die Oberfläche enthält bewusst keine eigene Speicherimplementierung. Alle
 * Datenzugriffe erfolgen über ../shared/store.js. Dadurch kann die Darstellung
 * verändert werden, ohne die Datenstruktur an mehreren Stellen anzufassen.
 */
(function initializeDashboard() {
  'use strict';

  const elements = {
    collectionView: document.getElementById('collectionView'),
    adminView: document.getElementById('adminView'),
    viewNav: document.getElementById('viewNav'),
    rows: document.getElementById('collectionRows'),
    cards: document.getElementById('collectionCards'),
    table: document.getElementById('collectionTable'),
    search: document.getElementById('searchInput'),
    ratingFilter: document.getElementById('ratingFilter'),
    sort: document.getElementById('sortSelect'),
    viewTitle: document.getElementById('viewTitle'),
    dialog: document.getElementById('entryDialog'),
    form: document.getElementById('entryForm'),
    dialogStars: document.getElementById('dialogStars'),
    toast: document.getElementById('toast')
  };

  let data = null;
  // „Lese ich gerade“ ist die Startansicht. Ein direkter Hilfelink darf jedoch
  // über ?view=admin unmittelbar zurück zu den Einstellungen springen.
  let currentView = new URLSearchParams(location.search).get('view') === 'admin' ? 'admin' : 'reading';
  let dialogRating = 0;
  let bookmarkFolders = [];
  let bookmarkEntries = [];
  let firefoxSearchEngines = [];
  let placeholderCoverOverrides = [];
  let coverObserver = null;
  let coverRenderEpoch = 0;
  const coverObjectUrls = new Map();
  let logLevel = 'all';
  let logQuery = '';
  let sortState = { column: 'modified', direction: 'desc' };
  let currentShortcut = 'Alt+Shift+M';
  const collectionViews = ['reading', 'active', 'hold', 'dropped', 'completed', 'all'];
  const PLACEHOLDER_COVERS = [
    { id: 'arcane', src: '../assets/placeholders/arcane-library.jpg', labelKey: 'placeholderArcane' },
    { id: 'city', src: '../assets/placeholders/moon-city.jpg', labelKey: 'placeholderCity' },
    { id: 'forest', src: '../assets/placeholders/forest-shrine.jpg', labelKey: 'placeholderForest' },
    { id: 'cosmic', src: '../assets/placeholders/cosmic-gate.jpg', labelKey: 'placeholderCosmic' }
  ];
  const AUTOMATIC_PLACEHOLDER_TAGS = {
    action: 'cosmic', adventure: 'cosmic', 'martial arts': 'cosmic', sports: 'cosmic', thriller: 'cosmic', shōnen: 'cosmic', seinen: 'cosmic',
    fantasy: 'arcane', isekai: 'arcane', mystery: 'arcane', supernatural: 'arcane', horror: 'arcane', historical: 'arcane',
    'sci-fi': 'city', mecha: 'city', webtoon: 'city', psychological: 'city',
    romance: 'forest', drama: 'forest', comedy: 'forest', 'slice of life': 'forest', 'school life': 'forest', shōjo: 'forest', 'boys love': 'forest', 'girls love': 'forest'
  };

  /** Verbindet die vier stabilen Slots mit ihren optionalen lokalen Bildern. */
  function allPlaceholderCovers() {
    const overrides = new Map(placeholderCoverOverrides.map((cover) => [cover.id, cover.dataUrl]));
    return PLACEHOLDER_COVERS.map((cover) => ({
      ...cover,
      src: overrides.get(cover.id) || cover.src,
      overridden: overrides.has(cover.id)
    }));
  }

  function allCollectionViews() {
    const available = [...collectionViews, ...(data?.settings?.customCategories || []).map((category) => category.id)];
    const savedOrder = data?.settings?.categoryOrder || [];
    return [...savedOrder.filter((view) => available.includes(view)), ...available.filter((view) => !savedOrder.includes(view))];
  }

  function statusViews() {
    return allCollectionViews().filter((view) => view !== 'all');
  }

  // Alle sichtbaren Texte liegen an einer Stelle. Neue Übersetzungen können so
  // ergänzt werden, ohne die Daten- oder Ereignislogik anzufassen.
  const translations = {
    de: {
      brandSubtitle: 'Lokale Firefox-Sammlung', navReading: 'Lese ich gerade', navActive: 'Aktiv', navHold: 'On Hold', navDropped: 'Gedroppt', navCompleted: 'Abgeschlossen', navAll: 'Alle', navAdmin: 'Admin',
      collectionEyebrow: 'Deine Sammlung', collectionDescription: 'Bewerte, kategorisiere und öffne deine gespeicherten Manga-Seiten.', entries: 'Einträge', averageStars: 'Ø Sterne',
      syncBookmarks: 'Firefox-Lesezeichen einlesen', addManga: '＋ Manga hinzufügen', searchPlaceholder: 'Titel, Website oder Tag suchen …',
      allRatings: 'Alle Bewertungen', unrated: 'Unbewertet', sortNew: 'Zuletzt geändert', sortRating: 'Beste Bewertung', sortTitle: 'Titel A–Z',
      title: 'Titel', continue: 'Weiterlesen', chapter: 'Aktuelles Kapitel', tags: 'Tags', rating: 'Bewertung', status: 'Status', modified: 'Geändert', actions: 'Aktionen',
      viewReading: 'Lese ich gerade', viewActive: 'Aktive Manga', viewHold: 'Manga auf Hold', viewDropped: 'Gedroppte Manga', viewCompleted: 'Abgeschlossene Manga', viewAll: 'Gesamte Sammlung', collection: 'Sammlung',
      active: 'Aktiv', reading: 'Lese ich gerade', hold: 'On Hold', dropped: 'Gedroppt', completed: 'Abgeschlossen', full: 'voll', noTag: 'Ohne Tag', editTags: '＋ Tags anpassen', edit: 'Bearbeiten', remove: 'Entfernen', open: 'Offen',
      findSource: 'Neue Quelle suchen', bookmarkLinked: 'Mit Firefox-Lesezeichen verknüpft', emptyCollection: 'Keine passenden Manga gefunden.',
      appearanceTitle: 'Oberfläche', appearanceDescription: 'Ansicht, Sprache und Farbschema der Erweiterung.', viewMode: 'Sammlungsansicht', viewModeHint: 'Tabelle oder Manga-Kacheln', tableView: 'Tabelle', cardView: 'Kacheln', language: 'Sprache', languageHint: 'Oberfläche und Einblendungsformular', colorMode: 'Farbschema', colorModeHint: 'Dunkle oder helle Darstellung', darkMode: 'Dunkel', lightMode: 'Hell', tableCovers: 'Cover in Tabellen', tableCoversHint: 'Cover nur in der Tabellenansicht einblenden.', searchEngine: 'Suchmaschine', searchEngineHint: 'Standardmäßig wird die Firefox-Auswahl verwendet.', browserDefault: 'Firefox-Standard',
      tagRemoved: 'Tag entfernt', mangaRemoved: 'Manga entfernt', chapterSaved: 'Kapitelstand gespeichert', mangaSaved: 'Manga gespeichert', mangaAndCoverSaved: 'Manga und Cover lokal gespeichert', coverSaveFailed: 'Manga gespeichert; Cover konnte nicht heruntergeladen werden', tagsSaved: 'Tags gespeichert', preferencesSaved: 'Darstellung gespeichert',
      removeConfirm: (title) => `„${title}“ endgültig aus dem Manga-Regal entfernen?`, movedTo: (status) => `Nach „${status}“ verschoben`,
      logCount: (visible, total) => `${visible} von ${total} Einträgen`, emptyLogs: 'Keine passenden Protokolleinträge.',
      entryEdit: 'Manga bearbeiten', entryAdd: 'Manga hinzufügen', noTagsYet: 'Noch keine Tags vorhanden. Lege unten den ersten Tag an.',
      noRating: 'Keine Bewertung', stars: 'Sterne', bookmarkCount: 'Lesezeichen', noFolders: 'Firefox enthält keine Ordner mit importierbaren Webseiten-Lesezeichen.', loadingFolders: 'Ordner werden gelesen …',
      folderReadError: (message) => `Ordner konnten nicht gelesen werden: ${message}`,
      selectFolder: 'Bitte mindestens einen Firefox-Ordner auswählen.', imported: (count, rated) => `${count} importiert · ${rated} bewertet`, importFailed: (message) => `Import fehlgeschlagen: ${message}`,
      backupCreated: 'JSON-Sicherung erstellt', backupImported: 'JSON-Sicherung importiert', clearLogsConfirm: 'Alle Protokolleinträge löschen?', logsCleared: 'Protokoll gelöscht', limitSaved: (limit) => `Limit für „Lese ich gerade“ auf ${limit} gesetzt`, loadFailed: 'Die Sammlung konnte nicht geladen werden.',
      adminEyebrow: 'Systemverwaltung', adminTitle: 'Admin & Datensicherung', adminDescription: 'Import, Export und lokale Protokolle der Erweiterung.', storageActive: 'Autospeichern aktiv', saveAdmin: 'Einstellungen speichern', adminSaved: 'Alle Admin-Einstellungen gespeichert', backupTitle: 'Datensicherung', backupDescription: 'Deine Bewertungen und Tags bleiben in Firefox gespeichert.', exportBackup: 'JSON-Sicherung herunterladen', importBackup: 'JSON-Sicherung importieren', integrationTitle: 'Firefox-Integration', integrationDescription: 'Das Symbol befindet sich in der Firefox-Werkzeugleiste.', currentLimit: 'Limit für „Lese ich gerade“', currentLimitNamed: (name) => `Limit für „${name}“`, currentLimitHint: 'Wie viele Manga dürfen gleichzeitig aktiv gelesen werden?', saveLimit: 'Limit speichern', logsTitle: 'Import- & Fehlerprotokoll', logsDescription: 'Die neuesten lokalen Ereignisse zuerst.', clearLogs: 'Protokoll leeren', allLevels: 'Alle Stufen', searchLogs: 'Protokoll durchsuchen …', shortcutHint: 'Firefox verlangt Strg oder Alt; Umschalt ist nur zusätzlich möglich.', saveShortcut: 'Kürzel speichern', resetShortcut: 'Standard', shortcutSaved: 'Tastenkürzel gespeichert', shortcutReset: 'Tastenkürzel zurückgesetzt', shortcutPrimaryRequired: 'Firefox verlangt Strg oder Alt als Haupttaste, z. B. Strg+D oder Alt+Umschalt+D.', shortcutTooManyModifiers: 'Firefox erlaubt höchstens zwei Zusatztasten, z. B. Strg+Umschalt+D.', shortcutKeyRequired: 'Bitte zusätzlich eine Taste von A–Z, 0–9 oder eine unterstützte Sondertaste drücken.', shortcutInvalid: 'Dieses Tastenkürzel wird von Firefox nicht unterstützt.', shortcutUnavailable: 'Dieses Kürzel ist bereits durch Firefox oder ein anderes Add-on belegt.', perPageViewTitle: 'Ansicht je Kategorie', perPageViewHint: 'Für jede Seite Tabelle oder Kacheln festlegen.', categoryNamesTitle: 'Kategorienamen', categoryNamesHint: 'Leere Felder verwenden wieder die Standardnamen.', saveCategoryNames: 'Kategorienamen speichern', categoryNamesSaved: 'Kategorienamen gespeichert', defaultName: 'Standardname',
      entryEyebrow: 'Manga-Eintrag', website: 'Webseite', coverUrl: 'Cover-Adresse', cancel: 'Abbrechen', save: 'Speichern', tagTableEyebrow: 'Direkt in der Sammlung', editTagsTitle: 'Tags anpassen', tagHelp: 'Wähle vorhandene Tags aus oder lege darunter neue Kategorien an.', newTags: 'Neue Tags', newTagsHelp: 'Mehrere neue Tags mit Kommas trennen.', applyTags: 'Tags übernehmen', bookmarksEyebrow: 'Firefox-Lesezeichen', selectAllDisplayed: 'Alle angezeigten Einträge auswählen', importSelection: 'Auswahl importieren', bookmarkImportTitle: 'Lesezeichen-Import', bookmarkImportHint: 'Lege fest, welche Lesezeichen angeboten werden.', defaultNewStatus: 'Standardkategorie für neue Einträge', defaultNewStatusHint: 'Gilt für das Tab-Formular, manuelle Einträge und Firefox-Importe.', importMode: 'Importart', importFoldersMode: 'Ordner auswählen', importKeywordMode: 'Alle mit Schlüsselwort', importManualMode: 'Lesezeichen einzeln auswählen', importKeyword: 'Schlüsselwort', importKeywordHint: 'Sucht in Titel und Adresse, z. B. Chapter', showImportButton: 'Importknopf anzeigen', showImportButtonHint: 'Blendet den Knopf im Kopfbereich ein oder aus.', folderDialogTitle: 'Ordner auswählen', keywordDialogTitle: 'Lesezeichen mit Schlüsselwort', manualDialogTitle: 'Lesezeichen auswählen', folderHelp: 'Es werden nur markierte Ordner importiert. Optional kannst du allen Manga eines Ordners direkt eine Bewertung geben.', keywordHelp: (keyword) => `Alle Lesezeichen mit „${keyword}“ in Titel oder Adresse werden importiert.`, manualHelp: 'Wähle einzelne Lesezeichen aus allen Firefox-Ordnern aus.', noBookmarks: 'Keine passenden Webseiten-Lesezeichen gefunden.', selectBookmark: 'Bitte mindestens einen Eintrag auswählen.', customSearchTitle: 'Weitere Suchmaschine', customSearchHint: 'In der Adresse muss {query} als Platzhalter stehen.', addSearchEngine: '＋ Hinzufügen', invalidSearchEngine: 'Name und gültige Suchadresse mit {query} eingeben.', backupHint: 'Ein JSON-Export ist empfehlenswert, bevor du das Add-on entfernst. Beim Entfernen löscht Firefox normalerweise auch den Erweiterungsspeicher.', toolbarSymbol: 'Werkzeugleisten-Symbol', toolbarSymbolDetail: 'Öffnet das Formular im aktuellen Tab', shortcut: 'Tastenkürzel', internalPages: 'Interne Seiten', internalPagesDetail: 'Öffnen stattdessen diese Sammlung', logTime: 'Zeit', logLevel: 'Stufe', logArea: 'Bereich', logMessage: 'Meldung', logDetails: 'Details', tagPresetsTitle: 'Tag-Vorauswahl', tagPresetsDescription: 'Aktiviere häufig verwendete Tags für die Manga-Tag-Auswahl.', tagPresetsHint: 'Entfernte Vorgaben verschwinden nur aus dieser Auswahl. Bereits vergebene Manga-Tags bleiben erhalten.', selectAll: 'Alle auswählen', selectNone: 'Keine auswählen', saveTagPresets: 'Tag-Auswahl speichern', tagPresetsSaved: 'Tag-Auswahl gespeichert', newPresetTag: 'Eigenen Tag anlegen', newPresetPlaceholder: 'z. B. Reincarnation', addPresetTag: '＋ Tag hinzufügen', presetAdded: 'Tag zur Vorauswahl hinzugefügt', presetExists: 'Dieser Tag ist bereits in der Liste.', presetRemoved: 'Tag aus der Vorauswahl entfernt', newCategory: 'Neue Kategorie', newCategoryPlaceholder: 'z. B. Später lesen', addCategory: '＋ Kategorie hinzufügen', categoryAdded: 'Neue Kategorie hinzugefügt', categoryExists: 'Dieser Kategoriename ist bereits vorhanden.', categoryRemoved: 'Kategorie entfernt; enthaltene Manga wurden nach Aktiv verschoben.', removeCategoryConfirm: (name) => `Kategorie „${name}“ entfernen? Enthaltene Manga werden nach Aktiv verschoben.`
    },
    en: {
      brandSubtitle: 'Local Firefox collection', navReading: 'Currently Reading', navActive: 'Active', navHold: 'On Hold', navDropped: 'Dropped', navCompleted: 'Completed', navAll: 'All', navAdmin: 'Admin',
      collectionEyebrow: 'Your collection', collectionDescription: 'Rate, categorize, and open your saved manga pages.', entries: 'Entries', averageStars: 'Avg. stars',
      syncBookmarks: 'Import Firefox bookmarks', addManga: '＋ Add manga', searchPlaceholder: 'Search title, website, or tag …',
      allRatings: 'All ratings', unrated: 'Unrated', sortNew: 'Recently changed', sortRating: 'Highest rating', sortTitle: 'Title A–Z',
      title: 'Title', continue: 'Continue reading', chapter: 'Current chapter', tags: 'Tags', rating: 'Rating', status: 'Status', modified: 'Changed', actions: 'Actions',
      viewReading: 'Currently reading', viewActive: 'Active manga', viewHold: 'Manga on hold', viewDropped: 'Dropped manga', viewCompleted: 'Completed manga', viewAll: 'Entire collection', collection: 'Collection',
      active: 'Active', reading: 'Currently Reading', hold: 'On Hold', dropped: 'Dropped', completed: 'Completed', full: 'full', noTag: 'No tags', editTags: '＋ Edit tags', edit: 'Edit', remove: 'Remove', open: 'Open',
      findSource: 'Find a new source', bookmarkLinked: 'Linked to a Firefox bookmark', emptyCollection: 'No matching manga found.',
      appearanceTitle: 'Appearance', appearanceDescription: 'Collection layout, language, and color scheme.', viewMode: 'Collection layout', viewModeHint: 'Table or manga cards', tableView: 'Table', cardView: 'Cards', language: 'Language', languageHint: 'Dashboard and page overlay', colorMode: 'Color scheme', colorModeHint: 'Dark or light appearance', darkMode: 'Dark', lightMode: 'Light', tableCovers: 'Covers in tables', tableCoversHint: 'Show covers in table layouts only.', searchEngine: 'Search engine', searchEngineHint: 'Uses the Firefox selection by default.', browserDefault: 'Firefox default',
      tagRemoved: 'Tag removed', mangaRemoved: 'Manga removed', chapterSaved: 'Chapter progress saved', mangaSaved: 'Manga saved', mangaAndCoverSaved: 'Manga and cover stored locally', coverSaveFailed: 'Manga saved; cover could not be downloaded', tagsSaved: 'Tags saved', preferencesSaved: 'Appearance saved',
      removeConfirm: (title) => `Permanently remove “${title}” from Manga Shelf?`, movedTo: (status) => `Moved to “${status}”`,
      logCount: (visible, total) => `${visible} of ${total} entries`, emptyLogs: 'No matching log entries.',
      entryEdit: 'Edit manga', entryAdd: 'Add manga', noTagsYet: 'No tags yet. Create the first tag below.',
      noRating: 'No rating', stars: 'stars', bookmarkCount: 'bookmarks', noFolders: 'Firefox has no folders containing importable website bookmarks.', loadingFolders: 'Reading folders …',
      folderReadError: (message) => `Folders could not be read: ${message}`,
      selectFolder: 'Please select at least one Firefox folder.', imported: (count, rated) => `${count} imported · ${rated} rated`, importFailed: (message) => `Import failed: ${message}`,
      backupCreated: 'JSON backup created', backupImported: 'JSON backup imported', clearLogsConfirm: 'Delete all log entries?', logsCleared: 'Log cleared', limitSaved: (limit) => `Currently Reading limit set to ${limit}`, loadFailed: 'The collection could not be loaded.',
      adminEyebrow: 'System management', adminTitle: 'Admin & backup', adminDescription: 'Import, export, and local extension logs.', storageActive: 'Autosave active', saveAdmin: 'Save settings', adminSaved: 'All admin settings saved', backupTitle: 'Data backup', backupDescription: 'Your ratings and tags remain stored in Firefox.', exportBackup: 'Download JSON backup', importBackup: 'Import JSON backup', integrationTitle: 'Firefox integration', integrationDescription: 'The icon is located in the Firefox toolbar.', currentLimit: 'Currently Reading limit', currentLimitNamed: (name) => `${name} limit`, currentLimitHint: 'How many manga can be read at the same time?', saveLimit: 'Save limit', logsTitle: 'Import & error log', logsDescription: 'Newest local events first.', clearLogs: 'Clear log', allLevels: 'All levels', searchLogs: 'Search logs …', shortcutHint: 'Firefox requires Ctrl or Alt; Shift can only be additional.', saveShortcut: 'Save shortcut', resetShortcut: 'Default', shortcutSaved: 'Keyboard shortcut saved', shortcutReset: 'Keyboard shortcut reset', shortcutPrimaryRequired: 'Firefox requires Ctrl or Alt as the primary modifier, e.g. Ctrl+D or Alt+Shift+D.', shortcutTooManyModifiers: 'Firefox allows no more than two modifiers, e.g. Ctrl+Shift+D.', shortcutKeyRequired: 'Please also press A–Z, 0–9, or a supported special key.', shortcutInvalid: 'Firefox does not support this keyboard shortcut.', shortcutUnavailable: 'This shortcut is already used by Firefox or another add-on.', perPageViewTitle: 'Layout per category', perPageViewHint: 'Choose table or cards for every page.', categoryNamesTitle: 'Category names', categoryNamesHint: 'Empty fields use the default names again.', saveCategoryNames: 'Save category names', categoryNamesSaved: 'Category names saved', defaultName: 'Default name',
      entryEyebrow: 'Manga entry', website: 'Website', coverUrl: 'Cover URL', cancel: 'Cancel', save: 'Save', tagTableEyebrow: 'Directly in the collection', editTagsTitle: 'Edit tags', tagHelp: 'Select existing tags or create new categories below.', newTags: 'New tags', newTagsHelp: 'Separate multiple new tags with commas.', applyTags: 'Apply tags', bookmarksEyebrow: 'Firefox bookmarks', selectAllDisplayed: 'Select all displayed entries', importSelection: 'Import selection', bookmarkImportTitle: 'Bookmark import', bookmarkImportHint: 'Choose which bookmarks are offered for import.', defaultNewStatus: 'Default category for new entries', defaultNewStatusHint: 'Used by the tab form, manual entries, and Firefox imports.', importMode: 'Import mode', importFoldersMode: 'Select folders', importKeywordMode: 'All matching a keyword', importManualMode: 'Select individual bookmarks', importKeyword: 'Keyword', importKeywordHint: 'Searches title and URL, e.g. Chapter', showImportButton: 'Show import button', showImportButtonHint: 'Shows or hides the button in the header.', folderDialogTitle: 'Select folders', keywordDialogTitle: 'Bookmarks matching keyword', manualDialogTitle: 'Select bookmarks', folderHelp: 'Only selected folders are imported. You can optionally assign a rating to every manga in a folder.', keywordHelp: (keyword) => `All bookmarks containing “${keyword}” in title or URL will be imported.`, manualHelp: 'Select individual bookmarks from all Firefox folders.', noBookmarks: 'No matching website bookmarks found.', selectBookmark: 'Please select at least one entry.', customSearchTitle: 'Additional search engine', customSearchHint: 'The address must contain {query} as a placeholder.', addSearchEngine: '＋ Add', invalidSearchEngine: 'Enter a name and valid search URL containing {query}.', backupHint: 'Create a JSON export before removing the add-on. Firefox normally also deletes extension storage during removal.', toolbarSymbol: 'Toolbar icon', toolbarSymbolDetail: 'Opens the form in the current tab', shortcut: 'Keyboard shortcut', internalPages: 'Internal pages', internalPagesDetail: 'Open this collection instead', logTime: 'Time', logLevel: 'Level', logArea: 'Area', logMessage: 'Message', logDetails: 'Details', tagPresetsTitle: 'Tag presets', tagPresetsDescription: 'Enable frequently used tags for the manga tag picker.', tagPresetsHint: 'Removed presets disappear only from this picker. Tags already assigned to manga remain.', selectAll: 'Select all', selectNone: 'Select none', saveTagPresets: 'Save tag selection', tagPresetsSaved: 'Tag selection saved', newPresetTag: 'Create a custom tag', newPresetPlaceholder: 'e.g. Reincarnation', addPresetTag: '＋ Add tag', presetAdded: 'Tag added to presets', presetExists: 'This tag is already in the list.', presetRemoved: 'Tag removed from presets', newCategory: 'New category', newCategoryPlaceholder: 'e.g. Read later', addCategory: '＋ Add category', categoryAdded: 'New category added', categoryExists: 'This category name already exists.', categoryRemoved: 'Category removed; its manga were moved to Active.', removeCategoryConfirm: (name) => `Remove category “${name}”? Its manga will be moved to Active.`
    }
  };

  // Nutzerfreundliche Bezeichnungen für den früheren „Admin“-Bereich. Die
  // internen IDs bleiben absichtlich unverändert, damit alte Daten gültig sind.
  Object.assign(translations.de, {
    brandName: 'Manga-Regal',
    fullChangelog: 'Vollständige Versionshistorie',
    chromeSyncConsentTitle: 'Chrome Sync aktivieren?',
    chromeSyncConsentAccept: 'Sync erlauben',
    chromeSyncConsentText: 'Deine gespeicherten Titel, Links, Kapitelstände, Bewertungen, Tags und Einstellungen werden über Chrome Sync synchronisiert, sofern Chrome Sync im Browser aktiviert ist. Cover und Protokolle bleiben ausschließlich lokal. Die Zustimmung gilt nur für dieses Gerät und kann durch Ausschalten von Sync widerrufen werden.',
    limitLogs: 'Alte Einträge automatisch löschen',
    limitLogsHint: 'Ein: Bei mehr als 100 Einträgen werden die ältesten automatisch gelöscht. Aus: Alle Einträge bleiben erhalten. Beim erneuten Einschalten bleiben nur die neuesten 100 Einträge.',
    close: 'Schließen', collectionArea: 'Sammlungsbereich', filterRating: 'Bewertung filtern', sorting: 'Sortierung', settingsHelpTitle: 'Einstellungen erklären', settingsTabs: 'Protokolle und Änderungen', categoryMove: 'Kategorie verschieben', moveUp: 'Nach oben', moveDown: 'Nach unten', ratingFor: (title) => `Bewertung für ${title}`, folderRating: (title) => `Bewertung für Ordner ${title}`,
    navAdmin: 'Einstellungen',
    adminEyebrow: 'Verwaltung',
    adminTitle: 'Einstellungen & Datensicherung',
    adminDescription: 'Passe das Manga-Regal an und verwalte deine lokalen Daten.',
    help: 'Hilfe',
    adminSaved: 'Alle Einstellungen gespeichert',
    ratingScale: 'Bewertungsskala',
    ratingScaleHint: 'Fünf oder zehn Sterne verwenden',
    categoryOrderTitle: 'Reihenfolge der Kategorien',
    categoryOrderHint: 'Am Griff ziehen und an der gewünschten Position ablegen.',
    categoryOrderSaved: 'Kategorien neu angeordnet',
    categoryNamesTitle: 'Kategorien verwalten',
    categoryNamesHint: 'Name und Tabellen-/Kachelansicht festlegen oder die Zeile am Griff verschieben.',
    saveCategoryNames: 'Änderungen speichern',
    resetCategoryName: 'Standardnamen wiederherstellen',
    welcomeEyebrow: 'Willkommen',
    welcomeTitle: 'Dein Manga-Regal ist bereit',
    welcomeText: 'Dein Platz für Manga und Light Novels: Behalte Lesestand, Bewertungen und Tags im Blick.',
    welcomeStepOneTitle: 'Ersten Titel speichern',
    welcomeStepTwoTitle: 'Nach deinen Wünschen ordnen',
    welcomeStepThreeTitle: 'Weiterlesen und aktualisieren',
    welcomeStepOne: 'Öffne eine Manga-Seite und klicke auf das Manga-Regal-Symbol in der Firefox-Symbolleiste.',
    welcomeStepTwo: 'Prüfe Titel und Kapitel, wähle eine Kategorie und ergänze bei Bedarf Sterne und Tags.',
    welcomeStepThree: 'Öffne den gespeicherten Link über „Weiterlesen“. Speichere nach dem Lesen die neue Kapitelseite über das Symbol.',
    welcomeImportTitle: 'Schon Firefox-Lesezeichen vorhanden?',
    welcomeImportText: 'Mit „Firefox-Lesezeichen einlesen“ kannst du ausgewählte Ordner oder einzelne Lesezeichen übernehmen. Die Importart legst du in den Einstellungen fest.',
    welcomeStorage: 'Deine Sammlung wird lokal in Firefox gespeichert. Firefox Sync ist optional; Cover bleiben lokal. Die Hilfe ist jederzeit über „?“ in den Einstellungen erreichbar.',
    openGuide: 'Ausführliche Hilfe',
    startNow: 'Jetzt starten',
    firefoxSyncTitle: 'Firefox Sync',
    firefoxSyncDescription: 'Sammlung zwischen Firefox-Profilen synchronisieren.',
    firefoxSync: 'Automatisch synchronisieren',
    firefoxSyncHint: 'Benötigt ein angemeldetes Mozilla-Konto und aktivierte Add-on-Synchronisierung.',
    syncManga: 'Manga',
    syncBundles: 'Bündel',
    syncStorage: 'komprimiert von 100 KB',
    syncCompression: 'Komprimierung',
    syncNow: 'Jetzt synchronisieren',
    restoreSync: 'Vom Sync laden',
    syncNoCovers: 'Cover und lokale Protokolle bleiben auf diesem Gerät und werden nicht synchronisiert.',
    syncDisabled: 'Firefox Sync ist ausgeschaltet.',
    syncConsentRequired: 'Firefox Sync wartet auf deine Zustimmung in Firefox.',
    syncConsentDenied: 'Firefox Sync bleibt ausgeschaltet, weil die Datenfreigabe nicht erteilt wurde.',
    syncNever: 'Noch keine synchronisierte Sammlung vorhanden.',
    syncLast: (date) => `Zuletzt synchronisiert: ${date}`,
    syncCompleted: (items, chunks) => `${items} Manga in ${chunks} Bündel synchronisiert`,
    syncRestored: (items) => `${items} Manga aus Firefox Sync geladen`,
    syncRestoreConfirm: 'Lokale Sammlung durch den Firefox-Sync-Stand ersetzen? Lokale Cover passender Manga bleiben erhalten.',
    ratingScaleWarningEyebrow: 'Bewertungen werden angepasst',
    ratingScaleConfirmTitle: 'Bewertungsskala wirklich ändern?',
    ratingScaleAffected: (count) => count === 1
      ? 'Ein Manga hat aktuell mehr als 5 Sterne. Diese Bewertung wird auf 5 Sterne gesetzt. Bewertungen von 1 bis 5 bleiben unverändert.'
      : `${count} Manga haben aktuell mehr als 5 Sterne. Alle diese Bewertungen werden auf 5 Sterne gesetzt. Bewertungen von 1 bis 5 bleiben unverändert.`,
    ratingScaleConversionExample: 'Beispiel: 10 → 5, 8 → 5 und 6 → 5. Werte von 1 bis 5 ändern sich nicht.',
    ratingScaleWarningHint: 'Die Änderung wird erst nach deiner Bestätigung gespeichert.',
    confirmRatingScaleChange: 'Auf 5 Sterne umstellen',
    logsTab: 'Import- & Fehlerprotokoll',
    patchlogTab: 'Patchlog',
    patchlogTitle: 'Patchlog',
    patchlogDescription: 'Hinweise zur aktuell installierten Version.',
    openFullHelp: 'Vollständige Hilfe öffnen',
    currentPatch: 'Aktuell',
    startupDialog: 'Startdialog anzeigen',
    startupDialogHint: 'Begrüßung und Kurzanleitung beim ersten Öffnen vollständig ein- oder ausschalten.',
    chapterDetection: 'Kapitel aus Links erkennen',
    chapterDetectionHint: 'Für Light Novels oder uneindeutige URLs abschaltbar. Kapitel können weiterhin manuell eingetragen werden.',
    rereadOption: 'Re-Read-Option anbieten',
    rereadOptionHint: 'Zeigt im Aktualisierungsdialog die Möglichkeit für einen getrennten neuen Lesedurchlauf.',
    rereadTag: 'Re-Reads automatisch taggen',
    rereadTagHint: 'Fügt neuen Re-Reads den sichtbaren Tag „Re-Read“ hinzu. Die interne Zuordnung bleibt erhalten.',
    bookmarkExportTitle: 'Zurück zu Firefox',
    bookmarkExportDescription: 'Erstellt aus der Sammlung wieder geordnete Firefox-Lesezeichen.',
    bookmarkExportDestination: 'Ziel',
    bookmarkExportDestinationDetail: 'Weitere Lesezeichen / Manga-Regal',
    bookmarkExportStructure: 'Struktur',
    bookmarkExportStructureDetail: 'Ein Unterordner je Kategorie',
    bookmarkExportData: 'Enthaltene Daten',
    bookmarkExportDataDetail: 'Nur Titel und aktuelle Adresse',
    bookmarkExportAction: 'Manga-Regal-Ordner erstellen',
    bookmarkExportUpdateAction: 'Manga-Regal-Ordner aktualisieren',
    bookmarkExportHint: 'Bei einem erneuten Export wird nur der zuvor von Manga-Regal erzeugte Ordner ersetzt. Die Gesamtansicht „Alle“ wird nicht doppelt angelegt.',
    bookmarkExportNever: 'Noch kein Manga-Regal-Ordner erstellt.',
    bookmarkExportNeverDetail: 'Bewertungen, Tags, Cover und Protokolle werden nicht als Lesezeichen gespeichert.',
    bookmarkExportLast: (items, folders, date) => `${items} Manga in ${folders} Ordnern · ${date}`,
    bookmarkExportReadyDetail: 'Der verwaltete Ordner kann sicher aktualisiert werden.',
    bookmarkExportConfirmCreate: (items) => `${items} Manga als Firefox-Lesezeichen unter „Weitere Lesezeichen / Manga-Regal“ erstellen?`,
    bookmarkExportConfirmReplace: (items) => `Den vorhandenen Manga-Regal-Export durch den aktuellen Stand mit ${items} Manga ersetzen?`,
    bookmarkExportDone: (items, folders) => `${items} Manga in ${folders} Firefox-Ordner exportiert`,
    bookmarkExportFailed: (message) => `Lesezeichen-Export fehlgeschlagen: ${message}`,
    placeholderCoverTitle: 'Platzhalter-Cover nach Tag',
    placeholderCoverHint: 'Ersetze bei Bedarf eines der vier Motive und ziehe Tags auf den gewünschten Platzhalter.',
    placeholderCoversToggle: 'Platzhalter-Cover anzeigen',
    placeholderAuto: 'Automatisch', placeholderArcane: 'Magische Bibliothek', placeholderCity: 'Mondstadt', placeholderForest: 'Waldschrein', placeholderCosmic: 'Kosmisches Tor',
    placeholderMappingSaved: 'Cover-Zuordnung gespeichert', placeholderAutoHint: 'Nicht fest zugeordnete Tags', placeholderDropHere: 'Tags hier ablegen', placeholderDropEmpty: 'Noch keine Tags zugeordnet', placeholderReset: 'Zurück auf automatisch', placeholderReplace: 'Bild ersetzen', placeholderRestore: 'Standardbild', placeholderImageSaved: 'Eigenes Platzhalter-Cover gespeichert', placeholderImageRestored: 'Standardbild wiederhergestellt', placeholderRestoreConfirm: 'Dieses eigene Bild entfernen und das mitgelieferte Standardmotiv wiederherstellen?'
  });
  Object.assign(translations.en, {
    brandName: 'Manga Shelf',
    fullChangelog: 'Full version history',
    chromeSyncConsentTitle: 'Enable Chrome Sync?',
    chromeSyncConsentAccept: 'Allow Sync',
    chromeSyncConsentText: 'Your saved titles, links, reading progress, ratings, tags, and settings will be synchronized through Chrome Sync if browser sync is enabled. Covers and logs stay entirely local. Consent applies only to this device and can be withdrawn by switching Sync off.',
    limitLogs: 'Automatically delete old entries',
    limitLogsHint: 'On: when there are more than 100 entries, the oldest are deleted automatically. Off: all entries are kept. Turning this back on keeps only the latest 100 entries.',
    close: 'Close', collectionArea: 'Collection sections', filterRating: 'Filter by rating', sorting: 'Sort order', settingsHelpTitle: 'Explain settings', settingsTabs: 'Logs and changes', categoryMove: 'Move category', moveUp: 'Move up', moveDown: 'Move down', ratingFor: (title) => `Rating for ${title}`, folderRating: (title) => `Rating for folder ${title}`,
    navAdmin: 'Settings',
    adminEyebrow: 'Management',
    adminTitle: 'Settings & backup',
    adminDescription: 'Customize Manga Shelf and manage your local data.',
    help: 'Help',
    adminSaved: 'All settings saved',
    ratingScale: 'Rating scale',
    ratingScaleHint: 'Use five or ten stars',
    categoryOrderTitle: 'Category order',
    categoryOrderHint: 'Drag the handle and drop it in the desired position.',
    categoryOrderSaved: 'Categories reordered',
    categoryNamesTitle: 'Manage categories',
    categoryNamesHint: 'Set its name and table/card layout or drag the row into the desired order.',
    saveCategoryNames: 'Save changes',
    resetCategoryName: 'Restore default name',
    welcomeEyebrow: 'Welcome',
    welcomeTitle: 'Your Manga Shelf is ready',
    welcomeText: 'Your home for manga and light novels: keep track of reading progress, ratings, and tags.',
    welcomeStepOneTitle: 'Save your first title',
    welcomeStepTwoTitle: 'Organize your way',
    welcomeStepThreeTitle: 'Read and update',
    welcomeStepOne: 'Open a manga page and click the Manga Shelf icon in the Firefox toolbar.',
    welcomeStepTwo: 'Check the title and chapter, choose a category, and optionally add stars and tags.',
    welcomeStepThree: 'Open your saved link with “Continue reading”. After reading, save the new chapter page using the toolbar icon.',
    welcomeImportTitle: 'Already have Firefox bookmarks?',
    welcomeImportText: 'Use “Read Firefox bookmarks” to import selected folders or individual bookmarks. Choose the import mode in Settings.',
    welcomeStorage: 'Your collection is stored locally in Firefox. Firefox Sync is optional; covers stay local. You can always open Help using “?” in Settings.',
    openGuide: 'Full guide',
    startNow: 'Get started',
    firefoxSyncTitle: 'Firefox Sync',
    firefoxSyncDescription: 'Synchronize the collection between Firefox profiles.',
    firefoxSync: 'Sync automatically',
    firefoxSyncHint: 'Requires a signed-in Mozilla account with add-on synchronization enabled.',
    syncManga: 'Manga',
    syncBundles: 'Bundles',
    syncStorage: 'compressed of 100 KB',
    syncCompression: 'Compression',
    syncNow: 'Sync now',
    restoreSync: 'Load from Sync',
    syncNoCovers: 'Covers and local logs remain on this device and are not synchronized.',
    syncDisabled: 'Firefox Sync is turned off.',
    syncConsentRequired: 'Firefox Sync is waiting for your consent in Firefox.',
    syncConsentDenied: 'Firefox Sync remains off because data permission was not granted.',
    syncNever: 'No synchronized collection is available yet.',
    syncLast: (date) => `Last synchronized: ${date}`,
    syncCompleted: (items, chunks) => `Synchronized ${items} manga in ${chunks} bundles`,
    syncRestored: (items) => `Loaded ${items} manga from Firefox Sync`,
    syncRestoreConfirm: 'Replace the local collection with the Firefox Sync version? Local covers for matching manga will be preserved.',
    ratingScaleWarningEyebrow: 'Ratings will be adjusted',
    ratingScaleConfirmTitle: 'Change the rating scale?',
    ratingScaleAffected: (count) => count === 1
      ? 'One manga currently has more than 5 stars. Its rating will be set to 5. Ratings from 1 to 5 stay unchanged.'
      : `${count} manga currently have more than 5 stars. All of those ratings will be set to 5. Ratings from 1 to 5 stay unchanged.`,
    ratingScaleConversionExample: 'Example: 10 → 5, 8 → 5, and 6 → 5. Values from 1 to 5 do not change.',
    ratingScaleWarningHint: 'The change is saved only after you confirm it.',
    confirmRatingScaleChange: 'Switch to 5 stars',
    logsTab: 'Import & error log',
    patchlogTab: 'Patch log',
    patchlogTitle: 'Patch log',
    patchlogDescription: 'Notes for the currently installed version.',
    openFullHelp: 'Open full help',
    currentPatch: 'Current',
    startupDialog: 'Show startup dialog',
    startupDialogHint: 'Completely enable or disable the welcome dialog and quick guide on first open.',
    chapterDetection: 'Detect chapters from links',
    chapterDetectionHint: 'Can be disabled for light novels or ambiguous URLs. Chapters can still be entered manually.',
    rereadOption: 'Offer re-read option',
    rereadOptionHint: 'Shows an option for a separate new reading run in the update dialog.',
    rereadTag: 'Tag re-reads automatically',
    rereadTagHint: 'Adds the visible “Re-Read” tag to new re-reads. The internal link remains independent.',
    bookmarkExportTitle: 'Back to Firefox',
    bookmarkExportDescription: 'Turns the collection back into organized Firefox bookmarks.',
    bookmarkExportDestination: 'Destination',
    bookmarkExportDestinationDetail: 'Other Bookmarks / Manga-Regal',
    bookmarkExportStructure: 'Structure',
    bookmarkExportStructureDetail: 'One subfolder per category',
    bookmarkExportData: 'Included data',
    bookmarkExportDataDetail: 'Title and current URL only',
    bookmarkExportAction: 'Create Manga-Regal folder',
    bookmarkExportUpdateAction: 'Update Manga-Regal folder',
    bookmarkExportHint: 'A repeated export replaces only the folder previously created by Manga-Regal. The aggregate All view is not duplicated.',
    bookmarkExportNever: 'No Manga-Regal bookmark folder has been created yet.',
    bookmarkExportNeverDetail: 'Ratings, tags, covers, and logs are not stored as bookmarks.',
    bookmarkExportLast: (items, folders, date) => `${items} manga in ${folders} folders · ${date}`,
    bookmarkExportReadyDetail: 'The managed folder can be updated safely.',
    bookmarkExportConfirmCreate: (items) => `Create ${items} manga as Firefox bookmarks under “Other Bookmarks / Manga-Regal”?`,
    bookmarkExportConfirmReplace: (items) => `Replace the existing Manga-Regal export with the current collection of ${items} manga?`,
    bookmarkExportDone: (items, folders) => `Exported ${items} manga to ${folders} Firefox folders`,
    bookmarkExportFailed: (message) => `Bookmark export failed: ${message}`,
    placeholderCoverTitle: 'Placeholder cover by tag',
    placeholderCoverHint: 'Replace any of the four artworks when needed and drag tags onto the desired placeholder.',
    placeholderCoversToggle: 'Show placeholder covers',
    placeholderAuto: 'Automatic', placeholderArcane: 'Arcane library', placeholderCity: 'Moon city', placeholderForest: 'Forest shrine', placeholderCosmic: 'Cosmic gate',
    placeholderMappingSaved: 'Cover assignment saved', placeholderAutoHint: 'Tags without a fixed assignment', placeholderDropHere: 'Drop tags here', placeholderDropEmpty: 'No tags assigned yet', placeholderReset: 'Return to automatic', placeholderReplace: 'Replace image', placeholderRestore: 'Default image', placeholderImageSaved: 'Custom placeholder cover saved', placeholderImageRestored: 'Default image restored', placeholderRestoreConfirm: 'Remove this custom image and restore the bundled default artwork?'
  });

  // Nur die Hinweise der installierten Version bleiben in der Anwendung. Die
  // vollständige Historie liegt zentral im CHANGELOG.md des Repositories.
  const patchNotes = {
    de: [
      { version: '0.20.8', date: '18.10.2026', title: 'Öffentliche Veröffentlichung', notes: ['Neues öffentliches Repository mit geprüftem Ausgangsstand und englischer Standard-README.', 'Support-Button und Einstellung entfernt.', 'GPLv3-only, neue öffentliche Downloads und abgesicherte Veröffentlichungsabläufe.'] },
    ],
    en: [
      { version: '0.20.8', date: '2026-10-18', title: 'Public release', notes: ['New public repository with a reviewed baseline and English default README.', 'Removed the support button and its setting.', 'GPLv3-only, new public downloads and hardened release workflows.'] },
    ]
  };

  Object.assign(translations.de, { syncBookmarks: 'Browser-Lesezeichen importieren', bookmarksEyebrow: 'Browser-Lesezeichen', bookmarkExportTitle: 'Zurück zu den Browser-Lesezeichen', bookmarkExportDescription: 'Erstellt aus der Sammlung normale Browser-Lesezeichen in Kategorieordnern.', showImportButton: 'Lesezeichen-Importknopf anzeigen', showImportButtonHint: 'Blendet den Browser-Lesezeichen-Import im Kopfbereich ein oder aus.' });
  Object.assign(translations.en, { syncBookmarks: 'Import browser bookmarks', bookmarksEyebrow: 'Browser bookmarks', bookmarkExportTitle: 'Back to browser bookmarks', bookmarkExportDescription: 'Creates regular browser bookmarks from the collection, organized into category folders.', showImportButton: 'Show bookmark import button', showImportButtonHint: 'Show or hide browser bookmark import in the header.' });
  function t(key, ...args) {
    const language = data?.settings?.language === 'en' ? 'en' : 'de';
    if (globalThis.MangaPlatform?.isChrome && key === 'firefoxSyncHint') {
      return language === 'en' ? 'Requires Chrome browser sync with extension synchronization enabled.' : 'Benötigt aktivierte Browser-Synchronisierung in Chrome einschließlich Erweiterungen.';
    }
    const translation = translations[language][key] ?? translations.de[key] ?? key;
    // Apply browser wording AFTER evaluating dynamic messages as well.
    const value = typeof translation === 'function' ? translation(...args) : translation;
    return globalThis.MangaPlatform?.isChrome && typeof value === 'string'
      ? value.replaceAll('Firefox', 'Chrome') : value;
  }

  function defaultCategoryLabel(view) {
    const keys = { reading: 'navReading', active: 'navActive', hold: 'navHold', dropped: 'navDropped', completed: 'navCompleted', all: 'navAll' };
    return t(keys[view] || 'collection');
  }

  /** Eigene Namen ändern nur die Anzeige; gespeicherte Statuswerte bleiben stabil. */
  function categoryLabel(view) {
    const custom = data?.settings?.customCategories?.find((category) => category.id === view);
    return data?.settings?.categoryNames?.[view]?.trim() || custom?.name || defaultCategoryLabel(view);
  }

  function renderCategoryNavigation() {
    const container = document.getElementById('categoryNavItems');
    container.innerHTML = allCollectionViews().map((view) => `<button class="nav-item" data-view="${escapeHtml(view)}"><span data-category-view="${escapeHtml(view)}">${escapeHtml(categoryLabel(view))}</span> <span data-count-view="${escapeHtml(view)}">0</span></button>`).join('');
  }

  /** Übernimmt Sprache und Farbschema sofort für die komplette Oberfläche. */
  function applyPreferences() {
    setSwitchState(document.getElementById('limitLogsSetting'), data.settings.limitLogs !== false,
      data.settings.language === 'en' ? 'On' : 'Ein', data.settings.language === 'en' ? 'Off' : 'Aus');
    const language = data.settings.language === 'en' ? 'en' : 'de';
    document.documentElement.lang = language;
    document.title = t('brandName');
    document.documentElement.dataset.theme = data.settings.colorMode;
    // CSS nutzt diesen Wert für eine schmalere 5-Sterne- bzw. breitere
    // 10-Sterne-Spalte, ohne die Aktionsspalte aus dem Sichtbereich zu drücken.
    document.documentElement.dataset.ratingScale = String(ratingMax());
    document.querySelector('meta[name="color-scheme"]').content = data.settings.colorMode;
    document.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = t(node.dataset.i18n); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((node) => { node.placeholder = t(node.dataset.i18nPlaceholder); });
    document.querySelectorAll('[data-i18n-title]').forEach((node) => { node.title = t(node.dataset.i18nTitle); });
    document.querySelectorAll('[data-i18n-aria-label]').forEach((node) => { node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel)); });
    document.querySelectorAll('[data-help-page]').forEach((node) => {
      const suffix = language === 'en' ? '.en' : '';
      node.href = `../help/${node.dataset.helpPage}${suffix}.html`;
    });
    document.querySelectorAll('[data-category-view]').forEach((node) => {
      node.textContent = categoryLabel(node.dataset.categoryView);
    });
    if (globalThis.MangaPlatform?.isChrome) {
      // Translate browser-facing labels only, never identifiers, URLs or saved data.
      document.querySelectorAll('[data-i18n]').forEach((node) => {
        node.textContent = node.textContent.replaceAll('Firefox', 'Chrome');
      });
      document.getElementById('shortcutInput').readOnly = true;
      document.getElementById('resetShortcut').hidden = true;
      document.getElementById('saveShortcut').textContent = language === 'en' ? 'Configure in Chrome' : 'In Chrome einstellen';
    }
  }

  /** Maskiert Text, bevor er in HTML-Templates eingesetzt wird. */
  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[character]);
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat(data?.settings?.language === 'en' ? 'en-US' : 'de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    }).format(new Date(value));
  }

  function statusLabel(status) {
    return categoryLabel(status);
  }

  function sourceSearchQuery(item) {
    return `${item.title} ${item.currentChapter ? `Chapter ${item.currentChapter}` : 'Manga'}`;
  }

  /** Verwendet standardmäßig exakt die in Firefox gewählte Suchmaschine. */
  async function performSourceSearch(item) {
    const query = sourceSearchQuery(item);
    const selected = data.settings.searchEngine;
    if (selected === 'browser-default' || selected.startsWith('firefox:')) {
      const engine = selected.startsWith('firefox:') ? selected.slice('firefox:'.length) : undefined;
      const details = { query, disposition: 'NEW_TAB' };
      if (engine) details.engine = engine;
      if (globalThis.MangaPlatform) await MangaPlatform.search(query, engine);
      else await browser.search.search(details);
      return;
    }
    const custom = data.settings.customSearchEngines.find((candidate) => `custom:${candidate.id}` === selected);
    if (custom) {
      await browser.tabs.create({ url: custom.urlTemplate.replaceAll('{query}', encodeURIComponent(query)) });
      return;
    }
    const encoded = encodeURIComponent(query);
    const engines = {
      google: `https://www.google.com/search?q=${encoded}`,
      bing: `https://www.bing.com/search?q=${encoded}`,
      yahoo: `https://search.yahoo.com/search?p=${encoded}`,
      yandex: `https://yandex.com/search/?text=${encoded}`,
      duckduckgo: `https://duckduckgo.com/?q=${encoded}`,
      baidu: `https://www.baidu.com/s?wd=${encoded}`
    };
    await browser.tabs.create({ url: engines[selected] || engines.google });
  }

  function actionIcon(type, id, label) {
    const svg = type === 'edit'
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4Zm13-17 4 4-2 2-4-4 2-2Z"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 21h10a2 2 0 0 0 2-2V7H5v12a2 2 0 0 0 2 2Zm3-11h2v8h-2v-8Zm4 0h2v8h-2v-8ZM8 4l1-2h6l1 2h5v2H3V4h5Z"/></svg>';
    return `<button class="icon-action-button ${type === 'remove' ? 'danger' : ''}" type="button" data-${type}="${escapeHtml(id)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${svg}</button>`;
  }

  /**
   * Ermittelt ein lokales Ersatzcover. Eine explizite Benutzerzuordnung hat
   * Vorrang vor der eingebauten Genre-Automatik. Ohne erkennbaren Tag sorgt
   * ein stabiler Hash dafür, dass ein Manga bei jedem Öffnen dasselbe Motiv
   * behält, die Sammlung insgesamt aber abwechslungsreich bleibt.
   */
  function placeholderCoverIdFor(item) {
    const tags = (item?.tags || []).map((tag) => String(tag).trim().toLowerCase());
    const configured = Object.entries(data?.settings?.placeholderCoverByTag || {});
    for (const tag of tags) {
      const assignment = configured.find(([configuredTag]) => configuredTag.toLowerCase() === tag);
      if (assignment && allPlaceholderCovers().some((cover) => cover.id === assignment[1])) return assignment[1];
    }
    for (const tag of tags) {
      if (AUTOMATIC_PLACEHOLDER_TAGS[tag]) return AUTOMATIC_PLACEHOLDER_TAGS[tag];
    }
    const stableKey = String(item?.id || item?.title || 'manga');
    const hash = [...stableKey].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 0);
    return PLACEHOLDER_COVERS[hash % PLACEHOLDER_COVERS.length].id;
  }

  function placeholderCoverFor(item) {
    if (data?.settings?.placeholderCoversEnabled === false) return '';
    const covers = allPlaceholderCovers();
    return covers.find((cover) => cover.id === placeholderCoverIdFor(item))?.src
      || covers[0].src;
  }

  /** Gibt die nur für die aktuelle Darstellung erzeugten Blob-Adressen frei. */
  function revokeCoverObjectUrls() {
    for (const objectUrl of coverObjectUrls.values()) URL.revokeObjectURL(objectUrl);
    coverObjectUrls.clear();
  }

  /**
   * Wandelt ein gespeichertes Base64-Bild in eine kurze, temporäre Blob-URL.
   * Die dauerhafte Speicherung bleibt portabel; das DOM muss aber keine mehrere
   * Megabyte lange data:-Adresse halten.
   */
  function localCoverObjectUrl(itemId, dataUrl) {
    const existing = coverObjectUrls.get(itemId);
    if (existing) return existing;
    const separator = dataUrl.indexOf(',');
    if (separator < 0) throw new Error('Ungültiges lokales Coverformat.');
    const header = dataUrl.slice(0, separator);
    const payload = dataUrl.slice(separator + 1);
    const type = header.match(/^data:([^;,]+)/i)?.[1] || 'image/jpeg';
    let bytes;
    if (/;base64/i.test(header)) {
      const binary = atob(payload);
      bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(payload));
    }
    const objectUrl = URL.createObjectURL(new Blob([bytes], { type }));
    coverObjectUrls.set(itemId, objectUrl);
    return objectUrl;
  }

  /** Cover werden erst geladen, wenn ihre Zeile oder Kachel nahe am Sichtbereich ist. */
  function observeVisibleCovers(container) {
    coverObserver?.disconnect();
    revokeCoverObjectUrls();
    const epoch = ++coverRenderEpoch;
    // Beobachtet wird der immer sichtbare Rahmen und nicht das anfangs noch
    // quelllose Bild. Ein img ohne src kann keine messbare Fläche besitzen und
    // hat den IntersectionObserver zuvor teilweise nie ausgelöst.
    const frames = [...container.querySelectorAll('.cover-image[data-cover-id]')]
      .map((image) => image.closest('.cover-frame'))
      .filter(Boolean);
    const loadCover = async (frame) => {
      if (frame.dataset.coverLoading === 'true') return;
      frame.dataset.coverLoading = 'true';
      const image = frame.querySelector('.cover-image[data-cover-id]');
      const item = data.items.find((candidate) => candidate.id === image.dataset.coverId);
      if (!item) return;
      const fallback = placeholderCoverFor(item);
      image.dataset.coverFallback = fallback || '';
      const showCover = (source) => {
        if (source) {
          frame.classList.remove('cover-empty');
          image.src = source;
          return;
        }
        image.removeAttribute('src');
        frame.classList.remove('cover-pending', 'cover-error');
        frame.classList.add('cover-empty');
      };
      try {
        const localCover = await MangaStore.cacheCover(item);
        if (epoch !== coverRenderEpoch || !frame.isConnected) return;
        showCover(localCover ? localCoverObjectUrl(item.id, localCover) : fallback);
      } catch {
        if (epoch !== coverRenderEpoch || !frame.isConnected) return;
        image.dataset.coverFallbackApplied = 'true';
        showCover(fallback);
      }
    };
    if (!('IntersectionObserver' in window)) {
      frames.forEach(loadCover);
      return;
    }
    coverObserver = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      coverObserver.unobserve(entry.target);
      loadCover(entry.target);
    }), { rootMargin: '180px' });
    frames.forEach((frame) => {
      // Ein direkter Test lädt die bereits sichtbaren Einträge zuverlässig.
      // Weiter entfernte Cover bleiben dem Observer vorbehalten.
      const bounds = frame.getBoundingClientRect();
      const nearViewport = bounds.bottom >= -180 && bounds.top <= window.innerHeight + 180
        && bounds.right >= -180 && bounds.left <= window.innerWidth + 180;
      if (nearViewport) loadCover(frame);
      else coverObserver.observe(frame);
    });
  }

  /** Kleine, nicht blockierende Rückmeldung unten rechts. */
  function toast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => elements.toast.classList.remove('show'), 2400);
  }

  /** Liefert die gemeinsame Bewertungsgröße für Dashboard, Import und Overlay. */
  function ratingMax() {
    return data?.settings?.ratingScale === 5 ? 5 : 10;
  }

  /**
   * Bestätigt eine verlustbehaftete Reduzierung der Bewertungsskala.
   *
   * Der Dialog wird nur benötigt, wenn tatsächlich gespeicherte Bewertungen
   * oberhalb der neuen Obergrenze liegen. Bis zur Bestätigung wird weder die
   * Einstellung noch ein Manga-Datensatz verändert.
   */
  function confirmRatingScaleReduction(nextScale) {
    const affected = data.items.filter((item) => Number(item.rating) > 5).length;
    if (ratingMax() !== 10 || Number(nextScale) !== 5 || affected === 0) {
      return Promise.resolve(true);
    }

    const dialog = document.getElementById('ratingScaleConfirmDialog');
    const confirmButton = document.getElementById('confirmRatingScaleChange');
    const cancelButton = document.getElementById('cancelRatingScaleChange');
    document.getElementById('ratingScaleWarningText').textContent = t('ratingScaleAffected', affected);

    return new Promise((resolve) => {
      let settled = false;
      const finish = (confirmed) => {
        if (settled) return;
        settled = true;
        confirmButton.removeEventListener('click', confirmChange);
        cancelButton.removeEventListener('click', cancelChange);
        dialog.removeEventListener('cancel', cancelDialog);
        if (dialog.open) dialog.close();
        resolve(confirmed);
      };
      const confirmChange = () => finish(true);
      const cancelChange = () => finish(false);
      const cancelDialog = (event) => {
        event.preventDefault();
        finish(false);
      };
      confirmButton.addEventListener('click', confirmChange);
      cancelButton.addEventListener('click', cancelChange);
      dialog.addEventListener('cancel', cancelDialog);
      dialog.showModal();
    });
  }

  /** Baut den Bewertungsfilter passend zur gewählten Skala neu auf. */
  function renderRatingFilter() {
    const previous = Number(elements.ratingFilter.value);
    const options = Array.from({ length: ratingMax() }, (_, index) => ratingMax() - index)
      .map((score) => `<option value="${score}">${score} ★</option>`).join('');
    elements.ratingFilter.innerHTML = `<option value="0">${t('allRatings')}</option>${options}<option value="-1">${t('unrated')}</option>`;
    elements.ratingFilter.value = [...elements.ratingFilter.options].some((option) => Number(option.value) === previous)
      ? String(previous)
      : '0';
  }

  /** Erzeugt die anklickbare Bewertung für eine Tabellenzeile. */
  function tableStars(item) {
    return `<div class="stars" aria-label="${escapeHtml(t('ratingFor', item.title))}">${Array.from(
      { length: ratingMax() },
      (_, index) => `<button class="star ${index + 1 <= item.rating ? 'on' : ''}" type="button" data-rate="${escapeHtml(item.id)}" data-score="${index + 1}" title="${index + 1}/${ratingMax()}">★</button>`
    ).join('')}</div>`;
  }

  /** Wendet Suche, Status, Bewertung und Sortierung auf die Sammlung an. */
  function visibleItems() {
    const query = elements.search.value.trim().toLowerCase();
    const selectedRating = Number(elements.ratingFilter.value);
    const statusItems = currentView === 'all'
      ? data.items
      : data.items.filter((item) => item.status === currentView);

    return statusItems
      .filter((item) => {
        const searchable = [
          item.title, item.url, item.source, item.description, item.currentChapter,
          ...item.tags, ...item.folderPath
        ].join(' ').toLowerCase();
        const ratingMatches = selectedRating === -1
          ? item.rating === 0
          : selectedRating === 0 || item.rating === selectedRating;
        return searchable.includes(query) && ratingMatches;
      })
      .sort(compareItems);
  }

  /** Liefert den für eine Tabellenüberschrift relevanten Sortierwert. */
  function sortValue(item, column) {
    if (column === 'chapter') return item.currentChapter;
    if (column === 'tags') return item.tags.join(' ');
    if (column === 'status') return statusLabel(item.status);
    return item[column] ?? '';
  }

  /** Text wird alphabetisch, Zahlen und Datumswerte numerisch sortiert. */
  function compareItems(a, b) {
    const column = sortState.column;
    const direction = sortState.direction === 'asc' ? 1 : -1;
    const aValue = sortValue(a, column);
    const bValue = sortValue(b, column);
    const aEmpty = aValue === '' || aValue === null || aValue === undefined;
    const bEmpty = bValue === '' || bValue === null || bValue === undefined;
    if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;

    if (['chapter', 'rating', 'modified'].includes(column)) {
      const aNumber = column === 'chapter' ? Number.parseFloat(aValue) : Number(aValue);
      const bNumber = column === 'chapter' ? Number.parseFloat(bValue) : Number(bValue);
      if (Number.isFinite(aNumber) && Number.isFinite(bNumber) && aNumber !== bNumber) {
        return (aNumber - bNumber) * direction;
      }
    }
    return String(aValue).localeCompare(String(bValue), data.settings.language, { numeric: true }) * direction;
  }

  function renderSortHeaders() {
    document.querySelectorAll('[data-sort-column]').forEach((button) => {
      const active = button.dataset.sortColumn === sortState.column;
      button.classList.toggle('active', active);
      button.querySelector('span').textContent = active
        ? (sortState.direction === 'asc' ? '↑' : '↓')
        : '';
      button.closest('th').setAttribute('aria-sort', active
        ? (sortState.direction === 'asc' ? 'ascending' : 'descending')
        : 'none');
    });
  }

  function renderCounts() {
    const count = (status) => data.items.filter((item) => item.status === status).length;
    const readingCount = count('reading');
    const readingLimit = MangaStore.getReadingLimit(data);
    document.querySelectorAll('[data-count-view]').forEach((counter) => {
      const view = counter.dataset.countView;
      counter.textContent = view === 'all' ? data.items.length : view === 'reading' ? `${readingCount}/${readingLimit}` : count(view);
      counter.classList.toggle('full', view === 'reading' && readingCount >= readingLimit);
    });
    document.getElementById('totalCount').textContent = data.items.length;
    const rated = data.items.filter((item) => item.rating > 0);
    document.getElementById('averageRating').textContent = rated.length
      ? (rated.reduce((sum, item) => sum + item.rating, 0) / rated.length).toFixed(1).replace('.', ',')
      : '–';
  }

  function renderCollection() {
    const items = visibleItems();
    const titles = {
      active: t('viewActive'), reading: t('viewReading'), hold: t('viewHold'), dropped: t('viewDropped'), completed: t('viewCompleted'), all: t('viewAll')
    };
    elements.viewTitle.textContent = data.settings.categoryNames[currentView] || titles[currentView] || t('collection');
    renderSortHeaders();

    const cardsMode = data.settings.collectionViews[currentView] === 'cards';
    elements.cards.hidden = !cardsMode;
    elements.table.hidden = cardsMode;

    if (cardsMode) {
      renderCards(items);
      return;
    }

    elements.rows.innerHTML = items.length ? items.map((item) => {
      const readingCount = data.items.filter((candidate) => candidate.status === 'reading').length;
      const readingLimit = MangaStore.getReadingLimit(data);
      const statusOptions = statusViews().map((status) =>
        `<option value="${status}" ${item.status === status ? 'selected' : ''} ${status === 'reading' && item.status !== 'reading' && readingCount >= readingLimit ? 'disabled' : ''}>${status === 'reading' ? `${statusLabel('reading')} (${readingCount}/${readingLimit})` : statusLabel(status)}</option>`
      ).join('');
      const tags = item.tags.length
        ? item.tags.map((tag) => `<button class="tag tag-button${tag.toLowerCase() === 're-read' ? ' reread-tag' : ''}" type="button" data-remove-row-tag="${escapeHtml(item.id)}" data-tag-value="${escapeHtml(tag)}">${escapeHtml(tag)} <b>×</b></button>`).join('')
        : `<span class="tag">${t('noTag')}</span>`;
      const cover = data.settings.showCoversInTable
        ? `<span class="row-cover cover-frame cover-pending"><img class="cover-image" data-cover-id="${escapeHtml(item.id)}" alt=""><span class="cover-placeholder" aria-hidden="true">◇</span></span>`
        : '';

      return `<tr>
        <td><div class="title-wrap">${cover}<div><a class="row-title-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>${item.bookmarkId ? `<span class="bookmark-mark">${t('bookmarkLinked')}</span>` : ''}</div></div></td>
        <td class="read-cell"><a class="continue-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${t('continue')} ↗</a><button class="source-search-link" type="button" data-source-search="${escapeHtml(item.id)}">${t('findSource')}</button><a class="url-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.source || item.url)}</a></td>
        <td><input class="chapter-input" data-chapter="${escapeHtml(item.id)}" value="${escapeHtml(item.currentChapter)}" placeholder="${t('open')}" aria-label="${t('chapter')}: ${escapeHtml(item.title)}"></td>
        <td class="tag-cell"><div class="tag-list">${tags}</div><button class="text-button edit-tags-button" type="button" data-edit-tags="${escapeHtml(item.id)}">${t('editTags')}</button></td>
        <td>${tableStars(item)}</td>
        <td><select class="status-select" data-status="${escapeHtml(item.id)}">${statusOptions}</select></td>
        <td class="date-cell">${formatDate(item.modified)}</td>
        <td class="row-actions"><div class="row-action-buttons">${actionIcon('edit', item.id, t('edit'))}${actionIcon('remove', item.id, t('remove'))}</div></td>
      </tr>`;
    }).join('') : `<tr><td class="empty-row" colspan="8">${t('emptyCollection')}</td></tr>`;
    observeVisibleCovers(elements.rows);
  }

  /** Kachelansicht mit denselben Daten und Aktionen wie die Tabelle. */
  function renderCards(items) {
    const readingCount = data.items.filter((candidate) => candidate.status === 'reading').length;
    const readingLimit = MangaStore.getReadingLimit(data);
    elements.cards.innerHTML = items.length ? items.map((item) => {
      const statusOptions = statusViews().map((status) =>
        `<option value="${status}" ${item.status === status ? 'selected' : ''} ${status === 'reading' && item.status !== 'reading' && readingCount >= readingLimit ? 'disabled' : ''}>${status === 'reading' ? `${statusLabel('reading')} (${readingCount}/${readingLimit})` : statusLabel(status)}</option>`
      ).join('');
      const tags = item.tags.length
        ? item.tags.map((tag) => `<button class="tag tag-button${tag.toLowerCase() === 're-read' ? ' reread-tag' : ''}" type="button" data-remove-row-tag="${escapeHtml(item.id)}" data-tag-value="${escapeHtml(tag)}">${escapeHtml(tag)} <b>×</b></button>`).join('')
        : `<span class="tag">${t('noTag')}</span>`;
      const cover = `<span class="card-cover-frame cover-frame cover-pending"><img class="card-cover cover-image" data-cover-id="${escapeHtml(item.id)}" alt=""><span class="cover-placeholder" aria-hidden="true">◇</span></span>`;
      return `<article class="manga-card">
        <a class="card-cover-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${cover}</a>
        <div class="card-body">
          <div class="card-title-row"><div><a class="card-title" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a><span class="card-source">${escapeHtml(item.source || item.url)}</span></div><span class="card-date">${formatDate(item.modified)}</span></div>
          <div class="card-progress"><label>${t('chapter')}<input class="chapter-input" data-chapter="${escapeHtml(item.id)}" value="${escapeHtml(item.currentChapter)}" placeholder="${t('open')}"></label><select class="status-select" data-status="${escapeHtml(item.id)}">${statusOptions}</select></div>
          <div class="tag-list">${tags}</div>
          <button class="text-button edit-tags-button" type="button" data-edit-tags="${escapeHtml(item.id)}">${t('editTags')}</button>
          ${tableStars(item)}
          <div class="card-links"><a class="continue-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${t('continue')} ↗</a><button class="source-search-link" type="button" data-source-search="${escapeHtml(item.id)}">${t('findSource')}</button></div>
          <div class="card-actions">${actionIcon('edit', item.id, t('edit'))}${actionIcon('remove', item.id, t('remove'))}</div>
        </div>
      </article>`;
    }).join('') : `<div class="card-empty">${t('emptyCollection')}</div>`;
    observeVisibleCovers(elements.cards);
  }

  /** Baut das Admin-Protokoll entsprechend der beiden Filter neu auf. */
  function renderLogs() {
    const query = logQuery.trim().toLowerCase();
    const logs = data.logs.filter((entry) => {
      const levelMatches = logLevel === 'all' || entry.level === logLevel;
      const text = [entry.area, entry.message, entry.details, entry.level].join(' ').toLowerCase();
      return levelMatches && (!query || text.includes(query));
    });
    document.getElementById('logCount').textContent = t('logCount', logs.length, data.logs.length);
    document.getElementById('logRows').innerHTML = logs.length ? logs.map((entry) => `<tr>
      <td class="date-cell">${new Date(entry.time).toLocaleString(data.settings.language === 'en' ? 'en-US' : 'de-DE')}</td>
      <td><span class="log-level ${escapeHtml(entry.level)}">${escapeHtml(entry.level)}</span></td>
      <td>${escapeHtml(entry.area)}</td><td>${escapeHtml(entry.message)}</td><td class="date-cell">${escapeHtml(entry.details || '–')}</td>
    </tr>`).join('') : `<tr><td class="empty-row" colspan="5">${t('emptyLogs')}</td></tr>`;
  }

  /** Rendert den lokalen Patchlog passend zur ausgewählten Oberflächensprache. */
  function renderPatchlog() {
    const language = data.settings.language === 'en' ? 'en' : 'de';
    document.getElementById('fullChangelogLink').href = `https://github.com/Raican667/Manga-Regal/blob/main/CHANGELOG${language === 'en' ? '.en' : ''}.md`;
    document.getElementById('patchlogContent').innerHTML = patchNotes[language].map((patch, index) => `
      <section class="patch-version ${index === 0 ? 'current' : ''}">
        <div class="patch-version-meta"><strong>v${escapeHtml(patch.version)}</strong><time>${escapeHtml(patch.date)}</time>${index === 0 ? `<span class="patch-current-badge">${escapeHtml(t('currentPatch'))}</span>` : ''}</div>
        <div><h4>${escapeHtml(patch.title)}</h4><ul>${patch.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul></div>
      </section>`).join('');
  }

  /** Schaltet zwischen technischem Protokoll und Versionshinweisen. */
  function setSettingsBottomTab(tab) {
    const patchlog = tab === 'patchlog';
    document.getElementById('logsPanel').hidden = patchlog;
    document.getElementById('patchlogPanel').hidden = !patchlog;
    document.getElementById('showLogsTab').classList.toggle('active', !patchlog);
    document.getElementById('showLogsTab').setAttribute('aria-selected', String(!patchlog));
    document.getElementById('showPatchlogTab').classList.toggle('active', patchlog);
    document.getElementById('showPatchlogTab').setAttribute('aria-selected', String(patchlog));
  }

  /** Name und Reihenfolge werden bewusst in einer einzigen Liste bearbeitet. */
  function renderCategoryNameSettings() {
    document.getElementById('categoryOrderList').innerHTML = allCollectionViews().map((view) => {
      const custom = data.settings.customCategories.find((category) => category.id === view);
      const label = custom?.name || defaultCategoryLabel(view);
      const input = custom
        ? `<input type="text" maxlength="40" data-custom-category-name="${escapeHtml(view)}" value="${escapeHtml(custom.name)}">`
        : `<input type="text" maxlength="40" data-category-name="${escapeHtml(view)}" value="${escapeHtml(data.settings.categoryNames[view] || '')}" placeholder="${escapeHtml(`${t('defaultName')}: ${defaultCategoryLabel(view)}`)}">`;
      const layout = `<label class="category-editor-layout" title="${escapeHtml(t('viewMode'))}"><span class="sr-only">${escapeHtml(t('viewMode'))}</span><select aria-label="${escapeHtml(t('viewMode'))}" data-view-mode="${escapeHtml(view)}"><option value="table" ${data.settings.collectionViews[view] === 'table' ? 'selected' : ''}>${t('tableView')}</option><option value="cards" ${data.settings.collectionViews[view] === 'cards' ? 'selected' : ''}>${t('cardView')}</option></select></label>`;
      const removeTitle = custom ? t('remove') : t('resetCategoryName');
      const remove = `<button class="remove-category-button ${custom ? '' : 'reset-category-button'}" type="button" data-remove-category="${escapeHtml(view)}" data-remove-custom="${custom ? 'true' : 'false'}" aria-label="${escapeHtml(removeTitle)}" title="${escapeHtml(removeTitle)}">×</button>`;
      return `<div class="category-order-item category-editor-item" data-order-view="${escapeHtml(view)}"><span class="drag-handle" draggable="true" aria-label="${escapeHtml(t('categoryMove'))}" title="${escapeHtml(t('categoryMove'))}">⠿</span><label class="category-editor-copy"><span>${escapeHtml(label)}</span>${input}</label>${layout}<span class="order-arrows"><button type="button" data-order-move="up" aria-label="${escapeHtml(t('moveUp'))}">↑</button><button type="button" data-order-move="down" aria-label="${escapeHtml(t('moveDown'))}">↓</button></span>${remove}</div>`;
    }).join('');
  }

  /** Rendert die mitgelieferten Tag-Vorschläge als aktivierbare Checkboxen. */
  function renderTagPresets() {
    const enabled = new Set(data.settings.tagPresets);
    const hidden = new Set(data.settings.hiddenTagPresets.map((tag) => tag.toLowerCase()));
    const catalog = [...MangaStore.TAG_PRESETS, ...data.settings.customTagPresets]
      .filter((tag) => !hidden.has(tag.toLowerCase()));
    document.getElementById('tagPresetGrid').innerHTML = catalog.map((tag, index) => `<div class="tag-preset-option"><label for="tag-preset-${index}"><input id="tag-preset-${index}" type="checkbox" data-tag-preset value="${escapeHtml(tag)}" ${enabled.has(tag) ? 'checked' : ''}><span>${escapeHtml(tag)}</span></label><button class="remove-preset-button" type="button" data-remove-tag-preset="${escapeHtml(tag)}" aria-label="${t('remove')}" title="${t('remove')}">×</button></div>`).join('');
  }

  /**
   * Stellt die Coverzuordnung als kleines Kanban-Board dar: Tags starten in
   * "Automatisch" und werden direkt auf eines der vier Motive gezogen.
   */
  function renderPlaceholderTagMap() {
    const hidden = new Set(data.settings.hiddenTagPresets.map((tag) => tag.toLowerCase()));
    const catalog = [...MangaStore.TAG_PRESETS, ...data.settings.customTagPresets]
      .filter((tag) => !hidden.has(tag.toLowerCase()));
    const configured = data.settings.placeholderCoverByTag || {};
    const container = document.getElementById('placeholderTagMap');
    const assignedCover = (tag) => Object.entries(configured)
      .find(([configuredTag]) => configuredTag.toLowerCase() === tag.toLowerCase())?.[1] || '';
    const chip = (tag, assigned = false) => `<span class="placeholder-tag-chip" draggable="true" data-placeholder-drag="${escapeHtml(tag)}"><i aria-hidden="true">⋮⋮</i><b>${escapeHtml(tag)}</b>${assigned ? `<button type="button" data-placeholder-reset="${escapeHtml(tag)}" title="${escapeHtml(t('placeholderReset'))}" aria-label="${escapeHtml(t('placeholderReset'))}">×</button>` : ''}</span>`;
    const automaticTags = catalog.filter((tag) => !assignedCover(tag));
    const automaticZone = `<section class="placeholder-drop-zone automatic-zone" data-placeholder-drop=""><header><span class="placeholder-auto-symbol" aria-hidden="true">✦</span><div><h5>${escapeHtml(t('placeholderAuto'))}</h5><p>${escapeHtml(t('placeholderAutoHint'))}</p></div></header><div class="placeholder-chip-list">${automaticTags.map((tag) => chip(tag)).join('') || `<small>${escapeHtml(t('placeholderDropEmpty'))}</small>`}</div></section>`;
    const coverZones = allPlaceholderCovers().map((cover) => {
      const assignedTags = catalog.filter((tag) => assignedCover(tag) === cover.id);
      const restore = cover.overridden ? `<button class="placeholder-restore-button" type="button" data-placeholder-restore-image="${cover.id}">${escapeHtml(t('placeholderRestore'))}</button>` : '';
      return `<section class="placeholder-drop-zone cover-zone" data-placeholder-drop="${cover.id}"><img src="${escapeHtml(cover.src)}" alt=""><header><div><h5>${escapeHtml(t(cover.labelKey))}</h5><p>${escapeHtml(t('placeholderDropHere'))}</p></div><div class="placeholder-cover-actions"><label class="placeholder-upload-button"><span>${escapeHtml(t('placeholderReplace'))}</span><input type="file" accept="image/jpeg,image/png,image/webp" data-placeholder-upload="${cover.id}"></label>${restore}</div></header><div class="placeholder-chip-list">${assignedTags.map((tag) => chip(tag, true)).join('') || `<small>${escapeHtml(t('placeholderDropEmpty'))}</small>`}</div></section>`;
    }).join('');
    container.innerHTML = `${automaticZone}<div class="placeholder-cover-zones">${coverZones}</div>`;
  }

  function setSwitchState(button, enabled, onLabel = 'Ein', offLabel = 'Aus') {
    button.setAttribute('aria-checked', String(Boolean(enabled)));
    button.classList.toggle('on', Boolean(enabled));
    const label = button.querySelector('[data-switch-label]');
    if (label) label.textContent = enabled ? onLabel : offLabel;
  }

  /**
   * Liest nur die kleine lokale Sync-Statistik und die entfernte Meta-Information.
   * Die eigentlichen Manga-Bündel werden hier nicht geladen; dadurch bleibt das
   * Öffnen der Einstellungen auch bei einer großen Sammlung günstig.
   */
  async function refreshSyncStatus() {
    const status = await MangaSync.status();
    document.getElementById('syncItemCount').textContent = String(status.itemCount || 0);
    document.getElementById('syncChunkCount').textContent = String(status.chunkCount || 0);
    document.getElementById('syncStorageUsage').textContent = `${(Number(status.usedBytes || 0) / 1024).toFixed(1)} KB`;
    const ratio = Number(status.compressedBytes) > 0
      ? Number(status.uncompressedBytes || 0) / Number(status.compressedBytes)
      : 0;
    document.getElementById('syncCompressionRatio').textContent = ratio > 0
      ? `${ratio.toFixed(1).replace('.', ',')}×`
      : '–';
    const statusText = document.getElementById('syncStatusText');
    if (!status.consentGranted && data.settings.syncEnabled) statusText.textContent = t('syncConsentRequired');
    else if (!data.settings.syncEnabled) statusText.textContent = t('syncDisabled');
    else if (!status.available && !status.lastSync) statusText.textContent = t('syncNever');
    else statusText.textContent = t('syncLast', new Intl.DateTimeFormat(
      data.settings.language === 'en' ? 'en-US' : 'de-DE',
      { dateStyle: 'medium', timeStyle: 'short' }
    ).format(new Date(status.lastSync || Date.now())));
  }

  /**
   * Zeigt nur den Zustand des von diesem Add-on verwalteten Lesezeichenbaums.
   * Gleichnamige Ordner, die der Nutzer selbst angelegt hat, werden weder als
   * Export erkannt noch beim Aktualisieren angefasst.
   */
  async function refreshBookmarkExportStatus() {
    const status = await MangaStore.getFirefoxBookmarkExportStatus();
    const summary = document.getElementById('bookmarkExportSummary');
    const detail = document.getElementById('bookmarkExportDetail');
    const button = document.getElementById('exportFirefoxBookmarks');
    if (!status.available) {
      summary.textContent = t('bookmarkExportNever');
      detail.textContent = t('bookmarkExportNeverDetail');
      button.textContent = t('bookmarkExportAction');
      return status;
    }
    const formattedDate = new Intl.DateTimeFormat(
      data.settings.language === 'en' ? 'en-US' : 'de-DE',
      { dateStyle: 'medium', timeStyle: 'short' }
    ).format(new Date(status.exportedAt || Date.now()));
    summary.textContent = t('bookmarkExportLast', status.itemCount, status.folderCount, formattedDate);
    detail.textContent = t('bookmarkExportReadyDetail');
    button.textContent = t('bookmarkExportUpdateAction');
    return status;
  }

  function renderSearchEngineSettings() {
    const select = document.getElementById('searchEngineSetting');
    const defaultEngine = firefoxSearchEngines.find((engine) => engine.isDefault);
    const firefoxOptions = firefoxSearchEngines.map((engine) => `<option value="firefox:${escapeHtml(engine.name)}">${escapeHtml(engine.name)}${engine.isDefault ? ' · Standard' : ''}</option>`).join('');
    const builtInOptions = [
      ['google', 'Google'], ['bing', 'Bing'], ['duckduckgo', 'DuckDuckGo'],
      ['yahoo', 'Yahoo'], ['yandex', 'Yandex'], ['baidu', 'Baidu']
    ].map(([value, name]) => `<option value="${value}">${name}</option>`).join('');
    const customOptions = data.settings.customSearchEngines.map((engine) => `<option value="custom:${escapeHtml(engine.id)}">${escapeHtml(engine.name)}</option>`).join('');
    select.innerHTML = `<option value="browser-default">${t('browserDefault')}${defaultEngine ? ` · ${escapeHtml(defaultEngine.name)}` : ''}</option>${firefoxOptions}${builtInOptions}${customOptions}`;
    select.value = [...select.options].some((option) => option.value === data.settings.searchEngine)
      ? data.settings.searchEngine
      : 'browser-default';
    document.getElementById('customSearchEngineList').innerHTML = data.settings.customSearchEngines.map((engine) => `<div class="custom-engine-item"><span><b>${escapeHtml(engine.name)}</b><small>${escapeHtml(engine.urlTemplate)}</small></span><button class="icon-action-button danger" type="button" data-remove-search-engine="${escapeHtml(engine.id)}" title="${t('remove')}" aria-label="${t('remove')}">×</button></div>`).join('');
  }

  function renderDefaultStatusSetting() {
    const select = document.getElementById('defaultNewStatusSetting');
    select.innerHTML = statusViews().map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</option>`).join('');
    select.value = data.settings.defaultNewStatus;
  }

  function render() {
    const admin = currentView === 'admin';
    elements.collectionView.hidden = admin;
    elements.adminView.hidden = !admin;
    renderCategoryNavigation();
    // Die Kategorienavigation bleibt auch in den Einstellungen sichtbar.
    // Deshalb müssen ihre Zähler unabhängig von renderCollection() gesetzt
    // werden; andernfalls blieben die beim Aufbau eingesetzten Platzhalter 0.
    renderCounts();
    document.querySelectorAll('[data-view]').forEach((button) => {
      button.classList.toggle('active', button.dataset.view === currentView);
    });
    if (admin) {
      renderLogs();
      renderPatchlog();
      document.getElementById('readingLimitInput').value = MangaStore.getReadingLimit(data);
      document.getElementById('currentLimitLabel').textContent = t('currentLimitNamed', categoryLabel('reading'));
      setSwitchState(document.getElementById('languageSetting'), data.settings.language === 'en');
      setSwitchState(document.getElementById('colorModeSetting'), data.settings.colorMode === 'light');
      setSwitchState(document.getElementById('showCoversInTableSetting'), data.settings.showCoversInTable,
        data.settings.language === 'en' ? 'On' : 'Ein', data.settings.language === 'en' ? 'Off' : 'Aus');
      setSwitchState(document.getElementById('showOnboardingSetting'), data.settings.showOnboardingOnStartup,
        data.settings.language === 'en' ? 'On' : 'Ein', data.settings.language === 'en' ? 'Off' : 'Aus');
      setSwitchState(document.getElementById('chapterDetectionSetting'), data.settings.chapterDetectionEnabled !== false,
        data.settings.language === 'en' ? 'On' : 'Ein', data.settings.language === 'en' ? 'Off' : 'Aus');
      setSwitchState(document.getElementById('offerRereadSetting'), data.settings.offerRereadOnUpdate !== false,
        data.settings.language === 'en' ? 'On' : 'Ein', data.settings.language === 'en' ? 'Off' : 'Aus');
      setSwitchState(document.getElementById('autoTagRereadsSetting'), data.settings.autoTagRereads !== false,
        data.settings.language === 'en' ? 'On' : 'Ein', data.settings.language === 'en' ? 'Off' : 'Aus');
      const placeholderSwitch = document.getElementById('placeholderCoversEnabledSetting');
      placeholderSwitch.title = t('placeholderCoversToggle');
      placeholderSwitch.setAttribute('aria-label', t('placeholderCoversToggle'));
      setSwitchState(placeholderSwitch, data.settings.placeholderCoversEnabled !== false,
        data.settings.language === 'en' ? 'On' : 'Ein', data.settings.language === 'en' ? 'Off' : 'Aus');
      setSwitchState(document.getElementById('showBookmarkImportButtonSetting'), data.settings.showBookmarkImportButton,
        data.settings.language === 'en' ? 'On' : 'Ein', data.settings.language === 'en' ? 'Off' : 'Aus');
      setSwitchState(document.getElementById('syncEnabledSetting'), data.settings.syncEnabled,
        data.settings.language === 'en' ? 'On' : 'Ein', data.settings.language === 'en' ? 'Off' : 'Aus');
      document.getElementById('bookmarkImportModeSetting').value = data.settings.bookmarkImportMode;
      document.getElementById('bookmarkImportKeywordSetting').value = data.settings.bookmarkImportKeyword;
      document.getElementById('ratingScaleSetting').value = String(ratingMax());
      document.getElementById('bookmarkKeywordRow').hidden = data.settings.bookmarkImportMode !== 'keyword';
      renderDefaultStatusSetting();
      renderSearchEngineSettings();
      document.getElementById('shortcutInput').value = currentShortcut;
      renderCategoryNameSettings();
      renderTagPresets();
      renderPlaceholderTagMap();
      refreshSyncStatus().catch((error) => {
        document.getElementById('syncStatusText').textContent = error.message;
      });
      refreshBookmarkExportStatus().catch((error) => {
        document.getElementById('bookmarkExportSummary').textContent = error.message;
      });
    } else renderCollection();
  }

  async function reload() {
    data = await MangaStore.load();
    placeholderCoverOverrides = await MangaStore.getCustomPlaceholderCovers({ includeData: true });
    try {
      const commands = await browser.commands.getAll();
      currentShortcut = commands.find((command) => command.name === 'toggle-manga-regal')?.shortcut || '';
    } catch {
      currentShortcut = '';
    }
    try {
      firefoxSearchEngines = await browser.search.get();
    } catch {
      firefoxSearchEngines = [];
    }
    applyPreferences();
    renderRatingFilter();
    const syncButton = document.getElementById('syncBookmarks');
    syncButton.hidden = !data.settings.showBookmarkImportButton;
    render();
    const onboarding = document.getElementById('onboardingDialog');
    if (data.settings.showOnboardingOnStartup && !data.settings.onboardingComplete && !onboarding.open) {
      onboarding.showModal();
    }
  }

  /** Zeigt die Sterne im Bearbeitungsdialog an. */
  function renderDialogStars() {
    elements.dialogStars.innerHTML = Array.from({ length: ratingMax() }, (_, index) => {
      const score = index + 1;
      return `<button class="star ${score <= dialogRating ? 'on' : ''}" type="button" data-dialog-rating="${score}" title="${score}/${ratingMax()}">★</button>`;
    }).join('');
  }

  function openDialog(id = '') {
    const item = data.items.find((candidate) => candidate.id === id);
    document.getElementById('dialogTitle').textContent = item ? t('entryEdit') : t('entryAdd');
    document.getElementById('editId').value = item?.id || '';
    document.getElementById('titleInput').value = item?.title || '';
    document.getElementById('urlInput').value = item?.url || '';
    entryTags = [...(item?.tags || [])];
    renderEntryTags();
    const detectChapterForItem = data.settings.chapterDetectionEnabled !== false
      && item?.chapterDetectionDisabled !== true;
    document.getElementById('chapterInput').value = item?.currentChapter
      || (detectChapterForItem ? MangaStore.chapterFromUrl(item?.url || '') : '');
    const readingCount = data.items.filter((candidate) => candidate.status === 'reading').length;
    const readingLimit = MangaStore.getReadingLimit(data);
    document.getElementById('statusInput').innerHTML = statusViews().map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</option>`).join('');
    const readingOption = document.querySelector('#statusInput option[value="reading"]');
    readingOption.disabled = readingCount >= readingLimit && item?.status !== 'reading';
    readingOption.textContent = readingOption.disabled
      ? `${statusLabel('reading')} (${readingCount}/${readingLimit} – ${t('full')})`
      : `${statusLabel('reading')} (${readingCount}/${readingLimit})`;
    const requestedStatus = item?.status || data.settings.defaultNewStatus;
    document.getElementById('statusInput').value = requestedStatus === 'reading' && readingOption.disabled ? 'active' : requestedStatus;
    document.getElementById('coverInput').value = item?.cover?.startsWith('http') ? item.cover : '';
    dialogRating = item?.rating || 0;
    renderDialogStars();
    elements.dialog.showModal();
    setTimeout(() => document.getElementById(item ? 'titleInput' : 'urlInput').focus(), 0);
  }

  let entryTags = [];
  let editingEntryTags = false;

  function renderEntryTags() {
    const container = document.getElementById('entrySelectedTags');
    container.replaceChildren();
    container.hidden = entryTags.length === 0;
    for (const tag of entryTags) {
      const chip = document.createElement('span');
      chip.className = 'tag';
      chip.classList.toggle('reread-tag', tag.toLowerCase() === MangaStore.REREAD_TAG.toLowerCase());
      chip.textContent = tag;
      container.append(chip);
    }
  }

  /** One picker serves both persisted collection rows and the unsaved form.
   * Form selections stay in memory until Save; Cancel never writes storage.
   * Only enabled presets plus existing assignments are offered, as in overlay. */
  function openTagEditor(id) {
    const item = data.items.find((candidate) => candidate.id === id);
    editingEntryTags = id === undefined;
    if (!editingEntryTags && !item) return;
    const assigned = editingEntryTags ? entryTags : item.tags;
    const knownTags = MangaStore.cleanTags([...data.settings.tagPresets, ...assigned]);
    document.getElementById('tagEditorItemId').value = item?.id || '';
    const choices = document.getElementById('tagChoiceList');
    choices.replaceChildren();
    if (!knownTags.length) choices.textContent = t('noTagsYet');
    for (const tag of knownTags) {
      const label = document.createElement('label');
      label.className = 'tag-choice';
      label.classList.toggle('reread-tag', tag.toLowerCase() === MangaStore.REREAD_TAG.toLowerCase());
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = tag;
      checkbox.checked = assigned.some((value) => value.toLowerCase() === tag.toLowerCase());
      const name = document.createElement('span');
      name.textContent = tag;
      label.append(checkbox, name);
      choices.append(label);
    }
    document.getElementById('tagEditorDialog').showModal();
  }
  document.getElementById('chooseEntryTags').addEventListener('click', () => openTagEditor());

  elements.viewNav.addEventListener('click', (event) => {
    const button = event.target.closest('[data-view]');
    if (!button) return;
    currentView = button.dataset.view;
    render();
  });

  elements.search.addEventListener('input', renderCollection);
  elements.ratingFilter.addEventListener('change', renderCollection);
  elements.sort.addEventListener('change', (event) => {
    const presets = {
      new: { column: 'modified', direction: 'desc' },
      rating: { column: 'rating', direction: 'desc' },
      title: { column: 'title', direction: 'asc' }
    };
    sortState = presets[event.target.value];
    renderCollection();
  });
  document.querySelectorAll('[data-sort-column]').forEach((button) => {
    button.addEventListener('click', () => {
      const column = button.dataset.sortColumn;
      const numericOrDate = ['chapter', 'rating', 'modified'].includes(column);
      sortState = sortState.column === column
        ? { column, direction: sortState.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: numericOrDate ? 'desc' : 'asc' };
      renderCollection();
    });
  });
  document.getElementById('addEntry').addEventListener('click', () => openDialog());
  document.getElementById('closeDialog').addEventListener('click', () => elements.dialog.close());
  document.getElementById('cancelDialog').addEventListener('click', () => elements.dialog.close());
  document.getElementById('urlInput').addEventListener('blur', (event) => {
    const chapterInput = document.getElementById('chapterInput');
    const item = data.items.find((candidate) => candidate.id === document.getElementById('editId').value);
    const detectChapterForItem = data.settings.chapterDetectionEnabled !== false
      && item?.chapterDetectionDisabled !== true;
    if (!chapterInput.value.trim() && detectChapterForItem) {
      chapterInput.value = MangaStore.chapterFromUrl(event.target.value);
    }
  });

  /** Baut die Firefox-Ordnerliste samt individueller Startbewertung. */
  function renderBookmarkFolders() {
    const container = document.getElementById('bookmarkFolderList');
    const ratingOptions = [`<option value="0">${t('noRating')}</option>`]
      .concat(Array.from({ length: ratingMax() }, (_, index) => `<option value="${index + 1}">${index + 1} ${t('stars')}</option>`))
      .join('');
    container.innerHTML = bookmarkFolders.length ? bookmarkFolders.map((folder, index) => `<div class="folder-option">
      <input id="folder-${index}" type="checkbox" data-folder-check value="${escapeHtml(folder.id)}">
      <label class="folder-copy" for="folder-${index}"><strong>${escapeHtml(folder.title)}</strong><span>${escapeHtml(folder.path.join(' / '))} · ${folder.bookmarkCount} ${t('bookmarkCount')}</span></label>
      <select class="folder-rating" data-folder-rating="${escapeHtml(folder.id)}" aria-label="${escapeHtml(t('folderRating', folder.title))}">${ratingOptions}</select>
    </div>`).join('') : `<div class="folder-empty">${t('noFolders')}</div>`;
    document.getElementById('selectAllFolders').checked = false;
  }

  function renderBookmarkEntries(entries) {
    const container = document.getElementById('bookmarkFolderList');
    container.innerHTML = entries.length ? entries.map((bookmark, index) => `<div class="folder-option bookmark-option">
      <input id="bookmark-${index}" type="checkbox" data-bookmark-check value="${escapeHtml(bookmark.id)}">
      <label class="folder-copy" for="bookmark-${index}"><strong>${escapeHtml(bookmark.title)}</strong><span>${escapeHtml(bookmark.path.join(' / '))}${bookmark.currentChapter ? ` · Chapter ${escapeHtml(bookmark.currentChapter)}` : ''}</span><small>${escapeHtml(bookmark.url)}</small></label>
    </div>`).join('') : `<div class="folder-empty">${t('noBookmarks')}</div>`;
    document.getElementById('selectAllFolders').checked = false;
  }

  async function openBookmarkDialog() {
    const button = document.getElementById('syncBookmarks');
    button.disabled = true;
    button.textContent = t('loadingFolders');
    try {
      const mode = data.settings.bookmarkImportMode;
      document.getElementById('bookmarkDialogTitle').textContent = t(mode === 'folders' ? 'folderDialogTitle' : mode === 'keyword' ? 'keywordDialogTitle' : 'manualDialogTitle');
      document.getElementById('bookmarkDialogHelp').textContent = mode === 'folders'
        ? t('folderHelp')
        : mode === 'keyword' ? t('keywordHelp', data.settings.bookmarkImportKeyword) : t('manualHelp');
      if (mode === 'folders') {
        bookmarkFolders = await MangaStore.getFirefoxBookmarkFolders();
        renderBookmarkFolders();
      } else {
        bookmarkEntries = await MangaStore.getFirefoxBookmarks();
        const keyword = data.settings.bookmarkImportKeyword.toLocaleLowerCase();
        const visible = mode === 'keyword'
          ? (keyword ? bookmarkEntries.filter((bookmark) => `${bookmark.title} ${bookmark.url}`.toLocaleLowerCase().includes(keyword)) : [])
          : bookmarkEntries;
        renderBookmarkEntries(visible);
        if (mode === 'keyword') {
          document.querySelectorAll('[data-bookmark-check]').forEach((checkbox) => { checkbox.checked = true; });
          document.getElementById('selectAllFolders').checked = visible.length > 0;
        }
      }
      document.getElementById('bookmarkDialog').showModal();
    } catch (error) {
      toast(t('folderReadError', error.message));
    } finally {
      button.disabled = false;
      button.textContent = t('syncBookmarks');
    }
  }

  elements.dialogStars.addEventListener('click', (event) => {
    const star = event.target.closest('[data-dialog-rating]');
    if (!star) return;
    dialogRating = Number(star.dataset.dialogRating);
    renderDialogStars();
  });

  /** Ereignisdelegation gilt gleichermaßen für Tabellen- und Kachelansicht. */
  elements.collectionView.addEventListener('click', async (event) => {
    const sourceButton = event.target.closest('[data-source-search]');
    if (sourceButton) {
      const item = data.items.find((candidate) => candidate.id === sourceButton.dataset.sourceSearch);
      if (item) {
        try { await performSourceSearch(item); } catch (error) { toast(error.message); }
      }
      return;
    }
    const editTagsButton = event.target.closest('[data-edit-tags]');
    if (editTagsButton) {
      openTagEditor(editTagsButton.dataset.editTags);
      return;
    }
    const removeTagButton = event.target.closest('[data-remove-row-tag]');
    if (removeTagButton) {
      const item = data.items.find((candidate) => candidate.id === removeTagButton.dataset.removeRowTag);
      if (!item) return;
      const savedData = await MangaStore.upsertItem({
        ...item,
        tags: item.tags.filter((tag) => tag !== removeTagButton.dataset.tagValue)
      });
      await reload();
      toast(t('tagRemoved'));
      return;
    }
    const ratingButton = event.target.closest('[data-rate]');
    if (ratingButton) {
      await MangaStore.patchItem(ratingButton.dataset.rate, { rating: Number(ratingButton.dataset.score) });
      await reload();
      return;
    }
    const editButton = event.target.closest('[data-edit]');
    if (editButton) {
      openDialog(editButton.dataset.edit);
      return;
    }
    const removeButton = event.target.closest('[data-remove]');
    if (removeButton) {
      const item = data.items.find((candidate) => candidate.id === removeButton.dataset.remove);
      if (item && confirm(t('removeConfirm', item.title))) {
        await MangaStore.removeItem(item.id);
        await reload();
        toast(t('mangaRemoved'));
      }
    }
  });

  elements.collectionView.addEventListener('change', async (event) => {
    const statusSelect = event.target.closest('[data-status]');
    if (statusSelect) {
      const nextStatus = statusSelect.value;
      try {
        await MangaStore.patchItem(statusSelect.dataset.status, { status: nextStatus });
        await reload();
        toast(t('movedTo', statusLabel(nextStatus)));
      } catch (error) {
        await reload();
        toast(error.message);
      }
      return;
    }
    const chapterInput = event.target.closest('[data-chapter]');
    if (chapterInput) {
      await MangaStore.patchItem(chapterInput.dataset.chapter, {
        currentChapter: chapterInput.value.trim(),
        chapterManual: true
      });
      await reload();
      toast(t('chapterSaved'));
    }
  });

  elements.collectionView.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.matches('[data-chapter]')) {
      event.preventDefault();
      event.target.blur();
    }
  });

  // Externe Manga-Seiten können Hotlinking blockieren. Statt eines kaputten
  // Bildsymbols wird dann ein neutraler Platzhalter gezeigt; lokale Cover sind
  // davon nicht betroffen.
  elements.collectionView.addEventListener('error', (event) => {
    if (!event.target.matches('.cover-image')) return;
    const fallback = event.target.dataset.coverFallback;
    if (fallback && event.target.dataset.coverFallbackApplied !== 'true') {
      event.target.dataset.coverFallbackApplied = 'true';
      event.target.src = fallback;
      return;
    }
    const frame = event.target.closest('.cover-frame');
    if (data.settings.placeholderCoversEnabled === false) {
      event.target.removeAttribute('src');
      frame?.classList.remove('cover-pending', 'cover-error');
      frame?.classList.add('cover-empty');
      return;
    }
    frame?.classList.add('cover-error');
  }, true);
  elements.collectionView.addEventListener('load', (event) => {
    if (!event.target.matches('.cover-image')) return;
    event.target.closest('.cover-frame')?.classList.remove('cover-pending', 'cover-error', 'cover-empty');
  }, true);

  elements.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = document.getElementById('editId').value;
    const existing = data.items.find((item) => item.id === id);
    try {
      const editedUrl = document.getElementById('urlInput').value;
      const detectChapterForItem = data.settings.chapterDetectionEnabled !== false
        && existing?.chapterDetectionDisabled !== true;
      const inferredChapter = detectChapterForItem
        ? MangaStore.chapterFromUrl(editedUrl)
        : '';
      const enteredChapter = document.getElementById('chapterInput').value.trim();
      const enteredCover = document.getElementById('coverInput').value.trim();
      const coverManuallyChanged = Boolean(enteredCover && enteredCover !== String(existing?.cover || ''));
      const savedData = await MangaStore.upsertItem({
        ...existing,
        id,
        title: document.getElementById('titleInput').value,
        url: editedUrl,
        tags: entryTags,
        currentChapter: enteredChapter || inferredChapter,
        chapterManual: !detectChapterForItem
          ? Boolean(enteredChapter)
          : Boolean(enteredChapter && enteredChapter !== inferredChapter),
        status: document.getElementById('statusInput').value,
        rating: dialogRating,
        cover: enteredCover || existing?.cover || ''
      });
      const savedItem = savedData.items.find((item) => item.id === id || item.url === MangaStore.normalizeItem({ url: editedUrl }).url);
      let coverResult = null;
      if (savedItem) {
        try {
          coverResult = await browser.runtime.sendMessage({
            type: 'manga-regal:cache-cover',
            itemId: savedItem.id,
            force: coverManuallyChanged
          });
        } catch {
          coverResult = { ok: false, status: 'failed' };
        }
      }
      elements.dialog.close();
      await reload();
      toast(coverResult?.status === 'downloaded' ? t('mangaAndCoverSaved')
        : coverResult?.status === 'failed' ? t('coverSaveFailed') : t('mangaSaved'));
    } catch (error) {
      toast(error.message);
    }
  });

  document.getElementById('syncBookmarks').addEventListener('click', openBookmarkDialog);
  document.getElementById('closeTagEditor').addEventListener('click', () => document.getElementById('tagEditorDialog').close());
  document.getElementById('cancelTagEditor').addEventListener('click', () => document.getElementById('tagEditorDialog').close());
  document.getElementById('tagEditorForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = document.getElementById('tagEditorItemId').value;
    const item = data.items.find((candidate) => candidate.id === id);
    const selectedTags = [...document.querySelectorAll('#tagChoiceList input:checked')]
      .map((checkbox) => checkbox.value);
    if (editingEntryTags) {
      entryTags = selectedTags;
      renderEntryTags();
      document.getElementById('tagEditorDialog').close();
      return;
    }
    if (!item) return;
    await MangaStore.upsertItem({ ...item, tags: selectedTags });
    document.getElementById('tagEditorDialog').close();
    await reload();
    toast(t('tagsSaved'));
  });
  document.getElementById('closeBookmarkDialog').addEventListener('click', () => document.getElementById('bookmarkDialog').close());
  document.getElementById('cancelBookmarkDialog').addEventListener('click', () => document.getElementById('bookmarkDialog').close());
  document.getElementById('selectAllFolders').addEventListener('change', (event) => {
    document.querySelectorAll('[data-folder-check], [data-bookmark-check]').forEach((checkbox) => {
      checkbox.checked = event.target.checked;
    });
  });

  document.getElementById('bookmarkForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const mode = data.settings.bookmarkImportMode;
    const selected = [...document.querySelectorAll(mode === 'folders' ? '[data-folder-check]:checked' : '[data-bookmark-check]:checked')];
    if (!selected.length) {
      toast(t(mode === 'folders' ? 'selectFolder' : 'selectBookmark'));
      return;
    }
    const folderIds = mode === 'folders' ? selected.map((checkbox) => checkbox.value) : [];
    const bookmarkIds = mode === 'folders' ? [] : selected.map((checkbox) => checkbox.value);
    const folderRatings = Object.fromEntries(folderIds.map((id) => [id,
      Number(document.querySelector(`[data-folder-rating="${CSS.escape(id)}"]`)?.value) || 0]));
    try {
      const result = await MangaStore.importFirefoxBookmarks({ folderIds, bookmarkIds, folderRatings });
      document.getElementById('bookmarkDialog').close();
      await reload();
      toast(t('imported', result.imported, result.rated));
    } catch (error) {
      toast(t('importFailed', error.message));
    }
  });

  /** Export als normale JSON-Datei; es werden keine Daten ins Internet gesendet. */
  document.getElementById('exportJson').addEventListener('click', async () => {
    const exportData = await MangaStore.exportData();
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `manga-regal-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(t('backupCreated'));
  });

  document.getElementById('importJson').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      await MangaStore.importData(JSON.parse(await file.text()));
      await reload();
      toast(t('backupImported'));
    } catch (error) {
      toast(error.message);
    } finally {
      event.target.value = '';
    }
  });

  document.getElementById('logLevel').addEventListener('change', (event) => {
    logLevel = event.target.value;
    renderLogs();
  });
  document.getElementById('logSearch').addEventListener('input', (event) => {
    logQuery = event.target.value;
    renderLogs();
  });
  document.getElementById('showLogsTab').addEventListener('click', () => setSettingsBottomTab('logs'));
  document.getElementById('showPatchlogTab').addEventListener('click', () => setSettingsBottomTab('patchlog'));
  document.getElementById('clearLogs').addEventListener('click', async () => {
    if (!confirm(t('clearLogsConfirm'))) return;
    await MangaStore.update((current) => { current.logs = []; });
    await reload();
    toast(t('logsCleared'));
  });
  document.getElementById('limitLogsSetting').addEventListener('click', async () => {
    await MangaStore.setPreferences({ limitLogs: data.settings.limitLogs === false });
    await reload();
  });
  document.getElementById('saveReadingLimit').addEventListener('click', async () => {
    const input = document.getElementById('readingLimitInput');
    try {
      await MangaStore.setReadingLimit(input.value);
      await reload();
      toast(t('limitSaved', input.value));
    } catch (error) {
      await reload();
      toast(error.message);
    }
  });

  /** Schalter speichern sofort; der zusätzliche Admin-Knopf bleibt als bewusste Bestätigung. */
  document.getElementById('languageSetting').addEventListener('click', async () => {
    await MangaStore.setPreferences({ language: data.settings.language === 'de' ? 'en' : 'de' });
    await reload();
    toast(t('preferencesSaved'));
  });
  document.getElementById('colorModeSetting').addEventListener('click', async () => {
    await MangaStore.setPreferences({ colorMode: data.settings.colorMode === 'dark' ? 'light' : 'dark' });
    await reload();
    toast(t('preferencesSaved'));
  });
  document.getElementById('showCoversInTableSetting').addEventListener('click', async () => {
    await MangaStore.setPreferences({ showCoversInTable: !data.settings.showCoversInTable });
    await reload();
    toast(t('preferencesSaved'));
  });
  document.getElementById('showOnboardingSetting').addEventListener('click', async () => {
    await MangaStore.setPreferences({ showOnboardingOnStartup: !data.settings.showOnboardingOnStartup });
    await reload();
    toast(t('preferencesSaved'));
  });
  document.getElementById('chapterDetectionSetting').addEventListener('click', async () => {
    await MangaStore.setPreferences({ chapterDetectionEnabled: data.settings.chapterDetectionEnabled === false });
    await reload();
    toast(t('preferencesSaved'));
  });
  document.getElementById('offerRereadSetting').addEventListener('click', async () => {
    await MangaStore.setPreferences({ offerRereadOnUpdate: data.settings.offerRereadOnUpdate === false });
    await reload();
    toast(t('preferencesSaved'));
  });
  document.getElementById('autoTagRereadsSetting').addEventListener('click', async () => {
    await MangaStore.setPreferences({ autoTagRereads: data.settings.autoTagRereads === false });
    await reload();
    toast(t('preferencesSaved'));
  });
  document.getElementById('placeholderCoversEnabledSetting').addEventListener('click', async () => {
    await MangaStore.setPreferences({ placeholderCoversEnabled: data.settings.placeholderCoversEnabled === false });
    await reload();
    toast(t('preferencesSaved'));
  });
  document.getElementById('ratingScaleSetting').addEventListener('change', async (event) => {
    const nextScale = Number(event.target.value);
    if (!(await confirmRatingScaleReduction(nextScale))) {
      event.target.value = String(ratingMax());
      return;
    }
    await MangaStore.setPreferences({ ratingScale: nextScale });
    await reload();
    toast(t('preferencesSaved'));
  });
  document.getElementById('searchEngineSetting').addEventListener('change', async (event) => {
    await MangaStore.setPreferences({ searchEngine: event.target.value });
    await reload();
    toast(t('preferencesSaved'));
  });
  document.getElementById('bookmarkImportModeSetting').addEventListener('change', async (event) => {
    await MangaStore.setPreferences({ bookmarkImportMode: event.target.value });
    await reload();
    toast(t('preferencesSaved'));
  });
  document.getElementById('defaultNewStatusSetting').addEventListener('change', async (event) => {
    await MangaStore.setPreferences({ defaultNewStatus: event.target.value });
    await reload();
    toast(t('preferencesSaved'));
  });
  document.getElementById('bookmarkImportKeywordSetting').addEventListener('change', async (event) => {
    await MangaStore.setPreferences({ bookmarkImportKeyword: event.target.value });
    await reload();
    toast(t('preferencesSaved'));
  });
  document.getElementById('showBookmarkImportButtonSetting').addEventListener('click', async () => {
    await MangaStore.setPreferences({ showBookmarkImportButton: !data.settings.showBookmarkImportButton });
    await reload();
    toast(t('preferencesSaved'));
  });

  async function requestSyncConsent() {
    // Keep Firefox's native request directly on the click path. Chrome instead
    // requires our own local consent dialog before any Sync reads or writes.
    if (!globalThis.MangaPlatform?.isChrome) return MangaSync.requestConsent();
    if (await MangaSync.hasConsent()) return true;
    const dialog = document.getElementById('chromeSyncConsentDialog');
    if (dialog.open) return false;
    return new Promise((resolve, reject) => {
      const listeners = new AbortController();
      const finish = async (accepted) => {
        listeners.abort();
        dialog.close();
        try { resolve(accepted ? await MangaSync.requestConsent({ confirmed: true }) : false); }
        catch (error) { reject(error); }
      };
      const options = { signal: listeners.signal };
      document.getElementById('confirmChromeSyncConsent').addEventListener('click', () => finish(true), options);
      document.getElementById('cancelChromeSyncConsent').addEventListener('click', () => finish(false), options);
      dialog.addEventListener('cancel', (event) => { event.preventDefault(); finish(false); }, options);
      dialog.addEventListener('close', () => finish(false), options);
      dialog.showModal();
    });
  }

  document.getElementById('syncEnabledSetting').addEventListener('click', async () => {
    const enabled = !data.settings.syncEnabled;
    try {
      // requestConsent() ist beim Einschalten absichtlich die erste asynchrone
      // Aktion. Firefox akzeptiert optionale Datenrechte nur unmittelbar nach
      // einer bewussten Nutzeraktion wie diesem Klick.
      if (enabled && !(await requestSyncConsent())) {
        toast(t('syncConsentDenied'));
        return;
      }
      await MangaStore.setPreferences({ syncEnabled: enabled });
      // Beim Einschalten wird sofort ein vollständiger Snapshot geschrieben.
      // So hängt der erste Sync nicht von einer späteren Datenänderung ab.
      if (enabled) {
        const result = await MangaSync.upload({ force: true });
        toast(t('syncCompleted', result.itemCount, result.chunkCount));
      } else {
        await MangaSync.revokeConsent();
      }
      await reload();
    } catch (error) {
      toast(error.message);
    }
  });

  document.getElementById('syncNow').addEventListener('click', async () => {
    try {
      if (!(await requestSyncConsent())) {
        toast(t('syncConsentDenied'));
        return;
      }
      const result = await MangaSync.upload({ force: true });
      toast(t('syncCompleted', result.itemCount, result.chunkCount));
      await refreshSyncStatus();
    } catch (error) {
      toast(error.message);
    }
  });

  document.getElementById('restoreSync').addEventListener('click', async () => {
    if (!confirm(t('syncRestoreConfirm'))) return;
    try {
      if (!(await requestSyncConsent())) {
        toast(t('syncConsentDenied'));
        return;
      }
      const result = await MangaSync.restore({ force: true });
      await reload();
      toast(t('syncRestored', result.itemCount));
    } catch (error) {
      toast(error.message);
    }
  });

  document.getElementById('exportFirefoxBookmarks').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    try {
      const status = await MangaStore.getFirefoxBookmarkExportStatus();
      const message = t(status.available ? 'bookmarkExportConfirmReplace' : 'bookmarkExportConfirmCreate', data.items.length);
      if (!confirm(message)) return;
      button.disabled = true;
      const result = await MangaStore.exportToFirefoxBookmarks({
        rootTitle: 'Manga-Regal',
        categories: statusViews().map((statusId) => ({ id: statusId, title: categoryLabel(statusId) }))
      });
      await reload();
      toast(t('bookmarkExportDone', result.itemCount, result.folderCount));
    } catch (error) {
      toast(t('bookmarkExportFailed', error.message));
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById('addSearchEngine').addEventListener('click', async () => {
    const nameInput = document.getElementById('customSearchName');
    const urlInput = document.getElementById('customSearchUrl');
    const name = nameInput.value.trim();
    const urlTemplate = urlInput.value.trim();
    if (!name || !/^https?:\/\//i.test(urlTemplate) || !urlTemplate.includes('{query}')) {
      toast(t('invalidSearchEngine'));
      return;
    }
    const id = `engine-${Date.now().toString(36)}`;
    await MangaStore.setPreferences({ customSearchEngines: [...data.settings.customSearchEngines, { id, name, urlTemplate }] });
    nameInput.value = '';
    urlInput.value = '';
    await reload();
    toast(t('preferencesSaved'));
  });
  document.getElementById('customSearchEngineList').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-remove-search-engine]');
    if (!button) return;
    const engines = data.settings.customSearchEngines.filter((engine) => engine.id !== button.dataset.removeSearchEngine);
    await MangaStore.setPreferences({ customSearchEngines: engines });
    await reload();
    toast(t('preferencesSaved'));
  });

  async function saveAllAdminSettings() {
    const nextRatingScale = Number(document.getElementById('ratingScaleSetting').value);
    if (!(await confirmRatingScaleReduction(nextRatingScale))) {
      document.getElementById('ratingScaleSetting').value = String(ratingMax());
      return false;
    }
    const categoryNames = Object.fromEntries([...document.querySelectorAll('[data-category-name]')]
      .map((input) => [input.dataset.categoryName, input.value]));
    const customCategories = data.settings.customCategories.map((category) => ({
      ...category,
      name: document.querySelector(`[data-custom-category-name="${CSS.escape(category.id)}"]`)?.value.trim() || category.name
    }));
    const collectionViewSettings = Object.fromEntries([...document.querySelectorAll('[data-view-mode]')]
      .map((select) => [select.dataset.viewMode, select.value]));
    const tagPresets = [...document.querySelectorAll('[data-tag-preset]:checked')].map((checkbox) => checkbox.value);
    await MangaStore.setPreferences({
      categoryNames,
      customCategories,
      categoryOrder: [...document.querySelectorAll('#categoryOrderList [data-order-view]')].map((item) => item.dataset.orderView),
      collectionViews: collectionViewSettings,
      tagPresets,
      placeholderCoverByTag: data.settings.placeholderCoverByTag,
      ratingScale: nextRatingScale,
      showCoversInTable: document.getElementById('showCoversInTableSetting').getAttribute('aria-checked') === 'true',
      showOnboardingOnStartup: document.getElementById('showOnboardingSetting').getAttribute('aria-checked') === 'true',
      chapterDetectionEnabled: document.getElementById('chapterDetectionSetting').getAttribute('aria-checked') === 'true',
      offerRereadOnUpdate: document.getElementById('offerRereadSetting').getAttribute('aria-checked') === 'true',
      autoTagRereads: document.getElementById('autoTagRereadsSetting').getAttribute('aria-checked') === 'true',
      placeholderCoversEnabled: document.getElementById('placeholderCoversEnabledSetting').getAttribute('aria-checked') === 'true',
      // Der Sync-Schalter speichert separat, weil nur sein direkter Klick den
      // nativen Firefox-Einwilligungsdialog rechtmäßig öffnen kann.
      syncEnabled: data.settings.syncEnabled,
      searchEngine: document.getElementById('searchEngineSetting').value,
      defaultNewStatus: document.getElementById('defaultNewStatusSetting').value,
      bookmarkImportMode: document.getElementById('bookmarkImportModeSetting').value,
      bookmarkImportKeyword: document.getElementById('bookmarkImportKeywordSetting').value
    });
    await MangaStore.setReadingLimit(document.getElementById('readingLimitInput').value);
    await reload();
    toast(t('adminSaved'));
    return true;
  }
  document.getElementById('saveAdminSettings').addEventListener('click', async () => {
    try { await saveAllAdminSettings(); } catch (error) { toast(error.message); }
  });

  const categoryOrderList = document.getElementById('categoryOrderList');
  let draggedCategory = null;

  async function saveCategoryEditorFromDom(messageKey = 'categoryNamesSaved') {
    const categoryOrder = [...categoryOrderList.querySelectorAll('[data-order-view]')]
      .map((item) => item.dataset.orderView);
    const categoryNames = Object.fromEntries([...categoryOrderList.querySelectorAll('[data-category-name]')]
      .map((input) => [input.dataset.categoryName, input.value]));
    const customCategories = data.settings.customCategories.map((category) => ({
      ...category,
      name: categoryOrderList.querySelector(`[data-custom-category-name="${CSS.escape(category.id)}"]`)?.value.trim() || category.name
    }));
    const collectionViews = Object.fromEntries([...categoryOrderList.querySelectorAll('[data-view-mode]')]
      .map((select) => [select.dataset.viewMode, select.value]));
    await MangaStore.setPreferences({ categoryOrder, categoryNames, customCategories, collectionViews });
    await reload();
    toast(t(messageKey));
  }

  categoryOrderList.addEventListener('dragstart', (event) => {
    draggedCategory = event.target.closest('[data-order-view]');
    if (!draggedCategory) return;
    draggedCategory.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggedCategory.dataset.orderView);
  });
  categoryOrderList.addEventListener('dragover', (event) => {
    if (!draggedCategory) return;
    event.preventDefault();
    const target = event.target.closest('[data-order-view]');
    if (!target || target === draggedCategory) return;
    const placeAfter = event.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2;
    categoryOrderList.insertBefore(draggedCategory, placeAfter ? target.nextSibling : target);
  });
  categoryOrderList.addEventListener('drop', async (event) => {
    if (!draggedCategory) return;
    event.preventDefault();
    draggedCategory.classList.remove('dragging');
    draggedCategory = null;
    await saveCategoryEditorFromDom('categoryOrderSaved');
  });
  categoryOrderList.addEventListener('dragend', () => {
    draggedCategory?.classList.remove('dragging');
    draggedCategory = null;
  });
  categoryOrderList.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-order-move]');
    const item = button?.closest('[data-order-view]');
    if (!button || !item) return;
    const sibling = button.dataset.orderMove === 'up' ? item.previousElementSibling : item.nextElementSibling;
    if (!sibling) return;
    if (button.dataset.orderMove === 'up') categoryOrderList.insertBefore(item, sibling);
    else categoryOrderList.insertBefore(sibling, item);
    await saveCategoryEditorFromDom('categoryOrderSaved');
  });

  categoryOrderList.addEventListener('change', async (event) => {
    if (!event.target.closest('[data-view-mode]')) return;
    await saveCategoryEditorFromDom('preferencesSaved');
  });

  document.getElementById('saveCategoryNames').addEventListener('click', async () => {
    await saveCategoryEditorFromDom('categoryNamesSaved');
  });

  document.getElementById('addCategory').addEventListener('click', async () => {
    const input = document.getElementById('newCategoryInput');
    const name = input.value.trim();
    if (!name) return;
    const duplicate = allCollectionViews().some((view) => categoryLabel(view).toLocaleLowerCase() === name.toLocaleLowerCase());
    if (duplicate) {
      toast(t('categoryExists'));
      return;
    }
    const slug = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'category';
    const usedIds = new Set(allCollectionViews());
    let id = `custom-${slug}`;
    let suffix = 2;
    while (usedIds.has(id)) id = `custom-${slug}-${suffix++}`;
    await MangaStore.setPreferences({ customCategories: [...data.settings.customCategories, { id, name }] });
    input.value = '';
    await reload();
    toast(t('categoryAdded'));
  });

  document.getElementById('newCategoryInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      document.getElementById('addCategory').click();
    }
  });

  document.getElementById('categoryOrderList').addEventListener('click', async (event) => {
    const removeButton = event.target.closest('[data-remove-category]');
    if (!removeButton) return;
    const view = removeButton.dataset.removeCategory;
    const category = data.settings.customCategories.find((candidate) => candidate.id === view);
    if (category) {
      if (!confirm(t('removeCategoryConfirm', category.name))) return;
      await MangaStore.setPreferences({
        customCategories: data.settings.customCategories.filter((candidate) => candidate.id !== category.id)
      });
      await reload();
      toast(t('categoryRemoved'));
      return;
    }
    // Standardkategorien bleiben technisch erhalten, damit Statuswerte alter
    // Manga nicht ungültig werden. Der Entfernen-Knopf setzt hier nur den
    // sichtbaren eigenen Namen auf die übersetzte Standardbezeichnung zurück.
    await MangaStore.setPreferences({ categoryNames: { [view]: '' } });
    await reload();
    toast(t('resetCategoryName'));
  });

  document.getElementById('selectAllTagPresets').addEventListener('click', () => {
    document.querySelectorAll('[data-tag-preset]').forEach((checkbox) => { checkbox.checked = true; });
  });
  document.getElementById('clearTagPresets').addEventListener('click', () => {
    document.querySelectorAll('[data-tag-preset]').forEach((checkbox) => { checkbox.checked = false; });
  });
  document.getElementById('addTagPreset').addEventListener('click', async () => {
    const input = document.getElementById('newTagPresetInput');
    const name = input.value.trim();
    if (!name) return;
    const hiddenMatch = data.settings.hiddenTagPresets.find((tag) => tag.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (hiddenMatch) {
      await MangaStore.setPreferences({
        hiddenTagPresets: data.settings.hiddenTagPresets.filter((tag) => tag !== hiddenMatch),
        tagPresets: [...data.settings.tagPresets, hiddenMatch]
      });
      input.value = '';
      await reload();
      toast(t('presetAdded'));
      return;
    }
    const catalog = [...MangaStore.TAG_PRESETS, ...data.settings.customTagPresets]
      .filter((tag) => !data.settings.hiddenTagPresets.some((hidden) => hidden.toLowerCase() === tag.toLowerCase()));
    if (catalog.some((tag) => tag.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      toast(t('presetExists'));
      return;
    }
    const customTagPresets = [...data.settings.customTagPresets, name];
    const tagPresets = [...data.settings.tagPresets, name];
    await MangaStore.setPreferences({ customTagPresets, tagPresets });
    input.value = '';
    await reload();
    toast(t('presetAdded'));
  });
  document.getElementById('newTagPresetInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      document.getElementById('addTagPreset').click();
    }
  });
  document.getElementById('tagPresetGrid').addEventListener('click', async (event) => {
    const removeButton = event.target.closest('[data-remove-tag-preset]');
    if (!removeButton) return;
    const tag = removeButton.dataset.removeTagPreset;
    const isBuiltIn = MangaStore.TAG_PRESETS.some((preset) => preset.toLowerCase() === tag.toLowerCase());
    const customTagPresets = data.settings.customTagPresets.filter((candidate) => candidate !== tag);
    const hiddenTagPresets = isBuiltIn
      ? [...data.settings.hiddenTagPresets, tag]
      : data.settings.hiddenTagPresets;
    const tagPresets = data.settings.tagPresets.filter((candidate) => candidate !== tag);
    await MangaStore.setPreferences({ customTagPresets, hiddenTagPresets, tagPresets });
    await reload();
    toast(t('presetRemoved'));
  });
  document.getElementById('saveTagPresets').addEventListener('click', async () => {
    const tagPresets = [...document.querySelectorAll('[data-tag-preset]:checked')]
      .map((checkbox) => checkbox.value);
    await MangaStore.setPreferences({ tagPresets, placeholderCoverByTag: data.settings.placeholderCoverByTag });
    await reload();
    toast(t('tagPresetsSaved'));
  });

  const placeholderTagMap = document.getElementById('placeholderTagMap');
  let draggedPlaceholderTag = '';

  function clearPlaceholderDropState() {
    placeholderTagMap.querySelectorAll('.drag-over').forEach((zone) => zone.classList.remove('drag-over'));
  }

  async function assignPlaceholderTag(tag, coverId) {
    const next = Object.fromEntries(Object.entries(data.settings.placeholderCoverByTag || {})
      .filter(([existingTag]) => existingTag.toLowerCase() !== tag.toLowerCase()));
    if (coverId) next[tag] = coverId;
    await MangaStore.setPreferences({ placeholderCoverByTag: next });
    await reload();
    toast(t('placeholderMappingSaved'));
  }

  placeholderTagMap.addEventListener('dragstart', (event) => {
    const chip = event.target.closest('[data-placeholder-drag]');
    if (!chip) return;
    draggedPlaceholderTag = chip.dataset.placeholderDrag;
    chip.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggedPlaceholderTag);
  });
  placeholderTagMap.addEventListener('dragover', (event) => {
    const zone = event.target.closest('[data-placeholder-drop]');
    if (!zone || !draggedPlaceholderTag) return;
    event.preventDefault();
    clearPlaceholderDropState();
    zone.classList.add('drag-over');
    event.dataTransfer.dropEffect = 'move';
  });
  placeholderTagMap.addEventListener('drop', async (event) => {
    const zone = event.target.closest('[data-placeholder-drop]');
    if (!zone || !draggedPlaceholderTag) return;
    event.preventDefault();
    const tag = draggedPlaceholderTag;
    draggedPlaceholderTag = '';
    clearPlaceholderDropState();
    await assignPlaceholderTag(tag, zone.dataset.placeholderDrop);
  });
  placeholderTagMap.addEventListener('dragend', (event) => {
    event.target.closest('[data-placeholder-drag]')?.classList.remove('dragging');
    draggedPlaceholderTag = '';
    clearPlaceholderDropState();
  });
  placeholderTagMap.addEventListener('click', async (event) => {
    const restoreImage = event.target.closest('[data-placeholder-restore-image]');
    if (restoreImage) {
      if (!confirm(t('placeholderRestoreConfirm'))) return;
      await MangaStore.removeCustomPlaceholderCover(restoreImage.dataset.placeholderRestoreImage);
      await reload();
      toast(t('placeholderImageRestored'));
      return;
    }
    const reset = event.target.closest('[data-placeholder-reset]');
    if (!reset) return;
    await assignPlaceholderTag(reset.dataset.placeholderReset, '');
  });

  /** Verkleinert ein eigenes Motiv vor dem getrennten lokalen Speichern. */
  function placeholderFileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file?.type.match(/^image\/(?:jpeg|png|webp)$/i)) {
        reject(new Error('Bitte eine JPG-, PNG- oder WebP-Datei auswählen.'));
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        reject(new Error('Das ausgewählte Bild ist größer als 8 MB.'));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Das Bild konnte nicht gelesen werden.'));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error('Das Bildformat wird nicht unterstützt.'));
        image.onload = () => {
          const scale = Math.min(1, 480 / image.width, 720 / image.height);
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

  placeholderTagMap.addEventListener('change', async (event) => {
    const input = event.target.closest('[data-placeholder-upload]');
    if (!input || !input.files?.[0]) return;
    try {
      const dataUrl = await placeholderFileToDataUrl(input.files[0]);
      await MangaStore.saveCustomPlaceholderCover({ id: input.dataset.placeholderUpload, dataUrl });
      await reload();
      toast(t('placeholderImageSaved'));
    } catch (error) {
      toast(error.message);
    } finally {
      input.value = '';
    }
  });

  /** Akzeptiert auch die deutschen Begriffe „Strg“ und „Umschalt“. */
  function normalizeShortcut(value) {
    const aliases = {
      ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt', command: 'Command', macctrl: 'MacCtrl',
      comma: 'Comma', period: 'Period', space: 'Space', home: 'Home', end: 'End',
      pageup: 'PageUp', pagedown: 'PageDown', insert: 'Insert', delete: 'Delete',
      up: 'Up', down: 'Down', left: 'Left', right: 'Right'
    };
    return String(value || '')
      .trim()
      .replace(/\s+/g, '')
      .replace(/strg/ig, 'Ctrl')
      .replace(/umschalt/ig, 'Shift')
      .split('+')
      .filter(Boolean)
      .map((part) => aliases[part.toLowerCase()]
        || (part.length === 1 ? part.toUpperCase() : part))
      .join('+');
  }

  /** Prüft dieselben Grenzen, die Firefox für commands.update vorgibt. */
  function validateShortcut(value) {
    const normalized = normalizeShortcut(value);
    const parts = normalized.split('+').filter(Boolean);
    const allowedModifiers = ['Ctrl', 'Alt', 'Command', 'MacCtrl', 'Shift'];
    const allowedKey = /^(?:[A-Z0-9]|F(?:[1-9]|1[0-2])|Comma|Period|Home|End|PageUp|PageDown|Space|Insert|Delete|Up|Down|Left|Right)$/;
    if (parts.length === 1 && /^F(?:[1-9]|1[0-2])$/.test(parts[0])) return parts[0];
    const key = parts.at(-1) || '';
    const modifiers = parts.slice(0, -1);
    if (!allowedKey.test(key) || modifiers.some((modifier) => !allowedModifiers.includes(modifier))) {
      throw new Error(t('shortcutKeyRequired'));
    }
    if (!modifiers.some((modifier) => ['Ctrl', 'Alt', 'Command', 'MacCtrl'].includes(modifier))) {
      throw new Error(t('shortcutPrimaryRequired'));
    }
    if (modifiers.length > 2 || new Set(modifiers).size !== modifiers.length) {
      throw new Error(t('shortcutTooManyModifiers'));
    }
    const primaryModifiers = modifiers.filter((modifier) => modifier !== 'Shift');
    const ordered = modifiers.includes('Shift')
      ? [primaryModifiers[0], 'Shift']
      : primaryModifiers;
    return [...ordered, key].join('+');
  }

  // Das Feld verhält sich wie ein Kürzel-Recorder: Kombination drücken statt
  // Firefox-Schreibweise auswendig kennen zu müssen.
  document.getElementById('shortcutInput').addEventListener('keydown', (event) => {
    if (event.key === 'Tab') return;
    if (event.key === 'Backspace' || (event.key === 'Delete' && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey)) {
      event.preventDefault();
      event.currentTarget.value = '';
      return;
    }
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;
    const specialKeys = {
      ' ': 'Space', ',': 'Comma', '.': 'Period', ArrowUp: 'Up', ArrowDown: 'Down',
      ArrowLeft: 'Left', ArrowRight: 'Right', Home: 'Home', End: 'End',
      PageUp: 'PageUp', PageDown: 'PageDown', Insert: 'Insert', Delete: 'Delete'
    };
    const key = specialKeys[event.key]
      || (/^F(?:[1-9]|1[0-9])$/i.test(event.key) ? event.key.toUpperCase() : event.key.toUpperCase());
    const modifiers = [];
    if (event.ctrlKey) modifiers.push('Ctrl');
    if (event.altKey) modifiers.push('Alt');
    if (event.shiftKey) modifiers.push('Shift');
    if (event.metaKey) modifiers.push('Command');
    if (!modifiers.length && !/^F(?:[1-9]|1[0-9])$/.test(key)) return;
    event.preventDefault();
    try {
      event.currentTarget.value = validateShortcut([...modifiers, key].join('+'));
    } catch (error) {
      toast(error.message);
    }
  });

  document.getElementById('saveShortcut').addEventListener('click', async () => {
    if (globalThis.MangaPlatform?.isChrome) {
      await browser.tabs.create({ url: 'chrome://extensions/shortcuts' });
      return;
    }
    const input = document.getElementById('shortcutInput');
    try {
      const shortcut = validateShortcut(input.value);
      await browser.commands.update({ name: 'toggle-manga-regal', shortcut });
      currentShortcut = shortcut;
      input.value = shortcut;
      toast(t('shortcutSaved'));
    } catch (error) {
      const message = String(error?.message || '');
      if (/already|conflict|in use|belegt/i.test(message)) toast(t('shortcutUnavailable'));
      else if (error?.name === 'TypeError' || /processing shortcut|commands\.update/i.test(message)) toast(t('shortcutInvalid'));
      else toast(message || t('shortcutInvalid'));
    }
  });

  document.getElementById('resetShortcut').addEventListener('click', async () => {
    try {
      await browser.commands.reset('toggle-manga-regal');
      const commands = await browser.commands.getAll();
      currentShortcut = commands.find((command) => command.name === 'toggle-manga-regal')?.shortcut || '';
      document.getElementById('shortcutInput').value = currentShortcut;
      toast(t('shortcutReset'));
    } catch (error) {
      toast(error.message);
    }
  });

  document.getElementById('finishOnboarding').addEventListener('click', async () => {
    await MangaStore.setPreferences({ onboardingComplete: true });
    document.getElementById('onboardingDialog').close();
    await reload();
  });

  // Speichern aus dem Tab-Overlay wird sofort auch im geöffneten Dashboard sichtbar.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[MangaStore.STORAGE_KEY]) reload();
  });

  reload().catch((error) => {
    console.error('Manga-Regal konnte nicht geladen werden:', error);
    toast(t('loadFailed'));
  });
})();
