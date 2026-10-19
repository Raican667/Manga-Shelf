/* Optional Chromium UI regression, using isolated mock extension storage. */
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.argv[2] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const memory = { mangaRegalDataV1: { items: [], customTags: [], settings: { onboardingComplete: true, language: 'en', tagPresets: ['Action', 'Re-Read'] } } };
      const storage = { get: async (key) => ({ [key]: memory[key] }), set: async (values) => Object.assign(memory, values), remove: async () => {} };
      window.browser = { storage: { local: storage, sync: storage, onChanged: { addListener() {} } }, runtime: { getManifest: () => ({ browser_specific_settings: { gecko: {} } }), getURL: (url) => url, sendMessage: async () => ({ ok: true }) }, commands: { getAll: async () => [] }, search: { get: async () => [] } };
    });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../dashboard/index.html')).href);
    await page.locator('#addEntry').click();
    assert.equal(await page.locator('#supportButton, #showSupportButtonSetting').count(), 0);
    assert.equal(await page.locator('#tagsInput, #newTagsInput').count(), 0);
    await page.locator('#chooseEntryTags').click();
    await page.locator('.tag-choice').filter({ hasText: 'Action' }).locator('input').check();
    await page.locator('#cancelTagEditor').click();
    assert.equal(await page.locator('#entrySelectedTags').isVisible(), false);
    await page.locator('#chooseEntryTags').click();
    await page.locator('.tag-choice.reread-tag input').check();
    await page.locator('#tagEditorForm button[type=submit]').click();
    assert.equal(await page.locator('#entrySelectedTags .reread-tag').textContent(), 'Re-Read');
    assert.equal((await page.evaluate(() => MangaStore.load())).items.length, 0);
    await page.locator('#titleInput').fill('Test manga');
    await page.locator('#urlInput').fill('https://example.org/manga');
    await page.locator('#entryForm button[type=submit]').click();
    await page.waitForFunction(async () => (await MangaStore.load()).items.length === 1);
    assert.deepEqual((await page.evaluate(() => MangaStore.load())).items[0].tags, ['Re-Read']);
    await page.locator('[data-view="admin"]').click();
    assert.equal(await page.locator('#allCoverAccessSetting').isVisible(), false, 'Chrome host control must not appear in Firefox');
    assert.equal(await page.locator('#supportButton, #showSupportButtonSetting').count(), 0);
    assert.deepEqual(errors, []);
    console.log('Dashboard tags: no free text, Cancel rollback, green Re-Read and deferred persistence verified.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
