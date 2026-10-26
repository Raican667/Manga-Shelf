/* Real Chromium FileSystemDirectoryHandle + IndexedDB persistence in OPFS.
 * Picker UI is stubbed; all filesystem I/O is real, in an isolated test profile. */
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.argv[2] });
  try {
    const page = await browser.newPage();
    await page.route('http://localhost:7833/**', route => route.fulfill({ body: '<html><body>Isolated folder test</body></html>', contentType: 'text/html' }));
    async function install() {
      await page.evaluate(() => {
        window.MangaPlatform = { isChrome: true };
        window.browser = { runtime: { id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }, downloads: { download: () => { throw new Error('data-URL downloads must not be used'); } } };
        window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('Selected backup folder', { create: true });
      });
      await page.addScriptTag({ path: path.resolve(__dirname, '../shared/backup-target.js') });
    }
    await page.goto('http://localhost:7833/test'); await install();
    assert.equal((await page.evaluate(() => MangaBackupTarget.status())).selected, false);
    await page.evaluate(() => MangaBackupTarget.choose());
    assert.equal((await page.evaluate(() => MangaBackupTarget.status())).ready, true);
    await page.evaluate(async () => {
      const directory = await showDirectoryPicker();
      const stream = await (await directory.getFileHandle('personal.txt', { create: true })).createWritable();
      await stream.write('Keep this file'); await stream.close();
      const data = { items: [{ id: 'one', title: '日本語 Ä' }], settings: { theme: 'blue-light' }, localCovers: { one: 'data:image/png;base64,cover' } };
      for (let i = 0; i < 6; i++) await MangaBackupTarget.write(data, '2026-10-26', 3);
    });
    const files = await page.evaluate(async () => {
      const directory = await showDirectoryPicker(), result = [];
      for await (const [name, handle] of directory.entries()) result.push({ name, text: await (await handle.getFile()).text() });
      return result;
    });
    assert.equal(files.filter(file => file.name.startsWith('manga-shelf-')).length, 3);
    assert.equal(files.find(file => file.name === 'personal.txt').text, 'Keep this file');
    assert.equal(JSON.parse(files.find(file => file.name.startsWith('manga-shelf-')).text).settings.theme, 'blue-light');
    await page.reload(); await install();
    assert.equal((await page.evaluate(() => MangaBackupTarget.status())).label, 'Selected backup folder');
    assert.equal((await page.evaluate(() => MangaBackupTarget.status())).ready, true, 'Stored handle must survive page restart');
    await page.evaluate(() => { FileSystemHandle.prototype.queryPermission = async () => 'denied'; });
    assert.equal((await page.evaluate(() => MangaBackupTarget.status())).ready, false);
    assert.match(await page.evaluate(async () => {
      try { await MangaBackupTarget.write({ items: [{}], settings: {} }, '2026-10-26', 3); return ''; } catch (error) { return error.message; }
    }), /FOLDER_PERMISSION_REQUIRED/);
    assert.match(await page.evaluate(async () => {
      try { await MangaBackupTarget.write({ items: [{}] }, '2026-10-26', 366); return ''; } catch (error) { return error.message; }
    }), /INVALID_BACKUP_COUNT/);
    console.log('Chrome folder target: real directory writes, full JSON, owner-only retention, persisted handles and revoked access verified.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
