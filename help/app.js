/* Kleine Komfortfunktionen der lokalen Hilfe – ohne Netzwerkzugriff. */
(async function initializeHelp() {
  'use strict';

  // Die Hilfe übernimmt den in Manga-Regal gewählten Hell-/Dunkelmodus.
  try {
    const data = await MangaStore.load();
    document.documentElement.dataset.theme = data.settings.colorMode === 'light' ? 'light' : 'dark';
  } catch (_) {
    // Bei einem sehr frühen Aufruf bleibt das sichere dunkle Standarddesign aktiv.
  }

  // Beim Lesen wird der passende Eintrag im Inhaltsverzeichnis markiert.
  const links = [...document.querySelectorAll('.contents a')];
  const sections = links.map((link) => document.querySelector(link.getAttribute('href'))).filter(Boolean);
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    links.forEach((link) => link.classList.toggle('active', link.hash === `#${visible.target.id}`));
  }, { rootMargin: '-15% 0px -68% 0px', threshold: [0, 0.2, 0.6] });
  sections.forEach((section) => observer.observe(section));
})();
