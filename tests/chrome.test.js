/* Run the real Chrome worker entry point without DOM/FileReader. This is an API
 * contract test, not a substitute for manual installation in Chrome. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const chromeManifest = require('../scripts/chrome-manifest.js');
const root = path.resolve(__dirname, '..');
const manifest = chromeManifest(JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'))));
assert.equal(manifest.version, '0.20.9');
assert.equal(manifest.background.service_worker, 'background/service-worker.js');
assert.equal(manifest.minimum_chrome_version, '148');
assert.equal(manifest.browser_specific_settings, undefined);
assert.ok(manifest.permissions.includes('alarms'));
for (const icon of Object.values(manifest.icons)) {
  const bytes = fs.readFileSync(path.join(root, icon));
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
}
const events = {}, memory = {}, tabs = [], injections = [], alarms = [];
let search;
const event = (name) => ({ addListener(fn) { events[name] = fn; } });
const storage = {
  async get(key) { return key == null ? structuredClone(memory) : { [key]: structuredClone(memory[key]) }; },
  async set(values) { Object.assign(memory, structuredClone(values)); },
  async remove(key) { delete memory[key]; }
};
const browser = {
  runtime: { getManifest: () => manifest, getURL: (file) => `chrome-extension://test/${file}`, onMessage: event('message'), onInstalled: event('install'), onStartup: event('startup') },
  action: { onClicked: event('action') }, commands: { onCommand: event('command') },
  storage: { local: storage, sync: storage, onChanged: event('storage') },
  alarms: { create(name, info) { alarms.push({ name, info }); }, get: async (name) => alarms.find((alarm) => alarm.name === name), onAlarm: event('alarm') },
  tabs: { query: async () => [], create: async (tab) => { tabs.push(tab); }, update: async () => {}, sendMessage: async () => { if (injections.length) return { ok: true }; throw new Error('not injected'); } },
  windows: { update: async () => {} },
  scripting: { insertCSS: async () => {}, executeScript: async (details) => { injections.push(details); } },
  bookmarks: { onChanged: event('bookmarkChanged'), onRemoved: event('bookmarkRemoved'), getTree: async () => [{ id: '0', children: [{ id: '1', title: 'Bookmarks bar', children: [{ id: '10', title: 'Manga', children: [{ id: '11', title: 'Chrome manga Chapter 42', url: 'https://example.org/chapter-42', dateAdded: 1700000000000 }] }] }, { id: '2', title: 'Other bookmarks', children: [] }] }] },
  search: { query: async (details) => { search = details; } },
  // Deliberately no data_collection or commands.update: they are Firefox-only.
  permissions: { getAll: async () => { throw new Error('Mozilla permission used in Chrome'); } }
};
const png = fs.readFileSync(path.join(root, 'icons/manga-regal-32.png'));
const context = vm.createContext({ browser, console, URL, Blob, Response, TextEncoder, TextDecoder,
  CompressionStream, DecompressionStream, btoa, atob, crypto: require('node:crypto').webcrypto,
  setTimeout, clearTimeout, fetch: async () => new Response(png, { headers: { 'content-type': 'image/png' } }) });
context.importScripts = (...files) => files.forEach((file) => {
  vm.runInContext(fs.readFileSync(path.resolve(root, 'background', file), 'utf8'), context, { filename: file });
});
vm.runInContext(fs.readFileSync(path.join(root, 'background/service-worker.js'), 'utf8'), context);
function message(request) {
  return new Promise((resolve, reject) => {
    const accepted = events.message(request, {}, resolve);
    if (accepted !== true) reject(new Error('Async response channel not kept open'));
  });
}
(async () => {
  assert.equal(await context.MangaSync.hasConsent(), false);
  assert.equal(await context.MangaSync.requestConsent(), false);
  await assert.rejects(context.MangaSync.upload(), /Zustimmung/);
  assert.equal(await context.MangaSync.requestConsent({ confirmed: true }), true);
  assert.equal(await context.MangaSync.hasConsent(), true);
  await context.MangaSync.revokeConsent();
  assert.equal(await context.MangaSync.hasConsent(), false);
  // Imported/synced settings cannot substitute for device-local consent.
  await context.MangaStore.setPreferences({ syncEnabled: true });
  assert.equal(await context.MangaSync.hasConsent(), false);
  await assert.rejects(context.MangaSync.upload(), /Zustimmung/);
  assert.equal(await context.MangaSync.requestConsent({ confirmed: true }), true);
  await context.MangaPlatform.search('Example Chapter 3', 'ignored Firefox engine');
  assert.equal(search.text, 'Example Chapter 3');
  assert.equal(search.disposition, 'NEW_TAB');
  assert.equal(events.message({ type: 'unknown' }, {}, () => {}), false);
  await message({ type: 'manga-regal:open-dashboard' });
  assert.equal(tabs.at(-1).url, 'chrome-extension://test/dashboard/index.html');
  await events.action({ id: 8, url: 'https://example.org/manga' });
  assert.ok(injections[0].files.includes('shared/platform.js'));
  assert.equal(tabs.length, 1, 'A successful popup handshake must not open the collection fallback');
  // Chrome bookmark roots and optional Firefox-only dateGroupModified fields.
  const imported = await context.MangaStore.importFirefoxBookmarks({ folderIds: ['10'], folderRatings: { '10': 4 } });
  assert.equal(imported.imported, 1);
  const importedItem = (await context.MangaStore.load()).items.find((item) => item.bookmarkId === '11');
  assert.equal(importedItem.currentChapter, '42');
  assert.equal(importedItem.rating, 4);
  assert.equal(importedItem.cover, '');
  assert.equal((await context.MangaStore.importFirefoxBookmarks({ keyword: 'chapter' })).scanned, 1);
  assert.equal((await context.MangaStore.importFirefoxBookmarks({ bookmarkIds: ['11'] })).scanned, 1);
  assert.equal((await context.MangaStore.load()).items.filter((item) => item.bookmarkId === '11').length, 1);
  const saved = await context.MangaStore.upsertItem({ title: 'Worker cover', url: 'https://example.org/manga', cover: 'https://example.org/cover.png' });
  const item = saved.items[0];
  const result = await message({ type: 'manga-regal:cache-cover', itemId: item.id });
  assert.equal(result.ok, true);
  assert.match(await context.MangaStore.getStoredCover(item.id), /^data:image\/png;base64,/);
  const existing = await message({ type: 'manga-regal:cache-cover', itemId: item.id });
  assert.equal(existing.status, 'existing');
  events.storage({ [context.MangaStore.STORAGE_KEY]: {} }, 'local');
  assert.ok(alarms.some((alarm) => alarm.name === 'manga-regal:sync-upload'));
  events.storage({ [context.MangaSync.PREFIX + 'meta']: {} }, 'sync');
  assert.ok(alarms.some((alarm) => alarm.name === 'manga-regal:sync-restore'));
  console.log('Chrome worker, messages, search, cover cache and durable sync scheduling verified.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
