/* Optional real-browser UI test. Requires Playwright and a Chromium executable
 * passed as the first argument; uses a local fixture, not user browser data. */
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
    await page.goto(pathToFileURL(path.join(__dirname, 'overlay-preview.html')).href);
    const trigger = page.locator('#mr-choose-tags');
    assert.equal(await page.locator('#mr-support').count(), 0, 'Support button belongs only in the collection');
    assert.equal(await page.locator('#mr-selected-tags').isVisible(), false, 'Empty tag selection should not show a hint or blank row');
    await trigger.click();
    assert.equal(await page.locator('#mr-tag-options input').count(), 6);
    assert.equal(await page.locator('#mr-tag-options label.mr-reread-tag').textContent(), 'Re-Read');
    await page.locator('#mr-tag-options label').filter({ hasText: 'Fantasy' }).locator('input').check();
    await page.locator('#mr-tag-options label').filter({ hasText: 'Action' }).locator('input').check();
    assert.equal(await page.locator('.mr-tag-chip').count(), 2);
    await page.locator('#mr-finish-tags').click();
    await trigger.click();
    await page.locator('#mr-tag-options label').filter({ hasText: 'Comedy' }).locator('input').check();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#mr-tag-picker').isVisible(), false);
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('.mr-tag-chip').count(), 2, 'Escape must discard unconfirmed changes');
    assert.equal(await page.locator('#mr-entry-tags').count(), 0, 'Free-text tag input must be removed');
    assert.equal(await page.locator('#manga-regal-overlay').evaluate((root) => root.classList.contains('mr-open')), true);
    await page.locator('.mr-tag-chip').filter({ hasText: 'Fantasy' }).click();
    assert.equal(await page.locator('.mr-tag-chip').count(), 1);
    await trigger.click();
    assert.equal(await page.locator('#mr-tag-options label').filter({ hasText: 'Fantasy' }).locator('input').isChecked(), false);
    await page.locator('#mr-finish-tags').click();
    assert.equal(await page.locator('#mr-tag-picker').isVisible(), false);
    assert.deepEqual(errors, []);
    // Simulate extension reload in a still-open tab: old DOM remains, but the
    // new script context has no listener. Re-injection must rebuild the overlay.
    await page.evaluate(() => {
      globalThis.__mangaRegalOverlayReady = false;
      overlayMessageHandler = undefined;
    });
    await page.addScriptTag({ path: path.join(__dirname, '../content/overlay.js') });
    const reply = await page.evaluate(() => new Promise((resolve) => {
      overlayMessageHandler({ type: 'manga-regal:toggle-overlay' }, {}, resolve);
    }));
    assert.equal(reply.ok, true);
    assert.equal(await page.locator('#manga-regal-overlay').count(), 1);
    assert.equal(await trigger.isVisible(), true);
    const hiddenReply = await page.evaluate(() => new Promise((resolve) => {
      overlayMessageHandler({ type: 'manga-regal:toggle-overlay' }, {}, resolve);
    }));
    assert.equal(hiddenReply.ok, true);
    assert.equal(await trigger.isVisible(), false);
    await page.evaluate(() => {
      const originalLoad = MangaStore.load;
      MangaStore.load = async () => { const data = await originalLoad(); data.settings.showSupportButton = false; return data; };
    });
    await page.evaluate(() => new Promise((resolve) => overlayMessageHandler({ type: 'manga-regal:toggle-overlay' }, {}, resolve)));
    assert.equal(await page.locator('#mr-support').count(), 0);
    console.log('Overlay tag selection: six presets, select/remove, Escape and Done verified in Chromium.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
