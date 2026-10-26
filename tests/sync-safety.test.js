'use strict';
const assert = require('node:assert/strict');
const local = {}, remote = {};
const copy = value => structuredClone(value);
const selected = (source, keys) => keys == null ? copy(source) : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in source).map(k => [k, copy(source[k])]));
const area = source => ({ get: async keys => selected(source, keys), set: async values => Object.assign(source, copy(values)),
  remove: async keys => { for (const key of Array.isArray(keys) ? keys : [keys]) delete source[key]; }, getBytesInUse: async () => Buffer.byteLength(JSON.stringify(source)) });
global.browser = { storage: { local: area(local), sync: area(remote) }, permissions: { getAll: async () => ({ data_collection: ['bookmarksInfo','browsingActivity','technicalAndInteraction','websiteActivity','websiteContent'] }) } };
require('../shared/store.js'); require('../shared/sync.js');
const manga = id => ({ id, title: id, url: `https://example.org/${id}/chapter-42`, status: 'active', rating: 5 });
(async () => {
  await MangaStore.save({ items: [manga('one'), manga('two')], settings: { language: 'de', theme: 'blue-light', syncEnabled: true } });
  await MangaSync.upload({ force: true });
  const remoteBefore = copy(remote);
  // In-memory uninstall simulation: no browser account/profile is accessed.
  for (const key of Object.keys(local)) delete local[key];
  assert.equal((await MangaStore.load()).settings.syncEnabled, false);
  assert.equal((await MangaSync.readRemote()).data.items.length, 2);
  for (const force of [false, true]) {
    await assert.rejects(MangaSync.upload({ force }), error => error.code === 'SYNC_CHOICE_REQUIRED');
    assert.deepEqual(remote, remoteBefore, 'Reset local storage must never erase remote data, even with force');
  }
  let plan = await MangaSync.plan();
  assert.equal(plan.localCount, 0); assert.equal(plan.remoteCount, 2);
  await MangaSync.restore({ force: true, expectedRevision: plan.remoteRevision });
  assert.equal((await MangaStore.load()).settings.theme, 'blue-light');
  assert.equal((await MangaStore.load()).items.length, 2);
  await MangaStore.patchItem('one', { rating: 4 });
  await MangaSync.upload(); // Known revision + ordinary edits remain automatic.
  const afterEdit = copy(remote);
  await MangaStore.removeItem('two');
  await assert.rejects(MangaSync.upload({ force: true }), error => error.code === 'SYNC_CHOICE_REQUIRED');
  assert.deepEqual(remote, afterEdit);
  plan = await MangaSync.plan();
  await assert.rejects(MangaSync.upload({ force: true, allowReplaceRevision: 'stale-revision' }), error => error.code === 'SYNC_CHOICE_REQUIRED');
  await MangaSync.upload({ force: true, allowReplaceRevision: plan.remoteRevision });
  assert.equal((await MangaSync.readRemote()).data.items.length, 1, 'Explicit current-revision replacement is allowed');

  // A remote revision arriving after the choice cannot silently replace it.
  const stale = (await MangaSync.plan()).remoteRevision;
  await MangaStore.patchItem('one', { currentChapter: '43' });
  await MangaSync.upload();
  await assert.rejects(MangaSync.restore({ force: true, expectedRevision: stale }), /changed/);
  await MangaStore.upsertItem(manga('local-only'));
  for (const value of Object.values(remote)) if (value && typeof value === 'object' && value.r) value.r += '-other-device';
  await assert.rejects(MangaSync.restore(), error => error.code === 'SYNC_CHOICE_REQUIRED');
  assert.equal((await MangaStore.load()).items.length, 2);
  await MangaSync.restore({ force: true });
  assert.equal(local.mangaRegalPreSyncRecoveryV1.data.items.length, 2);

  // A malformed empty snapshot is not interpreted as a valid collection.
  const meta = remote[MangaSync.META_KEY];
  meta.n = 99;
  await assert.rejects(MangaSync.readRemote(), /count mismatch/);
  console.log('Sync safety: local reset, force bypass, stale decisions, deletions, restore conflicts and recovery verified.');
})().catch(error => { console.error(error); process.exitCode = 1; });
