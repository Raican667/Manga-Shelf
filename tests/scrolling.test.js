/* Native mouse-wheel regression in real Chromium with isolated local data.
 * Covers are real bundled image bytes, so lazy loading/decoding is exercised. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const cover = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(root, 'assets/placeholders/forest-shrine.jpg')).toString('base64');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.argv[2] });
  try {
    for (const layout of ['table', 'cards']) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(({ layout, cover }) => {
        const listeners = [];
        const memory = { mangaRegalDataV1: { version: 20,
          items: Array.from({ length: 422 }, (_, i) => ({ id: 'scroll-' + i, title: 'Manga ' + i, url: 'https://example.org/manga-' + i, currentChapter: '42', rating: 4, tags: ['Fantasy'], status: 'active', modified: 1700000000000 + i })),
          settings: { theme: 'blue-dark', onboardingComplete: true, collectionViews: { active: layout } } } };
        const storage = { get: async (key) => ({ [key]: String(key).startsWith('mangaRegalCoverV1:') ? cover : structuredClone(memory[key]) }),
          set: async (values) => { Object.assign(memory, structuredClone(values)); queueMicrotask(() => listeners.forEach((fn) => fn(Object.fromEntries(Object.keys(values).map((key) => [key, {}])), 'local'))); },
          remove: async (key) => { delete memory[key]; } };
        window.browser = { storage: { local: storage, sync: storage, onChanged: { addListener: (fn) => listeners.push(fn) } },
          runtime: { getManifest: () => ({ browser_specific_settings: { gecko: {} } }), getURL: (url) => url }, commands: { getAll: async () => [] }, search: { get: async () => [] } };
        window.localDecodes = 0;
        const nativeFetch = window.fetch.bind(window);
        window.fetch = (...args) => { if (String(args[0]).startsWith('data:image/')) localDecodes++; return nativeFetch(...args); };
      }, { layout, cover });
      await page.goto(pathToFileURL(path.join(root, 'dashboard/index.html')).href);
      await page.locator('[data-view="active"]').click();
      await page.waitForFunction(() => [...document.querySelectorAll('.cover-image')].some((image) => image.complete && image.naturalWidth > 0));
      const dimensions = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, width: document.documentElement.clientWidth }));
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundAttachment), 'scroll, scroll, scroll');
      await page.evaluate(() => window.scrollTo(0, 800));
      await page.mouse.move(620, 420);
      let previous = await page.evaluate(() => scrollY);
      const initial = previous;
      for (let step = 0; step < 8; step++) {
        await page.mouse.wheel(0, 260);
        await page.waitForTimeout(50);
        const current = await page.evaluate(() => scrollY);
        assert.ok(current >= previous - 1, 'Forward wheel input must not reverse page scrolling');
        previous = current;
      }
      assert.ok(previous > initial + 1000, 'Wheel scroll must reach the document, not get trapped in the table');
      const after = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, width: document.documentElement.clientWidth }));
      assert.deepEqual(after, dimensions, 'Lazy-loaded covers must not change page dimensions');
      assert.ok(await page.evaluate(() => localDecodes > 0), 'Exercise native data-URL decoding');
      await page.locator('[data-view="admin"]').click();
      await page.evaluate(() => window.scrollTo(0, 1200));
      const settingsPosition = await page.evaluate(() => scrollY);
      await page.evaluate(() => MangaStore.setPreferences({ autoTagRereads: false }));
      await page.waitForTimeout(200);
      assert.ok(Math.abs(await page.evaluate(() => scrollY) - settingsPosition) <= 1, 'Autosave must preserve the settings scroll position');
      const width = await page.evaluate(() => document.documentElement.clientWidth);
      await page.evaluate(() => MangaStore.setPreferences({ theme: 'coral-light' }));
      await page.waitForFunction(() => document.documentElement.dataset.mangaTheme === 'coral-light');
      assert.equal(await page.evaluate(() => document.documentElement.clientWidth), width, 'Theme changes must not shift the scrollbar gutter');
      assert.deepEqual(errors, []);
      console.log(layout + ': native scrolling, lazy covers, stable page size, settings autosave and theme gutter verified.');
      await page.close();
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
