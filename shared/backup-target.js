/* Device-only backup targets. Chrome handles stay in IndexedDB; Firefox paths
 * stay in the local helper. Only owner-indexed backup files may be pruned. */
(function createBackupTarget(global) {
  'use strict';
  const HOST = 'io.mangashelf.backup_helper';
  const isChrome = () => global.MangaPlatform?.isChrome === true;
  async function directory(value) {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('mangaShelfBackupTargetsV1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('directories');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('directories', value ? 'readwrite' : 'readonly');
        const request = value ? tx.objectStore('directories').put(value, 'primary') : tx.objectStore('directories').get('primary');
        let result;
        request.onsuccess = () => { result = request.result; };
        tx.oncomplete = () => resolve(value || result);
        tx.onerror = tx.onabort = () => reject(tx.error || request.error);
      });
    } finally { db.close(); }
  }
  async function native(action, extra = {}) {
    if (!(await browser.permissions.contains({ permissions: ['nativeMessaging'] }))) throw new Error('HELPER_PERMISSION_REQUIRED');
    let result;
    try { result = await browser.runtime.sendNativeMessage(HOST, { action, owner: browser.runtime.id, ...extra }); }
    catch { throw new Error('HELPER_NOT_INSTALLED'); }
    if (!result?.ok) throw new Error(result?.error || 'HELPER_FAILED');
    return result;
  }
  async function status() {
    if (!isChrome()) {
      try { const result = await native('status'); return { selected: Boolean(result.folder), ready: Boolean(result.ready), label: result.folder || '', kind: 'native' }; }
      catch (error) { return { selected: false, ready: false, kind: 'native', error: error.message }; }
    }
    try {
      const handle = await directory();
      if (!handle) return { selected: false, ready: false, kind: 'directory' };
      return { selected: true, ready: await handle.queryPermission({ mode: 'readwrite' }) === 'granted', label: handle.name, kind: 'directory' };
    } catch (error) { return { selected: false, ready: false, kind: 'directory', error: error.message }; }
  }
  async function choose() {
    if (!isChrome()) return native('choose');
    // This call must be first, preserving transient activation from the click.
    if (typeof global.showDirectoryPicker !== 'function') throw new Error('DIRECTORY_PICKER_UNAVAILABLE');
    const handle = await global.showDirectoryPicker({ id: 'manga-shelf-backups', mode: 'readwrite', startIn: 'documents' });
    await directory(handle);
    return { ok: true, folder: handle.name };
  }
  const backupName = /^manga-shelf-\d{4}-\d{2}-\d{2}-[a-f0-9-]{20,40}\.json$/;
  async function readIndex(handle, name) {
    try {
      const index = JSON.parse(await (await (await handle.getFileHandle(name)).getFile()).text());
      if (index.version !== 1 || index.owner !== browser.runtime.id || !Array.isArray(index.files)
        || !index.files.every(entry => backupName.test(entry.name) && Number.isFinite(entry.createdAt))) throw new Error('BACKUP_INDEX_INVALID');
      return index;
    } catch (error) {
      if (error.name === 'NotFoundError') return { version: 1, owner: browser.runtime.id, files: [] };
      throw error;
    }
  }
  async function writeFile(handle, name, text) {
    const stream = await (await handle.getFileHandle(name, { create: true })).createWritable();
    try { await stream.write(text); await stream.close(); }
    catch (error) { try { await stream.abort(); } catch {} throw error; }
  }
  async function write(snapshot, day, limit) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 365) throw new Error('INVALID_BACKUP_COUNT');
    if (!snapshot?.items?.length) throw new Error('EMPTY_BACKUP');
    if (!isChrome()) return native('save', { snapshot: JSON.stringify(snapshot), day, limit });
    const handle = await directory();
    if (!handle || await handle.queryPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('FOLDER_PERMISSION_REQUIRED');
    const indexName = `.manga-shelf-index-${browser.runtime.id}.json`;
    const index = await readIndex(handle, indexName);
    const name = `manga-shelf-${day}-${crypto.randomUUID()}.json`;
    try { await handle.getFileHandle(name); throw new Error('BACKUP_FILE_EXISTS'); }
    catch (error) { if (error.name !== 'NotFoundError') throw error; }
    await writeFile(handle, name, JSON.stringify(snapshot));
    index.files.push({ name, createdAt: Date.now() });
    await writeFile(handle, indexName, JSON.stringify(index));
    index.files.sort((a, b) => a.createdAt - b.createdAt);
    let cleanupError = '';
    while (index.files.length > limit) {
      try { await handle.removeEntry(index.files[0].name); }
      catch (error) { if (error.name !== 'NotFoundError') { cleanupError = error.message; break; } }
      index.files.shift();
    }
    await writeFile(handle, indexName, JSON.stringify(index));
    return { ok: true, filename: `${handle.name}/${name}`, cleanupError };
  }
  global.MangaBackupTarget = { HOST, choose, status, write };
})(globalThis);
