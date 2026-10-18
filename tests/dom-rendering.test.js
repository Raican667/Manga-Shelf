/* Real Chromium rendering with isolated browser API/storage fixtures.
 * Markup-shaped data must remain literal text through every renderer. */
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.argv[2] });
  try {
    for (const scale of [5, 10]) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(({ scale }) => {
        const label = '</option><img data-injected-probe>';
        const title = 'Title <img data-injected-probe> "&';
        const memory = { mangaRegalDataV1: { items: [{ id: 'probe', title, url: 'https://example.org/chapter-2', currentChapter: '2', tags: [label], status: 'reading', rating: 3 }],
          customTags: [label], logs: [{ id: 'log', time: 1700000000000, level: 'info', area: label, message: title, details: label }],
          settings: { onboardingComplete: true, language: scale === 5 ? 'en' : 'de', colorMode: scale === 5 ? 'dark' : 'light', ratingScale: scale,
            categoryNames: { reading: label }, customTagPresets: [label], tagPresets: [label],
            customSearchEngines: [{ id: 'engine-probe', name: label, urlTemplate: 'https://example.org/?q={query}' }] } } };
        const listeners = [];
        const storage = { get: async (key) => ({ [key]: memory[key] }), set: async (values) => Object.assign(memory, values), remove: async () => {} };
        window.reloadFixture = () => listeners.forEach((callback) => callback({ mangaRegalDataV1: {} }, 'local'));
        window.browser = { storage: { local: storage, sync: storage, onChanged: { addListener(callback) { listeners.push(callback); } } },
          runtime: { getManifest: () => ({ browser_specific_settings: { gecko: {} } }), getURL: (url) => url, sendMessage: async () => ({ ok: true }) },
          commands: { getAll: async () => [] }, search: { get: async () => [{ name: label, isDefault: true }] },
          bookmarks: { get: async () => [], getTree: async () => [{ id: '0', children: [{ id: 'folder', title: label, children: [{ id: 'bookmark', title, url: 'https://example.org/chapter-2' }] }] }] } };
      }, { scale });
      await page.goto(pathToFileURL(path.resolve(__dirname, '../dashboard/index.html')).href);
      await page.locator('#collectionRows tr .row-title-link').waitFor();
      const label = '</option><img data-injected-probe>';
      assert.equal(await page.locator('.row-title-link').textContent(), 'Title <img data-injected-probe> "&');
      assert.equal(await page.locator('#collectionRows .star').count(), scale);
      assert.ok((await page.locator('#collectionRows .status-select').textContent()).includes(label));
      assert.equal(await page.locator('[data-injected-probe]').count(), 0);
      await page.locator('[data-view="admin"]').click();
      assert.ok((await page.locator('#logRows').textContent()).includes(label));
      assert.ok((await page.locator('#customSearchEngineList').textContent()).includes(label));
      assert.equal(await page.locator('[data-injected-probe]').count(), 0);
      // Exercise card rendering after a real settings write and storage event.
      await page.evaluate(async () => { await MangaStore.setPreferences({ collectionViews: { reading: 'cards' } }); reloadFixture(); });
      await page.locator('[data-view="reading"]').click();
      await page.locator('#collectionCards .card-title').waitFor();
      assert.ok((await page.locator('#collectionCards').textContent()).includes(label));
      await page.locator('#syncBookmarks').click();
      await page.locator('#bookmarkDialog').waitFor();
      assert.ok((await page.locator('#bookmarkFolderList').textContent()).includes(label));
      assert.equal(await page.locator('[data-injected-probe]').count(), 0);
      await page.locator('#cancelBookmarkDialog').click();
      await page.evaluate(async () => { await MangaStore.setPreferences({ bookmarkImportMode: 'manual' }); reloadFixture(); });
      await page.locator('#syncBookmarks').click();
      await page.locator('.bookmark-option').waitFor();
      assert.equal(await page.locator('[data-injected-probe]').count(), 0);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('DOM rendering: hostile text, table/cards, settings, logs, bookmark folders/manual import and 5/10 stars verified.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
