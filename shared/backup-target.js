/* Device-local download journal. Retention only removes recorded download IDs
 * after a new full file has completed; unrelated downloads are never scanned. */
(function createBackupTarget(global) {
  'use strict';
  const KEY = 'mangaShelfBackupDownloadsV1', FOLDER = 'MangaShelf/Backups';
  const safeName = /^manga-shelf-\d{4}-\d{2}-\d{2}-[a-f0-9-]{20,40}\.json$/;
  async function status() {
    const ready = await browser.permissions.contains({ permissions: ['downloads'] });
    return { selected: true, ready, kind: 'downloads', label: FOLDER, error: ready ? '' : 'DOWNLOAD_PERMISSION_REQUIRED' };
  }
  function validEntry(entry) { return entry && Number.isInteger(entry.id) && safeName.test(entry.name) && Number.isFinite(entry.createdAt); }
  async function journal() {
    const stored = (await browser.storage.local.get(KEY))[KEY];
    if (!stored) return { files: [], pending: null };
    if (!Array.isArray(stored.files) || !stored.files.every(validEntry) || (stored.pending && !validEntry(stored.pending))) throw new Error('BACKUP_INDEX_INVALID');
    return stored;
  }
  const persist = value => browser.storage.local.set({ [KEY]: value });
  async function owned(entry) {
    const [download] = await browser.downloads.search({ id: entry.id });
    if (!download) return null;
    const path = String(download.filename).replaceAll('\\', '/');
    if (download.byExtensionId !== browser.runtime.id || !path.endsWith(`/${FOLDER}/${entry.name}`)) throw new Error('BACKUP_OWNERSHIP_MISMATCH');
    return download;
  }
  async function complete(entry) {
    for (let attempt = 0; attempt < 90; attempt++) {
      const download = await owned(entry);
      if (!download || download.state === 'interrupted') throw new Error('BACKUP_DOWNLOAD_FAILED');
      if (download.state === 'complete') {
        if (download.exists === false) throw new Error('BACKUP_DOWNLOAD_MISSING');
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('BACKUP_DOWNLOAD_PENDING');
  }
  async function prune(index, limit) {
    let cleanupError = '';
    while (index.files.length > limit) {
      try {
        const oldest = index.files[0], download = await owned(oldest);
        if (download && download.exists !== false) await browser.downloads.removeFile(oldest.id);
        if (!download) cleanupError = 'BACKUP_CLEANUP_FAILED';
        // Cleared history cannot be used to locate a file safely. Forget the
        // record, preserving the file instead of guessing a filesystem path.
        index.files.shift();
        await persist(index);
      } catch { cleanupError = 'BACKUP_CLEANUP_FAILED'; break; }
    }
    return cleanupError;
  }
  async function write(snapshot, day, limit) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 365) throw new Error('INVALID_BACKUP_COUNT');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('INVALID_BACKUP_DAY');
    if (!snapshot?.items?.length) throw new Error('EMPTY_BACKUP');
    if (!(await status()).ready) throw new Error('DOWNLOAD_PERMISSION_REQUIRED');
    const index = await journal();
    if (index.pending) {
      try { await complete(index.pending); index.files.push(index.pending); }
      catch (error) { if (error.message === 'BACKUP_DOWNLOAD_PENDING') throw error; }
      index.pending = null;
      await persist(index);
    }
    const name = `manga-shelf-${day}-${crypto.randomUUID()}.json`, json = JSON.stringify(snapshot);
    let url;
    const blobSupported = typeof URL.createObjectURL === 'function';
    if (blobSupported) {
      // Firefox rejects JSON data URLs: keep this Blob alive until completion.
      url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    } else {
      // Chrome workers lack Blob URLs. Chrome downloads accepts data URLs.
      // UTF-8 preserves non-ASCII titles. This content never leaves the browser.
      const bytes = new TextEncoder().encode(json), chunks = [];
      for (let offset = 0; offset < bytes.length; offset += 8192) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
      url = 'data:application/json;base64,' + btoa(chunks.join(''));
    }
    try {
      let id;
      try { id = await browser.downloads.download({ url, filename: `${FOLDER}/${name}`, saveAs: false, conflictAction: 'uniquify' }); }
      catch { throw new Error('BACKUP_DOWNLOAD_FAILED'); } // Do not expose private JSON inside API errors.
      index.pending = { id, name, createdAt: Date.now() };
      await persist(index);
      await complete(index.pending);
      index.files.push(index.pending); index.pending = null;
      await persist(index);
      return { ok: true, filename: `${FOLDER}/${name}`, cleanupError: await prune(index, limit) };
    } finally { if (blobSupported) URL.revokeObjectURL(url); }
  }
  global.MangaBackupTarget = { KEY, FOLDER, status, write };
})(globalThis);
