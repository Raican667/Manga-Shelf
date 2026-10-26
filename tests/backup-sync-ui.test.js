'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.argv[2] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const local = { mangaRegalDataV1: { version: 20, items: [], settings: { onboardingComplete: true, language: 'en' } } }, remote = {}, listeners = [];
      window.fixtureLocal = local; window.fixtureFiles = []; window.allowDownloads = false;
      const area = (source, notify) => ({ get: async keys => keys == null ? structuredClone(source)
        : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => key in source).map(key => [key, structuredClone(source[key])])),
      set: async values => { Object.assign(source, structuredClone(values)); if (notify) queueMicrotask(() => listeners.forEach(fn => fn(Object.fromEntries(Object.keys(values).map(key => [key, {}])), 'local'))); },
      remove: async keys => { for (const key of Array.isArray(keys) ? keys : [keys]) delete source[key]; },
      getBytesInUse: async () => JSON.stringify(source).length });
      const alarms = new Map();
      window.browser = { runtime: { id: 'manga-shelf@local.example', getManifest: () => ({ browser_specific_settings: { gecko: {} } }), getURL: url => url,
        sendMessage: async message => {
          try {
            const status = message.action === 'status' ? { ...await MangaBackups.status(), target: await MangaBackupTarget.status() }
              : message.action === 'configure' ? await MangaBackups.configure(message.enabled, message.limit)
              : await MangaBackups.run({ force: true });
            return { ok: true, status };
          } catch (error) { return { ok: false, message: error.message }; }
        } },
        storage: { local: area(local, true), sync: area(remote, false), onChanged: { addListener: fn => listeners.push(fn) } },
        permissions: { getAll: async () => ({ data_collection: ['bookmarksInfo','browsingActivity','technicalAndInteraction','websiteActivity','websiteContent'] }),
          request: async details => details.permissions ? window.allowDownloads : true, contains: async () => window.allowDownloads },
        alarms: { get: async name => alarms.get(name), create: async (name, info) => alarms.set(name, info), clear: async name => alarms.delete(name) },
        downloads: { onChanged: { addListener() {} }, download: async details => {
          const content = await (await fetch(details.url)).text();
          const id = fixtureFiles.length + 1; fixtureFiles.push({ ...details, content, filename: 'C:/Downloads/' + details.filename, id, byExtensionId: 'manga-shelf@local.example', state: 'complete', exists: true }); return id;
        }, search: async ({ id, state }) => fixtureFiles.filter(file => (id === undefined || file.id === id) && (!state || file.state === state)),
        removeFile: async id => { fixtureFiles.find(file => file.id === id).exists = false; } },
        commands: { getAll: async () => [] }, search: { get: async () => [] } };
    });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../dashboard/index.html')).href + '?view=admin&settings=technical');
    await page.addScriptTag({ path: path.resolve(__dirname, '../shared/backup-target.js') });
    await page.addScriptTag({ path: path.resolve(__dirname, '../shared/backups.js') });
    await page.evaluate(async () => {
      await MangaStore.save({ items: [{ id: 'keep', title: 'Keep me', url: 'https://example.org/chapter-42', status: 'active' }], settings: { onboardingComplete: true, language: 'en', theme: 'blue-light' } });
      await MangaSync.upload({ force: true });
      for (const key of Object.keys(fixtureLocal)) delete fixtureLocal[key];
      await MangaStore.setPreferences({ onboardingComplete: true });
    });
    await page.waitForFunction(() => document.getElementById('syncEnabledSetting').getAttribute('aria-checked') === 'false');
    await page.locator('#syncEnabledSetting').click();
    await page.locator('#syncChoiceDialog').waitFor();
    assert.match(await page.locator('#syncChoiceCounts').textContent(), /Local collection: 0.*snapshot: 1/);
    await page.locator('#syncChooseCancel').click();
    assert.equal((await page.evaluate(() => MangaSync.readRemote())).data.items.length, 1);
    assert.equal((await page.evaluate(() => MangaStore.load())).settings.syncEnabled, false);
    await page.locator('#syncEnabledSetting').click();
    await page.locator('#syncChooseRestore').click();
    await page.waitForFunction(async () => (await MangaStore.load()).items.length === 1);
    await page.waitForFunction(async () => (await MangaStore.load()).settings.theme === 'blue-light');
    assert.equal((await page.evaluate(() => MangaStore.load())).settings.theme, 'blue-light');
    await page.evaluate(async cover => { await MangaStore.storeCover('keep', cover); }, 'data:image/png;base64,' + fs.readFileSync(path.resolve(__dirname, '../icons/manga-regal-32.png')).toString('base64'));
    await page.locator('#dailyBackupSetting').click();
    assert.equal(await page.evaluate(() => fixtureFiles.length), 0, 'Missing folder must not write');
    assert.equal(await page.locator('#chooseBackupFolder').count(), 0);
    assert.match(await page.locator('#backupDestination').textContent(), /MangaShelf\/Backups/);
    await page.evaluate(() => { allowDownloads = true; });
    await page.locator('#dailyBackupSetting').click();
    await page.waitForFunction(() => fixtureFiles.length === 1);
    await page.waitForFunction(() => document.getElementById('dailyBackupStatus').textContent.includes('Last successful'));
    const saved = await page.evaluate(() => JSON.parse(fixtureFiles[0].content));
    assert.equal(saved.items.length, 1); assert.ok(saved.localCovers.keep); assert.equal(saved.settings.theme, 'blue-light');
    await page.locator('#dailyBackupLimit').fill('5');
    await page.locator('#dailyBackupLimit').press('Tab');
    await page.waitForFunction(async () => (await MangaBackups.status()).limit === 5);
    await page.locator('#dailyBackupLimit').fill('366');
    await page.locator('#dailyBackupLimit').press('Tab');
    assert.equal(await page.locator('#dailyBackupLimit').getAttribute('aria-invalid'), 'true');
    assert.equal((await page.evaluate(() => MangaBackups.status())).limit, 5, 'Invalid count must not persist');
    await page.locator('#dailyBackupLimit').fill('365');
    await page.locator('#dailyBackupLimit').press('Tab');
    await page.waitForFunction(async () => (await MangaBackups.status()).limit === 365);
    assert.equal(await page.locator('#dailyBackupLimit').getAttribute('aria-invalid'), 'false');
    assert.equal((await page.evaluate(() => MangaSync.readRemote())).data.settings.dailyBackup, undefined);
    await page.evaluate(() => MangaStore.removeItem('keep'));
    await page.locator('#syncNow').click();
    await page.locator('#syncChoiceDialog').waitFor();
    page.once('dialog', dialog => dialog.dismiss());
    await page.locator('#syncChooseUpload').click();
    assert.equal((await page.evaluate(() => MangaSync.readRemote())).data.items.length, 1);
    await page.locator('#syncChooseCancel').click();
    assert.equal(await page.evaluate(() => fixtureFiles[0].exists), true);
    assert.deepEqual(errors, []);
    console.log('Real UI: reset-local/remote-data choice, cancel/restore, download consent, full-cover dump and retention settings verified.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
