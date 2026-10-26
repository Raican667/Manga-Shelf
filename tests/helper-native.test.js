/* Execute the real compiled helper over framed stdio in a fresh workspace
 * directory. No registration, real folder dialog or user data is touched. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
if (process.platform !== 'win32') { console.log('Windows native-helper test skipped on this platform'); process.exit(0); }
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(root, 'build/native-helper-test-'));
const folder = path.join(temp, 'Selected backups');
const config = path.join(temp, 'config');
fs.mkdirSync(folder); fs.mkdirSync(config);
const owner = 'manga-shelf@local.example';
fs.writeFileSync(path.join(config, 'targets.json'), JSON.stringify({ Folders: { [owner]: folder } }));
fs.writeFileSync(path.join(folder, 'personal.txt'), 'Do not remove');
function request(value) {
  const data = Buffer.from(JSON.stringify({ owner, ...value }));
  const length = Buffer.alloc(4); length.writeUInt32LE(data.length);
  const result = spawnSync(path.join(root, 'build/helper-windows/MangaShelf.BackupHelper.exe'), ['--config-dir', config],
    { input: Buffer.concat([length, data]), windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
  assert.equal(result.status, 0, String(result.stderr));
  assert.ok(result.stdout.length >= 4, 'Native response missing');
  const size = result.stdout.readUInt32LE();
  return JSON.parse(result.stdout.subarray(4, 4 + size).toString('utf8'));
}
assert.equal(request({ action: 'status' }).folder, folder);
assert.equal(request({ owner: 'untrusted@example.org', action: 'status' }).ok, false);
assert.equal(request({ action: 'read-any-file', path: 'C:/Windows' }).ok, false);
const snapshot = { items: [{ id: 'one', title: 'Änderung 日本語' }], settings: { language: 'de' }, localCovers: { one: 'data:image/png;base64,cover' } };
for (let i = 0; i < 9; i++) {
  const result = request({ action: 'save', snapshot: JSON.stringify(snapshot), day: '2026-10-26', limit: 7 });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(JSON.parse(fs.readFileSync(result.filename, 'utf8')), snapshot);
}
assert.equal(fs.readdirSync(folder).filter(name => /^manga-shelf-.*\.json$/.test(name)).length, 7);
assert.equal(fs.readFileSync(path.join(folder, 'personal.txt'), 'utf8'), 'Do not remove');
const before = fs.readdirSync(folder);
assert.equal(request({ action: 'save', snapshot: '{}', day: '2026-10-26', limit: 7 }).ok, false);
assert.equal(request({ action: 'save', snapshot: JSON.stringify(snapshot), day: '../escape', limit: 7 }).ok, false);
assert.equal(request({ action: 'save', snapshot: JSON.stringify(snapshot), day: '2026-10-26', limit: 366 }).ok, false);
assert.deepEqual(fs.readdirSync(folder), before);
const index = fs.readdirSync(folder).find(name => name.startsWith('.manga-shelf-index-'));
const bad = JSON.parse(fs.readFileSync(path.join(folder, index), 'utf8'));
bad.Files[0].Name = '../personal.txt';
fs.writeFileSync(path.join(folder, index), JSON.stringify(bad));
assert.equal(request({ action: 'save', snapshot: JSON.stringify(snapshot), day: '2026-10-26', limit: 1 }).error, 'BACKUP_INDEX_INVALID');
assert.equal(fs.readFileSync(path.join(folder, 'personal.txt'), 'utf8'), 'Do not remove');
console.log('Compiled Windows helper: stdio protocol, selected path, Unicode/full JSON, retention, allowlist and traversal rejection verified.');
