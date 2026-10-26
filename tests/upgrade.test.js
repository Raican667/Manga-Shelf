/* Upgrade contract: a new script context must reuse the existing storage.
 * Fixtures model the v0.20.9 schema (DATA_VERSION 20, before settings.theme).
 * No Git checkout or browser profile is required to run this regression test. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../shared/store.js'), 'utf8');
const key = 'mangaRegalDataV1';
const clone = (value) => JSON.parse(JSON.stringify(value));

function start(memory) {
  const writes = [];
  const context = vm.createContext({ console, URL, crypto: require('node:crypto').webcrypto,
    browser: { storage: { local: {
      async get(name) { return clone({ [name]: memory[name] }); },
      async set(values) { writes.push(clone(values)); Object.assign(memory, clone(values)); },
      async remove() { throw new Error('Upgrade must not remove stored data'); }
    } } }
  });
  vm.runInContext(source, context, { filename: 'shared/store.js' });
  return { store: context.MangaStore, writes };
}

(async () => {
  for (const colorMode of ['light', 'dark']) {
    const { store: seed } = start({});
    const data = clone(await seed.load());
    Object.assign(data.settings, {
      language: 'de', colorMode, ratingScale: 10, readingLimit: 9,
      collectionView: 'cards',
      collectionViews: { reading: 'table', active: 'cards', hold: 'table',
        dropped: 'cards', completed: 'table', all: 'table', 'custom-later': 'table' },
      categoryNames: { reading: 'Lesestapel', active: 'Bibliothek', hold: 'Pause',
        dropped: 'Archiv', completed: 'Fertig', all: 'Alles' },
      customCategories: [{ id: 'custom-later', name: 'Später' }],
      categoryOrder: ['custom-later', 'all', 'completed', 'active', 'reading', 'hold', 'dropped'],
      defaultNewStatus: 'custom-later',
      customTagPresets: ['Eigener Tag'], hiddenTagPresets: ['Horror'],
      tagPresets: ['Fantasy', 'Eigener Tag'], placeholderCoverByTag: { Fantasy: 'forest' },
      placeholderCoversEnabled: false, chapterDetectionEnabled: false,
      showCoversInTable: false, showOnboardingOnStartup: false, onboardingComplete: true,
      offerRereadOnUpdate: false, autoTagRereads: false, showBookmarkImportButton: false,
      limitLogs: false, bookmarkImportMode: 'manual', bookmarkImportKeyword: '',
      customSearchEngines: [{ id: 'engine-reader', name: 'Reader', urlTemplate: 'https://example.org/?q={query}' }],
      searchEngine: 'custom:engine-reader', syncEnabled: true
    });
    delete data.settings.theme; // Older releases store only the light/dark choice.
    delete data.settings.hiddenCategories;
    delete data.settings.ratingCategoryRules;
    data.items = ['reading', 'active', 'hold', 'dropped', 'completed', 'custom-later'].map((status, i) =>
      clone(seed.normalizeItem({ id: `upgrade-${i}`, title: `Manga ${i}`, status,
        url: `https://example.org/series-${i}/chapter-150`, currentChapter: '150',
        chapterManual: true, chapterDetectionDisabled: true, coverDetectionDisabled: true,
        rating: 8, tags: ['Fantasy', 'Eigener Tag'], bookmarkId: `bookmark-${i}` })));
    data.logs = [{ id: 'log-1', time: 1, level: 'info', area: 'Test', message: 'Keep me', details: '' }];
    data.updatedAt = 123456;
    const memory = { [key]: data, 'mangaRegalCoverV1:upgrade-0': { dataUrl: 'local-cover-bytes' },
      'mangaRegalCustomPlaceholderV1:forest': { dataUrl: 'custom-placeholder-bytes' },
      unrelatedDevicePreference: { enabled: false } };
    const before = clone(memory);
    const expectedSettings = { ...clone(data.settings), theme: colorMode, hiddenCategories: [], ratingCategoryRules: {} };
    const first = start(memory);
    const loaded = clone(await first.store.load());
    assert.deepEqual(loaded.settings, expectedSettings, 'Every explicit legacy setting must survive');
    assert.deepEqual(loaded.items, before[key].items, 'Manga progress, categories, ratings and flags must survive');
    assert.deepEqual(loaded.logs, data.logs);
    assert.equal(first.writes.length, 0, 'Current schema reads must not rewrite storage');
    assert.deepEqual(memory, before, 'Local images and unrelated storage must remain byte-for-byte unchanged');

    // A normal preference write must persist the migration without resetting
    // other choices; another VM simulates restarting after the extension update.
    await first.store.setPreferences({ theme: 'blue-light', hiddenCategories: ['hold'], ratingCategoryRules: { 1: 'dropped' } });
    const second = start(memory);
    const restarted = clone(await second.store.load());
    assert.deepEqual(restarted.settings, { ...expectedSettings, theme: 'blue-light', colorMode: 'light',
      hiddenCategories: ['hold'], ratingCategoryRules: { 1: 'dropped' } });
    assert.deepEqual(restarted.items, before[key].items);
    assert.deepEqual(memory['mangaRegalCoverV1:upgrade-0'], before['mangaRegalCoverV1:upgrade-0']);
    assert.deepEqual(memory['mangaRegalCustomPlaceholderV1:forest'], before['mangaRegalCustomPlaceholderV1:forest']);
    assert.equal(second.writes.length, 0);

    // Old schema migration writes once, then becomes idempotent. Missing
    // per-category views inherit the legacy value; explicit tables do not.
    memory[key].version = 19;
    delete memory[key].settings.collectionViews.hold;
    const migration = start(memory);
    const migrated = clone(await migration.store.load());
    assert.equal(migrated.settings.collectionViews.hold, 'cards');
    assert.equal(migrated.settings.collectionViews.reading, 'table');
    assert.equal(migrated.settings.bookmarkImportKeyword, '');
    assert.equal(migration.writes.length, 1);
    assert.deepEqual(clone(await start(memory).store.load()), migrated);
  }
  const { store } = start({});
  assert.equal((await store.load()).settings.bookmarkImportKeyword, 'chapter', 'Missing keyword still gets the default');
  console.log('Upgrade/restart: all saved preferences, manga, logs and separate image keys preserved.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
