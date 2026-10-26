'use strict';
const assert = require('node:assert/strict');
const memory = {}, writes = [], alarms = new Map();
let ready = false, fail = false;
const snapshot = { items: [{ id: 'one' }], settings: { language: 'de' }, localCovers: { one: 'data:image/png;base64,cover' }, customPlaceholderCovers: [{ id: 'forest', dataUrl: 'data:image/png;base64,custom' }] };
global.browser = { storage: { local: { get: async key => ({ [key]: structuredClone(memory[key]) }), set: async values => Object.assign(memory, structuredClone(values)) } },
  alarms: { get: async name => alarms.get(name), create: async (name, info) => alarms.set(name, info), clear: async name => alarms.delete(name) },
  downloads: { download: () => { throw new Error('The old data-URL download path must never be called'); } } };
global.MangaStore = { exportData: async () => structuredClone(snapshot) };
global.MangaBackupTarget = {
  status: async () => ({ ready, label: 'Chosen folder' }),
  write: async (data, day, limit) => { if (fail) throw new Error('DISK_WRITE_FAILED'); writes.push({ data, day, limit }); return { filename: 'Chosen folder/' + day + '.json' }; }
};
require('../shared/backups.js');
(async () => {
  await MangaBackups.initialize(); assert.equal(writes.length, 0);
  await assert.rejects(MangaBackups.configure(true), /DOWNLOAD_PERMISSION_REQUIRED/);
  assert.equal((await MangaBackups.status()).enabled, false);
  ready = true;
  await MangaBackups.configure(true); assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].data, snapshot, 'Full local artwork must be included');
  assert.equal(writes[0].limit, 7);
  await MangaBackups.run(); await MangaBackups.initialize(); assert.equal(writes.length, 1);
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const success = (await MangaBackups.status()).lastSuccessDay;
  fail = true;
  await assert.rejects(MangaBackups.run({ now: tomorrow }), /DISK_WRITE_FAILED/);
  assert.equal((await MangaBackups.status()).lastSuccessDay, success);
  fail = false; ready = false;
  await assert.rejects(MangaBackups.run({ now: tomorrow }), /DOWNLOAD_PERMISSION_REQUIRED/);
  assert.equal(writes.length, 1, 'Revoked permission must not fall back to Downloads');
  ready = true;
  await MangaBackups.run({ now: tomorrow }); assert.equal(writes.length, 2);
  await MangaBackups.configure(false); assert.equal(alarms.has(MangaBackups.ALARM), false);
  await MangaBackups.run(); assert.equal(writes.length, 2);
  snapshot.items = [];
  await assert.rejects(MangaBackups.run({ force: true }), /EMPTY_BACKUP/);
  snapshot.items = [{ id: 'one' }];
  await MangaBackups.configure(false, 365); assert.equal((await MangaBackups.status()).limit, 365);
  await assert.rejects(MangaBackups.configure(false, 366), /INVALID_BACKUP_COUNT/);
  await assert.rejects(MangaBackups.configure(false, 1.5), /INVALID_BACKUP_COUNT/);
  await MangaBackups.configure(false, 1); assert.equal((await MangaBackups.status()).limit, 1);
  console.log('Backups: download permission required, target adapter, full JSON, retry, startup, empty guard and free-count validation verified.');
})().catch(error => { console.error(error); process.exitCode = 1; });
