/* Real DOM integration with isolated storage, never the user's profile. */
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.argv[2] });
  try {
    for (const scale of [5, 10]) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(({ scale }) => {
        const listeners = [];
        const memory = { mangaRegalDataV1: { version: 20, items: [
          { id: 'one', title: 'Manga A', url: 'https://example.org/a/chapter-1', rating: 5, status: 'active' },
          { id: 'two', title: 'Manga B', url: 'https://example.org/b/chapter-2', rating: 3, status: 'active' }
        ], settings: { onboardingComplete: true, language: scale === 5 ? 'en' : 'de', ratingScale: scale,
          customCategories: [{ id: 'custom-favorites', name: 'Favorites' }] } } };
        const storage = { get: async key => ({ [key]: structuredClone(memory[key]) }),
          set: async values => { Object.assign(memory, structuredClone(values)); queueMicrotask(() => listeners.forEach(fn => fn(Object.fromEntries(Object.keys(values).map(k => [k, {}])), 'local'))); },
          remove: async key => { delete memory[key]; } };
        window.browser = { storage: { local: storage, sync: storage, onChanged: { addListener: fn => listeners.push(fn) } },
          runtime: { getManifest: () => ({ browser_specific_settings: { gecko: {} } }), getURL: url => url, sendMessage: async () => ({ ok: true }) },
          commands: { getAll: async () => [] }, search: { get: async () => [] },
          bookmarks: { get: async () => [], getTree: async () => [{ id: 'root', children: [{ id: 'folder', title: 'Import folder', children: [
            { id: 'bookmark-new', title: 'Imported Chapter 8', url: 'https://example.org/new/chapter-8' }
          ] }] }] } };
      }, { scale });
      await page.goto(pathToFileURL(path.resolve(__dirname, '../dashboard/index.html')).href + '?view=admin');
      await page.locator('[data-toggle-category="active"]').waitFor();
      assert.equal(await page.locator('[data-rating-score]').count(), scale * 6);
      for (const view of ['active', 'custom-favorites']) {
        await page.locator(`[data-toggle-category="${view}"]`).click();
        await page.waitForFunction(view => !document.querySelector(`#categoryNavItems [data-view="${view}"]`), view);
        assert.equal(await page.locator(`[data-toggle-category="${view}"]`).getAttribute('aria-pressed'), 'false');
      }
      assert.equal((await page.evaluate(() => MangaStore.load())).items.length, 2);
      const aligned = await page.locator('[data-order-view="active"]').evaluate(row => {
        const field = row.querySelector('input').getBoundingClientRect();
        const hide = row.querySelector('[data-toggle-category]').getBoundingClientRect();
        const rating = row.querySelector('[data-rating-picker]').getBoundingClientRect();
        const layout = row.querySelector('select').getBoundingClientRect();
        return field.right <= hide.left && hide.right <= rating.left && rating.right <= layout.left && Math.abs(hide.top - layout.top) < 3;
      });
      assert.ok(aligned, 'Visibility button must fit between name and layout');
      await page.locator('[data-rating-picker="custom-favorites"] summary').click();
      page.once('dialog', dialog => dialog.dismiss());
      await page.locator('[data-rating-target="custom-favorites"][data-rating-score="5"]').click();
      assert.deepEqual((await page.evaluate(() => MangaStore.load())).settings.ratingCategoryRules, {});
      await page.locator('[data-rating-picker="custom-favorites"] summary').click();
      page.once('dialog', dialog => dialog.accept());
      await page.locator('[data-rating-target="custom-favorites"][data-rating-score="5"]').click();
      await page.waitForFunction(async () => (await MangaStore.load()).items.find(i => i.id === 'one').status === 'custom-favorites');
      await page.waitForFunction(() => document.querySelector('[data-rating-picker="custom-favorites"] summary').textContent.includes('5'));
      await page.locator('[data-rating-picker="hold"] summary').click();
      page.once('dialog', dialog => dialog.accept());
      await page.locator('[data-rating-target="hold"][data-rating-score="3"]').click();
      await page.waitForFunction(async () => (await MangaStore.load()).items.find(i => i.id === 'two').status === 'hold');
      assert.equal((await page.evaluate(() => MangaStore.load())).items.find(i => i.id === 'two').status, 'hold');
      // A score has one owner, and a category can own several scores.
      await page.locator('[data-rating-picker="active"] summary').click();
      page.once('dialog', dialog => dialog.accept());
      await page.locator('[data-rating-target="active"][data-rating-score="5"]').click();
      await page.waitForFunction(async () => (await MangaStore.load()).items.find(i => i.id === 'one').status === 'active');
      await page.locator('[data-rating-picker="custom-favorites"] summary').click();
      page.once('dialog', dialog => dialog.accept());
      await page.locator('[data-rating-target="custom-favorites"][data-rating-score="5"]').click();
      await page.waitForFunction(async () => (await MangaStore.load()).settings.ratingCategoryRules['5'] === 'custom-favorites');
      await page.locator('[data-rating-picker="custom-favorites"] summary').click();
      page.once('dialog', dialog => dialog.accept());
      await page.locator('[data-rating-target="custom-favorites"][data-rating-score="4"]').click();
      await page.waitForFunction(async () => (await MangaStore.load()).settings.ratingCategoryRules['4'] === 'custom-favorites');
      assert.equal((await page.evaluate(() => MangaStore.load())).settings.ratingCategoryRules['5'], 'custom-favorites');
      await page.locator('[data-view="all"]').click();
      const oldOrder = (await page.evaluate(() => MangaStore.load())).settings.categoryOrder;
      await page.locator('[data-view="all"]').dragTo(page.locator('[data-view="reading"]'), { targetPosition: { x: 3, y: 10 } });
      await page.waitForFunction(async () => (await MangaStore.load()).settings.categoryOrder[0] === 'all');
      const newSettings = (await page.evaluate(() => MangaStore.load())).settings;
      assert.notDeepEqual(newSettings.categoryOrder, oldOrder);
      assert.deepEqual(newSettings.hiddenCategories, ['active', 'custom-favorites']);

      for (const mode of ['folders', 'manual', 'keyword']) {
        await page.evaluate(async mode => { await MangaStore.setPreferences({ bookmarkImportMode: mode }); }, mode);
        await page.locator('#syncBookmarks').click();
        await page.locator('#bookmarkDialog').waitFor();
        await page.selectOption('#importCategory', 'completed');
        await page.selectOption('#importRating', '2');
        if (mode === 'folders') {
          await page.check('[data-folder-check][value="folder"]');
          await page.selectOption('[data-folder-rating="folder"]', '5');
          await page.selectOption('[data-folder-status="folder"]', 'dropped');
        } else await page.check('[data-bookmark-check][value="bookmark-new"]');
        await page.locator('#submitBookmarkImport').click();
        await page.waitForFunction(() => !document.getElementById('bookmarkDialog').open);
        const imported = (await page.evaluate(() => MangaStore.load())).items.find(i => i.bookmarkId === 'bookmark-new');
        assert.equal(imported.status, mode === 'folders' ? 'custom-favorites' : 'completed');
      }
      await page.locator('[data-view="admin"]').click();
      await page.setViewportSize({ width: 600, height: 900 });
      await page.locator('#categoryOrderList').scrollIntoViewIfNeeded();
      assert.ok(await page.locator('[data-order-view="active"]').evaluate(row => row.scrollWidth <= row.clientWidth + 1), 'Mobile editor must not overflow');
      if (scale === 5) {
        const output = path.resolve(__dirname, '../build/category-preview');
        fs.mkdirSync(output, { recursive: true });
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.locator('#categoryOrderList').screenshot({ path: path.join(output, 'category-editor.png') });
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('5/10-star UI: hide defaults/custom, rule confirmation, tab drag, all import modes and responsive alignment verified.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
