/* Derive Chrome configuration from the Firefox source manifest.
 * Browser-specific policy belongs here. Do not maintain a second copy of
 * permissions, versions or localized names that can silently drift apart. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
function chromeManifest(source) {
  const manifest = structuredClone(source);
  delete manifest.browser_specific_settings;
  // Chrome chooses directories through File System Access, not a native host.
  manifest.optional_permissions = (manifest.optional_permissions || []).filter(permission => permission !== 'nativeMessaging');
  if (!manifest.optional_permissions.length) delete manifest.optional_permissions;
  // activeTab covers user-triggered page inspection. Cross-origin cover access
  // is optional and requested for one concrete image host, never on install.
  delete manifest.host_permissions;
  manifest.optional_host_permissions = ['http://*/*', 'https://*/*'];
  manifest.minimum_chrome_version = '148';
  manifest.background = { service_worker: 'background/service-worker.js' };
  manifest.permissions = [...new Set([...manifest.permissions, 'alarms'])];
  manifest.icons = Object.fromEntries([16, 32, 48, 128].map((size) => [size, `icons/manga-regal-${size}.png`]));
  manifest.action.default_icon = manifest.icons;
  return manifest;
}
module.exports = chromeManifest;
if (require.main === module) {
  const destination = process.argv[2];
  if (!destination) throw new Error('Expected an explicit build manifest destination');
  const source = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'), 'utf8'));
  fs.writeFileSync(destination, JSON.stringify(chromeManifest(source), null, 2) + '\n');
  // Localized store descriptions and toolbar labels must name the built browser,
  // not Firefox. Rewrite staged locales only; source Firefox locales stay intact.
  for (const locale of ['de', 'en']) {
    const localePath = path.join(path.dirname(destination), '_locales', locale, 'messages.json');
    const messages = JSON.parse(fs.readFileSync(localePath, 'utf8'));
    for (const entry of Object.values(messages)) entry.message = entry.message.replaceAll('Firefox', 'Chrome');
    fs.writeFileSync(localePath, JSON.stringify(messages, null, 2) + '\n');
  }
}
