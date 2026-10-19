/* Permission-page contract with a synchronous user-gesture boundary. Network
 * and persistence are covered by chrome.test.js; no real grants are changed. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'dashboard/cover-permissions.js'), 'utf8');
const markup = fs.readFileSync(path.join(root, 'dashboard/cover-permissions.html'), 'utf8');
const ids = [...markup.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
for (const asset of [...markup.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1])) {
  assert.ok(fs.existsSync(path.resolve(root, 'dashboard', asset)), `Missing page asset: ${asset}`);
}
async function fixture({ language = 'en', granted = false, cached = false, missing = false, failed = false } = {}) {
  let gesture = false;
  const requests = [], messages = [], errors = [];
  const elements = Object.fromEntries(ids.map((id) => [id, {
    disabled: id === 'allow', textContent: '', handlers: {},
    addEventListener(name, handler) { this.handlers[name] = handler; }
  }]));
  const item = { id: 'saved', cover: 'https://cdn.example.org/cover.png?token=private' };
  const context = vm.createContext({
    URL, URLSearchParams, location: { search: '?item=saved&url=https://untrusted.invalid' }, window: { close() {} },
    document: { documentElement: { lang: 'en' }, getElementById: (id) => { assert.ok(elements[id], `Missing ID: ${id}`); return elements[id]; } },
    MangaPlatform: { isChrome: true, coverOrigin: (url) => new URL(url).origin + '/*' },
    MangaStore: { load: async () => ({ items: missing ? [] : [item], settings: { language } }), getStoredCover: async () => cached ? 'data:image/png;base64,AAAA' : '' },
    browser: {
      permissions: { request(details) { assert.equal(gesture, true, 'Request must be synchronous inside the user gesture'); requests.push(details); return Promise.resolve(granted); } },
      runtime: { sendMessage: async (details) => { messages.push(details); return failed ? { ok: false, status: 'failed' } : { ok: true, status: 'downloaded' }; } }
    }
  });
  vm.runInContext(source, context);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 0, 'Opening a form must not prompt');
  return { elements, requests, messages, errors, item, click: async () => {
    gesture = true;
    const result = elements.allow.handlers.click();
    gesture = false;
    await result;
  } };
}
(async () => {
  const denied = await fixture();
  assert.equal(denied.elements.origin.textContent, 'cdn.example.org', 'Do not display token/path as host');
  await denied.click();
  assert.deepEqual(Array.from(denied.requests[0].origins), ['https://cdn.example.org/*']);
  assert.equal(denied.messages.length, 0);
  assert.match(denied.elements.status.textContent, /remains saved/);
  assert.equal(denied.elements.allow.disabled, false);
  const allowed = await fixture({ language: 'de', granted: true });
  assert.equal(allowed.elements.allow.textContent, 'Diese Cover-Domain freigeben');
  await allowed.click();
  assert.equal(allowed.messages[0].itemId, 'saved');
  assert.equal(allowed.messages[0].type, 'manga-regal:cache-cover');
  assert.match(allowed.elements.status.textContent, /lokal gespeichert/);
  const failed = await fixture({ granted: true, failed: true });
  await failed.click();
  assert.match(failed.elements.status.textContent, /could not be downloaded/);
  for (const settings of [{ cached: true }, { missing: true }]) {
    const page = await fixture(settings);
    assert.equal(page.elements.allow.disabled, true);
    await page.click();
    assert.equal(page.requests.length, 0);
    assert.equal(page.messages.length, 0);
  }
  console.log('Cover permission page: exact host, explicit gesture, denial, grant, cached image and missing item verified.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
