'use strict';
const assert = require('node:assert/strict');
const memory = {};
const clone = (value) => structuredClone(value);
const tree = [{ id: 'root', children: [{ id: 'parent', title: 'Parent', children: [
  { id: 'one', title: 'One', url: 'https://example.org/one/chapter-1' },
  { id: 'sub', title: 'Sub', children: [{ id: 'two', title: 'Two', url: 'https://example.org/two/chapter-2' }] }
] }] }];
global.browser = { storage: { local: {
  async get(key) { return { [key]: clone(memory[key]) }; },
  async set(values) { Object.assign(memory, clone(values)); },
  async remove(key) { delete memory[key]; }
} }, bookmarks: { async getTree() { return clone(tree); } } };
require('../shared/store.js');
require('../shared/sync.js');
const item = (id, rating = 0, status = 'active') => ({ id, title: id, rating, status, url: `https://example.org/${id}/chapter-1` });
const settings = { language: 'en', onboardingComplete: true, customCategories: [{ id: 'custom-favorites', name: 'Favorites' }] };
const reset = (items = [], overrides = {}) => MangaStore.save({ items, settings: { ...settings, ...overrides } });
(async () => {
  await reset([item('five', 5), item('three', 3), item('unrated')]);
  await MangaStore.setPreferences({ hiddenCategories: ['reading', 'custom-favorites'] });
  let data = await MangaStore.load();
  assert.deepEqual(data.settings.hiddenCategories, ['reading', 'custom-favorites']);
  assert.equal(data.items.length, 3, 'Hiding must not delete manga');
  const beforeHidden = clone(memory);
  await assert.rejects(MangaStore.setPreferences({ hiddenCategories: ['reading', 'active', 'hold', 'dropped', 'completed', 'all', 'custom-favorites'] }), /at least one/);
  assert.deepEqual(memory, beforeHidden, 'Last-tab guard must not commit a partial change');
  await MangaStore.setPreferences({ ratingCategoryRules: { 5: 'custom-favorites', 3: 'hold', 4: 'all', 99: 'active' } });
  data = await MangaStore.load();
  assert.deepEqual(data.settings.ratingCategoryRules, { 3: 'hold', 5: 'custom-favorites' });
  assert.equal(data.items.find(i => i.id === 'five').status, 'custom-favorites');
  assert.equal(data.items.find(i => i.id === 'three').status, 'hold');
  assert.equal(data.items.find(i => i.id === 'unrated').status, 'active');
  await MangaStore.upsertItem(item('new-five', 5, 'completed'));
  await MangaStore.patchItem('unrated', { rating: 5 });
  data = await MangaStore.load();
  assert.equal(data.items.find(i => i.id === 'new-five').status, 'custom-favorites');
  assert.equal(data.items.find(i => i.id === 'unrated').status, 'custom-favorites');
  await MangaStore.patchItem('five', { status: 'completed' });
  await MangaStore.upsertItem({ id: 'five', url: 'https://example.org/five/chapter-2', currentChapter: '2' });
  assert.equal((await MangaStore.load()).items.find(i => i.id === 'five').status, 'completed', 'Chapter-only update must preserve manual category');
  await MangaStore.patchItem('five', { rating: 3 });
  assert.equal((await MangaStore.load()).items.find(i => i.id === 'five').status, 'hold');
  await MangaStore.setPreferences({ ratingCategoryRules: {} });
  assert.equal((await MangaStore.load()).items.find(i => i.id === 'three').status, 'hold', 'Removing a rule must not undo past moves');

  await reset([item('a', 5), item('b', 5)], { readingLimit: 1 });
  const beforeLimit = clone(memory);
  await assert.rejects(MangaStore.setPreferences({ ratingCategoryRules: { 5: 'reading' } }), /limit exceeded/);
  assert.deepEqual(memory, beforeLimit, 'Bulk routing must roll back items and rules together');
  await MangaStore.setPreferences({ ratingCategoryRules: { 4: 'reading' } });
  await MangaStore.patchItem('a', { rating: 4 });
  const beforePatch = clone(memory);
  await assert.rejects(MangaStore.patchItem('b', { rating: 4 }), /limit exceeded/);
  assert.deepEqual(memory, beforePatch);
  await assert.rejects(MangaStore.upsertItem(item('c', 4)), /voll/);

  await reset([], { ratingCategoryRules: { 5: 'custom-favorites' } });
  await MangaStore.importFirefoxBookmarks({ folderIds: ['parent', 'sub'], folderRatings: { parent: 5, sub: 3 },
    folderStatuses: { parent: 'completed', sub: 'hold' } });
  data = await MangaStore.load();
  assert.equal(data.items.find(i => i.bookmarkId === 'one').status, 'custom-favorites', 'Rule has import precedence');
  assert.equal(data.items.find(i => i.bookmarkId === 'two').status, 'hold', 'Nested folder override wins');
  assert.equal(data.items.find(i => i.bookmarkId === 'two').rating, 3);
  await MangaStore.importFirefoxBookmarks({ bookmarkIds: ['one'], rating: 2, status: 'dropped' });
  data = await MangaStore.load();
  assert.equal(data.items.length, 2, 'Reimport links existing entry, not a duplicate');
  assert.equal(data.items.find(i => i.bookmarkId === 'one').status, 'dropped');
  assert.equal(data.items.find(i => i.bookmarkId === 'one').rating, 2);
  await reset([], { readingLimit: 1 });
  const beforeImport = clone(memory);
  await assert.rejects(MangaStore.importFirefoxBookmarks({ folderIds: ['parent'], status: 'reading' }), /limit exceeded/);
  assert.deepEqual(memory, beforeImport, 'Overfull import must be atomic');

  await reset([item('ten', 10)], { ratingScale: 10, ratingCategoryRules: { 10: 'completed', 5: 'custom-favorites' },
    hiddenCategories: ['hold', 'custom-favorites'] });
  await MangaStore.setPreferences({ ratingScale: 5 });
  data = await MangaStore.load();
  assert.equal(data.items[0].rating, 5);
  assert.equal(data.items[0].status, 'custom-favorites');
  assert.deepEqual(data.settings.ratingCategoryRules, { 5: 'custom-favorites' }, 'Out-of-scale rules must disappear');
  const prepared = await MangaSync.prepare(data);
  const snapshot = await MangaSync.decompressSnapshot(prepared.payload);
  assert.deepEqual(snapshot.s.hiddenCategories, data.settings.hiddenCategories);
  assert.deepEqual(snapshot.s.ratingCategoryRules, data.settings.ratingCategoryRules);
  const backup = await MangaStore.exportData();
  await MangaStore.importData(backup);
  assert.deepEqual((await MangaStore.load()).settings.ratingCategoryRules, { 5: 'custom-favorites' });
  await MangaStore.setPreferences({ customCategories: [] });
  data = await MangaStore.load();
  assert.deepEqual(data.settings.hiddenCategories, ['hold']);
  assert.deepEqual(data.settings.ratingCategoryRules, {});
  assert.equal(data.items[0].status, 'active', 'Deleting category removes dangling routing references');
  console.log('Category visibility, exact-rating routing, manual overrides, import targets, limits, backup and sync verified.');
})().catch(error => { console.error(error); process.exitCode = 1; });
