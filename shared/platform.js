/* Browser differences live here, not in the collection's data model.
 * Chrome builds target 148+, with native Promise-based browser APIs.
 * Stable storage keys and message names intentionally remain unchanged. */
(() => {
  'use strict';
  const manifest = browser.runtime.getManifest();
  const isChrome = !manifest.browser_specific_settings?.gecko;
  globalThis.MangaPlatform = Object.freeze({
    isChrome,
    browserName: isChrome ? 'Chrome' : 'Firefox',
    // Firefox search.search and Chrome search.query use different property names.
    search: (query, engine) => isChrome
      ? browser.search.query({ text: query, disposition: 'NEW_TAB' })
      : browser.search.search({ query, disposition: 'NEW_TAB', ...(engine ? { engine } : {}) })
  });
})();
