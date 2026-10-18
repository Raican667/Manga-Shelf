/*
 * Firefox-Sync für Manga-Regal.
 *
 * Architektur aus Backend-Sicht
 * --------------------------------
 * storage.local bleibt die lokale Source of Truth. storage.sync wird wie ein
 * entfernter Replikationskanal behandelt, nicht wie eine Datenbank: Es gibt
 * keine Transaktionen über mehrere Schlüssel und Änderungen können auf einem
 * zweiten Gerät zeitversetzt eintreffen.
 *
 * Firefox begrenzt Erweiterungen auf 8.192 Byte je Schlüssel, 102.400 Byte
 * insgesamt und 512 Schlüssel. Deshalb wird der vollständige JSON-Snapshot
 * zuerst mit gzip komprimiert, danach Base64-kodiert und erst anschließend in
 * ca. 7-KB-Transportstücke geteilt. Die Kompression arbeitet über die gesamte
 * Sammlung und kann wiederholte Domains, Tags, Statuswerte und Feldstrukturen
 * gemeinsam verdichten. So wird deutlich weniger Kontingent benötigt als bei
 * einzeln serialisierten Manga-Bündeln.
 *
 * Cover-Bilddaten, Logs und gerätespezifische Bookmark-IDs sind absichtlich
 * kein Teil des Sync-Vertrags. Sie bleiben ausschließlich in storage.local.
 */
(function createMangaSync(global) {
  'use strict';

  // Das Präfix bleibt für vorhandene Sync-Daten stabil. Unkomprimierte
  // Altdaten werden gelesen und beim nächsten Upload ersetzt.
  const PREFIX = 'mangaRegalSyncV1:';
  const META_KEY = `${PREFIX}meta`;
  const LEGACY_CORE_KEY = `${PREFIX}core`;
  const CHUNK_PREFIX = `${PREFIX}chunk:`;
  const LOCAL_STATE_KEY = 'mangaRegalSyncStateV1';
  // Device-only consent: never part of settings, snapshots, or JSON backups.
  const CHROME_CONSENT_KEY = 'mangaRegalChromeSyncConsentV1';
  const LOCAL_CACHE_KEY = 'mangaRegalCompressedSyncCacheV1';
  const ENCODING = 'gzip-base64-v1';
  const MAX_ITEM_BYTES = 8192;
  const TARGET_PAYLOAD_CHARS = 7400;
  const MAX_TOTAL_BYTES = 102400;
  const SAFE_TOTAL_BYTES = 98000;
  const MAX_SYNC_KEYS = 512;
  // Mozilla behandelt auch browser.storage.sync als Übertragung außerhalb des
  // lokalen Browsers. Diese Kategorien beschreiben den optionalen Snapshot:
  // gespeicherte URLs/Lesezeichen, Seitentitel und -beschreibungen sowie die
  // vom Nutzer gepflegten Manga- und Anwendungseinstellungen. Cover, Cookies,
  // Logs und gerätespezifische Lesezeichen-IDs verlassen das Gerät weiterhin nie.
  const DATA_COLLECTION_PERMISSIONS = Object.freeze([
    'bookmarksInfo',
    'browsingActivity',
    'technicalAndInteraction',
    'websiteActivity',
    'websiteContent'
  ]);

  const byteLength = (value) => new TextEncoder().encode(String(value)).length;
  const storedBytes = (key, value) => byteLength(key) + byteLength(JSON.stringify(value));
  const chunkKey = (index) => `${CHUNK_PREFIX}${String(index).padStart(3, '0')}`;

  /**
   * Prüft Mozillas eingebaute Einwilligung unabhängig von der fachlichen
   * syncEnabled-Einstellung. Dadurch reicht ein alter oder manipulierter lokaler
   * Schalter niemals aus, um Daten ohne Firefox-Freigabe zu übertragen.
   */
  async function hasConsent() {
    if (global.MangaPlatform?.isChrome) {
      const stored = await browser.storage.local.get(CHROME_CONSENT_KEY);
      return stored[CHROME_CONSENT_KEY]?.accepted === true;
    }
    const granted = await browser.permissions.getAll();
    const dataCollection = Array.isArray(granted.data_collection) ? granted.data_collection : [];
    return DATA_COLLECTION_PERMISSIONS.every((permission) => dataCollection.includes(permission));
  }

  /**
   * Muss direkt aus einer Nutzeraktion aufgerufen werden: Firefox zeigt den
   * eigenen Berechtigungsdialog und liefert nur bei Zustimmung true zurück.
   */
  async function requestConsent(options = {}) {
    if (global.MangaPlatform?.isChrome) {
      // Only the confirmation button may grant consent; ordinary requests and
      // background jobs can check it, but must never create it automatically.
      if (options.confirmed === true) {
        await browser.storage.local.set({ [CHROME_CONSENT_KEY]: { accepted: true, at: Date.now() } });
      }
      return hasConsent();
    }
    return browser.permissions.request({ data_collection: [...DATA_COLLECTION_PERMISSIONS] });
  }

  /** Entfernt die optionale Freigabe beim bewussten Ausschalten von Sync. */
  async function revokeConsent() {
    if (global.MangaPlatform?.isChrome) {
      await browser.storage.local.remove(CHROME_CONSENT_KEY);
      return true;
    }
    const granted = await browser.permissions.getAll();
    const dataCollection = Array.isArray(granted.data_collection) ? granted.data_collection : [];
    const removable = DATA_COLLECTION_PERMISSIONS.filter((permission) => dataCollection.includes(permission));
    if (!removable.length) return true;
    return browser.permissions.remove({ data_collection: removable });
  }

  async function requireConsent() {
    if (await hasConsent()) return;
    throw new Error('Firefox Sync benötigt zuerst deine Zustimmung zu den optionalen Datenberechtigungen.');
  }

  /**
   * Persistierter Datenvertrag eines Manga-Datensatzes im Sync.
   * Das Arrayformat spart zusätzliche Feldnamen vor der gzip-Kompression. Die
   * Reihenfolge darf nur zusammen mit einer neuen Sync-Version verändert werden.
   */
  function compactItem(item) {
    return [
      String(item.id || ''),
      String(item.title || '').slice(0, 300),
      String(item.url || '').slice(0, 1500),
      String(item.description || '').slice(0, 500),
      String(item.currentChapter || '').slice(0, 100),
      item.chapterManual ? 1 : 0,
      Array.isArray(item.tags) ? item.tags.map(String).slice(0, 50) : [],
      Number(item.rating) || 0,
      String(item.status || 'active'),
      Number(item.created) || Date.now(),
      Number(item.modified) || Date.now(),
      item.chapterDetectionDisabled ? 1 : 0,
      item.coverDetectionDisabled ? 1 : 0,
      String(item.rereadOf || ''),
      Number(item.rereadRound) || 0
    ];
  }

  function expandItem(item) {
    return MangaStore.normalizeItem({
      id: item[0], title: item[1], url: item[2], description: item[3],
      currentChapter: item[4], chapterManual: Boolean(item[5]), tags: item[6],
      rating: item[7], status: item[8], created: item[9], modified: item[10],
      chapterDetectionDisabled: item[11] === 1,
      coverDetectionDisabled: item[12] === 1,
      rereadOf: item[13] || '',
      rereadRound: item[14] || 0,
      cover: '', favicon: '', bookmarkId: '', folderPath: []
    });
  }

  /** Alte Bündelung bleibt für Migrationstests erhalten; neue Uploads sind gzip-komprimiert. */
  function buildChunks(items, revision) {
    const chunks = [];
    let current = [];
    for (const item of items.map(compactItem)) {
      const candidate = { r: revision, i: [...current, item] };
      if (current.length && storedBytes(chunkKey(chunks.length), candidate) > TARGET_PAYLOAD_CHARS) {
        chunks.push({ r: revision, i: current });
        current = [item];
      } else {
        current.push(item);
      }
      if (storedBytes(chunkKey(chunks.length), { r: revision, i: current }) > MAX_ITEM_BYTES) {
        throw new Error(`„${item[1] || 'Manga'}“ enthält zu viele Metadaten für Firefox Sync.`);
      }
    }
    if (current.length) chunks.push({ r: revision, i: current });
    return chunks;
  }

  function bytesToBase64(bytes) {
    const parts = [];
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
    }
    return global.btoa(parts.join(''));
  }

  function base64ToBytes(value) {
    const binary = global.atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  /** Nutzt die in aktuellen Firefox-Versionen eingebaute gzip-Implementierung. */
  async function transformGzip(bytes, decompress = false) {
    const Stream = decompress ? global.DecompressionStream : global.CompressionStream;
    if (typeof Stream !== 'function') {
      throw new Error('Diese Firefox-Version unterstützt die benötigte Sync-Kompression nicht. Bitte Firefox aktualisieren.');
    }
    const transformed = new Blob([bytes]).stream().pipeThrough(new Stream('gzip'));
    return new Uint8Array(await new Response(transformed).arrayBuffer());
  }

  async function compressSnapshot(snapshot) {
    const json = JSON.stringify(snapshot);
    const compressed = await transformGzip(new TextEncoder().encode(json));
    return { payload: bytesToBase64(compressed), jsonBytes: byteLength(json), compressedBytes: compressed.length };
  }

  async function decompressSnapshot(payload) {
    const bytes = await transformGzip(base64ToBytes(payload), true);
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  /**
   * Kurze Inhalts-Signatur des unkomprimierten Sync-Vertrags. Sie dient nur
   * zur Cache-Erkennung, nicht als kryptografischer Integritätsnachweis.
   */
  function snapshotSignature(json) {
    let hash = 2166136261;
    for (let index = 0; index < json.length; index += 1) {
      hash ^= json.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `${json.length}:${(hash >>> 0).toString(16)}`;
  }

  function createSnapshot(data) {
    return {
      v: Number(data.version) || 1,
      s: { ...data.settings, onboardingComplete: true, syncEnabled: true },
      t: Array.isArray(data.customTags) ? data.customTags : [],
      i: data.items.map(compactItem)
    };
  }

  /**
   * Pflegt eine dauerhafte komprimierte Kopie in storage.local.
   *
   * Der normale Arbeitsdatensatz bleibt für Suche und Bearbeitung direkt
   * zugänglich. Nur der unveränderliche Sync-Snapshot wird komprimiert. Stimmen
   * Inhalts-Signatur und Cache überein, findet keine erneute gzip-Arbeit statt –
   * auch dann nicht, wenn der Benutzer „Jetzt synchronisieren“ erzwingt.
   */
  async function prepare(data = null) {
    const current = data || await MangaStore.load();
    const snapshot = createSnapshot(current);
    const json = JSON.stringify(snapshot);
    const signature = snapshotSignature(json);
    const stored = await browser.storage.local.get(LOCAL_CACHE_KEY);
    const cached = stored[LOCAL_CACHE_KEY];
    if (cached?.signature === signature && typeof cached.payload === 'string') {
      return { ...cached, reused: true };
    }

    const compressedBytes = await transformGzip(new TextEncoder().encode(json));
    const next = {
      signature,
      payload: bytesToBase64(compressedBytes),
      jsonBytes: byteLength(json),
      compressedBytes: compressedBytes.length,
      itemCount: current.items.length,
      preparedAt: Date.now()
    };
    await browser.storage.local.set({ [LOCAL_CACHE_KEY]: next });
    return { ...next, reused: false };
  }

  /**
   * Teilt ausschließlich die bereits komprimierte Base64-Zeichenfolge. Jedes
   * Stück trägt die Snapshot-Revision, sodass gemischte Teilstände nie gelesen
   * werden. Die tatsächliche JSON-Größe wird für jeden Schlüssel kontrolliert.
   */
  function buildCompressedChunks(payload, revision) {
    const chunks = [];
    let offset = 0;
    while (offset < payload.length) {
      const key = chunkKey(chunks.length);
      let take = Math.min(TARGET_PAYLOAD_CHARS, payload.length - offset);
      let chunk = { r: revision, d: payload.slice(offset, offset + take) };
      while (take > 0 && storedBytes(key, chunk) > MAX_ITEM_BYTES) {
        take -= 128;
        chunk = { r: revision, d: payload.slice(offset, offset + take) };
      }
      if (take <= 0) throw new Error('Komprimierte Sync-Daten konnten nicht sicher aufgeteilt werden.');
      chunks.push(chunk);
      offset += take;
    }
    return chunks;
  }

  async function localState() {
    const result = await browser.storage.local.get(LOCAL_STATE_KEY);
    return result[LOCAL_STATE_KEY] || {};
  }

  async function setLocalState(state) {
    await browser.storage.local.set({ [LOCAL_STATE_KEY]: state });
  }

  /**
   * Schreibt einen vollständigen, komprimierten Snapshot ohne Cover.
   *
   * Alte Manga-Regal-Schlüssel werden vor dem neuen Snapshot entfernt, weil
   * ein bereits fast voller Altstand sonst auch einen viel kleineren Stand
   * blockieren würde. Schlägt das Schreiben fehl, wird der alte Snapshot
   * bestmöglich zurückgeschrieben; die lokale Sammlung bleibt unangetastet.
   */
  async function upload(options = {}) {
    await requireConsent();
    const data = options.data || await MangaStore.load();
    const state = await localState();
    const prepared = await prepare(data);
    if (!options.force && state.signature === prepared.signature && state.status === 'ok') {
      return { ...state, skipped: true, cacheReused: true };
    }

    const revision = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const chunks = buildCompressedChunks(prepared.payload, revision);
    const meta = {
      r: revision, c: chunks.length, n: data.items.length, at: Date.now(), z: ENCODING,
      u: prepared.jsonBytes, g: prepared.compressedBytes, p: prepared.payload.length
    };
    const values = { [META_KEY]: meta };
    chunks.forEach((chunk, index) => { values[chunkKey(index)] = chunk; });

    for (const [key, value] of Object.entries(values)) {
      if (storedBytes(key, value) > MAX_ITEM_BYTES) {
        throw new Error('Ein komprimiertes Firefox-Sync-Teilstück überschreitet 8 KB.');
      }
    }

    const existing = await browser.storage.sync.get(null);
    const mangaRegalKeys = Object.keys(existing).filter((key) => key.startsWith(PREFIX));
    const otherEntries = Object.entries(existing).filter(([key]) => !key.startsWith(PREFIX));
    const totalBytes = [...otherEntries, ...Object.entries(values)]
      .reduce((sum, [key, value]) => sum + storedBytes(key, value), 0);
    const totalKeys = otherEntries.length + Object.keys(values).length;
    if (totalKeys > MAX_SYNC_KEYS) {
      throw new Error(`Firefox Sync benötigt ${totalKeys} Schlüssel, erlaubt sind ${MAX_SYNC_KEYS}.`);
    }
    if (totalBytes > SAFE_TOTAL_BYTES) {
      throw new Error(`Der komprimierte Firefox Sync ist voll (${Math.ceil(totalBytes / 1024)} KB von 100 KB). Bitte sichere die vollständige Sammlung als JSON.`);
    }

    const backup = Object.fromEntries(mangaRegalKeys.map((key) => [key, existing[key]]));
    if (mangaRegalKeys.length) await browser.storage.sync.remove(mangaRegalKeys);
    try {
      await browser.storage.sync.set(values);
    } catch (error) {
      if (Object.keys(backup).length) {
        try { await browser.storage.sync.set(backup); } catch { /* storage.local bleibt führend. */ }
      }
      throw error;
    }

    const usedBytes = typeof browser.storage.sync.getBytesInUse === 'function'
      ? await browser.storage.sync.getBytesInUse(null)
      : totalBytes;
    const nextState = {
      status: 'ok', revision, dataUpdatedAt: data.updatedAt, lastSync: Date.now(),
      itemCount: data.items.length, chunkCount: chunks.length, usedBytes,
      uncompressedBytes: prepared.jsonBytes, compressedBytes: prepared.compressedBytes,
      signature: prepared.signature, cacheReused: prepared.reused
    };
    await setLocalState(nextState);
    return nextState;
  }

  function readLegacySnapshot(values, meta) {
    const core = values[LEGACY_CORE_KEY];
    if (!core || meta.r !== core.r) {
      throw new Error('Firefox Sync ist noch nicht vollständig übertragen. Bitte später erneut versuchen.');
    }
    const chunks = [];
    for (let index = 0; index < Number(meta.c || 0); index += 1) {
      const chunk = values[chunkKey(index)];
      if (!chunk || chunk.r !== meta.r || !Array.isArray(chunk.i)) {
        throw new Error('Firefox Sync ist noch nicht vollständig übertragen. Bitte später erneut versuchen.');
      }
      chunks.push(chunk);
    }
    return {
      meta,
      data: {
        version: core.v,
        items: chunks.flatMap((chunk) => chunk.i.map(expandItem)),
        customTags: Array.isArray(core.t) ? core.t : [],
        settings: core.s || {}
      }
    };
  }

  /** Validiert alle Stücke derselben Revision und dekomprimiert erst danach. */
  async function readRemote() {
    await requireConsent();
    const values = await browser.storage.sync.get(null);
    const meta = values[META_KEY];
    if (!meta) return null;
    if (meta.z !== ENCODING) return readLegacySnapshot(values, meta);

    const payload = [];
    for (let index = 0; index < Number(meta.c || 0); index += 1) {
      const chunk = values[chunkKey(index)];
      if (!chunk || chunk.r !== meta.r || typeof chunk.d !== 'string') {
        throw new Error('Firefox Sync ist noch nicht vollständig übertragen. Bitte später erneut versuchen.');
      }
      payload.push(chunk.d);
    }
    const joined = payload.join('');
    if (Number(meta.p) !== joined.length) {
      throw new Error('Firefox Sync enthält einen unvollständigen komprimierten Snapshot.');
    }
    const snapshot = await decompressSnapshot(joined);
    return {
      meta,
      data: {
        version: snapshot.v,
        items: Array.isArray(snapshot.i) ? snapshot.i.map(expandItem) : [],
        customTags: Array.isArray(snapshot.t) ? snapshot.t : [],
        settings: snapshot.s || {}
      }
    };
  }

  /** Lädt Metadaten und erhält lokale Cover/Firefox-Verknüpfungen per stabiler ID. */
  async function restore(options = {}) {
    await requireConsent();
    const remote = await readRemote();
    if (!remote) throw new Error('In Firefox Sync wurde noch keine Manga-Regal-Sammlung gefunden.');
    const state = await localState();
    if (!options.force && state.revision === remote.meta.r) return { ...state, skipped: true };

    const local = await MangaStore.load();
    const localById = new Map(local.items.map((item) => [item.id, item]));
    const items = remote.data.items.map((item) => {
      const existing = localById.get(item.id);
      return {
        ...item,
        cover: existing?.cover || '', favicon: existing?.favicon || '',
        bookmarkId: existing?.bookmarkId || '', folderPath: existing?.folderPath || []
      };
    });
    const saved = await MangaStore.save({
      ...local,
      version: remote.data.version,
      items,
      customTags: remote.data.customTags,
      logs: local.logs,
      settings: { ...local.settings, ...remote.data.settings, syncEnabled: true }
    });
    const usedBytes = typeof browser.storage.sync.getBytesInUse === 'function'
      ? await browser.storage.sync.getBytesInUse(null)
      : 0;
    // Der gerade geladene Stand wird sofort auch als lokaler Sync-Cache
    // vorbereitet. Dadurch interpretiert der Hintergrund das Restore nicht als
    // neue fachliche Änderung und lädt denselben Snapshot nicht erneut hoch.
    const prepared = await prepare(saved);
    const nextState = {
      status: 'ok', revision: remote.meta.r, dataUpdatedAt: saved.updatedAt,
      lastSync: Date.now(), itemCount: items.length, chunkCount: remote.meta.c, usedBytes,
      uncompressedBytes: remote.meta.u || prepared.jsonBytes,
      compressedBytes: remote.meta.g || prepared.compressedBytes,
      signature: prepared.signature, cacheReused: prepared.reused
    };
    await setLocalState(nextState);
    return nextState;
  }

  async function status() {
    const state = await localState();
    const consentGranted = await hasConsent();
    if (!consentGranted) {
      return {
        ...state,
        consentGranted: false,
        available: false,
        remoteRevision: 0,
        itemCount: state.itemCount || 0,
        chunkCount: state.chunkCount || 0,
        uncompressedBytes: state.uncompressedBytes || 0,
        compressedBytes: state.compressedBytes || 0,
        usedBytes: state.usedBytes || 0,
        maxBytes: MAX_TOTAL_BYTES
      };
    }
    const remote = await browser.storage.sync.get(META_KEY);
    const meta = remote[META_KEY];
    const usedBytes = typeof browser.storage.sync.getBytesInUse === 'function'
      ? await browser.storage.sync.getBytesInUse(null)
      : Number(state.usedBytes) || 0;
    return {
      ...state,
      consentGranted: true,
      available: Boolean(meta), remoteRevision: meta?.r || 0,
      itemCount: meta?.n ?? state.itemCount ?? 0,
      chunkCount: meta?.c ?? state.chunkCount ?? 0,
      uncompressedBytes: meta?.u ?? state.uncompressedBytes ?? 0,
      compressedBytes: meta?.g ?? state.compressedBytes ?? 0,
      usedBytes, maxBytes: MAX_TOTAL_BYTES
    };
  }

  global.MangaSync = {
    PREFIX, META_KEY, LOCAL_CACHE_KEY, DATA_COLLECTION_PERMISSIONS,
    prepare, upload, restore, status, readRemote,
    hasConsent, requestConsent, revokeConsent,
    compactItem, expandItem, buildChunks, buildCompressedChunks,
    compressSnapshot, decompressSnapshot
  };
})(globalThis);
