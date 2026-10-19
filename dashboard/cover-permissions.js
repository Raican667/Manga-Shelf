/* Optional Chrome cover permission: prompt only on a direct button click.
 * Saved collection data is independent of network consent and remains intact
 * after denial. The host comes from the saved item; no URL is accepted in the
 * query string. Existing cache entries are reused by the normal cache service. */
(() => {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const copy = {
    en: {
      heading: 'Save cover locally', description: 'This manga is already saved. Chrome needs your permission to download its cover from this domain:',
      explanation: 'Access applies only to this domain. No access to all websites is requested. You can decline or remove access later in Chrome. A local image file is an alternative.',
      allow: 'Allow this cover domain', close: 'Close', denied: 'Permission declined. Your manga remains saved without a downloaded cover.',
      saved: 'Cover stored locally. You can close this tab.', failed: 'The cover could not be downloaded. The server may block access; you can choose a local image instead.',
      missing: 'No saved manga with a remote cover was found.', loading: 'Downloading cover…'
    },
    de: {
      heading: 'Cover lokal speichern', description: 'Dieser Manga ist bereits gespeichert. Chrome benötigt deine Freigabe, um das Cover von dieser Domain herunterzuladen:',
      explanation: 'Der Zugriff gilt nur für diese Domain, nicht für alle Webseiten. Du kannst ablehnen oder die Freigabe später in Chrome entfernen. Alternativ kannst du eine lokale Bilddatei auswählen.',
      allow: 'Diese Cover-Domain freigeben', close: 'Schließen', denied: 'Freigabe abgelehnt. Dein Manga bleibt ohne heruntergeladenes Cover gespeichert.',
      saved: 'Cover lokal gespeichert. Du kannst diesen Tab schließen.', failed: 'Das Cover konnte nicht geladen werden. Der Server kann den Zugriff blockieren. Wähle alternativ eine lokale Bilddatei.',
      missing: 'Kein gespeicherter Manga mit einer Cover-Adresse gefunden.', loading: 'Cover wird heruntergeladen…'
    }
  };
  let text = copy.en;
  let origin = '';
  let itemId = '';
  byId('close').addEventListener('click', () => window.close());
  byId('allow').addEventListener('click', async () => {
    if (!origin || byId('allow').disabled) return;
    // This API must run before the first await in the user-gesture handler.
    const decision = browser.permissions.request({ origins: [origin] });
    byId('allow').disabled = true;
    try {
      if (!await decision) { byId('status').textContent = text.denied; return; }
      byId('status').textContent = text.loading;
      const result = await browser.runtime.sendMessage({ type: 'manga-regal:cache-cover', itemId, force: true });
      byId('status').textContent = result?.ok && ['downloaded', 'existing'].includes(result.status) ? text.saved : text.failed;
    } catch { byId('status').textContent = text.failed; }
    finally { byId('allow').disabled = false; }
  });
  (async () => {
    const data = await MangaStore.load();
    text = copy[data.settings.language === 'de' ? 'de' : 'en'];
    document.documentElement.lang = data.settings.language === 'de' ? 'de' : 'en';
    for (const id of ['heading', 'description', 'explanation', 'allow', 'close']) byId(id).textContent = text[id];
    itemId = new URLSearchParams(location.search).get('item') || '';
    const item = data.items.find((candidate) => candidate.id === itemId);
    origin = globalThis.MangaPlatform?.isChrome && item ? MangaPlatform.coverOrigin(item.cover) : '';
    byId('origin').textContent = origin ? new URL(item.cover).host : '';
    if (!origin) { byId('status').textContent = text.missing; return; }
    if (await MangaStore.getStoredCover(itemId)) { byId('status').textContent = text.saved; return; }
    byId('allow').disabled = false;
  })().catch(() => { byId('status').textContent = text.failed; });
})();
