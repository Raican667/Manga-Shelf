/* Release notes come from the canonical bilingual changelogs, not another
 * manually maintained version history. Run only after the build succeeds. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')).version;
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
`;
fs.writeFileSync(path.join(root, 'build/release-notes.md'), `[English](#english) · [Deutsch](#deutsch)\n\n${instructions}\n## English\n\n${section('CHANGELOG.en.md')}\n\n## Deutsch\n\n${section('CHANGELOG.md')}\n`);
