/* Optional real Chromium UI test with isolated extension API/storage fixtures. */
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.argv[2] });
  try {
    for (const language of ['en', 'de']) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(({ language }) => {
        const memory = { mangaRegalDataV1: { items: [{ id: 'saved', title: 'Manga', url: 'https://example.org/chapter-2', cover: 'https://cdn.example.org/image.png?token=hidden', status: 'active' }],
          settings: { language, onboardingComplete: true } } };
        window.coverRequests = [];
        window.coverMessages = [];
        window.coverDecision = false;
        const storage = { get: async (key) => ({ [key]: memory[key] }), set: async (values) => Object.assign(memory, values), remove: async (key) => { delete memory[key]; } };
        window.browser = {
          storage: { local: storage, sync: storage, onChanged: { addListener() {} } },
          runtime: { getManifest: () => ({}), getURL: (file) => file,
            sendMessage: async (request) => { window.coverMessages.push(request); return { ok: true, status: 'downloaded' }; } },
          permissions: { contains: async () => false, request: async (request) => {
            if (!navigator.userActivation.isActive) throw new Error('Not a direct user gesture');
            window.coverRequests.push(request); return window.coverDecision;
          } },
          commands: { getAll: async () => [] }, search: { get: async () => [] }
        };
      }, { language });
      await page.goto(pathToFileURL(path.resolve(__dirname, '../dashboard/cover-permissions.html')).href + '?item=saved');
      const allow = page.locator('#allow');
      await allow.waitFor({ state: 'visible' });
      await page.waitForFunction(() => !document.getElementById('allow').disabled);
      assert.equal(await page.locator('#origin').textContent(), 'cdn.example.org');
      assert.equal((await page.evaluate(() => coverRequests)).length, 0);
      await allow.click();
      await page.waitForFunction(() => !document.getElementById('allow').disabled);
      assert.deepEqual(await page.evaluate(() => coverRequests[0].origins), ['https://cdn.example.org/*']);
      assert.equal((await page.evaluate(() => coverMessages)).length, 0);
      assert.match(await page.locator('#status').textContent(), language === 'de' ? /bleibt/ : /remains saved/);
      await page.evaluate(() => { coverDecision = true; });
      await allow.click();
      await page.waitForFunction(() => document.getElementById('status').textContent.includes('lokal gespeichert') || document.getElementById('status').textContent.includes('stored locally'));
      assert.equal((await page.evaluate(() => coverMessages[0])).itemId, 'saved');
      assert.deepEqual(errors, []);
      // The collection must save even without host access and offer a separate
      // explicit permission action instead of losing data or creating duplicates.
      await page.goto(pathToFileURL(path.resolve(__dirname, '../dashboard/index.html')).href);
      await page.locator('#addEntry').click();
      await page.locator('#titleInput').fill('New manga');
      await page.locator('#urlInput').fill('https://example.org/new-manga');
      await page.locator('#coverInput').fill('https://cdn.example.org/new.png');
      await page.evaluate(() => {
        const send = browser.runtime.sendMessage;
        browser.runtime.sendMessage = async (request) => request.type === 'manga-regal:cache-cover'
          ? { ok: false, status: 'permission-required' } : send(request);
      });
      await page.locator('#entryForm button[type=submit]').click();
      await page.waitForFunction(() => !!document.getElementById('editId').value);
      assert.equal(await page.locator('#coverAccessButton').isVisible(), true);
      assert.match(await page.locator('#coverPermissionHint').textContent(), language === 'de' ? /Manga gespeichert/ : /Manga saved/);
      const count = (await page.evaluate(() => MangaStore.load())).items.length;
      await page.locator('#entryForm button[type=submit]').click();
      await page.waitForTimeout(200);
      assert.equal((await page.evaluate(() => MangaStore.load())).items.length, count);
      await page.locator('#coverAccessButton').click();
      await page.waitForFunction(() => coverMessages.some((message) => message.type === 'manga-regal:request-cover-access'));
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('Chrome cover UI: English/German, exact-domain consent, decline/grant, saved manga and retry without duplicates verified.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
