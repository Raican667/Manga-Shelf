/* Background-only scheduling. Targets are explicit; no Downloads fallback.
 * A day succeeds only after a full backup and its ownership index commit. */
(function createBackups(global) {
  'use strict';
  const KEY = 'mangaShelfDailyBackupV1', ALARM = 'manga-shelf:daily-backup';
  let running = null, queue = Promise.resolve();
  const dayOf = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  async function status() {
    const stored = (await browser.storage.local.get(KEY))[KEY] || { enabled: false };
    return { ...stored, pending: null, limit: Math.max(1, Math.min(365, Math.trunc(Number(stored.limit) || 7))) };
  }
  function write(patch) {
    const task = queue.then(async () => {
      const next = { ...await status(), ...patch };
      await browser.storage.local.set({ [KEY]: next });
      return next;
    });
    queue = task.catch(() => {});
    return task;
  }
  async function perform({ force = false, now = new Date() } = {}) {
    const config = await status(), day = dayOf(now);
    if (!force && (!config.enabled || config.lastSuccessDay === day)) return { skipped: true, ...config };
    const target = await MangaBackupTarget.status();
    if (!target.ready) throw new Error(target.error || 'FOLDER_PERMISSION_REQUIRED');
    const data = await MangaStore.exportData();
    if (!data.items.length) throw new Error('EMPTY_BACKUP');
    const result = await MangaBackupTarget.write(data, day, config.limit);
    return write({ error: result.cleanupError || '', lastSuccessAt: Date.now(), lastSuccessDay: day,
      lastFilename: result.filename, lastItemCount: data.items.length, pending: null });
  }
  function run(options) {
    if (running) return running;
    running = perform(options).catch(async error => { await write({ error: error.message }); throw error; })
      .finally(() => { running = null; });
    return running;
  }
  async function schedule() {
    if (!(await status()).enabled) { await browser.alarms?.clear?.(ALARM); return; }
    if (!(await browser.alarms.get(ALARM))) await browser.alarms.create(ALARM, { delayInMinutes: 1, periodInMinutes: 60 });
  }
  async function configure(enabled, limit) {
    if (limit !== undefined && (!Number.isInteger(Number(limit)) || Number(limit) < 1 || Number(limit) > 365)) throw new Error('INVALID_BACKUP_COUNT');
    if (enabled) {
      const target = await MangaBackupTarget.status();
      if (!target.ready) throw new Error(target.error || 'FOLDER_PERMISSION_REQUIRED');
    }
    await write({ enabled: Boolean(enabled), ...(limit !== undefined ? { limit: Number(limit) } : {}) });
    await schedule();
    if (enabled) await run();
    return status();
  }
  async function destinationChanged() {
    if (running) await running.catch(() => {});
    await write({ lastSuccessDay: '', lastFilename: '', error: '', pending: null });
    if ((await status()).enabled) await run();
    return status();
  }
  async function initialize() { await schedule(); if ((await status()).enabled) await run(); }
  global.MangaBackups = { KEY, ALARM, status, configure, run, initialize, destinationChanged };
})(globalThis);
