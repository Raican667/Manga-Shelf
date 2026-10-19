/* Browser differences live here, not in the collection's data model.
 * Chrome builds target 148+, with native Promise-based browser APIs.
 * Stable storage keys and message names intentionally remain unchanged. */
(() => {
  'use strict';
  const manifest = browser.runtime.getManifest();
  const isChrome = !manifest.browser_specific_settings?.gecko;
  const allCoverOrigins = ['http://*/*', 'https://*/*'];
  function coverOrigin(url) {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol) ? `${parsed.protocol}//${parsed.hostname}/*` : '';
    } catch { return ''; }
  }
  globalThis.MangaPlatform = Object.freeze({
    isChrome,
    coverOrigin,
    // Browser grants, not synchronized preferences, are the source of truth.
    // Keep request() synchronous so the settings click retains its user gesture.
    hasAllCoverAccess: () => isChrome ? browser.permissions.contains({ origins: allCoverOrigins }) : Promise.resolve(false),
    requestAllCoverAccess: () => isChrome ? browser.permissions.request({ origins: allCoverOrigins }) : Promise.resolve(false),
    removeAllCoverAccess: () => isChrome ? browser.permissions.remove({ origins: allCoverOrigins }) : Promise.resolve(false),
    // Data URLs and cached images do not need network permission. This check
    // is deliberately separate from request(): background work cannot prompt.
    hasCoverAccess: async (url) => !isChrome || !coverOrigin(url)
      || browser.permissions.contains({ origins: [coverOrigin(url)] }),
    browserName: isChrome ? 'Chrome' : 'Firefox',
    // Firefox search.search and Chrome search.query use different property names.
    search: (query, engine) => isChrome
      ? browser.search.query({ text: query, disposition: 'NEW_TAB' })
      : browser.search.search({ query, disposition: 'NEW_TAB', ...(engine ? { engine } : {}) })
  });
})();
