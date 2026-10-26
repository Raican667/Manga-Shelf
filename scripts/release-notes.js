/* Prefer a curated cumulative release summary when local previews are shipped
 * together; otherwise extract the current bilingual changelog sections. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const version = manifest.version;
function section(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const start = source.indexOf(`## [${version}]`);
  if (start < 0) throw new Error(`Missing ${version} in ${file}`);
  const next = source.indexOf('\n## [', start + 1);
  return source.slice(start, next < 0 ? undefined : next).trim();
}
const instructions = `## Downloads / Installation

Use the attached **Firefox** or **Chrome** ZIP, not the automatic Source code archives.
Bitte die angehängte **Firefox**- oder **Chrome**-ZIP herunterladen, nicht die Source-code-Archive.

- **Firefox 142+:** about:debugging#/runtime/this-firefox → Load Temporary Add-on / Temporäres Add-on laden → Firefox ZIP. Unsigned test package; installation ends after restarting Firefox.
- **Chrome 148+:** extract the Chrome ZIP / Chrome-ZIP entpacken → chrome://extensions → Developer mode / Entwicklermodus → Load unpacked / Entpackte Erweiterung laden.
- Chrome and Firefox Sync remain separate / Chrome und Firefox Sync bleiben getrennt. Use JSON backups for transfers / Zum Wechsel JSON-Datensicherungen verwenden.
- Automated tests passed during packaging. Manual browser testing is still required / Automatische Tests wurden beim Paketbau ausgeführt; praktische Browser-Tests sind weiterhin nötig.
- Before testing: export a JSON backup and use a separate browser profile. Removing a temporary Firefox add-on can clear local extension storage / Vor Tests JSON sichern und ein separates Profil verwenden. Entfernen temporärer Firefox-Add-ons kann den lokalen Erweiterungsspeicher löschen.
`;
const summaryPath = path.join(root, 'docs/releases', `${version}.md`);
const legacyNotice = manifest.browser_specific_settings?.gecko?.id === 'manga-regal@local.example'
  ? '\n**Legacy Firefox package:** this repository retains manga-regal@local.example for existing legacy installs. Do not upload it to the AMO listing using manga-shelf@local.example; use the Manga-Shelf repository Firefox ZIP instead. / Dieses Repository behält die alte Firefox-ID für Bestandsinstallationen. Für den englischen AMO-Eintrag die Firefox-ZIP aus Manga-Shelf verwenden.\n'
  : '';
const notes = fs.existsSync(summaryPath) ? fs.readFileSync(summaryPath, 'utf8')
  : `## English\n\n${section('CHANGELOG.en.md')}\n\n## Deutsch\n\n${section('CHANGELOG.md')}\n`;
fs.writeFileSync(path.join(root, 'build/release-notes.md'), `[English](#english) · [Deutsch](#deutsch)\n\n${instructions}\n${legacyNotice}\n${notes}`);
