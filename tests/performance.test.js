/* Reproducible large-collection checks. Timings are local diagnostics, not
 * hardware-independent performance assertions. Uses no real extension data. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.argv[2] });
  const results = [];
  try {
    for (const layout of ['table', 'cards']) {
      const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(({ layout }) => {
        const listeners = [];
        const items = Array.from({ length: 422 }, (_, i) => ({ id: 'item-' + i, title: 'Manga ' + i, url: 'https://example.org/manga-' + i + '/chapter-42', currentChapter: '42', tags: ['Fantasy'], rating: 4, status: 'active', modified: 1700000000000 + i }));
        const memory = { mangaRegalDataV1: { version: 20, items, settings: { theme: 'blue-dark', onboardingComplete: true, ratingScale: 10, collectionViews: { active: layout } } } };
        window.performanceReads = 0;
        window.placeholderReads = 0;
        window.emitPerformanceChange = () => listeners.forEach((listener) => listener({ mangaRegalDataV1: {} }, 'local'));
        const storage = {
          get: async (key) => {
            if (key === 'mangaRegalDataV1') performanceReads++;
            if (String(key).startsWith('mangaRegalCustomPlaceholderV1:')) placeholderReads++;
            const result = { [key]: structuredClone(memory[key]) };
            if (key === 'mangaRegalDataV1' && window.pausePerformanceRead) {
              window.pausePerformanceRead = false;
              window.performanceReadPaused = true;
              await new Promise((resolve) => setTimeout(resolve, 120));
            }
            return result;
          },
          set: async (values) => {
            Object.assign(memory, structuredClone(values));
            queueMicrotask(() => listeners.forEach((listener) => listener(Object.fromEntries(Object.keys(values).map((key) => [key, {}])), 'local')));
          }, remove: async (key) => { delete memory[key]; }
        };
        window.browser = { storage: { local: storage, sync: storage, onChanged: { addListener: (fn) => listeners.push(fn) } },
          runtime: { getManifest: () => ({ browser_specific_settings: { gecko: {} } }), getURL: (url) => url },
          commands: { getAll: async () => [] }, search: { get: async () => [] } };
      }, { layout });
      await page.goto(pathToFileURL(path.resolve(__dirname, '../dashboard/index.html')).href);
      await page.locator('[data-view="active"]').waitFor();
      const client = await page.context().newCDPSession(page);
      await client.send('Performance.enable');
      const metric = async () => Object.fromEntries((await client.send('Performance.getMetrics')).metrics.map((entry) => [entry.name, entry.value]));
      const before = await metric();
      const started = performance.now();
      await page.locator('[data-view="active"]').click();
      const target = layout === 'cards' ? '#collectionCards .manga-card' : '#collectionRows tr';
      await page.waitForFunction(({ target }) => document.querySelectorAll(target).length === 422, { target });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const after = await metric();
      const openMs = performance.now() - started;
      const blurCount = await page.locator(target).evaluateAll((nodes) => nodes.filter((node) => getComputedStyle(node).backdropFilter !== 'none').length);
      await page.locator('[data-view="admin"]').click();
      await page.evaluate(() => {
        window.themeApplications = 0;
        const original = CSSStyleDeclaration.prototype.setProperty;
        CSSStyleDeclaration.prototype.setProperty = function (...args) { if (args[0] === '--accent') themeApplications++; return original.apply(this, args); };
        performanceReads = 0;
        placeholderReads = 0;
      });
      await page.locator('#showCoversInTableSetting').click();
      await page.waitForTimeout(300);
      const counts = await page.evaluate(() => ({ reads: performanceReads, themeApplications, placeholderReads }));
      results.push({ layout, count: 422, openMs: Math.round(openMs), layoutMs: Math.round((after.LayoutDuration - before.LayoutDuration) * 1000), styleMs: Math.round((after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000), blurCount, ...counts });
      assert.deepEqual(errors, []);
      if (process.argv.includes('--assert-optimized')) {
        assert.equal(blurCount, 0, 'Repeated collection items must not allocate backdrop blur surfaces');
        assert.ok(counts.reads <= 2, 'One write plus one coalesced refresh, not duplicate refreshes');
        assert.equal(counts.themeApplications, 0, 'Unchanged theme must not rewrite presentation tokens');
        assert.equal(counts.placeholderReads, 0, 'Unrelated saves must not reread custom image data');
        await page.evaluate(() => MangaStore.saveCustomPlaceholderCover({ id: 'arcane', dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=' }));
        await page.locator('[data-placeholder-restore-image="arcane"]').waitFor();
        assert.ok(await page.evaluate(() => placeholderReads > 0), 'Artwork changes must invalidate the image cache');
        await page.evaluate(() => { window.pausePerformanceRead = true; emitPerformanceChange(); });
        await page.waitForFunction(() => window.performanceReadPaused);
        await page.evaluate(() => MangaStore.patchItem('item-0', { title: 'Latest async update' }));
        await page.waitForTimeout(250);
        await page.locator('[data-view="active"]').click();
        await page.getByText('Latest async update', { exact: true }).first().waitFor();
        await page.evaluate((layout) => {
          window.searchRenders = 0;
          new MutationObserver((records) => { searchRenders += records.length; }).observe(document.getElementById(layout === 'cards' ? 'collectionCards' : 'collectionRows'), { childList: true });
          const input = document.getElementById('searchInput');
          for (const text of ['M', 'Ma', 'Manga', 'Manga 4']) { input.value = text; input.dispatchEvent(new Event('input', { bubbles: true })); }
        }, layout);
        await page.waitForFunction(({ target }) => document.querySelectorAll(target).length === 33, { target });
        assert.ok(await page.evaluate(() => searchRenders <= 2), 'Rapid input should not rebuild the collection for every character');
      }
      await page.close();
    }
    console.log(JSON.stringify(results, null, 2));
    const destination = process.argv.find((arg) => arg.endsWith('.json'));
    if (destination) fs.writeFileSync(destination, JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
