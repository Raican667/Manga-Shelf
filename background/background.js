/*
 * Hintergrundsteuerung der Firefox-Erweiterung.
 *
 * Aufgaben dieser Datei:
 *   - Klick auf das Symbol in der Firefox-Werkzeugleiste behandeln
 *   - Tastenkürzel an den aktuellen Tab weiterreichen
 *   - die große Sammlungsansicht öffnen
 *   - verknüpfte Firefox-Lesezeichen aktuell halten
 */
'use strict';

const DASHBOARD_URL = browser.runtime.getURL('dashboard/index.html');

/** Öffnet die Sammlung oder aktiviert einen bereits geöffneten Dashboard-Tab. */
async function openDashboard() {
  const allTabs = await browser.tabs.query({});
  const existing = allTabs.filter((tab) => tab.url?.startsWith(DASHBOARD_URL));
  if (existing.length) {
    await browser.tabs.update(existing[0].id, { active: true });
    if (existing[0].windowId) {
      // Das Dashboard ist bereits geöffnet; ein fehlgeschlagener Fokuswechsel
      // darf den eigentlichen Toolbar-Klick nicht abbrechen.
      try {
        await browser.windows.update(existing[0].windowId, { focused: true });
      } catch (error) {
        console.debug('Manga-Regal: Dashboard-Tab aktiviert, Fensterfokus nicht geändert', error);
      }
    }
    return;
  }
  await browser.tabs.create({ url: DASHBOARD_URL });
}

/**
 * Blendet das Formular im aktuellen Webseiten-Tab ein.
 * Firefox-interne Seiten wie about:addons erlauben keine Content Scripts;
 * dort öffnen wir stattdessen automatisch die vollständige Sammlung.
 */
async function toggleOverlay(tab) {
  if (!tab || !tab.id || !/^https?:/i.test(tab.url || '')) {
    await openDashboard();
    return;
  }

  try {
    // Ist das Formular in diesem Tab bereits vorhanden, genügt die Nachricht.
    await browser.tabs.sendMessage(tab.id, { type: 'manga-regal:toggle-overlay' });
  } catch {
    try {
      // Erst nach dem bewussten Klick des Benutzers werden CSS und JavaScript
      // in genau diesen Tab geladen. So ist kein dauerhafter Zugriff nötig.
      await browser.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['content/overlay.css']
      });
      await browser.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['shared/platform.js', 'shared/store.js', 'content/overlay.js']
      });
      await browser.tabs.sendMessage(tab.id, { type: 'manga-regal:toggle-overlay' });
    } catch (error) {
      console.error('Manga-Regal: content-script injection or popup handshake failed', error);
      // Geschützte Firefox-Seiten erlauben keine Einblendung.
      await openDashboard();
    }
  }
}

// Das Symbol unter Firefox „Erweiterungen“ bzw. in der Werkzeugleiste. Der
// Listener bleibt synchron registriert, damit Firefox ihn nach dem Ruhemodus
// des Manifest-V3-Hintergrunds zuverlässig wieder aufwecken kann.
browser.action.onClicked.addListener((tab) => {
  return toggleOverlay(tab).catch(async (error) => {
    console.error('Manga-Regal: Einblendung im aktuellen Tab fehlgeschlagen', error);
    try {
      await browser.tabs.create({ url: DASHBOARD_URL });
    } catch (dashboardError) {
      console.error('Manga-Regal: Auch die Sammlung konnte nicht geöffnet werden', dashboardError);
    }
  });
});

// Bei einer echten Neuinstallation öffnet Firefox einmalig die Sammlung. Dort
// erklärt der Startdialog die drei wichtigsten Schritte. Updates öffnen keinen
// unerwarteten Tab.
browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    return openDashboard().catch((error) => {
      console.error('Manga-Regal: Startansicht konnte nicht geöffnet werden', error);
    });
  }
  return undefined;
});

// Standardmäßig Alt+Umschalt+M; in Firefox frei konfigurierbar.
browser.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-manga-regal') return;
  try {
    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
    await toggleOverlay(activeTab);
  } catch (error) {
    console.error('Manga-Regal: Tastenkürzel konnte nicht ausgeführt werden', error);
  }
});

// Nachrichten aus Overlay oder Dashboard.
async function handleMessage(message) {
  if (message?.type === 'manga-regal:request-cover-access') {
    if (!globalThis.MangaPlatform?.isChrome) return { ok: false, status: 'unsupported' };
    // Resolve the URL from our saved record, not an arbitrary URL supplied by
    // a page. A separate extension page preserves a direct user gesture for
    // permissions.request; async message forwarding cannot guarantee that.
    const data = await MangaStore.load();
    const item = data.items.find((candidate) => candidate.id === String(message.itemId || ''));
    if (!item || !MangaPlatform.coverOrigin(item.cover)) return { ok: false, status: 'missing-item' };
    await browser.tabs.create({ url: browser.runtime.getURL('dashboard/cover-permissions.html') + '?item=' + encodeURIComponent(item.id) });
    return { ok: true };
  }
  if (message?.type === 'manga-regal:open-dashboard') {
    return openDashboard();
  }
  if (message?.type === 'manga-regal:cache-cover') {
    const data = await MangaStore.load();
    const item = data.items.find((candidate) => candidate.id === String(message.itemId || ''));
    if (!item) return { ok: false, status: 'missing-item' };
    const storedCover = await MangaStore.getStoredCover(item.id);
    if (storedCover) return { ok: true, status: 'existing' };
    if (item.coverDetectionDisabled && message.force !== true) {
      return { ok: true, status: 'disabled' };
    }
    if (!item.cover) return { ok: true, status: 'missing' };
    try {
      await MangaStore.cacheCover(item, { force: message.force === true });
      await MangaStore.update((current) => {
        MangaStore.appendLog(current, 'info', 'Cover', `Cover für „${item.title}“ lokal gespeichert`, item.cover);
      });
      return { ok: true, status: 'downloaded' };
    } catch (error) {
      if (error.code === 'COVER_PERMISSION_REQUIRED') return { ok: false, status: 'permission-required' };
      await MangaStore.update((current) => {
        MangaStore.appendLog(current, 'warning', 'Cover', `Cover für „${item.title}“ konnte nicht geladen werden`, error.message);
      });
      return { ok: false, status: 'failed', message: error.message };
    }
  }
  if (message?.type === 'manga-regal:update-linked-bookmark') {
    const data = await MangaStore.load();
    const item = data.items.find((candidate) => candidate.id === String(message.itemId || ''));
    if (!item) return { ok: false, status: 'missing-item' };
    if (!item.bookmarkId) return { ok: true, status: 'not-linked' };
    try {
      await browser.bookmarks.update(item.bookmarkId, { title: item.title, url: item.url });
      return { ok: true, status: 'updated' };
    } catch (error) {
      await MangaStore.update((current) => {
        MangaStore.appendLog(current, 'warning', 'Firefox', `Lesezeichen für „${item.title}“ konnte nicht aktualisiert werden`, error.message);
      });
      return { ok: false, status: 'failed', message: error.message };
    }
  }
  return undefined;
}

// Keep the response channel open explicitly in Chrome. Unknown messages must
// not claim a response channel belonging to another extension listener.
browser.runtime.onMessage.addListener(globalThis.MangaPlatform?.isChrome
  ? (message, sender, sendResponse) => {
    if (!['manga-regal:open-dashboard', 'manga-regal:cache-cover', 'manga-regal:request-cover-access', 'manga-regal:update-linked-bookmark'].includes(message?.type)) return false;
    handleMessage(message).then((result) => sendResponse(result ?? { ok: true }),
      (error) => sendResponse({ ok: false, status: 'failed', message: String(error.message) }));
    return true;
  }
  : handleMessage);

/**
 * Wurde ein verknüpftes Firefox-Lesezeichen umbenannt oder verschoben,
 * aktualisieren wir Titel und URL im Manga-Regal. Eigene Tags, Status und
 * Bewertung bleiben dabei unangetastet.
 */
browser.bookmarks.onChanged.addListener(async (bookmarkId, changeInfo) => {
  await MangaStore.update((data) => {
    const item = data.items.find((candidate) => candidate.bookmarkId === bookmarkId);
    if (!item) return;
    if (changeInfo.title) item.title = changeInfo.title;
    if (changeInfo.url) {
      const checkedUrl = MangaStore.normalizeItem({ title: item.title, url: changeInfo.url }).url;
      if (checkedUrl) {
        item.url = checkedUrl;
        item.source = MangaStore.sourceFromUrl(checkedUrl);
        const detectChapter = data.settings.chapterDetectionEnabled !== false
          && item.chapterDetectionDisabled !== true;
        if (!item.chapterManual && detectChapter) {
          item.currentChapter = MangaStore.chapterFromUrl(checkedUrl);
        }
      }
    }
    item.modified = Date.now();
    MangaStore.appendLog(data, 'info', 'Firefox', `Lesezeichen „${item.title}“ aktualisiert`);
  });
});

/**
 * Beim Löschen eines Firefox-Lesezeichens bleibt der Manga-Eintrag erhalten.
 * Lediglich die Verknüpfung wird entfernt, damit keine Bewertungen verloren gehen.
 */
browser.bookmarks.onRemoved.addListener(async (bookmarkId) => {
  await MangaStore.update((data) => {
    const item = data.items.find((candidate) => candidate.bookmarkId === bookmarkId);
    if (!item) return;
    item.bookmarkId = '';
    item.modified = Date.now();
    MangaStore.appendLog(
      data,
      'warning',
      'Firefox',
      `Firefox-Lesezeichen für „${item.title}“ wurde entfernt`,
      'Der Manga bleibt im Manga-Regal gespeichert.'
    );
  });
});

/* -------------------------------------------------------------------------
 * Firefox-Sync-Orchestrierung
 * -------------------------------------------------------------------------
 *
 * Backend-Sicht: storage.local ist weiterhin die führende Datenbank dieses
 * Geräts. storage.sync ist kein transaktionales Datenbanksystem, sondern ein
 * verzögert replizierter Key/Value-Speicher mit harten Quoten. MangaSync legt
 * deshalb versionierte Snapshots ab. Erst wenn Meta-Datensatz und alle
 * komprimierten Transportstücke dieselbe Revision tragen, wird ein Stand gelesen.
 * Ein während der Übertragung nur teilweise sichtbarer Snapshot wird ignoriert
 * und beim nächsten storage.onChanged-Ereignis erneut geprüft.
 */
let localSyncTimer = null;
let localPreparationTimer = null;
let remoteSyncTimer = null;

/**
 * Erzeugt kurz nach jeder fachlichen Datenänderung die dauerhafte komprimierte
 * Sync-Kopie. Das geschieht unabhängig davon, ob Sync gerade eingeschaltet ist.
 * Ein späterer manueller oder automatischer Sync muss dann nur noch den bereits
 * vorbereiteten Cache in storage.sync übertragen.
 */
function scheduleSyncPreparation() {
  clearTimeout(localPreparationTimer);
  localPreparationTimer = setTimeout(async () => {
    try {
      await MangaSync.prepare(await MangaStore.load());
    } catch (error) {
      console.warn('Manga-Regal: komprimierter Sync-Cache konnte nicht vorbereitet werden', error);
    }
  }, 250);
}

/**
 * Mehrere lokale Schreibvorgänge (z. B. Manga + Logeintrag) werden zu genau
 * einem Upload zusammengefasst. Das reduziert Schreiblast und verhindert,
 * dass kurzlebige Zwischenstände repliziert werden.
 */
function scheduleSyncUpload() {
  if (globalThis.MangaPlatform?.isChrome) {
    // Timers can disappear when Chrome suspends the worker. Alarms survive it.
    browser.alarms.create('manga-regal:sync-upload', { delayInMinutes: 0.5 });
    return;
  }
  clearTimeout(localSyncTimer);
  localSyncTimer = setTimeout(async () => {
    try {
      const current = await MangaStore.load();
      if (current.settings.syncEnabled) await MangaSync.upload();
    } catch (error) {
      // Kein Fehler-Log in MangaStore schreiben: Das wäre selbst wieder eine
      // lokale Änderung und könnte eine endlose Upload-Schleife auslösen.
      console.warn('Manga-Regal: automatischer Firefox-Sync fehlgeschlagen', error);
    }
  }, 1500);
}

/**
 * Firefox überträgt die Schlüssel eines Snapshots nicht zwingend gleichzeitig.
 * Das kurze Debounce-Fenster gibt Meta-, Kern- und Bündel-Schlüsseln Zeit,
 * gemeinsam anzukommen, bevor der konsistente Stand wiederhergestellt wird.
 */
function scheduleSyncRestore() {
  if (globalThis.MangaPlatform?.isChrome) {
    browser.alarms.create('manga-regal:sync-restore', { delayInMinutes: 0.5 });
    return;
  }
  clearTimeout(remoteSyncTimer);
  remoteSyncTimer = setTimeout(async () => {
    try {
      const current = await MangaStore.load();
      if (current.settings.syncEnabled) await MangaSync.restore();
    } catch (error) {
      console.info('Manga-Regal: Firefox-Sync-Snapshot noch nicht lesbar', error);
    }
  }, 2500);
}

if (globalThis.MangaPlatform?.isChrome) {
  browser.alarms.onAlarm.addListener(async (alarm) => {
    try {
      if (!(await MangaStore.load()).settings.syncEnabled) return;
      if (alarm.name === 'manga-regal:sync-upload') await MangaSync.upload();
      if (alarm.name === 'manga-regal:sync-restore') await MangaSync.restore();
    } catch (error) {
      console.warn('Manga Shelf: scheduled sync failed', error);
    }
  });
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[MangaStore.STORAGE_KEY]) {
    scheduleSyncPreparation();
    scheduleSyncUpload();
  }
  if (area === 'sync' && Object.keys(changes).some((key) => key.startsWith(MangaSync.PREFIX))) {
    scheduleSyncRestore();
  }
});

/**
 * Beim Start gewinnt ein bereits vorhandener entfernter Snapshot. Existiert
 * noch keiner, wird die lokale Sammlung als erster Snapshot veröffentlicht.
 */
async function initializeFirefoxSync(syncOnStart = !globalThis.MangaPlatform?.isChrome) {
  const current = await MangaStore.load();
  try {
    // Die komprimierte Kopie wird auch bei ausgeschaltetem Sync bereitgehalten.
    await MangaSync.prepare(current);
    // Chrome restarts workers frequently: a wake-up must not overwrite pending
    // local edits with an older remote snapshot. Restore only at browser startup;
    // subsequent changes are handled by durable alarms and storage events.
    if (!syncOnStart) return;
    if (!current.settings.syncEnabled) return;
    if (globalThis.MangaPlatform?.isChrome
      && await browser.alarms.get('manga-regal:sync-upload')) {
      // A pending upload means local edits have not reached Sync yet. Never
      // restore over them merely because the browser was restarted.
      await MangaSync.upload({ data: current });
      return;
    }
    // Ein Update von einer älteren Version kann noch einen eingeschalteten
    // Schalter enthalten. Ohne Mozillas neue optionale Datenfreigabe wird diese
    // Alt-Einstellung sicher deaktiviert, bevor storage.sync gelesen wird.
    if (!(await MangaSync.hasConsent())) {
      await MangaStore.setPreferences({ syncEnabled: false });
      return;
    }
    const state = await MangaSync.status();
    if (state.available) await MangaSync.restore();
    else await MangaSync.upload({ data: current, force: true });
  } catch (error) {
    console.warn('Manga-Regal: Firefox-Sync konnte nicht initialisiert werden', error);
  }
}

if (globalThis.MangaPlatform?.isChrome) {
  browser.runtime.onStartup.addListener(() => initializeFirefoxSync(true));
}

initializeFirefoxSync().catch((error) => {
  // Der Toolbar-Listener ist zu diesem Zeitpunkt bereits registriert. Ein
  // defekter Sync-Stand darf deshalb niemals das gesamte Add-on stilllegen.
  console.error('Manga-Regal: Hintergrundinitialisierung fehlgeschlagen', error);
});
