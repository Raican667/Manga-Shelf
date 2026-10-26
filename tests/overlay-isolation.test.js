/* Hostile page CSS + strict CSP, using actual packaged popup assets.
 * Only synthetic page/storage fixtures; no user profile or remote service. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'content/overlay.css'), 'utf8');
const hostile = `html{font-size:60px!important} header,section{position:absolute!important;float:right!important;width:70px!important;height:90px!important;overflow:hidden!important} form{display:flex!important;flex-direction:row!important} h3{display:none!important} div{direction:rtl;letter-spacing:15px} button{font-size:3px!important;pointer-events:none!important} details{display:none!important} #manga-regal-host{display:none!important;height:0!important;visibility:hidden!important} main{color:rgb(255,0,128)!important}`;
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.argv[2] });
  try {
    for (const theme of ['dark', 'light', 'coral-dark', 'coral-light', 'blue-light', 'blue-dark']) {
      for (const strictCsp of [false, true]) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(css => { window.fixtureCss = css; }, css);
        await page.route('http://manga.example/**', async route => {
          const pathname = new URL(route.request().url()).pathname;
          const assets = {
            '/shared/themes.js': ['shared/themes.js', 'text/javascript'],
            '/content/overlay.js': ['content/overlay.js', 'text/javascript'],
            '/content/overlay.css': ['content/overlay.css', 'text/css'],
            '/assets/placeholders/forest-shrine.jpg': ['assets/placeholders/forest-shrine.jpg', 'image/jpeg']
          };
          if (pathname === '/tests/overlay-preview.html') {
            const html = fs.readFileSync(path.join(root, 'tests/overlay-preview.html'), 'utf8')
              .replace('sendMessage: async () => ({ ok: true })', "sendMessage: async message => message.type === 'manga-regal:overlay-css' ? ({ ok: true, cssText: window.fixtureCss }) : ({ ok: true })");
            return route.fulfill({ body: html, contentType: 'text/html', headers: strictCsp
              ? { 'Content-Security-Policy': "script-src 'self' 'unsafe-inline'; style-src 'none'; img-src 'self' data:; object-src 'none'" } : {} });
          }
          if (!assets[pathname]) return route.fulfill({ status: 404, body: '' });
          const [file, contentType] = assets[pathname];
          return route.fulfill({ body: fs.readFileSync(path.join(root, file)), contentType });
        });
        await page.goto(`http://manga.example/tests/overlay-preview.html?demo=1&theme=${theme}&scale=10`);
        await page.locator('.mr-panel').waitFor();
        await page.evaluate(hostile => { const sheet = new CSSStyleSheet(); sheet.replaceSync(hostile); document.adoptedStyleSheets = [sheet]; }, hostile);
        assert.ok(await page.locator('#manga-regal-host').evaluate(host => Boolean(host.shadowRoot)));
        const panel = await page.locator('.mr-panel').boundingBox();
        assert.ok(panel.width >= 300 && panel.width <= 420, `${theme}: panel width corrupted`);
        assert.equal(await page.locator('.mr-panel').evaluate(el => getComputedStyle(el).direction), 'ltr');
        assert.equal(await page.locator('main').evaluate(el => getComputedStyle(el).color), 'rgb(255, 0, 128)', 'Page CSS must remain untouched');
        if (!['dark', 'light'].includes(theme)) {
          assert.equal(await page.locator('#mr-quick-title').textContent(), 'Moonlit Journey');
          assert.ok(await page.locator('#mr-quick-title').isVisible(), 'Host h3 rules must not hide the title');
          await page.locator('#mr-entry-details > summary').click();
        }
        await page.locator('#mr-entry-title').fill('Visible title');
        assert.equal(await page.locator('#mr-stars .mr-star').count(), 10);
        await page.locator('#mr-choose-tags').click();
        await page.locator('#mr-finish-tags').click();
        assert.deepEqual(errors, []);
        if (theme === 'coral-dark' && strictCsp) {
          await page.setViewportSize({ width: 389, height: 800 });
          const narrow = await page.locator('.mr-panel').boundingBox();
          assert.ok(narrow.x >= 0 && narrow.x + narrow.width <= 389, 'Popup must fit the reported narrow viewport');
          const stars = await page.locator('#mr-stars').boundingBox();
          assert.ok(stars.x + stars.width <= narrow.x + narrow.width, 'Ten stars must stay inside the narrow panel');
          fs.mkdirSync(path.join(root, 'build/overlay-isolation'), { recursive: true });
          await page.locator('.mr-panel').screenshot({ path: path.join(root, 'build/overlay-isolation/coral-dark.png') });
        }
        await page.close();
      }
    }
    console.log('All six popup themes isolated from hostile page CSS; strict CSP, fields, tags and 10 stars verified.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
