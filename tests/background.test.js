/*
 * Startet das echte Hintergrundskript in einer kleinen Firefox-API-Simulation.
 * Der Test schützt genau den kritischen Pfad: Manifest-V3-Hintergrund laden,
 * Toolbar-Klick registrieren, Overlay injizieren und bei geschützten Seiten
 * auf die Sammlung ausweichen.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const listeners = {};
const injected = [];
const createdTabs = [];
let messageAttempts = 0;
let syncPrepared = false;

const event = (name) => ({
  addListener(listener) { listeners[name] = listener; }
});

const browser = {
  runtime: {
    getURL: (file) => `moz-extension://manga-regal/${file}`,
    onInstalled: event('installed'),
    onMessage: event('message')
  },
  action: { onClicked: event('action') },
  commands: { onCommand: event('command') },
  bookmarks: {
    onChanged: event('bookmarkChanged'),
    onRemoved: event('bookmarkRemoved'),
    update: async () => ({})
  },
  storage: { onChanged: event('storageChanged') },
  tabs: {
    query: async () => [],
    update: async () => ({}),
    create: async (details) => { createdTabs.push(details); return details; },
    sendMessage: async () => {
      messageAttempts += 1;
      if (messageAttempts === 1) throw new Error('Content-Script ist noch nicht geladen');
      return { ok: true };
    }
  },
  windows: { update: async () => ({}) },
  scripting: {
    insertCSS: async (details) => { injected.push({ type: 'css', details }); },
    executeScript: async (details) => { injected.push({ type: 'script', details }); }
  }
};

const MangaStore = {
  STORAGE_KEY: 'mangaRegalDataV1',
  load: async () => ({ items: [], settings: { syncEnabled: false } }),
  update: async (mutator) => {
    const data = { items: [], settings: { syncEnabled: false } };
    mutator(data);
    return data;
  },
  normalizeItem: (item) => item,
  sourceFromUrl: () => 'example.org',
  chapterFromUrl: () => '1',
  appendLog: () => {}
};

const MangaSync = {
  PREFIX: 'mangaRegalSyncV1:',
  prepare: async () => { syncPrepared = true; },
  hasConsent: async () => true,
  status: async () => ({ available: false }),
  restore: async () => ({}),
  upload: async () => ({})
};

const context = vm.createContext({
  browser, MangaStore, MangaSync, console,
  setTimeout, clearTimeout, URL
});

const backgroundSource = fs.readFileSync(path.join(root, 'background', 'background.js'), 'utf8');
vm.runInContext(backgroundSource, context, { filename: 'background/background.js' });

(async () => {
  assert.equal(typeof listeners.action, 'function', 'Toolbar-Klick wurde nicht registriert');
  assert.equal(typeof listeners.command, 'function', 'Tastenkürzel wurde nicht registriert');
  assert.equal(typeof listeners.message, 'function', 'Nachrichtenkanal wurde nicht registriert');

  // Ein normaler Webseiten-Tab lädt CSS und JavaScript genau einmal nach.
  await listeners.action({ id: 7, url: 'https://example.org/manga/chapter-1' });
  assert.deepEqual(injected.map((entry) => entry.type), ['css', 'script']);
  assert.equal(JSON.stringify(injected[1].details.files), JSON.stringify(['shared/platform.js', 'shared/store.js', 'content/overlay.js']));

  // Firefox-interne Seiten können keine Content-Scripts aufnehmen. Dort muss
  // der Klick trotzdem sichtbar reagieren und die Sammlung öffnen.
  await listeners.action({ id: 8, url: 'about:debugging' });
  assert.equal(createdTabs.at(-1)?.url, 'moz-extension://manga-regal/dashboard/index.html');

  // Die asynchrone Sync-Vorbereitung darf die Listener-Registrierung nicht
  // blockieren und wird nach dem Laden trotzdem angestoßen.
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(syncPrepared, true);

  console.log('Firefox-Hintergrund und Toolbar-Klick erfolgreich geprüft.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
