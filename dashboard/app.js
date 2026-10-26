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
  const settingsSections = ['appearance', 'tags', 'technical'];
  const requestedSettingsSection = new URLSearchParams(location.search).get('settings');
  let currentSettingsSection = settingsSections.includes(requestedSettingsSection) ? requestedSettingsSection : 'appearance';
  let dialogRating = 0;
  let bookmarkFolders = [];
  let bookmarkEntries = [];
  let firefoxSearchEngines = [];
  let placeholderCoverOverrides = [];
  let placeholderRevision = 0;
  let placeholderReadRevision = -1;
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
    de: [{ version: '0.20.21', date: '26.10.2026', title: 'Dateisicherungen ohne Zusatzprogramm', notes: ['Automatische Sicherungen liegen im Downloadordner unter MangaShelf/Backups.', 'Der lokale Helfer und die freie Ordnerwahl wurden entfernt.', 'Firefox nutzt Blob-Downloads gegen den Fehler bei JSON-Datenadressen.', 'Aufbewahrung: Vorgabe 7, frei einstellbar; nur eigene protokollierte Dateien werden nach erfolgreicher Sicherung bereinigt.'] }],
    en: [{ version: '0.20.21', date: '2026-10-26', title: 'File backups without an external program', notes: ['Automatic backups use MangaShelf/Backups within your browser download folder.', 'The local helper and directory picker have been removed.', 'Firefox uses Blob downloads to avoid the JSON data-URL access error.', 'Retention defaults to 7 and is configurable; only recorded own files are pruned after a successful backup.'] }]
  };
  Object.assign(translations.de, { coverAccess: 'Cover-Domain freigeben', coverPermission: 'Manga gespeichert. Für den Cover-Download kannst du die Bild-Domain freigeben.' });
  Object.assign(translations.en, { coverAccess: 'Allow cover domain', coverPermission: 'Manga saved. You can allow the image domain to download its cover.' });
  Object.assign(translations.de, { themeLabel: 'Design', themeHint: 'Ein Design für Sammlung, Einstellungen, Speicherformular und Hilfe.', themeLight: 'Light Mode (klassisch)', themeDark: 'Dark Mode (klassisch)' });
  Object.assign(translations.en, { themeLabel: 'Theme', themeHint: 'One theme for your collection, settings, save form and help.', themeLight: 'Light Mode (classic)', themeDark: 'Dark Mode (classic)' });
  Object.assign(translations.de, {
    allCoverAccess: 'Cover automatisch von allen Webseiten laden',
    allCoverAccessHint: 'Optional: Chrome einmalig Zugriff auf alle HTTP-/HTTPS-Webseiten erlauben. Danach entfallen einzelne Domain-Freigaben. Ausschalten widerruft die umfassende Freigabe; lokale Cover bleiben erhalten.',
    allCoverAccessEnabled: 'Automatischer Cover-Zugriff für alle Webseiten aktiviert',
    allCoverAccessDisabled: 'Umfassende Cover-Freigabe widerrufen. Einzelne Domains können wieder eine Freigabe benötigen.',
    allCoverAccessDeclined: 'Nicht freigegeben. Der eingeschränkte Cover-Zugriff bleibt aktiv.',
    allCoverAccessFailed: 'Die Cover-Freigabe konnte nicht geändert werden.'
  });
  Object.assign(translations.en, {
    allCoverAccess: 'Automatically load covers from all websites',
    allCoverAccessHint: 'Optional: allow Chrome access to all HTTP/HTTPS websites once. This removes individual domain prompts. Switching off revokes broad access; local covers are kept.',
    allCoverAccessEnabled: 'Automatic cover access for all websites enabled',
    allCoverAccessDisabled: 'Broad cover access revoked. Individual domains may need permission again.',
    allCoverAccessDeclined: 'Permission not granted. Limited cover access remains active.',
    allCoverAccessFailed: 'Cover access could not be changed.'
  });

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

  Object.assign(translations.de, {
    showCategory: 'Kategorie einblenden', hideCategory: 'Kategorie ausblenden', visibleCategory: 'Sichtbar', hiddenCategory: 'Ausgeblendet',
    ratingCategoryLabel: 'Bewertungen zuordnen', ratingCategoryHint: 'Sterne auswählen, deren Manga automatisch in diese Kategorie verschoben werden. Pro Sternezahl gilt eine Zielkategorie. Die Übernahme wird bestätigt.',
    ratingAggregate: 'Gesamtansicht', ratingAggregateHint: 'Alle zeigt bereits sämtliche Manga. Eine automatische Zuordnung ist hier nicht nötig.',
    categoryNamesHint: 'Namen, Sichtbarkeit und Ansicht verwalten. Ausblenden entfernt nur den Reiter, keine Manga. Reiter oben oder Zeilen hier verschieben.',
    ratingRulesTitle: 'Kategorien nach Bewertung', ratingRulesHint: 'Eine Regel je exakter Sternezahl. Beim Speichern werden passende vorhandene Manga verschoben, künftig bei neuen oder geänderten Bewertungen. Manuelle Kategorieänderungen bleiben bis zur nächsten Bewertungsänderung erhalten. Ohne Regel wird nichts zurückverschoben.',
    noRatingRule: 'Keine automatische Zuordnung', saveRatingRules: 'Regeln anwenden', ratingRulesSaved: 'Bewertungsregeln gespeichert',
    ratingRulesConfirm: (count) => `${count} vorhandene Manga werden in die zugeordneten Kategorien verschoben. Die Regeln gelten auch für neue oder geänderte Bewertungen und haben beim Import Vorrang vor der Zielkategorie. Fortfahren?`,
    importCategory: 'Zielkategorie', importRating: 'Startbewertung', importInherit: 'Wie oben gewählt', importKeepCategory: 'Standard / bestehende Kategorie behalten',
    importOptionsHint: 'Gilt für die gesamte Auswahl. Ordner können eigene Werte erhalten. Bewertungsregeln haben Vorrang vor der Zielkategorie.'
  });
  Object.assign(translations.en, {
    showCategory: 'Show category', hideCategory: 'Hide category', visibleCategory: 'Visible', hiddenCategory: 'Hidden',
    ratingCategoryLabel: 'Assign ratings', ratingCategoryHint: 'Select star scores whose manga should move into this category. Each score has one target category. Changes require confirmation.',
    ratingAggregate: 'Aggregate view', ratingAggregateHint: 'All already includes every manga. No automatic assignment is needed here.',
    categoryNamesHint: 'Manage names, visibility and layout. Hiding only removes the tab, not its manga. Drag tabs above or rows here to reorder.',
    ratingRulesTitle: 'Categories by rating', ratingRulesHint: 'One rule per exact star score. Saving moves matching existing manga; future rules run on new or changed ratings. Manual category changes survive until the next rating change. Removing a rule does not undo earlier moves.',
    noRatingRule: 'No automatic assignment', saveRatingRules: 'Apply rules', ratingRulesSaved: 'Rating rules saved',
    ratingRulesConfirm: (count) => `${count} existing manga will move to the assigned categories. Rules also apply to new or changed ratings and take priority over the import category. Continue?`,
    importCategory: 'Target category', importRating: 'Initial rating', importInherit: 'Use selection above', importKeepCategory: 'Default / keep existing category',
    importOptionsHint: 'Applies to the whole selection. Folders can override these values. Rating rules take priority over the target category.'
  });

  function ratingRulesFromDom() {
    return Object.fromEntries([...document.querySelectorAll('[data-rating-score]:checked')]
      .map((checkbox) => [checkbox.dataset.ratingScore, checkbox.dataset.ratingTarget]));
  }

  Object.assign(translations.de, {
    dailyBackupTitle: 'Tägliche Dateisicherung', dailyBackupHint: 'Vollständige JSON-Datei mit Einstellungen und lokalen Covern unter Downloads/MangaShelf/Backups. Einmal täglich bei geöffnetem Browser, sonst beim nächsten Start. Alte eigene Sicherungen über dem gewählten Limit werden erst nach einer erfolgreichen neuen Sicherung dauerhaft gelöscht.',
    backupFolderTitle: 'Speicherort im Downloadordner', backupFolderUnset: 'MangaShelf/Backups',
    backupEmpty: 'Leere Sammlung: keine automatische Sicherungsdatei erstellt.',
    backupLegacyError: 'Der bisherige Download-Sicherungsweg wurde ersetzt. Bitte die Sicherung erneut starten.',
    backupFailed: 'Sicherung fehlgeschlagen. Bitte Download-Berechtigung und freien Speicher prüfen.',
    settingsSections: 'Einstellungsbereiche', settingsAppearance: 'Darstellung', settingsTags: 'Tag-Vorauswahl', settingsTechnical: 'Technik & Daten',
    backupCleanupFailed: 'Sicherung erstellt. Alte Dateien konnten nicht vollständig entfernt werden. Bei gelöschtem Downloadverlauf müssen alte Sicherungen manuell entfernt werden.',
    dailyBackupLimit: 'Aufbewahrte Sicherungen', invalidBackupLimit: 'Bitte eine gültige Anzahl eingeben.',
    dailyBackupNow: 'Dateisicherung jetzt erstellen', dailyBackupNever: 'Noch keine erfolgreiche Dateisicherung.',
    dailyBackupPending: 'Dateisicherung wird heruntergeladen …', dailyBackupLast: (time, file) => `Letzte erfolgreiche Sicherung: ${time} · ${file}`,
    downloadPermissionDenied: 'Die Download-Berechtigung wurde nicht erteilt.',
    syncChoiceTitle: 'Sync-Stand auswählen', syncChoiceHint: 'Diese Stände werden nicht zusammengeführt. Wähle bewusst, welcher übernommen werden soll. Bei einer leeren lokalen Sammlung zuerst den vorhandenen Sync-Stand wiederherstellen.',
    syncChoiceCounts: (local, remote) => `Lokale Sammlung: ${local} Manga · Vorhandener Sync-Stand: ${remote} Manga`,
    syncChooseRestore: 'Vorhandenen Sync-Stand übernehmen', syncChooseUpload: 'Lokalen Stand in den Sync hochladen',
    syncReplaceConfirm: 'Achtung: Der vorhandene Sync-Stand einschließlich Einstellungen wird durch die lokale Sammlung ersetzt. Wirklich überschreiben?'
  });
  Object.assign(translations.en, {
    dailyBackupTitle: 'Daily file backup', dailyBackupHint: 'Full JSON including settings and local covers under Downloads/MangaShelf/Backups. Once per day while the browser is open, or on next startup. Oldest own files above your retention count are permanently deleted only after a successful new backup.',
    backupFolderTitle: 'Location within your downloads folder', backupFolderUnset: 'MangaShelf/Backups',
    backupEmpty: 'Empty collection: no automatic backup file created.',
    backupLegacyError: 'The previous download-based backup path has been replaced. Try the backup again.',
    backupFailed: 'Backup failed. Check download permission and free disk space.',
    settingsSections: 'Settings sections', settingsAppearance: 'Appearance', settingsTags: 'Tag Presets', settingsTechnical: 'Technical & Data',
    backupCleanupFailed: 'Backup created. Some old files could not be removed. After clearing download history, remove old backups manually.',
    dailyBackupLimit: 'Backups to retain', invalidBackupLimit: 'Please enter a valid backup count.',
    dailyBackupNow: 'Create file backup now', dailyBackupNever: 'No successful file backup yet.',
    dailyBackupPending: 'Backup download in progress …', dailyBackupLast: (time, file) => `Last successful backup: ${time} · ${file}`,
    downloadPermissionDenied: 'Download permission was not granted.',
    syncChoiceTitle: 'Choose a Sync snapshot', syncChoiceHint: 'These snapshots will not be merged. Choose which one to keep. If local storage is empty, restore the existing Sync snapshot first.',
    syncChoiceCounts: (local, remote) => `Local collection: ${local} manga · Existing Sync snapshot: ${remote} manga`,
    syncChooseRestore: 'Use existing Sync snapshot', syncChooseUpload: 'Upload local collection to Sync',
    syncReplaceConfirm: 'Warning: the existing Sync snapshot, including settings, will be replaced with the local collection. Really overwrite it?'
  });

  async function backupRequest(action, extra = {}) {
    const result = await browser.runtime.sendMessage({ type: 'manga-shelf:backup', action, ...extra });
    if (!result?.ok) throw new Error(result?.message || 'Backup unavailable / Sicherung nicht verfügbar');
    return result.status || { enabled: false };
  }

  async function refreshBackupStatus() {
    try {
      const state = await backupRequest('status');
      const target = state.target || {};
      document.getElementById('backupDestination').textContent = target.label || t('backupFolderUnset');
      const limitInput = document.getElementById('dailyBackupLimit');
      if (document.activeElement !== limitInput && limitInput.getAttribute('aria-invalid') !== 'true') limitInput.value = String(state.limit || 7);
      setSwitchState(document.getElementById('dailyBackupSetting'), state.enabled === true,
        data.settings.language === 'en' ? 'On' : 'Ein', data.settings.language === 'en' ? 'Off' : 'Aus');
      document.getElementById('dailyBackupStatus').textContent = state.error ? backupError(state.error)
        : (state.pending ? t('dailyBackupPending') : state.lastSuccessAt
          ? t('dailyBackupLast', new Intl.DateTimeFormat(data.settings.language, { dateStyle: 'short', timeStyle: 'short' }).format(state.lastSuccessAt), state.lastFilename)
          : t('dailyBackupNever'));
    } catch (error) { document.getElementById('dailyBackupStatus').textContent = backupError(error.message); }
  }
  function backupError(message) {
    if (typeof message !== 'string') return t('backupFailed');
    if (/data:application\/json/i.test(message)) return t('backupLegacyError');
    if (message.length > 500) return t('backupFailed');
    const keys = { DOWNLOAD_PERMISSION_REQUIRED: 'downloadPermissionDenied', EMPTY_BACKUP: 'backupEmpty', BACKUP_DOWNLOAD_FAILED: 'backupFailed', BACKUP_DOWNLOAD_MISSING: 'backupFailed', BACKUP_DOWNLOAD_PENDING: 'dailyBackupPending', BACKUP_CLEANUP_FAILED: 'backupCleanupFailed' };
    return keys[message] ? t(keys[message]) : message;
  }

  function chooseSyncSnapshot(plan) {
    const dialog = document.getElementById('syncChoiceDialog');
    document.getElementById('syncChoiceCounts').textContent = t('syncChoiceCounts', plan.localCount, plan.remoteCount);
    return new Promise((resolve) => {
      const finish = (value) => { dialog.close(); resolve(value); };
      document.getElementById('syncChooseRestore').onclick = () => finish('restore');
      document.getElementById('syncChooseUpload').onclick = () => {
        if (confirm(t('syncReplaceConfirm'))) finish('upload');
      };
      document.getElementById('syncChooseCancel').onclick = () => finish('cancel');
      dialog.oncancel = (event) => { event.preventDefault(); finish('cancel'); };
      dialog.showModal();
      document.getElementById('syncChooseRestore').focus();
    });
  }

  async function connectSync(enable = false) {
    const plan = await MangaSync.plan();
    const choice = plan.remoteRevision ? await chooseSyncSnapshot(plan) : 'upload';
    if (choice === 'cancel') return;
    if (choice === 'restore') await MangaSync.restore({ force: true, expectedRevision: plan.remoteRevision });
    else await MangaSync.upload({ force: true, allowReplaceRevision: plan.remoteRevision });
    if (enable) await MangaStore.setPreferences({ syncEnabled: true });
    await reload();
  }

  function confirmRatingRules(rules) {
    if (JSON.stringify(rules) === JSON.stringify(data.settings.ratingCategoryRules)) return true;
    const count = data.items.filter((item) => rules[item.rating] && rules[item.rating] !== item.status).length;
    return confirm(t('ratingRulesConfirm', count));
  }

  /** Invert the persisted score -> status mapping only for presentation.
   * Several scores may target one category, but each score has one owner. */
  function categoryRatingPicker(view) {
    if (view === 'all') return node('span', { class: 'category-rating-aggregate', title: t('ratingAggregateHint') }, t('ratingAggregate'));
    const assigned = Object.entries(data.settings.ratingCategoryRules).filter(([, target]) => target === view).map(([score]) => score);
    return node('details', { class: 'category-rating-picker', 'data-rating-picker': view },
      node('summary', { title: t('ratingCategoryHint'), 'aria-label': `${t('ratingCategoryLabel')}: ${categoryLabel(view)}` },
        assigned.length ? `${assigned.join(', ')} ★` : t('ratingCategoryLabel')),
      node('div', { class: 'category-rating-options' },
        node('p', {}, t('ratingCategoryHint')),
        Array.from({ length: ratingMax() }, (_, i) => {
          const score = String(i + 1);
          const owner = data.settings.ratingCategoryRules[score];
          return node('label', {}, node('input', { type: 'checkbox', 'data-rating-score': score, 'data-rating-target': view,
            checked: owner === view }), node('span', {}, `${score} ★`),
            owner && owner !== view ? node('small', {}, categoryLabel(owner)) : null);
        })));
  }

  function renderCategoryNavigation() {
    const visible = allCollectionViews().filter((view) => !data.settings.hiddenCategories.includes(view));
    if (currentView !== 'admin' && !visible.includes(currentView)) currentView = visible[0] || 'all';
    document.getElementById('categoryNavItems').replaceChildren(...visible.map((view) =>
      button('nav-item', { 'data-view': view, draggable: 'true', title: t('categoryMove') }, node('span', { 'data-category-view': view }, categoryLabel(view)), ' ',
        node('span', { 'data-count-view': view }, '0'))));
  }

  /** Übernimmt Sprache und Farbschema sofort für die komplette Oberfläche. */
  function applyPreferences() {
    setSwitchState(document.getElementById('limitLogsSetting'), data.settings.limitLogs !== false,
      data.settings.language === 'en' ? 'On' : 'Ein', data.settings.language === 'en' ? 'Off' : 'Aus');
    const language = data.settings.language === 'en' ? 'en' : 'de';
    document.documentElement.lang = language;
    document.title = t('brandName');
    const theme = MangaThemes.apply(document.documentElement, data.settings);
    // CSS nutzt diesen Wert für eine schmalere 5-Sterne- bzw. breitere
    // 10-Sterne-Spalte, ohne die Aktionsspalte aus dem Sichtbereich zu drücken.
    document.documentElement.dataset.ratingScale = String(ratingMax());
    document.querySelector('meta[name="color-scheme"]').content = theme.mode;
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
  /** All application values remain text or DOM properties, never parsed HTML.
   * Attribute names and element types are constants owned by this module. */
  function node(tag, attributes = {}, ...children) {
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) {
      if (value === undefined || value === null || value === false) continue;
      if (/^on/i.test(name)) throw new Error('Inline event attributes are not allowed');
      if (['value', 'checked', 'selected', 'disabled'].includes(name)) element[name] = value;
      else element.setAttribute(name, String(value));
    }
    element.append(...children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false));
    return element;
  }

  function button(className, attributes, ...children) {
    return node('button', { type: 'button', class: className, ...attributes }, ...children);
  }

  function option(value, label, selected = false, disabled = false) {
    return node('option', { value, selected, disabled }, label);
  }

  function link(className, url, label) {
    return node('a', { class: className, href: url, target: '_blank', rel: 'noopener noreferrer' }, label);
  }

  function coverNode(item, cards = false) {
    return node('span', { class: cards ? 'card-cover-frame cover-frame cover-pending' : 'row-cover cover-frame cover-pending' },
      node('img', { class: cards ? 'card-cover cover-image' : 'cover-image', 'data-cover-id': item.id, alt: '' }),
      node('span', { class: 'cover-placeholder', 'aria-hidden': 'true' }, '◇'));
  }

  function tagNodes(item) {
    return item.tags.length ? item.tags.map((tag) => button('tag tag-button' + (tag.toLowerCase() === 're-read' ? ' reread-tag' : ''),
      { 'data-remove-row-tag': item.id, 'data-tag-value': tag }, tag, ' ', node('b', {}, '×')))
      : [node('span', { class: 'tag' }, t('noTag'))];
  }

  function statusSelect(item) {
    const count = data.items.filter((candidate) => candidate.status === 'reading').length;
    const limit = MangaStore.getReadingLimit(data);
    return node('select', { class: 'status-select', 'data-status': item.id },
      statusViews().map((status) => option(status, status === 'reading' ? `${statusLabel(status)} (${count}/${limit})` : statusLabel(status),
        item.status === status, status === 'reading' && item.status !== 'reading' && count >= limit)));
  }

  function chapterField(item) {
    return node('input', { class: 'chapter-input', 'data-chapter': item.id, value: item.currentChapter, placeholder: t('open'),
      'aria-label': `${t('chapter')}: ${item.title}` });
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
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', type === 'edit'
      ? 'M4 20h4l11-11-4-4L4 16v4Zm13-17 4 4-2 2-4-4 2-2Z'
      : 'M7 21h10a2 2 0 0 0 2-2V7H5v12a2 2 0 0 0 2 2Zm3-11h2v8h-2v-8Zm4 0h2v8h-2v-8ZM8 4l1-2h6l1 2h5v2H3V4h5Z');
    svg.append(path);
    return button('icon-action-button' + (type === 'remove' ? ' danger' : ''),
      { [`data-${type}`]: id, title: label, 'aria-label': label }, svg);
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
  async function localCoverObjectUrl(itemId, dataUrl, epoch) {
    const existing = coverObjectUrls.get(itemId);
    if (existing) return existing;
    // This fetch only decodes an already stored data:image URL. It performs
    // no HTTP request and requires no cover-domain access. Native decoding
    // avoids a JS per-byte loop in each IntersectionObserver scroll callback.
    if (!/^data:image\//i.test(dataUrl)) throw new Error('Ungültiges lokales Coverformat.');
    const blob = await (await fetch(dataUrl)).blob();
    // A newer render may have revoked its image set while decoding was pending.
    // Never create a late object URL that would outlive that render's cleanup.
    if (epoch !== coverRenderEpoch) return '';
    const cached = coverObjectUrls.get(itemId);
    if (cached) return cached;
    const objectUrl = URL.createObjectURL(new Blob([blob], { type: blob.type }));
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
        const source = localCover ? await localCoverObjectUrl(item.id, localCover, epoch) : fallback;
        if (epoch !== coverRenderEpoch || !frame.isConnected) return;
        showCover(source);
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
    // Read geometry in one batch before loadCover changes classes/attributes.
    // Interleaving DOM reads and writes forces a layout flush for every cover.
    const measuredFrames = frames.map((frame) => ({ frame, bounds: frame.getBoundingClientRect() }));
    measuredFrames.forEach(({ frame, bounds }) => {
      // Ein direkter Test lädt die bereits sichtbaren Einträge zuverlässig.
      // Weiter entfernte Cover bleiben dem Observer vorbehalten.
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
    const previous = elements.ratingFilter.value;
    elements.ratingFilter.replaceChildren(option('0', t('allRatings')),
      ...Array.from({ length: ratingMax() }, (_, i) => option(String(ratingMax() - i), `${ratingMax() - i} ★`)),
      option('-1', t('unrated')));
    elements.ratingFilter.value = [...elements.ratingFilter.options].some((entry) => entry.value === previous) ? previous : '0';
  }

  /** Erzeugt die anklickbare Bewertung für eine Tabellenzeile. */
  function tableStars(item) {
    return node('div', { class: 'stars', 'aria-label': t('ratingFor', item.title) },
      Array.from({ length: ratingMax() }, (_, i) => button('star' + (i + 1 <= item.rating ? ' on' : ''),
        { 'data-rate': item.id, 'data-score': i + 1, title: `${i + 1}/${ratingMax()}` }, '★')));
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
    const titles = { active: t('viewActive'), reading: t('viewReading'), hold: t('viewHold'), dropped: t('viewDropped'), completed: t('viewCompleted'), all: t('viewAll') };
    elements.viewTitle.textContent = data.settings.categoryNames[currentView] || titles[currentView] || t('collection');
    renderSortHeaders();
    const cardsMode = data.settings.collectionViews[currentView] === 'cards';
    elements.cards.hidden = !cardsMode;
    elements.table.hidden = cardsMode;
    if (cardsMode) { renderCards(items); return; }
    elements.rows.replaceChildren(...(items.length ? items.map((item) => {
      const title = node('div', {}, link('row-title-link', item.url, item.title),
        item.bookmarkId ? node('span', { class: 'bookmark-mark' }, t('bookmarkLinked')) : null);
      return node('tr', {},
        node('td', {}, node('div', { class: 'title-wrap' }, data.settings.showCoversInTable ? coverNode(item) : null, title)),
        node('td', { class: 'read-cell' }, link('continue-link', item.url, t('continue') + ' ↗'),
          button('source-search-link', { 'data-source-search': item.id }, t('findSource')),
          link('url-link', item.url, item.source || item.url)),
        node('td', {}, chapterField(item)),
        node('td', { class: 'tag-cell' }, node('div', { class: 'tag-list' }, tagNodes(item)),
          button('text-button edit-tags-button', { 'data-edit-tags': item.id }, t('editTags'))),
        node('td', {}, tableStars(item)), node('td', {}, statusSelect(item)),
        node('td', { class: 'date-cell' }, formatDate(item.modified)),
        node('td', { class: 'row-actions' }, node('div', { class: 'row-action-buttons' },
          actionIcon('edit', item.id, t('edit')), actionIcon('remove', item.id, t('remove')))));
    }) : [node('tr', {}, node('td', { class: 'empty-row', colspan: '8' }, t('emptyCollection')))]));
    observeVisibleCovers(elements.rows);
  }

  /** Kachelansicht mit denselben Daten und Aktionen wie die Tabelle. */
  function renderCards(items) {
    elements.cards.replaceChildren(...(items.length ? items.map((item) =>
      node('article', { class: 'manga-card' }, link('card-cover-link', item.url, coverNode(item, true)),
        node('div', { class: 'card-body' },
          node('div', { class: 'card-title-row' }, node('div', {}, link('card-title', item.url, item.title),
            node('span', { class: 'card-source' }, item.source || item.url)), node('span', { class: 'card-date' }, formatDate(item.modified))),
          node('div', { class: 'card-progress' }, node('label', {}, t('chapter'), chapterField(item)), statusSelect(item)),
          node('div', { class: 'tag-list' }, tagNodes(item)),
          button('text-button edit-tags-button', { 'data-edit-tags': item.id }, t('editTags')), tableStars(item),
          node('div', { class: 'card-links' }, link('continue-link', item.url, t('continue') + ' ↗'),
            button('source-search-link', { 'data-source-search': item.id }, t('findSource'))),
          node('div', { class: 'card-actions' }, actionIcon('edit', item.id, t('edit')), actionIcon('remove', item.id, t('remove'))))))
      : [node('div', { class: 'card-empty' }, t('emptyCollection'))]));
    observeVisibleCovers(elements.cards);
  }

  /** Baut das Admin-Protokoll entsprechend der beiden Filter neu auf. */
  function renderLogs() {
    const query = logQuery.trim().toLowerCase();
    const logs = data.logs.filter((entry) => (logLevel === 'all' || entry.level === logLevel)
      && [entry.area, entry.message, entry.details, entry.level].join(' ').toLowerCase().includes(query));
    document.getElementById('logCount').textContent = t('logCount', logs.length, data.logs.length);
    document.getElementById('logRows').replaceChildren(...(logs.length ? logs.map((entry) => node('tr', {},
      node('td', { class: 'date-cell' }, new Date(entry.time).toLocaleString(data.settings.language === 'en' ? 'en-US' : 'de-DE')),
      node('td', {}, node('span', { class: `log-level ${entry.level}` }, entry.level)),
      node('td', {}, entry.area), node('td', {}, entry.message), node('td', { class: 'date-cell' }, entry.details || '–')))
      : [node('tr', {}, node('td', { class: 'empty-row', colspan: '5' }, t('emptyLogs')))]));
  }

  /** Rendert den lokalen Patchlog passend zur ausgewählten Oberflächensprache. */
  function renderPatchlog() {
    const language = data.settings.language === 'en' ? 'en' : 'de';
    document.getElementById('fullChangelogLink').href = `https://github.com/Raican667/Manga-Shelf/blob/main/CHANGELOG${language === 'en' ? '.en' : ''}.md`;
    document.getElementById('patchlogContent').replaceChildren(...patchNotes[language].map((patch, index) =>
      node('section', { class: 'patch-version' + (index === 0 ? ' current' : '') },
        node('div', { class: 'patch-version-meta' }, node('strong', {}, `v${patch.version}`), node('time', {}, patch.date),
          index === 0 ? node('span', { class: 'patch-current-badge' }, t('currentPatch')) : null),
        node('div', {}, node('h4', {}, patch.title), node('ul', {}, patch.notes.map((note) => node('li', {}, note)))))));
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
    document.getElementById('categoryOrderList').replaceChildren(...allCollectionViews().map((view) => {
      const custom = data.settings.customCategories.find((category) => category.id === view);
      const input = node('input', { type: 'text', maxlength: '40', [custom ? 'data-custom-category-name' : 'data-category-name']: view,
        value: custom ? custom.name : data.settings.categoryNames[view] || '', placeholder: custom ? '' : `${t('defaultName')}: ${defaultCategoryLabel(view)}` });
      const layout = node('label', { class: 'category-editor-layout', title: t('viewMode') }, node('span', { class: 'sr-only' }, t('viewMode')),
        node('select', { 'aria-label': t('viewMode'), 'data-view-mode': view },
          option('table', t('tableView'), data.settings.collectionViews[view] === 'table'),
          option('cards', t('cardView'), data.settings.collectionViews[view] === 'cards')));
      const removeTitle = custom ? t('remove') : t('resetCategoryName');
      return node('div', { class: 'category-order-item category-editor-item', 'data-order-view': view },
        node('span', { class: 'drag-handle', draggable: 'true', 'aria-label': t('categoryMove'), title: t('categoryMove') }, '⠿'),
        node('label', { class: 'category-editor-copy' }, node('span', {}, custom?.name || defaultCategoryLabel(view)), input),
        button('category-visibility-button', { 'data-toggle-category': view,
          'aria-pressed': String(!data.settings.hiddenCategories.includes(view)),
          title: t(data.settings.hiddenCategories.includes(view) ? 'showCategory' : 'hideCategory'),
          'aria-label': `${t(data.settings.hiddenCategories.includes(view) ? 'showCategory' : 'hideCategory')}: ${categoryLabel(view)}` },
          t(data.settings.hiddenCategories.includes(view) ? 'hiddenCategory' : 'visibleCategory')), categoryRatingPicker(view), layout,
        node('span', { class: 'order-arrows' },
          button('', { 'data-order-move': 'up', 'aria-label': t('moveUp') }, '↑'),
          button('', { 'data-order-move': 'down', 'aria-label': t('moveDown') }, '↓')),
        button('remove-category-button' + (custom ? '' : ' reset-category-button'),
          { 'data-remove-category': view, 'data-remove-custom': String(Boolean(custom)), 'aria-label': removeTitle, title: removeTitle }, '×'));
    }));
  }

  /** Rendert die mitgelieferten Tag-Vorschläge als aktivierbare Checkboxen. */
  function renderTagPresets() {
    const enabled = new Set(data.settings.tagPresets);
    const hidden = new Set(data.settings.hiddenTagPresets.map((tag) => tag.toLowerCase()));
    const catalog = [...MangaStore.TAG_PRESETS, ...data.settings.customTagPresets].filter((tag) => !hidden.has(tag.toLowerCase()));
    document.getElementById('tagPresetGrid').replaceChildren(...catalog.map((tag, index) =>
      node('div', { class: 'tag-preset-option' }, node('label', { for: `tag-preset-${index}` },
        node('input', { id: `tag-preset-${index}`, type: 'checkbox', 'data-tag-preset': '', value: tag, checked: enabled.has(tag) }), node('span', {}, tag)),
        button('remove-preset-button', { 'data-remove-tag-preset': tag, 'aria-label': t('remove'), title: t('remove') }, '×'))));
  }

  /**
   * Stellt die Coverzuordnung als kleines Kanban-Board dar: Tags starten in
   * "Automatisch" und werden direkt auf eines der vier Motive gezogen.
   */
  function renderPlaceholderTagMap() {
    const hidden = new Set(data.settings.hiddenTagPresets.map((tag) => tag.toLowerCase()));
    const catalog = [...MangaStore.TAG_PRESETS, ...data.settings.customTagPresets].filter((tag) => !hidden.has(tag.toLowerCase()));
    const configured = data.settings.placeholderCoverByTag || {};
    const assignedCover = (tag) => Object.entries(configured).find(([key]) => key.toLowerCase() === tag.toLowerCase())?.[1] || '';
    const chip = (tag, assigned = false) => node('span', { class: 'placeholder-tag-chip', draggable: 'true', 'data-placeholder-drag': tag },
      node('i', { 'aria-hidden': 'true' }, '⋮⋮'), node('b', {}, tag),
      assigned ? button('', { 'data-placeholder-reset': tag, title: t('placeholderReset'), 'aria-label': t('placeholderReset') }, '×') : null);
    const chipList = (tags, assigned = false) => node('div', { class: 'placeholder-chip-list' },
      tags.length ? tags.map((tag) => chip(tag, assigned)) : node('small', {}, t('placeholderDropEmpty')));
    const automatic = node('section', { class: 'placeholder-drop-zone automatic-zone', 'data-placeholder-drop': '' },
      node('header', {}, node('span', { class: 'placeholder-auto-symbol', 'aria-hidden': 'true' }, '✦'),
        node('div', {}, node('h5', {}, t('placeholderAuto')), node('p', {}, t('placeholderAutoHint')))),
      chipList(catalog.filter((tag) => !assignedCover(tag))));
    const covers = allPlaceholderCovers().map((cover) => node('section', { class: 'placeholder-drop-zone cover-zone', 'data-placeholder-drop': cover.id },
      node('img', { src: cover.src, alt: '' }),
      node('header', {}, node('div', {}, node('h5', {}, t(cover.labelKey)), node('p', {}, t('placeholderDropHere'))),
        node('div', { class: 'placeholder-cover-actions' },
          node('label', { class: 'placeholder-upload-button' }, node('span', {}, t('placeholderReplace')),
            node('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', 'data-placeholder-upload': cover.id })),
          cover.overridden ? button('placeholder-restore-button', { 'data-placeholder-restore-image': cover.id }, t('placeholderRestore')) : null)),
      chipList(catalog.filter((tag) => assignedCover(tag) === cover.id), true)));
    document.getElementById('placeholderTagMap').replaceChildren(automatic, node('div', { class: 'placeholder-cover-zones' }, covers));
  }

  function setSwitchState(button, enabled, onLabel = 'Ein', offLabel = 'Aus') {
    button.setAttribute('aria-checked', String(Boolean(enabled)));
    button.classList.toggle('on', Boolean(enabled));
    const label = button.querySelector('[data-switch-label]');
    if (label) label.textContent = enabled ? onLabel : offLabel;
  }

  let coverAccessBusy = false;
  let coverAccessRevision = 0;
  async function refreshCoverAccessSetting() {
    const control = document.getElementById('allCoverAccessControl');
    control.hidden = !globalThis.MangaPlatform?.isChrome;
    if (control.hidden) return;
    const revision = ++coverAccessRevision;
    const button = document.getElementById('allCoverAccessSetting');
    try {
      const enabled = await MangaPlatform.hasAllCoverAccess();
      if (revision !== coverAccessRevision) return;
      setSwitchState(button, enabled, data.settings.language === 'en' ? 'On' : 'Ein', data.settings.language === 'en' ? 'Off' : 'Aus');
      button.disabled = coverAccessBusy;
    } catch { button.disabled = true; }
  }

  // External revocation in Chrome must be reflected without saving settings.
  if (globalThis.MangaPlatform?.isChrome) {
    browser.permissions.onAdded?.addListener(() => { void refreshCoverAccessSetting(); });
    browser.permissions.onRemoved?.addListener(() => { void refreshCoverAccessSetting(); });
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
    select.replaceChildren(option('browser-default', t('browserDefault') + (defaultEngine ? ` · ${defaultEngine.name}` : '')),
      ...firefoxSearchEngines.map((engine) => option(`firefox:${engine.name}`, engine.name + (engine.isDefault ? ' · Standard' : ''))),
      ...[['google', 'Google'], ['bing', 'Bing'], ['duckduckgo', 'DuckDuckGo'], ['yahoo', 'Yahoo'], ['yandex', 'Yandex'], ['baidu', 'Baidu']].map(([value, name]) => option(value, name)),
      ...data.settings.customSearchEngines.map((engine) => option(`custom:${engine.id}`, engine.name)));
    select.value = [...select.options].some((entry) => entry.value === data.settings.searchEngine) ? data.settings.searchEngine : 'browser-default';
    document.getElementById('customSearchEngineList').replaceChildren(...data.settings.customSearchEngines.map((engine) =>
      node('div', { class: 'custom-engine-item' }, node('span', {}, node('b', {}, engine.name), node('small', {}, engine.urlTemplate)),
        button('icon-action-button danger', { 'data-remove-search-engine': engine.id, title: t('remove'), 'aria-label': t('remove') }, '×'))));
  }

  function renderDefaultStatusSetting() {
    const select = document.getElementById('defaultNewStatusSetting');
    select.replaceChildren(...statusViews().map((status) => option(status, statusLabel(status))));
    select.value = data.settings.defaultNewStatus;
  }

  function render() {
    renderCategoryNavigation();
    const admin = currentView === 'admin';
    elements.collectionView.hidden = admin;
    elements.adminView.hidden = !admin;
    // Die Kategorienavigation bleibt auch in den Einstellungen sichtbar.
    // Deshalb müssen ihre Zähler unabhängig von renderCollection() gesetzt
    // werden; andernfalls blieben die beim Aufbau eingesetzten Platzhalter 0.
    renderCounts();
    document.querySelectorAll('[data-view]').forEach((button) => {
      button.classList.toggle('active', button.dataset.view === currentView);
    });
    if (admin) {
      renderSettingsSection();
      if (currentSettingsSection === 'technical') void refreshBackupStatus();
      void refreshCoverAccessSetting();
      renderLogs();
      renderPatchlog();
      document.getElementById('readingLimitInput').value = MangaStore.getReadingLimit(data);
      document.getElementById('currentLimitLabel').textContent = t('currentLimitNamed', categoryLabel('reading'));
      setSwitchState(document.getElementById('languageSetting'), data.settings.language === 'en');
      document.getElementById('colorModeSetting').value = MangaThemes.resolve(data.settings);
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

  let reloadPromise = null;
  let reloadDirty = false;
  function reload() {
    if (reloadPromise) return reloadPromise;
    // A storage notification and its own save handler usually request the
    // same refresh. Batch them before reading data; callers await one promise.
    // Timer rather than requestAnimationFrame also runs in background tabs.
    reloadPromise = new Promise((resolve) => setTimeout(resolve, 0)).then(async () => {
      do {
        reloadDirty = false;
        await reloadSnapshot();
      } while (reloadDirty);
    }).finally(() => { reloadPromise = null; });
    return reloadPromise;
  }

  async function reloadSnapshot() {
    data = await MangaStore.load();
    // Custom artwork can be megabytes. Unrelated rating/tag/theme saves must
    // not transfer and clone all four images again across the storage boundary.
    if (placeholderReadRevision !== placeholderRevision) {
      const revision = placeholderRevision;
      placeholderCoverOverrides = await MangaStore.getCustomPlaceholderCovers({ includeData: true });
      placeholderReadRevision = revision;
    }
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
    elements.dialogStars.replaceChildren(...Array.from({ length: ratingMax() }, (_, i) =>
      button('star' + (i + 1 <= dialogRating ? ' on' : ''), { 'data-dialog-rating': i + 1, title: `${i + 1}/${ratingMax()}` }, '★')));
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
    document.getElementById('statusInput').replaceChildren(...statusViews().map((status) => option(status, statusLabel(status))));
    const readingOption = document.querySelector('#statusInput option[value="reading"]');
    readingOption.disabled = readingCount >= readingLimit && item?.status !== 'reading';
    readingOption.textContent = readingOption.disabled
      ? `${statusLabel('reading')} (${readingCount}/${readingLimit} – ${t('full')})`
      : `${statusLabel('reading')} (${readingCount}/${readingLimit})`;
    const requestedStatus = item?.status || data.settings.defaultNewStatus;
    document.getElementById('statusInput').value = requestedStatus === 'reading' && readingOption.disabled ? 'active' : requestedStatus;
    document.getElementById('coverInput').value = item?.cover?.startsWith('http') ? item.cover : '';
    document.getElementById('coverAccessControl').hidden = !(globalThis.MangaPlatform?.isChrome && item && /^https?:/.test(item.cover));
    document.getElementById('coverPermissionHint').textContent = '';
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

  // Reorder only the small navigation list; persist once on drop. Hidden
  // categories retain their relative order in the full settings order.
  const categoryNavItems = document.getElementById('categoryNavItems');
  let draggedNavView = '';
  categoryNavItems.addEventListener('dragstart', (event) => {
    const tab = event.target.closest('[data-view]');
    if (!tab) return;
    draggedNavView = tab.dataset.view;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggedNavView);
    tab.classList.add('dragging');
  });
  categoryNavItems.addEventListener('dragover', (event) => {
    if (draggedNavView) event.preventDefault();
  });
  categoryNavItems.addEventListener('drop', async (event) => {
    const target = event.target.closest('[data-view]');
    if (!draggedNavView || !target) return;
    event.preventDefault();
    const moved = draggedNavView;
    draggedNavView = '';
    if (target.dataset.view === moved) return;
    const order = allCollectionViews().filter((view) => view !== moved);
    const rect = target.getBoundingClientRect();
    const after = event.clientX > rect.left + rect.width / 2;
    order.splice(order.indexOf(target.dataset.view) + (after ? 1 : 0), 0, moved);
    try {
      await MangaStore.setPreferences({ categoryOrder: order });
      await reload();
      toast(t('categoryOrderSaved'));
    } catch (error) { toast(error.message); }
  });
  categoryNavItems.addEventListener('dragend', () => {
    draggedNavView = '';
    categoryNavItems.querySelector('.dragging')?.classList.remove('dragging');
  });

  let searchTimer;
  elements.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderCollection, 100);
  });
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
    document.getElementById('bookmarkFolderList').replaceChildren(...(bookmarkFolders.length ? bookmarkFolders.map((folder, index) =>
      node('div', { class: 'folder-option' },
        node('input', { id: `folder-${index}`, type: 'checkbox', 'data-folder-check': '', value: folder.id }),
        node('label', { class: 'folder-copy', for: `folder-${index}` }, node('strong', {}, folder.title),
          node('span', {}, `${folder.path.join(' / ')} · ${folder.bookmarkCount} ${t('bookmarkCount')}`)),
        node('div', { class: 'folder-import-options' },
        node('select', { class: 'folder-rating', 'data-folder-rating': folder.id, 'aria-label': t('folderRating', folder.title) },
          option('', t('importInherit')),
          option('0', t('noRating')),
          Array.from({ length: ratingMax() }, (_, i) => option(String(i + 1), `${i + 1} ${t('stars')}`))),
        node('select', { class: 'folder-status', 'data-folder-status': folder.id, 'aria-label': `${t('status')}: ${folder.title}` },
          option('', t('importInherit')), ...statusViews().map((status) => option(status, statusLabel(status)))))))
      : [node('div', { class: 'folder-empty' }, t('noFolders'))]));
    document.getElementById('selectAllFolders').checked = false;
  }

  function renderBookmarkEntries(entries) {
    document.getElementById('bookmarkFolderList').replaceChildren(...(entries.length ? entries.map((bookmark, index) =>
      node('div', { class: 'folder-option bookmark-option' },
        node('input', { id: `bookmark-${index}`, type: 'checkbox', 'data-bookmark-check': '', value: bookmark.id }),
        node('label', { class: 'folder-copy', for: `bookmark-${index}` }, node('strong', {}, bookmark.title),
          node('span', {}, bookmark.path.join(' / ') + (bookmark.currentChapter ? ` · Chapter ${bookmark.currentChapter}` : '')),
          node('small', {}, bookmark.url))))
      : [node('div', { class: 'folder-empty' }, t('noBookmarks'))]));
    document.getElementById('selectAllFolders').checked = false;
  }

  async function openBookmarkDialog() {
    const button = document.getElementById('syncBookmarks');
    button.disabled = true;
    button.textContent = t('loadingFolders');
    try {
      const mode = data.settings.bookmarkImportMode;
      document.getElementById('importCategory').replaceChildren(option('', t('importKeepCategory')),
        ...statusViews().map((status) => option(status, statusLabel(status))));
      document.getElementById('importRating').replaceChildren(option('0', t('noRating')),
        ...Array.from({ length: ratingMax() }, (_, i) => option(String(i + 1), `${i + 1} ${t('stars')}`)));
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
      try {
        await MangaStore.patchItem(ratingButton.dataset.rate, { rating: Number(ratingButton.dataset.score) });
        await reload();
      } catch (error) { toast(error.message); }
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

  document.getElementById('coverAccessButton').addEventListener('click', async () => {
    try {
      await browser.runtime.sendMessage({ type: 'manga-regal:request-cover-access', itemId: document.getElementById('editId').value });
    } catch (error) { toast(error.message); }
  });

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
      if (coverResult?.status === 'permission-required' && savedItem) {
        // The entry is already durable. Keep its ID so a second save updates
        // it, and expose a deliberate consent action without forcing a prompt.
        document.getElementById('editId').value = savedItem.id;
        document.getElementById('coverAccessControl').hidden = false;
        document.getElementById('coverPermissionHint').textContent = t('coverPermission');
      } else {
        elements.dialog.close();
      }
      await reload();
      toast(coverResult?.status === 'downloaded' ? t('mangaAndCoverSaved')
        : coverResult?.status === 'permission-required' ? t('coverPermission')
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
      document.querySelector(`[data-folder-rating="${CSS.escape(id)}"]`)?.value || document.getElementById('importRating').value]));
    const folderStatuses = Object.fromEntries(folderIds.map((id) => [id,
      document.querySelector(`[data-folder-status="${CSS.escape(id)}"]`)?.value || '']));
    try {
      const result = await MangaStore.importFirefoxBookmarks({ folderIds, bookmarkIds, folderRatings, folderStatuses,
        rating: Number(document.getElementById('importRating').value), status: document.getElementById('importCategory').value });
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
  function renderSettingsSection() {
    document.querySelectorAll('[data-settings-section]').forEach((tab) => {
      const selected = tab.dataset.settingsSection === currentSettingsSection;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
    });
  }
  function selectSettingsSection(section, focus = false) {
    if (!settingsSections.includes(section)) return;
    currentSettingsSection = section;
    renderSettingsSection();
    if (focus) document.querySelector(`[data-settings-section="${section}"]`).focus();
    if (section === 'technical') {
      void refreshBackupStatus();
      refreshSyncStatus().catch((error) => { document.getElementById('syncStatusText').textContent = error.message; });
    }
  }
  document.querySelector('.settings-section-tabs').addEventListener('click', (event) => {
    const tab = event.target.closest('[data-settings-section]');
    if (tab) selectSettingsSection(tab.dataset.settingsSection);
  });
  document.querySelector('.settings-section-tabs').addEventListener('keydown', (event) => {
    const tab = event.target.closest('[data-settings-section]');
    if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = settingsSections.indexOf(tab.dataset.settingsSection);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? settingsSections.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + settingsSections.length) % settingsSections.length;
    selectSettingsSection(settingsSections[next], true);
  });
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
  document.getElementById('colorModeSetting').addEventListener('change', async (event) => {
    await MangaStore.setPreferences({ theme: event.target.value });
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
  document.getElementById('allCoverAccessSetting').addEventListener('click', async () => {
    if (!globalThis.MangaPlatform?.isChrome || coverAccessBusy) return;
    const button = document.getElementById('allCoverAccessSetting');
    const wasEnabled = button.getAttribute('aria-checked') === 'true';
    coverAccessBusy = true;
    button.disabled = true;
    try {
      // No awaits before request(): Chrome requires the original click gesture.
      const accepted = await (wasEnabled ? MangaPlatform.removeAllCoverAccess() : MangaPlatform.requestAllCoverAccess());
      const enabled = await MangaPlatform.hasAllCoverAccess();
      if (enabled !== wasEnabled) {
        await MangaStore.update((current) => {
          MangaStore.appendLog(current, 'info', 'Chrome', t(enabled ? 'allCoverAccessEnabled' : 'allCoverAccessDisabled'), '');
        });
        await reload();
      }
      toast(t(wasEnabled ? (enabled ? 'allCoverAccessFailed' : 'allCoverAccessDisabled')
        : accepted && enabled ? 'allCoverAccessEnabled' : 'allCoverAccessDeclined'));
    } catch { toast(t('allCoverAccessFailed')); }
    finally {
      coverAccessBusy = false;
      await refreshCoverAccessSetting();
    }
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
      if (enabled) {
        await connectSync(true);
      } else {
        await MangaStore.setPreferences({ syncEnabled: false });
        await MangaSync.revokeConsent();
      }
      await reload();
    } catch (error) {
      toast(error.message);
    }
  });

  async function allowBackupDownloads() {
    if (!(await browser.permissions.request({ permissions: ['downloads'] }))) throw new Error('DOWNLOAD_PERMISSION_REQUIRED');
  }
  document.getElementById('dailyBackupSetting').addEventListener('click', async () => {
    const enabled = document.getElementById('dailyBackupSetting').getAttribute('aria-checked') !== 'true';
    try {
      if (enabled) await allowBackupDownloads();
      await backupRequest('configure', { enabled });
    } catch (error) { toast(backupError(error.message)); }
    await refreshBackupStatus();
  });
  document.getElementById('dailyBackupNow').addEventListener('click', async () => {
    try {
      await allowBackupDownloads();
      await backupRequest('now');
    } catch (error) { toast(backupError(error.message)); }
    await refreshBackupStatus();
  });
  document.getElementById('dailyBackupLimit').addEventListener('change', async (event) => {
    if (!validateBackupLimit()) return;
    try {
      const enabled = document.getElementById('dailyBackupSetting').getAttribute('aria-checked') === 'true';
      await backupRequest('configure', { enabled, limit: Number(event.target.value) });
    } catch (error) { toast(error.message); }
    await refreshBackupStatus();
  });
  function validateBackupLimit() {
    const input = document.getElementById('dailyBackupLimit');
    const valid = /^\d+$/.test(input.value) && Number(input.value) >= 1 && Number(input.value) <= 365;
    input.setAttribute('aria-invalid', String(!valid));
    input.setCustomValidity(valid ? '' : t('invalidBackupLimit'));
    return valid;
  }
  document.getElementById('dailyBackupLimit').addEventListener('input', validateBackupLimit);
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.mangaShelfDailyBackupV1 && currentView === 'admin') void refreshBackupStatus();
  });

  document.getElementById('syncNow').addEventListener('click', async () => {
    try {
      if (!(await requestSyncConsent())) {
        toast(t('syncConsentDenied'));
        return;
      }
      await connectSync();
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
    if (!validateBackupLimit()) {
      selectSettingsSection('technical');
      document.getElementById('dailyBackupLimit').focus();
      return false;
    }
    const ratingCategoryRules = ratingRulesFromDom();
    if (!confirmRatingRules(ratingCategoryRules)) return;
    const rulesChanged = JSON.stringify(ratingCategoryRules) !== JSON.stringify(data.settings.ratingCategoryRules);
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
      ...(rulesChanged ? { ratingCategoryRules } : {}),
      tagPresets,
      placeholderCoverByTag: data.settings.placeholderCoverByTag,
      ratingScale: nextRatingScale,
      theme: document.getElementById('colorModeSetting').value,
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

  async function saveCategoryEditorFromDom(messageKey = 'categoryNamesSaved', extra = {}) {
    const ratingCategoryRules = ratingRulesFromDom();
    if (!confirmRatingRules(ratingCategoryRules)) { renderCategoryNameSettings(); return; }
    const rulesChanged = JSON.stringify(ratingCategoryRules) !== JSON.stringify(data.settings.ratingCategoryRules);
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
    await MangaStore.setPreferences({ categoryOrder, categoryNames, customCategories, collectionViews,
      ...(rulesChanged ? { ratingCategoryRules } : {}), ...extra });
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
    const visibility = event.target.closest('[data-toggle-category]');
    if (visibility) {
      const view = visibility.dataset.toggleCategory;
      const hidden = new Set(data.settings.hiddenCategories);
      if (hidden.has(view)) hidden.delete(view); else hidden.add(view);
      try { await saveCategoryEditorFromDom('preferencesSaved', { hiddenCategories: [...hidden] }); }
      catch (error) { toast(error.message); }
      return;
    }
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
    const rating = event.target.closest('[data-rating-score]');
    if (rating) {
      // Move ownership of this exact score; never keep competing rules in UI.
      if (rating.checked) categoryOrderList.querySelectorAll(`[data-rating-score="${rating.dataset.ratingScore}"]`)
        .forEach((checkbox) => { if (checkbox !== rating) checkbox.checked = false; });
      try { await saveCategoryEditorFromDom('ratingRulesSaved'); }
      catch (error) { renderCategoryNameSettings(); toast(error.message); }
      return;
    }
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
    if (area !== 'local') return;
    const artworkChanged = Object.keys(changes).some((key) => key.startsWith('mangaRegalCustomPlaceholderV1:'));
    if (artworkChanged) placeholderRevision++;
    if (!artworkChanged && !changes[MangaStore.STORAGE_KEY]) return;
    // A write during an active read is replayed; never lose a newer snapshot.
    if (reloadPromise) reloadDirty = true;
    reload().catch((error) => { console.error('Manga-Regal refresh failed:', error); });
  });

  reload().catch((error) => {
    console.error('Manga-Regal konnte nicht geladen werden:', error);
    toast(t('loadFailed'));
  });
})();
