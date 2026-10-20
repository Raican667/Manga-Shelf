/* Presentation contract shared by extension pages and the isolated overlay.
 * No CSS is applied to a visited website: apply() only writes to the supplied
 * extension-owned root. Persist stable IDs, not translated labels or CSS text. */
(() => {
  'use strict';
  const themes = {
    dark: { mode: 'dark', ink: '#130f18', panel: '#1c1721', panel2: '#241e2a', paper: '#f2ede4', muted: '#a9a0ad', line: '#39303f', accent: '#e26042', action: '#1b0f0b', gold: '#e8bd69', good: '#9ee0b8', danger: '#ff9686' },
    light: { mode: 'light', ink: '#f3efe9', panel: '#fffdf9', panel2: '#f4eee8', paper: '#211923', muted: '#6e6470', line: '#d9ced8', accent: '#e26042', action: '#ffffff', gold: '#956615', good: '#28623f', danger: '#a83c2a' },
    'coral-dark': { mode: 'dark', ink: '#0d121b', panel: '#181e28', panel2: '#232b37', paper: '#f6f7fa', muted: '#b4bece', line: '#3e4959', accent: '#ff674b', action: '#130d0a', gold: '#ffcb47', good: '#b3ec99', danger: '#ff9c8a' },
    'coral-light': { mode: 'light', ink: '#f3ece8', panel: '#fffaf6', panel2: '#ede6e2', paper: '#171824', muted: '#625e68', line: '#d6cdca', accent: '#ff674b', action: '#17100e', gold: '#946200', good: '#315e1c', danger: '#a33422' },
    'blue-light': { mode: 'light', ink: '#dceeff', panel: '#edf8ff', panel2: '#d4e7fc', paper: '#10213c', muted: '#405b7b', line: '#adc9e6', accent: '#087df0', action: '#ffffff', gold: '#916000', good: '#215e36', danger: '#a83236' },
    'blue-dark': { mode: 'dark', ink: '#14263e', panel: '#293c56', panel2: '#374c68', paper: '#f7faff', muted: '#c0d0e4', line: '#60758e', accent: '#1689ff', action: '#ffffff', gold: '#ffcf49', good: '#b5efa1', danger: '#ffaaa0' }
  };
  const appliedThemes = new WeakMap();
  function resolve(settings = {}) {
    return Object.hasOwn(themes, settings.theme) ? settings.theme : settings.colorMode === 'light' ? 'light' : 'dark';
  }
  function apply(root, settings = {}) {
    const id = resolve(settings);
    const palette = themes[id];
    const result = { id, mode: palette.mode, glass: id !== 'dark' && id !== 'light' };
    // Rating/tag/log writes are not theme changes. Avoid restyling every
    // descendant after each storage event, particularly in large collections.
    if (appliedThemes.get(root) === id) return result;
    root.dataset.theme = palette.mode; // Legacy light/dark selectors remain valid.
    root.dataset.mangaTheme = id;
    root.dataset.glassTheme = String(id !== 'dark' && id !== 'light');
    root.style.colorScheme = palette.mode;
    for (const [key, value] of Object.entries(palette)) {
      if (key !== 'mode') root.style.setProperty(`--${key}`, value);
    }
    root.style.setProperty('--surface', palette.panel2);
    root.style.setProperty('--shadow', palette.mode === 'light' ? '0 18px 50px rgba(36,62,91,.15)' : '0 22px 64px rgba(0,0,0,.35)');
    appliedThemes.set(root, id);
    return result;
  }
  globalThis.MangaThemes = Object.freeze({ ids: Object.freeze(Object.keys(themes)), resolve, apply });
})();
