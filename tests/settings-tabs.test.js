/* Settings grouping is navigation state only: no preference writes on switch. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.argv[2] });
  try {
    for (const language of ['en', 'de']) {
      const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(language => {
        const memory = { mangaRegalDataV1: { version: 20, items: [], settings: { language, onboardingComplete: true, tagPresets: ['Action', 'Fantasy'] } } }, listeners = [];
        window.fixtureWrites = 0;
        const storage = { get: async key => ({ [key]: structuredClone(memory[key]) }),
          set: async values => { fixtureWrites++; Object.assign(memory, structuredClone(values)); queueMicrotask(() => listeners.forEach(fn => fn(Object.fromEntries(Object.keys(values).map(k => [k, {}])), 'local'))); }, remove: async () => {} };
        window.browser = { storage: { local: storage, sync: storage, onChanged: { addListener: fn => listeners.push(fn) } },
          runtime: { getManifest: () => ({ browser_specific_settings: { gecko: {} } }), getURL: url => url, sendMessage: async () => ({ ok: true, status: { enabled: false, limit: 7 } }) },
          commands: { getAll: async () => [] }, search: { get: async () => [] } };
        window.browser.permissions = { getAll: async () => ({ data_collection: [] }) };
      }, language);
      await page.goto(pathToFileURL(path.resolve(__dirname, '../dashboard/index.html')).href + '?view=admin');
      await page.locator('#categoryOrderList [data-order-view]').first().waitFor();
      assert.equal(await page.locator('#settingsAppearanceTab').textContent(), language === 'en' ? 'Appearance' : 'Darstellung');
      assert.equal(await page.locator('.settings-section-tabs [role=tab]').count(), 3);
      assert.ok(await page.locator('#colorModeSetting').isVisible());
      assert.equal(await page.locator('#tagPresetGrid').isVisible(), false);
      assert.equal(await page.locator('#dailyBackupSetting').isVisible(), false);
      const writes = await page.evaluate(() => fixtureWrites);
      await page.locator('#settingsAppearanceTab').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#settingsTagsTab').getAttribute('aria-selected'), 'true');
      assert.ok(await page.locator('#tagPresetGrid').isVisible());
      const fantasy = page.locator('[data-tag-preset][value="Fantasy"]');
      await fantasy.uncheck();
      await page.locator('#settingsTechnicalTab').click();
      for (const selector of ['#exportJson', '#syncEnabledSetting', '#exportFirefoxBookmarks', '#shortcutInput', '#bookmarkImportModeSetting', '#showLogsTab', '#showPatchlogTab']) {
        assert.ok(await page.locator(selector).isVisible(), selector + ' must be in Technical & Data');
      }
      assert.equal(await page.locator('#categoryOrderList').isVisible(), false);
      await page.locator('#showPatchlogTab').click();
      assert.ok(await page.locator('#patchlogPanel').isVisible());
      await page.locator('#settingsTagsTab').click();
      assert.equal(await fantasy.isChecked(), false, 'Switching tabs must not reconstruct unsaved controls');
      assert.equal(await page.evaluate(() => fixtureWrites), writes);
      await page.locator('#settingsTagsTab').focus();
      await page.keyboard.press('End');
      assert.equal(await page.locator('#settingsTechnicalTab').getAttribute('aria-selected'), 'true');
      await page.keyboard.press('Home');
      assert.equal(await page.locator('#settingsAppearanceTab').getAttribute('aria-selected'), 'true');
      await page.locator('#colorModeSetting').selectOption('blue-light');
      await page.waitForFunction(() => document.documentElement.dataset.mangaTheme === 'blue-light');
      assert.equal(await page.locator('#settingsAppearanceTab').getAttribute('aria-selected'), 'true', 'Autosave must retain section');
      await page.locator('#settingsTechnicalTab').click();
      await page.locator('#dailyBackupLimit').fill('366');
      assert.equal(await page.locator('#dailyBackupLimit').getAttribute('aria-invalid'), 'true');
      assert.equal(await page.locator('#dailyBackupLimit').evaluate(input => input.validity.valid), false);
      await page.locator('#dailyBackupLimit').fill('7');
      assert.equal(await page.locator('#dailyBackupLimit').getAttribute('aria-invalid'), 'false');
      await page.setViewportSize({ width: 390, height: 850 });
      assert.ok(await page.locator('.settings-section-tabs').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
      const output = path.resolve(__dirname, '../build/settings-preview');
      fs.mkdirSync(output, { recursive: true });
      if (language === 'en') {
        await page.setViewportSize({ width: 1400, height: 950 });
        await page.locator('#settingsAppearanceTab').click();
        await page.screenshot({ path: path.join(output, 'appearance.png') });
        await page.locator('#settingsTechnicalTab').click();
        await page.screenshot({ path: path.join(output, 'technical.png') });
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('Settings tabs: EN/DE grouping, keyboard navigation, unchanged drafts, autosave section, free count validation and narrow layout verified.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
