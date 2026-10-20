/* Theme identifiers are persisted metadata; migration and validation belong
 * to the storage boundary, independently of the DOM presentation module. */
'use strict';
const assert = require('node:assert/strict');
const memory = {};
global.browser = { storage: { local: {
  get: async (key) => ({ [key]: structuredClone(memory[key]) }),
  set: async (values) => Object.assign(memory, structuredClone(values)),
  remove: async (key) => { delete memory[key]; }
} } };
require('../shared/store.js');
require('../shared/themes.js');
require('../shared/sync.js');
(async () => {
  assert.deepEqual(MangaThemes.ids, ['dark', 'light', 'coral-dark', 'coral-light', 'blue-light', 'blue-dark']);
  memory[MangaStore.STORAGE_KEY] = { items: [], settings: { colorMode: 'light' } };
  assert.equal((await MangaStore.load()).settings.theme, 'light', 'Legacy light preference must survive');
  for (const theme of MangaThemes.ids) {
    await MangaStore.setPreferences({ theme });
    const data = await MangaStore.load();
    assert.equal(data.settings.theme, theme);
    assert.equal(data.settings.colorMode, theme.endsWith('light') ? 'light' : 'dark');
    const root = { dataset: {}, style: { setProperty(key, value) { this[key] = value; } } };
    MangaThemes.apply(root, data.settings);
    assert.equal(root.dataset.mangaTheme, theme);
    assert.equal(root.dataset.theme, data.settings.colorMode);
    assert.equal(root.style.colorScheme, data.settings.colorMode);
    const compressed = await MangaSync.prepare(data);
    assert.equal((await MangaSync.decompressSnapshot(compressed.payload)).s.theme, theme, 'Theme must survive the sync snapshot');
    assert.match(root.style['--accent'], /^#[0-9a-f]{6}$/);
    const backup = await MangaStore.exportData();
    await MangaStore.importData(backup);
    assert.equal((await MangaStore.load()).settings.theme, theme, 'Theme must survive a JSON round trip');
  }
  await MangaStore.setPreferences({ theme: '<img src=x>' });
  assert.equal((await MangaStore.load()).settings.theme, 'dark');
  await MangaStore.setPreferences({ theme: 'blue-dark' });
  await MangaStore.setPreferences({ colorMode: 'light' });
  assert.equal((await MangaStore.load()).settings.theme, 'light', 'Old clients can still choose classic light');
  assert.equal(MangaThemes.resolve({ theme: 'unknown', colorMode: 'light' }), 'light');
  console.log('Six themes: stable identifiers, legacy migration, validation, scoped tokens and backup round trips verified.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
