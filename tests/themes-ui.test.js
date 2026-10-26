/* Actual Chromium rendering with isolated storage: never touches user data.
 * Captures can be reviewed from build/theme-preview after this optional test. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'build/theme-preview');
fs.mkdirSync(output, { recursive: true });
const ids = ['dark', 'light', 'coral-dark', 'coral-light', 'blue-light', 'blue-dark'];
function installFixture(settings) {
  const listeners = [];
  const memory = { mangaRegalDataV1: { items: [{ id: 'demo', title: 'Moonlit Journey', url: 'https://manga.example/chapter-42', currentChapter: '42', status: 'reading', tags: ['Fantasy', 'Adventure', 'Re-Read'], rating: 4 }], settings: { language: 'en', onboardingComplete: true, ...settings } } };
  const storage = {
    get: async (key) => ({ [key]: memory[key] }),
    set: async (values) => { Object.assign(memory, values); listeners.forEach((listener) => listener(Object.fromEntries(Object.keys(values).map((key) => [key, {}])), 'local')); },
    remove: async (key) => { delete memory[key]; }
  };
  window.browser = {
    storage: { local: storage, sync: storage, onChanged: { addListener: (fn) => listeners.push(fn) } },
    runtime: { getManifest: () => ({ browser_specific_settings: { gecko: {} } }), getURL: (url) => new URL('../' + url, location.href).href, sendMessage: async () => ({ ok: true }), onMessage: { addListener: (handler) => { window.themeOverlayHandler = handler; } } },
    commands: { getAll: async () => [] }, search: { get: async () => [] }
  };
}
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.argv[2] });
  try {
    for (const theme of ids) {
      const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(pathToFileURL(path.join(root, 'tests/overlay-preview.html')).href + '?demo=1&theme=' + theme);
      await page.locator('.mr-panel').waitFor();
      await page.evaluate(() => {
        const shadow = document.getElementById('manga-regal-host').shadowRoot;
        shadow.getElementById('mr-entry-url').value = 'https://manga.example/chapter-42';
        shadow.getElementById('mr-entry-cover-url').value = 'https://manga.example/cover.jpg';
        shadow.getElementById('mr-entry-url').dispatchEvent(new Event('input', { bubbles: true }));
      });
      const glass = !['dark', 'light'].includes(theme);
      assert.equal(await page.locator('#manga-regal-overlay').getAttribute('data-manga-theme'), theme);
      assert.equal(await page.locator('#mr-quick-summary').isVisible(), glass);
      // Visited page remains untouched by token injection.
      assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--accent')), '');
      if (glass) {
        assert.equal(await page.locator('#mr-entry-details').getAttribute('open'), null);
        await page.locator('#mr-quick-cover').evaluate((image) => image.decode());
        await page.locator('.mr-panel').screenshot({ animations: 'disabled', path: path.join(output, theme + '-closed.png') });
        await page.locator('#mr-entry-details > summary').click();
        assert.equal(await page.locator('#mr-entry-title').isVisible(), true);
        const expected = theme.startsWith('blue') ? (theme === 'blue-light' ? 'rgb(8, 125, 240)' : 'rgb(22, 137, 255)') : 'rgb(255, 103, 75)';
        assert.equal(await page.locator('#mr-quick-save').evaluate((button) => getComputedStyle(button).backgroundColor), expected);
      }
      await page.locator('#mr-choose-tags').click();
      await page.locator('#mr-tag-options label').filter({ hasText: 'Re-Read' }).locator('input').check();
      await page.locator('#mr-finish-tags').click();
      assert.equal(await page.locator('#mr-selected-tags .mr-reread-tag').count(), 1);
      await page.locator('#mr-entry-title').fill('Moonlit Journey');
      await page.locator('.mr-panel').screenshot({ animations: 'disabled', path: path.join(output, theme + '-open.png') });
      assert.equal(await page.locator('.mr-panel').evaluate((panel) => panel.scrollWidth <= panel.clientWidth + 1), true, 'No horizontal popup overflow');
      assert.deepEqual(errors, []);
      await page.close();

      if (glass) {
        const mobile = await browser.newPage({ viewport: { width: 340, height: 960 } });
        mobile.on('pageerror', (error) => errors.push(error.message));
        await mobile.goto(pathToFileURL(path.join(root, 'tests/overlay-preview.html')).href + '?demo=1&scale=10&theme=' + theme);
        await mobile.locator('#mr-quick-summary').waitFor();
        await mobile.locator('#mr-entry-details>summary').click();
        assert.equal(await mobile.locator('#mr-stars button').count(), 10);
        assert.equal(await mobile.locator('.mr-panel').evaluate((panel) => panel.scrollWidth <= panel.clientWidth + 1), true);
        await mobile.locator('.mr-panel').screenshot({ animations: 'disabled', path: path.join(output, theme + '-mobile-10.png') });
        await mobile.close();
      }
      const dashboard = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      dashboard.on('pageerror', (error) => errors.push(error.message));
      await dashboard.addInitScript(installFixture, { theme: 'dark', ratingScale: 5 });
      await dashboard.goto(pathToFileURL(path.join(root, 'dashboard/index.html')).href);
      await dashboard.locator('[data-view="admin"]').click();
      assert.equal(await dashboard.locator('#colorModeSetting').evaluate((element) => element.tagName), 'SELECT');
      assert.equal(await dashboard.locator('#colorModeSetting option').count(), 6);
      await dashboard.locator('#colorModeSetting').selectOption(theme);
      await dashboard.waitForFunction((id) => document.documentElement.dataset.mangaTheme === id, theme);
      assert.equal((await dashboard.evaluate(() => MangaStore.load())).settings.theme, theme);
      await dashboard.screenshot({ animations: 'disabled', path: path.join(output, theme + '-settings.png') });
      await dashboard.locator('[data-view="reading"]').click();
      await dashboard.screenshot({ animations: 'disabled', path: path.join(output, theme + '-collection.png') });
      if (glass) {
        await dashboard.addStyleTag({ path: path.join(root, 'content/overlay.css') });
        await dashboard.addScriptTag({ path: path.join(root, 'content/overlay.js') });
        await dashboard.evaluate(() => new Promise((resolve) => themeOverlayHandler({ type: 'manga-regal:toggle-overlay' }, {}, resolve)));
        await dashboard.locator('#mr-entry-details>summary').click();
        await dashboard.locator('#mr-entry-title').fill('Local Theme Save Test');
        await dashboard.locator('#mr-entry-url').fill('https://example.org/local-theme-save/chapter-7');
        await dashboard.locator('#mr-entry-url').press('Tab');
        await dashboard.locator('#mr-entry-chapter').fill('7');
        await dashboard.locator('#mr-entry-cover-url').fill('');
        await dashboard.locator('#mr-choose-tags').click();
        await dashboard.locator('#mr-tag-options label').filter({ hasText: /^Fantasy$/ }).locator('input').check();
        await dashboard.locator('#mr-finish-tags').click();
        await dashboard.locator('#mr-entry-details>summary').click();
        await dashboard.locator('#mr-quick-save').click();
        await dashboard.waitForFunction(async () => (await MangaStore.load()).items.some((item) => item.title === 'Local Theme Save Test'));
        const saved = (await dashboard.evaluate(() => MangaStore.load())).items.find((item) => item.title === 'Local Theme Save Test');
        assert.equal(saved.currentChapter, '7');
        assert.ok(saved.tags.includes('Fantasy'));
        assert.equal(await dashboard.locator('#mr-entry-details').getAttribute('open'), null, 'Quick save must work while details are closed');
      }
      await dashboard.reload();
      await dashboard.waitForFunction(() => !!document.documentElement.dataset.mangaTheme);
      // The test fixture resets on navigation. Check normalized saved data by
      // opening help with a copy of its actual preference, not a second theme API.
      await dashboard.close();
      for (const guide of ['index.html', 'index.en.html', 'settings.html', 'settings.en.html']) {
        const help = await browser.newPage({ viewport: { width: 1200, height: 850 } });
        help.on('pageerror', (error) => errors.push(error.message));
        await help.addInitScript(installFixture, { theme });
        await help.goto(pathToFileURL(path.join(root, 'help', guide)).href);
        await help.waitForFunction((id) => document.documentElement.dataset.mangaTheme === id, theme);
        if (guide === 'index.en.html') await help.screenshot({ animations: 'disabled', path: path.join(output, theme + '-help.png') });
        await help.close();
      }
      assert.deepEqual(errors, []);
    }
    console.log('Six themes rendered: classic/glass popup, tags, settings dropdown, collection and all four help pages; captures saved in build/theme-preview.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
