/* Automatische Basistests für die zentrale Speicherlogik. */
'use strict';

const assert = require('node:assert/strict');

// Sehr kleiner Firefox-API-Ersatz, damit store.js unabhängig testbar bleibt.
const memory = {};
const syncMemory = {};
const generatedBookmarks = new Map();
let generatedBookmarkSequence = 0;
const grantedDataCollection = new Set([
  'bookmarksInfo', 'browsingActivity', 'technicalAndInteraction', 'websiteActivity', 'websiteContent'
]);
const clone = (value) => JSON.parse(JSON.stringify(value));
function selectedStorage(source, keys) {
  if (keys === null || keys === undefined) return clone(source);
  const names = Array.isArray(keys) ? keys : [keys];
  return Object.fromEntries(names.filter((key) => key in source).map((key) => [key, clone(source[key])]));
}
global.browser = {
  permissions: {
    async getAll() { return { data_collection: [...grantedDataCollection] }; },
    async request(details) {
      for (const permission of details.data_collection || []) grantedDataCollection.add(permission);
      return true;
    },
    async remove(details) {
      for (const permission of details.data_collection || []) grantedDataCollection.delete(permission);
      return true;
    }
  },
  storage: {
    local: {
      async get(key) { return { [key]: memory[key] }; },
      async set(values) { Object.assign(memory, JSON.parse(JSON.stringify(values))); },
      async remove(key) { delete memory[key]; }
    },
    sync: {
      async get(keys) { return selectedStorage(syncMemory, keys); },
      async set(values) { Object.assign(syncMemory, clone(values)); },
      async remove(keys) { for (const key of (Array.isArray(keys) ? keys : [keys])) delete syncMemory[key]; },
      async getBytesInUse(keys) {
        const values = selectedStorage(syncMemory, keys);
        return Object.entries(values).reduce((sum, [key, value]) => (
          sum + new TextEncoder().encode(key + JSON.stringify(value)).length
        ), 0);
      }
    }
  },
  bookmarks: {
    async getTree() {
      return [{ title: '', children: [{
        id: 'folder-1', title: 'Manga', children: [
          { id: 'bookmark-1', title: 'Test Manga', url: 'https://example.org/manga/chapter-42.5', dateAdded: 1000 }
        ]
      }] }];
    },
    async create(details) {
      const id = `generated-${++generatedBookmarkSequence}`;
      const node = {
        id,
        parentId: details.parentId ? String(details.parentId) : 'unfiled_____',
        title: String(details.title || '')
      };
      if (details.url) node.url = String(details.url);
      generatedBookmarks.set(id, node);
      return clone(node);
    },
    async get(id) {
      const node = generatedBookmarks.get(String(id));
      if (!node) throw new Error('Bookmark not found');
      return [clone(node)];
    },
    async update(id, changes) {
      const node = generatedBookmarks.get(String(id));
      if (!node) throw new Error('Bookmark not found');
      Object.assign(node, clone(changes));
      return clone(node);
    },
    async removeTree(id) {
      const pending = [String(id)];
      while (pending.length) {
        const current = pending.pop();
        for (const node of generatedBookmarks.values()) {
          if (node.parentId === current) pending.push(node.id);
        }
        generatedBookmarks.delete(current);
      }
    }
  }
};

require('../shared/store.js');
require('../shared/sync.js');

(async () => {
  // Neue Installationen beginnen mit der kompakteren 5-Sterne-Skala.
  let data = await MangaStore.load();
  assert.equal(data.settings.ratingScale, 5);
  assert.equal(data.settings.limitLogs, true);
  await MangaStore.update((current) => {
    current.logs = [];
    for (let index = 0; index < 125; index++) MangaStore.appendLog(current, 'info', 'Test', String(index));
  });
  data = await MangaStore.load();
  assert.equal(data.logs.length, 100);
  assert.equal(data.logs[0].message, '124');
  assert.equal(data.logs[99].message, '25');
  await MangaStore.setPreferences({ limitLogs: false });
  await MangaStore.update((current) => {
    for (let index = 0; index < 125; index++) MangaStore.appendLog(current, 'info', 'Test', String(index));
  });
  data = await MangaStore.load();
  assert.ok(data.logs.length > 100);
  assert.equal(data.settings.limitLogs, false);
  await MangaStore.setPreferences({ limitLogs: true });
  data = await MangaStore.load();
  assert.equal(data.logs.length, 100);
  assert.equal(data.settings.chapterDetectionEnabled, true);
  assert.equal(data.settings.offerRereadOnUpdate, true);
  assert.equal(data.settings.autoTagRereads, true);
  assert.equal(data.settings.placeholderCoversEnabled, true);
  assert.ok(data.settings.tagPresets.includes('Re-Read'));
  assert.ok(MangaStore.TAG_PRESETS.includes('Re-Read'));
  assert.equal(data.settings.showOnboardingOnStartup, true);
  await MangaStore.setPreferences({ showOnboardingOnStartup: false });
  data = await MangaStore.load();
  assert.equal(data.settings.showOnboardingOnStartup, false);
  // Die weiteren Tests prüfen bewusst auch die optionale 10-Sterne-Skala.
  await MangaStore.setPreferences({ ratingScale: 10, showOnboardingOnStartup: true });

  await MangaStore.upsertItem({
    title: 'Lokaler Manga',
    url: 'https://local.example/title',
    tags: 'Fantasy, Fantasy, Seinen',
    rating: 9,
    cover: '/covers/title.jpg'
  });

  data = await MangaStore.load();
  assert.equal(data.items.length, 1);
  assert.equal(data.settings.showCoversInTable, true);
  assert.equal(data.settings.ratingScale, 10);
  assert.equal(data.settings.onboardingComplete, false);
  assert.deepEqual(data.items[0].tags, ['Fantasy', 'Seinen']);
  assert.equal(data.items[0].rating, 9);
  assert.equal(data.items[0].cover, 'https://local.example/covers/title.jpg');

  const folders = await MangaStore.getFirefoxBookmarkFolders();
  assert.equal(folders.length, 1);
  assert.equal(folders[0].bookmarkCount, 1);
  const bookmarks = await MangaStore.getFirefoxBookmarks();
  assert.equal(bookmarks.length, 1);
  assert.equal(bookmarks[0].currentChapter, '42.5');
  assert.equal(bookmarks[0].cover, undefined, 'Die Firefox-Vorschau darf keine erfundene Cover-Adresse enthalten');
  assert.equal(MangaStore.normalizeItem({
    title: 'Import ohne Cover',
    url: 'https://example.org/manga/chapter-42',
    cover: ''
  }).cover, '');
  assert.equal(MangaStore.normalizeItem({
    title: 'Alter fehlerhafter Import',
    url: 'https://example.org/manga/chapter-42',
    cover: 'https://example.org/manga/chapter-42'
  }).cover, '', 'Eine alte Kapiteladresse im Coverfeld muss automatisch bereinigt werden');

  const result = await MangaStore.importFirefoxBookmarks({
    folderIds: ['folder-1'],
    folderRatings: { 'folder-1': 8 }
  });
  assert.equal(result.imported, 1);
  data = await MangaStore.load();
  assert.equal(data.items.length, 2);
  assert.deepEqual(data.items.find((item) => item.bookmarkId === 'bookmark-1').folderPath, ['Manga']);
  assert.equal(data.items.find((item) => item.bookmarkId === 'bookmark-1').rating, 8);
  assert.equal(data.items.find((item) => item.bookmarkId === 'bookmark-1').currentChapter, '42.5');
  const keywordResult = await MangaStore.importFirefoxBookmarks({ keyword: 'chapter' });
  assert.equal(keywordResult.scanned, 1);
  const manualResult = await MangaStore.importFirefoxBookmarks({ bookmarkIds: ['bookmark-1'] });
  assert.equal(manualResult.scanned, 1);
  assert.equal(MangaStore.chapterFromUrl('https://reader.example/title/ch/17'), '17');
  assert.equal(MangaStore.chapterFromUrl('https://reader.example/read?chapter=88'), '88');

  const importedItem = data.items.find((item) => item.bookmarkId === 'bookmark-1');
  assert.equal(importedItem.cover, '');
  const likelyMatch = MangaStore.findLikelyMatch(data.items, {
    title: 'Test Manga Chapter 43',
    url: 'https://example.org/manga/chapter-43'
  });
  assert.equal(likelyMatch.id, importedItem.id);

  // Getrennte Lesestaende: Unterhalb des Hauptstands gewinnt der laufende
  // Re-Read, oberhalb des Hauptstands wieder der normale Datensatz. Der Dialog
  // erhaelt trotzdem beide Kandidaten fuer eine manuelle Korrektur.
  const rereadCandidates = [
    MangaStore.normalizeItem({
      id: 'main-progress', title: 'Example Hero',
      url: 'https://reader.example/series/example-hero/chapter-150',
      currentChapter: '150', modified: 100
    }),
    MangaStore.normalizeItem({
      id: 'reread-progress', title: 'Example Hero',
      url: 'https://reader.example/series/example-hero/chapter-1',
      currentChapter: '1', rereadOf: 'main-progress', rereadRound: 1, modified: 200
    })
  ];
  assert.equal(MangaStore.findLikelyMatch(rereadCandidates, {
    title: 'Example Hero Chapter 2',
    url: 'https://reader.example/series/example-hero/chapter-2', currentChapter: '2'
  }).id, 'reread-progress');
  assert.equal(MangaStore.findLikelyMatch(rereadCandidates, {
    title: 'Example Hero Chapter 151',
    url: 'https://reader.example/series/example-hero/chapter-151', currentChapter: '151'
  }).id, 'main-progress');
  assert.equal(MangaStore.findLikelyMatches(rereadCandidates, {
    title: 'Example Hero Chapter 2', url: 'https://reader.example/series/example-hero/chapter-2'
  }).length, 2);

  // forceNew ist fuer einen bewussten Re-Read erforderlich: Selbst dieselbe
  // URL darf den Hauptstand nicht stillschweigend ueberschreiben.
  await MangaStore.upsertItem({
    id: 'force-new-main', title: 'Force New Hero',
    url: 'https://force-new.example/hero/chapter-1', currentChapter: '1'
  });
  await MangaStore.upsertItem({
    id: 'force-new-reread', title: 'Force New Hero',
    url: 'https://force-new.example/hero/chapter-1', currentChapter: '1',
    rereadOf: 'force-new-main', rereadRound: 1, forceNew: true,
    tags: [MangaStore.REREAD_TAG]
  });
  data = await MangaStore.load();
  assert.equal(data.items.filter((item) => item.url === 'https://force-new.example/hero/chapter-1').length, 2);
  assert.equal(data.items.find((item) => item.id === 'force-new-reread').rereadOf, 'force-new-main');
  assert.deepEqual(data.items.find((item) => item.id === 'force-new-reread').tags, ['Re-Read']);
  await MangaStore.removeItem('force-new-main');
  await MangaStore.removeItem('force-new-reread');

  await MangaStore.patchItem(importedItem.id, { tags: ['Action'], status: 'hold' });
  await MangaStore.upsertItem({
    id: importedItem.id,
    title: importedItem.title,
    url: 'https://example.org/manga/chapter-43',
    currentChapter: '43'
  });
  data = await MangaStore.load();
  const updatedItem = data.items.find((item) => item.id === importedItem.id);
  assert.equal(updatedItem.bookmarkId, 'bookmark-1');
  assert.deepEqual(updatedItem.tags, ['Action']);
  assert.equal(updatedItem.rating, 8);
  assert.equal(updatedItem.status, 'hold');
  assert.equal(updatedItem.currentChapter, '43');

  // Ein Kapitelupdate darf ein bereits separat gespeichertes Cover weder
  // löschen noch erneut aus dem Internet laden.
  const localCover = 'data:image/png;base64,dGVzdA==';
  await MangaStore.storeCover(updatedItem.id, localCover);
  await MangaStore.upsertItem({ ...updatedItem, url: 'https://example.org/manga/chapter-44', currentChapter: '44', cover: '' });
  data = await MangaStore.load();
  const chapterUpdatedItem = data.items.find((item) => item.id === updatedItem.id);
  assert.equal(await MangaStore.cacheCover(chapterUpdatedItem), localCover);

  // Die globale Abschaltung entfernt nur automatisch erkannte Werte. Eine
  // manuelle Angabe bleibt erhalten und kann weiterhin optional gepflegt werden.
  const manualChapterItem = data.items.find((item) => item.id !== chapterUpdatedItem.id);
  await MangaStore.patchItem(chapterUpdatedItem.id, { currentChapter: '44', chapterManual: false });
  await MangaStore.patchItem(manualChapterItem.id, { currentChapter: 'Band 3', chapterManual: true });
  await MangaStore.setPreferences({ chapterDetectionEnabled: false });
  data = await MangaStore.load();
  assert.equal(data.settings.chapterDetectionEnabled, false);
  assert.equal(data.items.find((item) => item.id === chapterUpdatedItem.id).currentChapter, '');
  assert.equal(data.items.find((item) => item.id === manualChapterItem.id).currentChapter, 'Band 3');
  assert.equal((await MangaStore.getFirefoxBookmarks())[0].currentChapter, '');
  // Der Schalter im Speicher-Pop-up friert den sichtbaren Kapitelstand ein und
  // verhindert bei späteren URLs desselben Manga eine erneute Auto-Erkennung.
  await MangaStore.patchItem(chapterUpdatedItem.id, {
    currentChapter: '45', chapterManual: true, chapterDetectionDisabled: true
  });
  await MangaStore.setPreferences({ chapterDetectionEnabled: true });
  await MangaStore.setPreferences({ chapterDetectionEnabled: false });
  data = await MangaStore.load();
  assert.equal(data.items.find((item) => item.id === chapterUpdatedItem.id).currentChapter, '45');
  assert.equal(data.items.find((item) => item.id === chapterUpdatedItem.id).chapterDetectionDisabled, true);
  assert.equal(MangaStore.normalizeItem({
    title: 'Ohne Automatik', url: 'https://example.org/chapter-999', chapterDetectionDisabled: true
  }).currentChapter, '');
  await MangaStore.setPreferences({ chapterDetectionEnabled: true });

  const compactChapterSetting = MangaSync.compactItem({
    id: 'chapter-setting-test', title: 'Chapter setting', url: 'https://example.org/chapter-9',
    chapterDetectionDisabled: true
  });
  assert.equal(MangaSync.expandItem(compactChapterSetting).chapterDetectionDisabled, true);

  const compactCoverSetting = MangaSync.compactItem({
    id: 'cover-setting-test', title: 'Cover setting', url: 'https://example.org/chapter-9',
    coverDetectionDisabled: true
  });
  assert.equal(MangaSync.expandItem(compactCoverSetting).coverDetectionDisabled, true);
  const compactReread = MangaSync.compactItem({
    id: 'reread-sync-test', title: 'Re-Read Sync', url: 'https://example.org/chapter-2',
    rereadOf: 'main-sync-test', rereadRound: 2
  });
  assert.equal(MangaSync.expandItem(compactReread).rereadOf, 'main-sync-test');
  assert.equal(MangaSync.expandItem(compactReread).rereadRound, 2);
  assert.equal(MangaStore.normalizeItem({
    title: 'Cover bleibt lokal', url: 'https://example.org/chapter-9', coverDetectionDisabled: true
  }).coverDetectionDisabled, true);

  // Hintergrund-Cover bleiben anonym. Falls fetch scheitert, übernimmt XHR
  // ohne Cookies. Im aktiven Manga-Tab darf dagegen die vorhandene
  // Cloudflare-Sitzung mitgesendet werden, ohne dass das Add-on sie ausliest.
  const originalFetch = global.fetch;
  const originalXMLHttpRequest = global.XMLHttpRequest;
  const originalFileReader = global.FileReader;
  let usedFetchOptions;
  let xhrSentCredentials;
  try {
    global.fetch = async (_url, options) => {
      usedFetchOptions = options;
      throw new Error('simulierter Fetch-Netzwerkfehler');
    };
    global.XMLHttpRequest = class PublicCoverRequest {
      open() {}
      send() {
        xhrSentCredentials = this.withCredentials;
        this.status = 200;
        this.response = new Blob([
          Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
        ], { type: 'application/octet-stream' });
        queueMicrotask(() => this.onload());
      }
    };
    global.FileReader = class CoverFileReader {
      readAsDataURL(blob) {
        blob.arrayBuffer().then((buffer) => {
          this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
          this.onload();
        }, () => this.onerror());
      }
    };
    const disabledCover = await MangaStore.cacheCover({
      id: 'disabled-cover',
      cover: 'https://images.example.org/disabled.jpg',
      coverDetectionDisabled: true
    });
    assert.equal(disabledCover, '');
    assert.equal(usedFetchOptions, undefined, 'Deaktivierte Cover-Automatik darf keinen Netzwerkaufruf starten');

    const downloadedCover = await MangaStore.cacheCover({
      id: 'public-cover-fallback',
      cover: 'https://images.example.org/cover.bin'
    });
    assert.match(downloadedCover, /^data:image\/png;base64,/);
    assert.equal(usedFetchOptions.credentials, 'omit');
    assert.equal(xhrSentCredentials, false);

    let pageContextOptions;
    let pageContextXhrUsed = false;
    global.fetch = async (_url, options) => {
      pageContextOptions = options;
      return {
        ok: true,
        status: 200,
        async blob() {
          return new Blob([Uint8Array.from([0xFF, 0xD8, 0xFF, 0xD9])], { type: 'image/jpeg' });
        }
      };
    };
    global.XMLHttpRequest = class ForbiddenPageContextXhr {
      constructor() { pageContextXhrUsed = true; }
    };
    const pageContextCover = await MangaStore.cacheCover({
      id: 'public-cover-page-context',
      cover: 'https://cdn.example.org/cover.jpg'
    }, { referrerUrl: 'https://reader.example.org/manga/chapter-7' });
    assert.match(pageContextCover, /^data:image\/jpeg;base64,/);
    assert.equal(pageContextOptions.credentials, 'include');
    assert.equal(pageContextOptions.referrer, 'https://reader.example.org/manga/chapter-7');
    assert.equal(pageContextOptions.referrerPolicy, 'strict-origin-when-cross-origin');
    assert.equal(pageContextXhrUsed, false);
  } finally {
    global.fetch = originalFetch;
    if (originalXMLHttpRequest === undefined) delete global.XMLHttpRequest;
    else global.XMLHttpRequest = originalXMLHttpRequest;
    if (originalFileReader === undefined) delete global.FileReader;
    else global.FileReader = originalFileReader;
  }

  await MangaStore.patchItem(data.items[0].id, { status: 'hold', rating: 10 });
  data = await MangaStore.load();
  assert.equal(data.items[0].status, 'hold');
  assert.equal(data.items[0].rating, 10);

  await MangaStore.patchItem(data.items[0].id, { status: 'reading' });
  await MangaStore.patchItem(data.items[1].id, { status: 'reading' });
  await MangaStore.setReadingLimit(2);
  data = await MangaStore.load();
  assert.equal(MangaStore.getReadingLimit(data), 2);
  await assert.rejects(
    MangaStore.upsertItem({
      title: 'Dritter aktueller Manga',
      url: 'https://limit.example/chapter-1',
      status: 'reading'
    }),
    /„Lese ich gerade“ ist voll/
  );
  await assert.rejects(MangaStore.setReadingLimit(1), /nicht unter 2/);
  await MangaStore.setReadingLimit(3);

  await MangaStore.setPreferences({
    collectionViews: { reading: 'cards', active: 'table', hold: 'cards', dropped: 'table', all: 'cards' },
    categoryNames: { reading: 'Lesestapel', dropped: 'Archiv' },
    tagPresets: ['Fantasy', 'Mystery', 'Unbekannter Tag'],
    placeholderCoverByTag: { Fantasy: 'arcane', Romance: 'forest', Broken: 'unknown' },
    placeholderCoversEnabled: false,
    language: 'en',
    colorMode: 'light',
    searchEngine: 'duckduckgo',
    offerRereadOnUpdate: false,
    autoTagRereads: false
  });
  data = await MangaStore.load();
  assert.equal(data.settings.collectionViews.reading, 'cards');
  assert.equal(data.settings.collectionViews.active, 'table');
  assert.equal(data.settings.collectionViews.hold, 'cards');
  assert.equal(data.settings.categoryNames.reading, 'Lesestapel');
  assert.equal(data.settings.categoryNames.dropped, 'Archiv');
  assert.deepEqual(data.settings.tagPresets, ['Fantasy', 'Mystery']);
  assert.deepEqual(data.settings.placeholderCoverByTag, { Fantasy: 'arcane', Romance: 'forest' });
  assert.equal(data.settings.placeholderCoversEnabled, false);
  assert.equal(data.settings.language, 'en');
  assert.equal(data.settings.colorMode, 'light');
  assert.equal(data.settings.searchEngine, 'duckduckgo');
  assert.equal(data.settings.offerRereadOnUpdate, false);
  assert.equal(data.settings.autoTagRereads, false);
  await MangaStore.setPreferences({ offerRereadOnUpdate: true, autoTagRereads: true, placeholderCoversEnabled: true });

  // Beim Wechsel auf fünf Sterne werden nur Werte über fünf begrenzt. Bereits
  // gültige Bewertungen dürfen weder halbiert noch beim Rückwechsel verdoppelt werden.
  await MangaStore.patchItem(data.items[0].id, { rating: 4 });
  await MangaStore.patchItem(data.items[1].id, { rating: 8 });
  await MangaStore.setPreferences({ ratingScale: 5 });
  data = await MangaStore.load();
  assert.equal(data.settings.ratingScale, 5);
  assert.equal(data.items[0].rating, 4);
  assert.equal(data.items[1].rating, 5);
  await MangaStore.setPreferences({ ratingScale: 10, onboardingComplete: true });
  data = await MangaStore.load();
  assert.equal(data.settings.ratingScale, 10);
  assert.equal(data.items[0].rating, 4);
  assert.equal(data.items[1].rating, 5);
  assert.equal(data.settings.onboardingComplete, true);

  await MangaStore.setPreferences({ hiddenTagPresets: ['Mystery'], tagPresets: ['Fantasy', 'Mystery'] });
  data = await MangaStore.load();
  assert.deepEqual(data.settings.hiddenTagPresets, ['Mystery']);
  assert.deepEqual(data.settings.tagPresets, ['Fantasy']);
  await MangaStore.setPreferences({ hiddenTagPresets: [], tagPresets: ['Fantasy', 'Mystery'] });

  await MangaStore.setPreferences({
    customCategories: [{ id: 'custom-later', name: 'Später lesen' }],
    defaultNewStatus: 'custom-later',
    categoryOrder: ['all', 'custom-later', 'reading', 'active', 'hold', 'dropped', 'completed']
  });
  await MangaStore.upsertItem({
    title: 'Eigene Kategorie',
    url: 'https://custom.example/chapter-1',
    status: 'custom-later'
  });
  data = await MangaStore.load();
  assert.equal(data.items.find((item) => item.title === 'Eigene Kategorie').status, 'custom-later');
  assert.equal(data.settings.defaultNewStatus, 'custom-later');
  assert.deepEqual(data.settings.categoryOrder.slice(0, 3), ['all', 'custom-later', 'reading']);
  await MangaStore.setPreferences({ customCategories: [] });
  data = await MangaStore.load();
  assert.equal(data.items.find((item) => item.title === 'Eigene Kategorie').status, 'active');
  assert.equal(data.settings.defaultNewStatus, 'active');

  // Der Rückexport baut normale Firefox-Ordner auf und muss auch Manga
  // enthalten, die ausschließlich im Tool angelegt wurden. Gleichnamige
  // fremde Ordner dürfen bei späteren Aktualisierungen nicht gelöscht werden.
  const foreignRoot = await browser.bookmarks.create({ title: 'Manga-Regal' });
  const exportCategories = [
    { id: 'reading', title: 'Lese ich gerade' },
    { id: 'active', title: 'Aktiv' },
    { id: 'hold', title: 'On Hold' },
    { id: 'dropped', title: 'Gedroppt' },
    { id: 'completed', title: 'Abgeschlossen' }
  ];
  const firstBookmarkExport = await MangaStore.exportToFirefoxBookmarks({
    rootTitle: 'Manga-Regal',
    categories: exportCategories
  });
  assert.equal(firstBookmarkExport.itemCount, data.items.length);
  assert.equal(firstBookmarkExport.folderCount, exportCategories.length);
  assert.equal(firstBookmarkExport.replaced, false);
  assert.ok(generatedBookmarks.has(foreignRoot.id), 'Fremder gleichnamiger Ordner wurde gelöscht');
  const exportedNodes = [...generatedBookmarks.values()].filter((node) => node.url);
  assert.equal(exportedNodes.length, data.items.length);
  assert.ok(exportedNodes.some((node) => node.url === 'https://local.example/title'), 'Rein lokaler Manga fehlt im Lesezeichenexport');
  assert.doesNotMatch(JSON.stringify(exportedNodes), /rating|cover|tags|logs/i);
  data = await MangaStore.load();
  assert.ok(data.items.every((item) => item.bookmarkId.startsWith('generated-')));

  const secondBookmarkExport = await MangaStore.exportToFirefoxBookmarks({
    rootTitle: 'Manga-Regal',
    categories: exportCategories
  });
  assert.equal(secondBookmarkExport.replaced, true);
  assert.equal(
    [...generatedBookmarks.values()].filter((node) => node.title === 'Manga-Regal' && !node.url).length,
    2,
    'Erwartet werden genau der fremde und der aktuelle verwaltete Oberordner'
  );
  assert.ok(generatedBookmarks.has(foreignRoot.id), 'Fremder Ordner wurde beim Aktualisieren gelöscht');
  const bookmarkExportStatus = await MangaStore.getFirefoxBookmarkExportStatus();
  assert.equal(bookmarkExportStatus.available, true);
  assert.equal(bookmarkExportStatus.itemCount, data.items.length);

  // Die vier Platzhalter-Slots koennen lokal ersetzt werden. Ihre Bilder
  // gehoeren in die JSON-Sicherung, aber niemals in Firefox Sync.
  const customPlaceholderData = 'data:image/jpeg;base64,cGxhY2Vob2xkZXI=';
  await MangaStore.saveCustomPlaceholderCover({ id: 'city', dataUrl: customPlaceholderData });
  let placeholderOverrides = await MangaStore.getCustomPlaceholderCovers({ includeData: true });
  assert.equal(placeholderOverrides.length, 1);
  assert.equal(placeholderOverrides[0].id, 'city');
  assert.equal(placeholderOverrides[0].dataUrl, customPlaceholderData);
  const backupWithPlaceholders = await MangaStore.exportData();
  assert.equal(backupWithPlaceholders.customPlaceholderCovers[0].dataUrl, customPlaceholderData);

  // Firefox Sync speichert Manga in größenbasierten Bündeln. Cover, lokale
  // Firefox-IDs und Logs dürfen den Geräte-Speicher niemals verlassen.
  await MangaSync.revokeConsent();
  assert.equal(await MangaSync.hasConsent(), false);
  await assert.rejects(
    () => MangaSync.upload({ force: true }),
    /Zustimmung/,
    'Ohne Mozillas optionale Datenfreigabe darf kein Sync-Upload starten'
  );
  assert.equal(await MangaSync.requestConsent(), true);
  assert.equal(await MangaSync.hasConsent(), true);
  await MangaStore.setPreferences({ syncEnabled: true });
  const syncResult = await MangaSync.upload({ force: true });
  assert.equal(syncResult.itemCount, data.items.length);
  assert.ok(syncResult.chunkCount >= 1);
  assert.ok(memory[MangaSync.LOCAL_CACHE_KEY]?.payload, 'Dauerhafter komprimierter Sync-Cache fehlt');
  const cachePreparedAt = memory[MangaSync.LOCAL_CACHE_KEY].preparedAt;
  const repeatedSync = await MangaSync.upload({ force: true });
  assert.equal(repeatedSync.cacheReused, true);
  assert.equal(memory[MangaSync.LOCAL_CACHE_KEY].preparedAt, cachePreparedAt);
  assert.ok(Object.keys(syncMemory).length < 512);
  for (const [key, value] of Object.entries(syncMemory)) {
    const bytes = new TextEncoder().encode(key + JSON.stringify(value)).length;
    assert.ok(bytes <= 8192, `${key} überschreitet mit ${bytes} Byte das Firefox-Limit`);
  }
  const serializedSync = JSON.stringify(syncMemory);
  assert.match(serializedSync, /gzip-base64-v1/);
  assert.doesNotMatch(serializedSync, /data:image/i);
  assert.doesNotMatch(serializedSync, /bookmark-1/);
  assert.doesNotMatch(serializedSync, /Cover für/);
  assert.doesNotMatch(serializedSync, /cGxhY2Vob2xkZXI=/, 'Eigenes Platzhalterbild wurde in Firefox Sync aufgenommen');
  await MangaStore.removeCustomPlaceholderCover('city');
  placeholderOverrides = await MangaStore.getCustomPlaceholderCovers({ includeData: true });
  assert.equal(placeholderOverrides.length, 0);

  // Regressionstest für die vom Nutzer angesprochene 512-Item-Grenze:
  // 600 Manga müssen sich auf deutlich weniger als 512 Sync-Schlüssel verteilen.
  const manyManga = Array.from({ length: 600 }, (_, index) => ({
    id: `bulk-${index}`,
    title: `Manga ${index}`,
    url: `https://example.org/title-${index}/chapter-${index + 1}`,
    currentChapter: String(index + 1),
    tags: ['Fantasy'],
    status: 'active',
    modified: 1000 + index
  }));
  const packedChunks = MangaSync.buildChunks(manyManga, 12345);
  assert.ok(packedChunks.length < 512, `600 Manga erzeugten unerwartet ${packedChunks.length} Bündel`);
  assert.ok(packedChunks.every((chunk) => chunk.i.length > 1), 'Manga wurden nicht gebündelt');

  // Ein Restore übernimmt Metadaten, erhält aber ein bereits lokal gespeichertes
  // Cover desselben Manga. Das simuliert ein Kapitelupdate von einem Zweitgerät.
  const syncedItemId = data.items[0].id;
  await MangaStore.storeCover(syncedItemId, localCover);
  await MangaSync.restore({ force: true });
  assert.equal(await MangaStore.getStoredCover(syncedItemId), localCover);

  // Praxisnahe Größenprobe: 422 Manga hatten den alten unkomprimierten Sync
  // bereits gefüllt. Der neue Gesamtsnapshot muss komprimiert klar darunter
  // bleiben und sich wieder vollständig lesen lassen.
  const largeCollection = Array.from({ length: 422 }, (_, index) => ({
    id: `library-${index}`,
    title: `The Adventures of Manga Hero ${index}`,
    url: `https://reader.example.org/series/manga-hero-${index}/chapter-${index + 10}`,
    description: `A fantasy adventure manga in chapter ${index + 10} with recurring heroes and magic.`,
    currentChapter: String(index + 10),
    tags: ['Fantasy', index % 2 ? 'Adventure' : 'Isekai'],
    rating: (index % 10) + 1,
    status: index % 4 === 0 ? 'hold' : 'active',
    created: 1700000000000 + index,
    modified: 1800000000000 + index
  }));
  const compressedResult = await MangaSync.upload({
    force: true,
    data: { ...data, items: largeCollection, updatedAt: data.updatedAt + 1 }
  });
  assert.equal(compressedResult.itemCount, 422);
  assert.ok(compressedResult.usedBytes < 98000, `Komprimierter Sync belegt ${compressedResult.usedBytes} Byte`);
  assert.ok(compressedResult.compressedBytes < compressedResult.uncompressedBytes);
  const compressedRemote = await MangaSync.readRemote();
  assert.equal(compressedRemote.data.items.length, 422);
  assert.equal(compressedRemote.data.items[421].title, 'The Adventures of Manga Hero 421');

  await MangaStore.setPreferences({ language: 'de', showSupportButton: true });
  await MangaStore.setPreferences({ showSupportButton: false });
  const auditData = await MangaStore.load();
  assert.ok(auditData.logs.some((log) => log.message === 'Ko-fi-Button: Ein → Aus'));
  const auditCount = auditData.logs.length;
  await MangaStore.setPreferences({ showSupportButton: false });
  assert.equal((await MangaStore.load()).logs.length, auditCount, 'Unchanged settings must not add log entries');
  await MangaStore.setPreferences({ language: 'en', showSupportButton: true });
  assert.ok((await MangaStore.load()).logs.some((log) => log.message === 'Ko-fi button: Off → On'));

  console.log(
    `Speicher-, Lesezeichen- und Firefox-Sync-Tests erfolgreich. ` +
    `422 Manga: ${(compressedResult.usedBytes / 1024).toFixed(1)} KB Sync-Speicher.`
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
