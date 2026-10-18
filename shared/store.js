/*
 * Zentrale Datenablage des Add-ons.
 *
 * Diese Datei wird in allen drei Bereichen geladen:
 *   1. Hintergrundprozess (Firefox-Ereignisse)
 *   2. Einblendung im aktuellen Browser-Tab
 *   3. Vollständige Sammlungsansicht
 *
 * Sämtliche Schreibzugriffe laufen über MangaStore. Dadurch bleibt das
 * Datenformat an einer Stelle dokumentiert und spätere Änderungen sind leichter.
 */
(function createMangaStore(global) {
  'use strict';

  const STORAGE_KEY = 'mangaRegalDataV1';
  const COVER_KEY_PREFIX = 'mangaRegalCoverV1:';
  const CUSTOM_PLACEHOLDER_KEY_PREFIX = 'mangaRegalCustomPlaceholderV1:';
  const PLACEHOLDER_COVER_IDS = Object.freeze(['arcane', 'city', 'forest', 'cosmic']);
  // Die ID ist gerätespezifisch: Firefox vergibt Lesezeichen-IDs pro Profil.
  // Deshalb gehört dieser kleine Verwaltungswert bewusst nicht in Firefox Sync.
  const BOOKMARK_EXPORT_STATE_KEY = 'mangaRegalBookmarkExportStateV1';
  const DATA_VERSION = 20;
  const REREAD_TAG = 'Re-Read';
  const DEFAULT_READING_LIMIT = 5;
  const COLLECTION_VIEWS = ['reading', 'active', 'hold', 'dropped', 'completed', 'all'];
  const STANDARD_STATUSES = COLLECTION_VIEWS.filter((view) => view !== 'all');
  const TAG_PRESETS = [
    'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Historical', 'Horror',
    'Isekai', 'Martial Arts', 'Mecha', 'Mystery', 'Psychological', 'Romance',
    'School Life', 'Sci-Fi', 'Seinen', 'Shōjo', 'Shōnen', 'Slice of Life',
    'Sports', 'Supernatural', 'Thriller', 'Webtoon', 'Boys Love', 'Girls Love',
    REREAD_TAG
  ];
  const DEFAULT_TAG_PRESETS = [
    'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Isekai', 'Romance',
    'Seinen', 'Shōjo', 'Shōnen', 'Slice of Life', 'Webtoon', REREAD_TAG
  ];

  const DEFAULT_DATA = {
    version: DATA_VERSION,
    items: [],
    customTags: [],
    logs: [],
    settings: {
      limitLogs: true,
      // Neue Installationen zeigen Cover in Tabellen. Bestehende Nutzerwerte
      // (auch ein bewusstes false) werden beim Normalisieren beibehalten.
      showCoversInTable: true,
      // Kann für Light Novels und uneindeutige URL-Strukturen abgeschaltet
      // werden. Das Kapitel-Eingabefeld bleibt unabhängig davon verfügbar.
      chapterDetectionEnabled: true,
      // Der Konfliktdialog kann einen zweiten, mit dem Hauptstand verbundenen
      // Lesedurchlauf anlegen. Beide Optionen sind getrennt schaltbar: Die
      // fachliche Re-Read-Verknuepfung funktioniert auch ohne sichtbaren Tag.
      offerRereadOnUpdate: true,
      autoTagRereads: true,
      ratingScale: 5,
      onboardingComplete: false,
      showOnboardingOnStartup: true,
      syncEnabled: false,
      readingLimit: DEFAULT_READING_LIMIT,
      // collectionView bleibt als Migrationswert für Sicherungen vor Version 5.
      collectionView: 'table',
      collectionViews: {
        reading: 'table', active: 'table', hold: 'table', dropped: 'table', completed: 'table', all: 'table'
      },
      // Leere Werte verwenden die übersetzte Standardbezeichnung der Oberfläche.
      categoryNames: {
        reading: '', active: '', hold: '', dropped: '', completed: '', all: ''
      },
      customCategories: [],
      categoryOrder: ['reading', 'active', 'hold', 'dropped', 'completed', 'all'],
      defaultNewStatus: 'active',
      tagPresets: DEFAULT_TAG_PRESETS,
      customTagPresets: [],
      hiddenTagPresets: [],
      // Optionale Benutzerzuordnung: Tagname -> ID eines mitgelieferten
      // Platzhalter-Covers. Ein fehlender Eintrag bedeutet Automatik.
      // Der Hauptschalter blendet ausschließlich Ersatzbilder aus. Die vier
      // lokal ersetzten Motive und ihre Tag-Zuordnungen bleiben dabei erhalten.
      placeholderCoversEnabled: true,
      placeholderCoverByTag: {},
      language: 'en',
      colorMode: 'dark',
      searchEngine: 'browser-default',
      customSearchEngines: [],
      bookmarkImportMode: 'folders',
      bookmarkImportKeyword: 'chapter',
      showSupportButton: true,
      showBookmarkImportButton: true
    },
    updatedAt: 0
  };

  /** Erstellt eine tiefe Kopie einfacher JSON-Daten. */
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  /** Erzeugt eine ID. Der Fallback ist für ältere Firefox-Versionen gedacht. */
  function createId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    return `manga-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  /** Akzeptiert ausschließlich normale HTTP- und HTTPS-Adressen. */
  function cleanUrl(value) {
    try {
      const url = new URL(String(value || '').trim());
      return /^https?:$/.test(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }

  /**
   * Cover aus Seitendaten sind häufig relativ (z. B. /images/cover.jpg).
   * Sie werden gegen die Manga-Adresse aufgelöst; lokale data:-Bilder bleiben
   * unverändert, damit hochgeladene Cover weiterhin offline funktionieren.
   */
  function cleanCover(value, pageUrl) {
    const cover = String(value || '').trim();
    // `new URL('', pageUrl)` ergibt nicht leer, sondern exakt pageUrl. Ohne
    // diese frühe Rückgabe bekamen Firefox-Importe deshalb fälschlich den
    // Kapitel-Link als Cover-Adresse.
    if (!cover) return '';
    if (/^data:image\//i.test(cover)) return cover;
    try {
      const resolved = new URL(cover, pageUrl);
      return /^https?:$/.test(resolved.protocol) ? resolved.href : '';
    } catch {
      return '';
    }
  }

  function coverStorageKey(itemId) {
    return `${COVER_KEY_PREFIX}${itemId}`;
  }

  async function getStoredCover(itemId) {
    if (!itemId) return '';
    const key = coverStorageKey(itemId);
    const result = await browser.storage.local.get(key);
    return String(result[key] || '');
  }

  async function storeCover(itemId, dataUrl) {
    if (!itemId || !/^data:image\//i.test(String(dataUrl || ''))) return '';
    await browser.storage.local.set({ [coverStorageKey(itemId)]: dataUrl });
    return dataUrl;
  }

  function customPlaceholderStorageKey(id) {
    return `${CUSTOM_PLACEHOLDER_KEY_PREFIX}${id}`;
  }

  /**
   * Liest die lokal ersetzten Bilder der vier festen Platzhalter-Slots.
   * Die Slot-IDs bleiben stabil, damit vorhandene Tag-Zuordnungen beim
   * Austauschen oder Wiederherstellen eines Motivs unverändert weitergelten.
   */
  async function getCustomPlaceholderCovers(options = {}) {
    const covers = [];
    for (const id of PLACEHOLDER_COVER_IDS) {
      const key = customPlaceholderStorageKey(id);
      const stored = await browser.storage.local.get(key);
      const value = stored[key];
      if (!value || !/^data:image\//i.test(String(value.dataUrl || ''))) continue;
      covers.push({
        id,
        modified: Number(value.modified) || 0,
        ...(options.includeData === true ? { dataUrl: String(value.dataUrl) } : {})
      });
    }
    return covers;
  }

  /** Ersetzt genau einen der vier mitgelieferten Platzhalter-Slots. */
  async function saveCustomPlaceholderCover(input = {}) {
    const id = String(input.id || '');
    if (!PLACEHOLDER_COVER_IDS.includes(id)) throw new Error('Unbekannter Platzhalter-Slot.');
    const dataUrl = String(input.dataUrl || '');
    if (!/^data:image\/(?:jpeg|png|webp);base64,/i.test(dataUrl)) {
      throw new Error('Bitte eine gültige JPG-, PNG- oder WebP-Bilddatei auswählen.');
    }
    if (new TextEncoder().encode(dataUrl).length > 2 * 1024 * 1024) {
      throw new Error('Das vorbereitete Platzhalter-Cover ist größer als 2 MB.');
    }
    await browser.storage.local.set({
      [customPlaceholderStorageKey(id)]: { dataUrl, modified: Date.now() }
    });
    return { id, modified: Date.now() };
  }

  /** Stellt für einen Slot das mitgelieferte Standardmotiv wieder her. */
  async function removeCustomPlaceholderCover(id) {
    const checkedId = String(id || '');
    if (!PLACEHOLDER_COVER_IDS.includes(checkedId)) return false;
    await browser.storage.local.remove(customPlaceholderStorageKey(checkedId));
    await update((data) => appendLog(data, 'info', 'Cover', 'Standard-Platzhalter wiederhergestellt', checkedId));
    return true;
  }

  /**
   * Lädt ein öffentliches Bild ohne Cookies oder andere Sitzungsdaten.
   *
   * `fetch()` ist der bevorzugte Weg. Einige ältere oder ungewöhnlich
   * konfigurierte Bildserver funktionieren in Firefox jedoch zuverlässiger mit
   * XMLHttpRequest. Der zweite Versuch ist deshalb ein Kompatibilitäts-Fallback
   * und keine Anmeldung: `withCredentials` bleibt ausdrücklich deaktiviert.
   */
  async function downloadPublicCover(url, options = {}) {
    let fetchError;
    try {
      const pageReferrer = cleanUrl(options.referrerUrl);
      const requestOptions = {
        // Nur der explizit vom Benutzer geöffnete Manga-Tab darf seine bereits
        // vorhandene Cloudflare-Sitzung verwenden. Dadurch kann cf_clearance
        // den menschlich bestätigten Browser wiedererkennen. Der Hintergrund
        // bleibt strikt anonym und erhält keinen Zugriff auf Sitzungsdaten.
        credentials: pageReferrer ? 'include' : 'omit',
        // Der Seitenursprung erfüllt zusätzlich Cloudflares Hotlink-Prüfung.
        referrerPolicy: pageReferrer ? 'strict-origin-when-cross-origin' : 'no-referrer',
        redirect: 'follow'
      };
      if (pageReferrer) requestOptions.referrer = pageReferrer;
      const response = await fetch(url, requestOptions);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.blob();
    } catch (error) {
      fetchError = error;
    }

    // XHR kann bei einem Request aus dem Seitenkontext gleichursprüngliche
    // Cookies mitsenden, selbst wenn withCredentials=false ist. Da Cover hier
    // ausdrücklich öffentlich und anonym bleiben sollen, verwenden wir den
    // XHR-Fallback ausschließlich im Erweiterungshintergrund.
    if (cleanUrl(options.referrerUrl) || typeof XMLHttpRequest !== 'function') throw fetchError;
    try {
      return await new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('GET', url, true);
        request.responseType = 'blob';
        request.timeout = 20000;
        request.withCredentials = false;
        request.onload = () => {
          if (request.status >= 200 && request.status < 300 && request.response) {
            resolve(request.response);
          } else {
            reject(new Error(`HTTP ${request.status || 0}`));
          }
        };
        request.onerror = () => reject(new Error('Netzwerkfehler'));
        request.ontimeout = () => reject(new Error('Zeitüberschreitung'));
        request.send();
      });
    } catch (xhrError) {
      throw new Error(`Cover-Download fehlgeschlagen (Fetch: ${fetchError?.message || 'unbekannt'}; Fallback: ${xhrError.message})`);
    }
  }

  /** Erkennt häufige Bildformate auch bei fehlendem oder falschem Content-Type. */
  async function normalizeCoverBlob(blob) {
    if (!blob || typeof blob.size !== 'number' || blob.size === 0) {
      throw new Error('Die Cover-Adresse liefert eine leere Datei.');
    }
    if (blob.size > 8 * 1024 * 1024) throw new Error('Das Cover ist größer als 8 MB.');

    const declaredType = String(blob.type || '').split(';')[0].trim().toLowerCase();
    const header = new Uint8Array(await blob.slice(0, 512).arrayBuffer());
    const ascii = String.fromCharCode(...header);
    let detectedType = '';
    if (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) detectedType = 'image/jpeg';
    else if (header[0] === 0x89 && ascii.slice(1, 4) === 'PNG') detectedType = 'image/png';
    else if (ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a')) detectedType = 'image/gif';
    else if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') detectedType = 'image/webp';
    else if (ascii.startsWith('BM')) detectedType = 'image/bmp';
    else if (header[0] === 0 && header[1] === 0 && header[2] === 1 && header[3] === 0) detectedType = 'image/x-icon';
    else if (ascii.slice(4, 8) === 'ftyp' && /^(avif|avis)$/.test(ascii.slice(8, 12))) detectedType = 'image/avif';
    else if (/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(ascii)) detectedType = 'image/svg+xml';

    const imageType = detectedType || (declaredType.startsWith('image/') ? declaredType : '');
    if (!imageType) throw new Error('Die Cover-Adresse liefert keine erkennbare Bilddatei.');
    return declaredType === imageType ? blob : new Blob([blob], { type: imageType });
  }

  /** Lädt ein Remote-Cover erst bei Bedarf und speichert es getrennt lokal. */
  async function cacheCover(item, options = {}) {
    const stored = await getStoredCover(item?.id);
    if (stored) return stored;
    // Die pro Manga gespeicherte Ausnahme gilt an jedem Aufrufort – Overlay,
    // Sammlung und Hintergrundprozess. Nur eine ausdrueckliche manuelle
    // Cover-Aenderung darf sie fuer diesen einzelnen Vorgang ueberstimmen.
    if (item?.coverDetectionDisabled === true && options.force !== true) return '';
    if (/^data:image\//i.test(item?.cover || '')) {
      return storeCover(item.id, item.cover);
    }
    if (!/^https?:\/\//i.test(item?.cover || '')) return '';
    const blob = await normalizeCoverBlob(await downloadPublicCover(item.cover, options));
    const dataUrl = typeof FileReader === 'function' ? await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Das Cover konnte nicht lokal gespeichert werden.'));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    }) : await (async () => {
      // Service workers have no FileReader. Convert bounded image bytes without
      // spreading a potentially large buffer onto the JavaScript call stack.
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 8192) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      }
      return `data:${blob.type};base64,${btoa(binary)}`;
    })();
    return storeCover(item.id, dataUrl);
  }

  /** Normalisiert Tags, entfernt Leerwerte und doppelte Schreibweisen. */
  function cleanTags(tags) {
    const list = Array.isArray(tags) ? tags : String(tags || '').split(',');
    const seen = new Set();
    return list
      .map((tag) => String(tag).trim())
      .filter((tag) => {
        const key = tag.toLocaleLowerCase('de');
        if (!tag || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  /** Bringt ältere oder unvollständige Einträge in das aktuelle Datenformat. */
  function normalizeItem(input = {}) {
    const now = Date.now();
    const url = cleanUrl(input.url);
    // Eine am Manga gespeicherte Abschaltung verhindert auch bei allgemeinen
    // Import-/Updatepfaden, dass eine URL-Zahl erneut als Kapitel auftaucht.
    const inferredChapter = input.chapterDetectionDisabled === true ? '' : chapterFromUrl(url);
    const hasSuppliedChapter = Object.prototype.hasOwnProperty.call(input, 'currentChapter');
    const suppliedChapter = String(input.currentChapter || '').trim();
    const status = STANDARD_STATUSES.includes(input.status) || /^custom-[a-z0-9-]+$/.test(input.status)
      ? input.status
      : 'active';

    const normalizedCover = cleanCover(input.cover, url);
    return {
      id: String(input.id || createId()),
      bookmarkId: input.bookmarkId ? String(input.bookmarkId) : '',
      title: String(input.title || 'Ohne Titel').trim(),
      url,
      source: String(input.source || sourceFromUrl(input.url)),
      description: String(input.description || ''),
      folderPath: Array.isArray(input.folderPath) ? input.folderPath.map(String) : [],
      currentChapter: hasSuppliedChapter ? suppliedChapter : inferredChapter,
      chapterManual: typeof input.chapterManual === 'boolean'
        ? input.chapterManual
        : Boolean(suppliedChapter && suppliedChapter !== inferredChapter),
      // Diese Ausnahme gehört zum Manga und nicht zum gerade geöffneten Link.
      // Sie bleibt daher auch erhalten, wenn später ein neues Kapitel desselben
      // Eintrags gespeichert oder der Datensatz über Firefox Sync übertragen wird.
      chapterDetectionDisabled: input.chapterDetectionDisabled === true,
      // Verhindert automatische Download-/Erkennungsversuche auch bei allen
      // spaeteren Kapitelupdates. Lokale Cover bleiben davon unberuehrt.
      coverDetectionDisabled: input.coverDetectionDisabled === true,
      // Re-Reads bleiben eigenstaendige Datensaetze. rereadOf zeigt immer auf
      // den Hauptstand und erlaubt dadurch spaetere, kapitelbasierte Updates,
      // ohne den weiter fortgeschrittenen Hauptstand zu ueberschreiben.
      rereadOf: String(input.rereadOf || ''),
      rereadRound: Math.max(0, Math.round(Number(input.rereadRound) || 0)),
      tags: cleanTags(input.tags),
      rating: Math.max(0, Math.min(10, Number(input.rating) || 0)),
      status,
      // Sicherung und ältere Datensätze bis Version 13 können durch den
      // früheren Leerwertfehler die Kapiteladresse im Coverfeld enthalten.
      // Das ist kein Bild und wird beim Laden automatisch bereinigt.
      cover: normalizedCover === url ? '' : normalizedCover,
      favicon: String(input.favicon || ''),
      created: Number(input.created) || now,
      modified: Number(input.modified) || Number(input.created) || now
    };
  }

  /** Leitet den sichtbaren Webseitennamen aus einer URL ab. */
  function sourceFromUrl(value) {
    try {
      return new URL(value).hostname.replace(/^www\./, '');
    } catch {
      return 'Unbekannte Website';
    }
  }

  /**
   * Erkennt typische Kapitelangaben aus Manga-URLs, z. B.:
   *   /chapter-123, /chapters/45.5, /ch/17 oder ?chapter=88
   * Da Webseiten unterschiedliche Formate verwenden, bleibt der Wert im
   * Dashboard immer manuell änderbar.
   */
  function chapterFromUrl(value) {
    try {
      const url = new URL(value);
      const parameterNames = ['chapter', 'chap', 'ch', 'episode', 'ep'];
      for (const name of parameterNames) {
        const parameter = url.searchParams.get(name);
        if (parameter && /\d/.test(parameter)) return parameter.trim();
      }

      const path = decodeURIComponent(url.pathname);
      const namedMatch = path.match(
        /(?:chapter|chapters|chap|ch|capitulo|episode|ep)[-_/ ]*([0-9]+(?:[.-][0-9]+)?[a-z]?)/i
      );
      if (namedMatch) return namedMatch[1];

      // Fallback für Seiten, bei denen das Kapitel nur die letzte Pfadzahl ist.
      const finalNumber = path.match(/\/([0-9]+(?:\.[0-9]+)?[a-z]?)\/?$/i);
      return finalNumber ? finalNumber[1] : '';
    } catch {
      return '';
    }
  }

  /** Entfernt Kapitelangaben und technische Zusätze aus einem Seitentitel. */
  function titleKey(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/\s+[|–—]\s+/)[0]
      .replace(/\b(?:chapter|chapters|chap|ch|kapitel|capitulo|episode|ep)\b.*$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  /**
   * Ermittelt den stabilen Serienanteil einer URL ohne Kapitelnummer.
   * Aus /manga/name/chapter-18 und /manga/name/chapter-19 wird dadurch derselbe
   * Schlüssel. Die Originaladresse selbst wird dabei nicht verändert.
   */
  function seriesKeyFromUrl(value) {
    try {
      const url = new URL(value);
      const segments = decodeURIComponent(url.pathname).split('/').filter(Boolean);
      const chapterIndex = segments.findIndex((segment) =>
        /^(?:chapter|chapters|chap|ch|kapitel|capitulo|episode|ep)(?:[-_ ]?\d.*)?$/i.test(segment)
      );
      if (chapterIndex >= 0) {
        segments.splice(chapterIndex);
      } else if (segments.length && /^\d+(?:[.-]\d+)?[a-z]?$/i.test(segments.at(-1))) {
        segments.pop();
      }
      // Nur der Domainname wäre zu unspezifisch und könnte verschiedene Manga
      // derselben Website fälschlich als identisch behandeln.
      if (!segments.length) return '';
      return `${url.hostname.replace(/^www\./, '').toLowerCase()}/${segments.join('/').toLowerCase()}`;
    } catch {
      return '';
    }
  }

  /**
   * Sucht einen wahrscheinlich bereits vorhandenen Manga.
   * Ein gemeinsamer Serienpfad auf derselben Website ist das stärkste Signal;
   * alternativ genügt ein identischer, von Kapitelzusätzen bereinigter Titel.
   * Die Funktion speichert nichts – die Oberfläche fragt zuerst den Benutzer.
   */
  function matchScore(item, incoming) {
    const incomingUrl = cleanUrl(incoming?.url);
    const incomingSeries = seriesKeyFromUrl(incomingUrl);
    const incomingTitle = titleKey(incoming?.title);
    if (item.url === incomingUrl) return 100;
    if (incomingSeries && seriesKeyFromUrl(item.url) === incomingSeries) return 85;
    if (incomingTitle.length >= 4 && titleKey(item.title) === incomingTitle) {
      return item.source === sourceFromUrl(incomingUrl) ? 75 : 65;
    }
    return 0;
  }

  /** Liefert alle plausiblen Lesestaende derselben Serie. */
  function findLikelyMatches(items, incoming) {
    return (items || [])
      .map((item) => ({ item, score: matchScore(item, incoming) }))
      .filter((candidate) => candidate.score >= 65)
      .sort((left, right) => right.score - left.score || right.item.modified - left.item.modified)
      .map((candidate) => candidate.item);
  }

  /** Nur reine numerische Kapitel sind fuer eine automatische Wahl sicher. */
  function comparableChapter(value) {
    const text = String(value || '').trim().replace(',', '.');
    return /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : null;
  }

  /**
   * Waehlt den Lesestand fuer ein Kapitelupdate, ohne die Entscheidung zu
   * verstecken. Die Oberflaeche zeigt alle Kandidaten weiterhin im Dropdown.
   *
   * Beispiel: Hauptstand 150 + Re-Read 1. Kapitel 2 geht an den Re-Read,
   * Kapitel 151 an den Hauptstand. Bei nicht vergleichbaren Angaben gewinnt
   * der zuletzt bearbeitete Lesestand und kann im Dialog korrigiert werden.
   */
  function findLikelyMatch(items, incoming) {
    const candidates = findLikelyMatches(items, incoming);
    if (!candidates.length) return null;

    const incomingChapter = comparableChapter(
      Object.prototype.hasOwnProperty.call(incoming || {}, 'currentChapter')
        ? incoming.currentChapter
        : chapterFromUrl(incoming?.url)
    );
    const primaryCandidates = candidates.filter((item) => !item.rereadOf);
    const rereadCandidates = candidates.filter((item) => Boolean(item.rereadOf));
    const byChapterThenModified = (left, right) => {
      const leftChapter = comparableChapter(left.currentChapter);
      const rightChapter = comparableChapter(right.currentChapter);
      if (leftChapter !== null && rightChapter !== null && leftChapter !== rightChapter) {
        return rightChapter - leftChapter;
      }
      return right.modified - left.modified;
    };
    const primary = [...primaryCandidates].sort(byChapterThenModified)[0] || null;
    const primaryChapter = comparableChapter(primary?.currentChapter);

    if (incomingChapter !== null && primary && primaryChapter !== null && incomingChapter > primaryChapter) {
      return primary;
    }
    if (incomingChapter !== null && rereadCandidates.length) {
      const progressing = rereadCandidates
        .filter((item) => {
          const chapter = comparableChapter(item.currentChapter);
          return chapter !== null && chapter <= incomingChapter;
        })
        .sort(byChapterThenModified);
      return progressing[0]
        || [...rereadCandidates].sort((left, right) => right.modified - left.modified)[0];
    }
    return candidates.find((item) => item.url === cleanUrl(incoming?.url))
      || [...candidates].sort((left, right) => right.modified - left.modified)[0];
  }

  /** Normalisiert den gesamten Datensatz nach dem Laden oder Importieren. */
  function normalizeData(input = {}) {
    const readingLimit = Math.max(1, Math.min(50, Number(input.settings?.readingLimit) || DEFAULT_READING_LIMIT));
    const legacyCollectionView = input.settings?.collectionView === 'cards' ? 'cards' : 'table';
    const customCategories = Array.isArray(input.settings?.customCategories)
      ? input.settings.customCategories
        .map((category) => ({
          id: /^custom-[a-z0-9-]+$/.test(String(category?.id || '')) ? String(category.id) : '',
          name: String(category?.name || '').trim().slice(0, 40)
        }))
        .filter((category, index, categories) => category.id && category.name && categories.findIndex((item) => item.id === category.id) === index)
        .slice(0, 30)
      : [];
    const allCollectionViews = [...COLLECTION_VIEWS, ...customCategories.map((category) => category.id)];
    const requestedCategoryOrder = Array.isArray(input.settings?.categoryOrder)
      ? input.settings.categoryOrder.map(String)
      : [];
    const categoryOrder = [
      ...requestedCategoryOrder.filter((view, index) => allCollectionViews.includes(view) && requestedCategoryOrder.indexOf(view) === index),
      ...allCollectionViews.filter((view) => !requestedCategoryOrder.includes(view))
    ];
    // Fehlende Werte gehören zu einer neuen bzw. sehr alten Installation und
    // verwenden den heutigen Standard von fünf Sternen. Ein ausdrücklich
    // gespeicherter Wert 10 bleibt bei bestehenden Nutzern unverändert.
    const ratingScale = Number(input.settings?.ratingScale) === 10 ? 10 : 5;
    const availableStatuses = [...STANDARD_STATUSES, ...customCategories.map((category) => category.id)];
    const defaultNewStatus = availableStatuses.includes(input.settings?.defaultNewStatus)
      ? input.settings.defaultNewStatus
      : 'active';
    const chapterDetectionEnabled = input.settings?.chapterDetectionEnabled !== false;
    const collectionViews = Object.fromEntries(allCollectionViews.map((view) => [
      view,
      input.settings?.collectionViews?.[view] === 'cards' ? 'cards' : legacyCollectionView
    ]));
    const categoryNames = Object.fromEntries(COLLECTION_VIEWS.map((view) => [
      view,
      String(input.settings?.categoryNames?.[view] || '').trim().slice(0, 40)
    ]));
    const customTagPresets = cleanTags(input.settings?.customTagPresets)
      .filter((tag) => !TAG_PRESETS.some((preset) => preset.toLowerCase() === tag.toLowerCase()))
      .map((tag) => tag.slice(0, 40))
      .slice(0, 100);
    const availableTagPresets = [...TAG_PRESETS, ...customTagPresets];
    const hiddenTagPresets = cleanTags(input.settings?.hiddenTagPresets)
      .map((tag) => TAG_PRESETS.find((preset) => preset.toLowerCase() === tag.toLowerCase()))
      .filter(Boolean);
    const placeholderCoverIds = new Set(PLACEHOLDER_COVER_IDS);
    const placeholderCoverByTag = Object.fromEntries(Object.entries(input.settings?.placeholderCoverByTag || {})
      .map(([tag, coverId]) => [String(tag).trim().slice(0, 40), String(coverId)])
      .filter(([tag, coverId], index, entries) => tag && placeholderCoverIds.has(coverId)
        && entries.findIndex(([candidate]) => candidate.toLowerCase() === tag.toLowerCase()) === index));
    const customSearchEngines = Array.isArray(input.settings?.customSearchEngines)
      ? input.settings.customSearchEngines.map((engine) => ({
        id: /^engine-[a-z0-9-]+$/.test(String(engine?.id || '')) ? String(engine.id) : '',
        name: String(engine?.name || '').trim().slice(0, 50),
        urlTemplate: String(engine?.urlTemplate || '').trim().slice(0, 500)
      })).filter((engine, index, engines) => engine.id && engine.name && /^https?:\/\//i.test(engine.urlTemplate) && engine.urlTemplate.includes('{query}') && engines.findIndex((item) => item.id === engine.id) === index).slice(0, 30)
      : [];
    const requestedSearchEngine = String(input.settings?.searchEngine || 'browser-default');
    const knownSearchEngines = ['browser-default', 'google', 'bing', 'yahoo', 'yandex', 'duckduckgo', 'baidu'];
    const searchEngine = knownSearchEngines.includes(requestedSearchEngine)
      || requestedSearchEngine.startsWith('firefox:')
      || customSearchEngines.some((engine) => `custom:${engine.id}` === requestedSearchEngine)
      ? requestedSearchEngine
      : 'browser-default';
    const requestedTagPresets = cleanTags(input.settings?.tagPresets ?? DEFAULT_TAG_PRESETS);
    // Die Datenmigration aktiviert Re-Read einmalig für Bestandsinstallationen;
    // danach kann die Vorgabe normal abgewählt oder entfernt werden.
    if (Number(input.version) < 19
      && !requestedTagPresets.some((tag) => tag.toLowerCase() === REREAD_TAG.toLowerCase())
      && !hiddenTagPresets.some((tag) => tag.toLowerCase() === REREAD_TAG.toLowerCase())) {
      requestedTagPresets.push(REREAD_TAG);
    }
    const items = Array.isArray(input.items)
      ? input.items.map(normalizeItem).filter((item) => item.url)
      : [];
    let readingCount = 0;
    // Auch importierte Sicherungen dürfen das feste Limit nicht umgehen.
    items.forEach((item) => {
      item.rating = Math.min(ratingScale, item.rating);
      if (!chapterDetectionEnabled && !item.chapterManual) item.currentChapter = '';
      if (![...STANDARD_STATUSES, ...customCategories.map((category) => category.id)].includes(item.status)) {
        item.status = 'active';
      }
      if (item.status !== 'reading') return;
      readingCount += 1;
      if (readingCount > readingLimit) item.status = 'active';
    });

    return {
      ...clone(DEFAULT_DATA),
      ...input,
      version: DATA_VERSION,
      items,
      customTags: cleanTags(input.customTags),
      // Logs are newest-first. Retention applies on every read/write, including imports.
      logs: Array.isArray(input.logs) ? (input.settings?.limitLogs === false ? input.logs : input.logs.slice(0, 100)) : [],
      settings: {
        ...DEFAULT_DATA.settings,
        ...(input.settings || {}),
        limitLogs: input.settings?.limitLogs !== false,
        readingLimit,
        collectionView: legacyCollectionView,
        collectionViews,
        categoryNames,
        customCategories,
        categoryOrder,
        ratingScale,
        onboardingComplete: input.settings?.onboardingComplete === true,
        showOnboardingOnStartup: input.settings?.showOnboardingOnStartup !== false,
        syncEnabled: input.settings?.syncEnabled === true,
        chapterDetectionEnabled,
        offerRereadOnUpdate: input.settings?.offerRereadOnUpdate !== false,
        autoTagRereads: input.settings?.autoTagRereads !== false,
        defaultNewStatus,
        customTagPresets,
        hiddenTagPresets,
        placeholderCoversEnabled: input.settings?.placeholderCoversEnabled !== false,
        placeholderCoverByTag,
        tagPresets: requestedTagPresets
          .map((tag) => availableTagPresets.find((preset) => preset.toLowerCase() === tag.toLowerCase()))
          .filter((tag) => tag && !hiddenTagPresets.some((hidden) => hidden.toLowerCase() === tag.toLowerCase())),
        // Preserve explicit choices; new or legacy datasets without a language start in English.
        language: input.settings?.language === 'de' ? 'de' : 'en',
        colorMode: input.settings?.colorMode === 'light' ? 'light' : 'dark',
        searchEngine,
        customSearchEngines,
        bookmarkImportMode: ['folders', 'keyword', 'manual'].includes(input.settings?.bookmarkImportMode)
          ? input.settings.bookmarkImportMode
          : 'folders',
        bookmarkImportKeyword: String(input.settings?.bookmarkImportKeyword || 'chapter').trim().slice(0, 100),
        showSupportButton: input.settings?.showSupportButton !== false,
        showBookmarkImportButton: input.settings?.showBookmarkImportButton !== false
      },
      updatedAt: Number(input.updatedAt) || 0
    };
  }

  /** Gibt das konfigurierte Limit zurück; ältere Daten verwenden automatisch 5. */
  function getReadingLimit(data) {
    return Math.max(1, Math.min(50, Number(data?.settings?.readingLimit) || DEFAULT_READING_LIMIT));
  }

  /**
   * Ändert das Limit kontrolliert. Es darf nicht unter die Zahl der bereits
   * aktuell gelesenen Manga gesetzt werden, damit kein Eintrag verschoben wird.
   */
  async function setReadingLimit(value) {
    const requested = Math.round(Number(value));
    if (!Number.isFinite(requested) || requested < 1 || requested > 50) {
      throw new Error('Das Limit muss zwischen 1 und 50 liegen.');
    }
    return update((data) => {
      const currentCount = data.items.filter((item) => item.status === 'reading').length;
      if (requested < currentCount) {
        throw new Error(`Das Limit kann nicht unter ${currentCount} gesetzt werden. Verschiebe zuerst Manga aus „Lese ich gerade“.`);
      }
      data.settings.readingLimit = requested;
      appendLog(data, 'info', 'Admin', `Limit für „Lese ich gerade“ auf ${requested} gesetzt`);
    });
  }

  /** Speichert die im Admin-Modul gewählten Darstellungsoptionen. */
  async function setPreferences(changes = {}) {
    return update((data) => {
      // Audit normalized values, not raw form inputs. Snapshot before mutation
      // so nested preferences can be compared and no-op saves stay silent.
      const previousSettings = JSON.parse(JSON.stringify(data.settings));
      if (changes.showCoversInTable !== undefined) {
        data.settings.showCoversInTable = Boolean(changes.showCoversInTable);
      }
      if (changes.chapterDetectionEnabled !== undefined) {
        const enabled = Boolean(changes.chapterDetectionEnabled);
        // Beim Ausschalten werden ausschließlich automatisch erkannte Werte
        // entfernt. Manuell eingetragene Kapitel bleiben vollständig erhalten.
        if (!enabled && data.settings.chapterDetectionEnabled !== false) {
          data.items.forEach((item) => {
            if (!item.chapterManual) item.currentChapter = '';
          });
        }
        data.settings.chapterDetectionEnabled = enabled;
      }
      if (changes.offerRereadOnUpdate !== undefined) {
        data.settings.offerRereadOnUpdate = Boolean(changes.offerRereadOnUpdate);
      }
      if (changes.autoTagRereads !== undefined) {
        data.settings.autoTagRereads = Boolean(changes.autoTagRereads);
      }
      if (changes.ratingScale !== undefined) {
        const previousScale = data.settings.ratingScale === 10 ? 10 : 5;
        const nextScale = Number(changes.ratingScale) === 10 ? 10 : 5;
        // Beim Verkleinern werden ausschließlich ungültig werdende Werte auf
        // die neue Obergrenze gesetzt. Bereits gültige 1–5 Sterne behalten
        // exakt ihre Bedeutung; beim späteren Wechsel auf 10 bleiben sie ebenso
        // unverändert und werden nicht künstlich verdoppelt.
        if (nextScale < previousScale) {
          data.items.forEach((item) => {
            if (item.rating > nextScale) item.rating = nextScale;
          });
        }
        data.settings.ratingScale = nextScale;
      }
      if (changes.onboardingComplete !== undefined) {
        data.settings.onboardingComplete = Boolean(changes.onboardingComplete);
      }
      if (changes.showOnboardingOnStartup !== undefined) {
        data.settings.showOnboardingOnStartup = Boolean(changes.showOnboardingOnStartup);
      }
      if (changes.syncEnabled !== undefined) {
        data.settings.syncEnabled = Boolean(changes.syncEnabled);
      }
      if (changes.collectionView !== undefined) {
        data.settings.collectionView = changes.collectionView === 'cards' ? 'cards' : 'table';
      }
      if (changes.collectionViews && typeof changes.collectionViews === 'object') {
        [...COLLECTION_VIEWS, ...data.settings.customCategories.map((category) => category.id)].forEach((view) => {
          if (changes.collectionViews[view] !== undefined) {
            data.settings.collectionViews[view] = changes.collectionViews[view] === 'cards' ? 'cards' : 'table';
          }
        });
      }
      if (changes.categoryNames && typeof changes.categoryNames === 'object') {
        COLLECTION_VIEWS.forEach((view) => {
          if (changes.categoryNames[view] !== undefined) {
            data.settings.categoryNames[view] = String(changes.categoryNames[view] || '').trim().slice(0, 40);
          }
        });
      }
      if (changes.customCategories !== undefined) {
        data.settings.customCategories = Array.isArray(changes.customCategories)
          ? changes.customCategories
          : data.settings.customCategories;
      }
      if (changes.categoryOrder !== undefined && Array.isArray(changes.categoryOrder)) {
        const available = [...COLLECTION_VIEWS, ...data.settings.customCategories.map((category) => category.id)];
        data.settings.categoryOrder = [
          ...changes.categoryOrder.map(String).filter((view, index, order) => available.includes(view) && order.indexOf(view) === index),
          ...available.filter((view) => !changes.categoryOrder.includes(view))
        ];
      }
      if (changes.defaultNewStatus !== undefined) {
        const availableStatuses = [...STANDARD_STATUSES, ...data.settings.customCategories.map((category) => category.id)];
        data.settings.defaultNewStatus = availableStatuses.includes(changes.defaultNewStatus)
          ? changes.defaultNewStatus
          : 'active';
      }
      if (changes.customTagPresets !== undefined) {
        data.settings.customTagPresets = cleanTags(changes.customTagPresets)
          .filter((tag) => !TAG_PRESETS.some((preset) => preset.toLowerCase() === tag.toLowerCase()))
          .map((tag) => tag.slice(0, 40))
          .slice(0, 100);
      }
      if (changes.hiddenTagPresets !== undefined) {
        data.settings.hiddenTagPresets = cleanTags(changes.hiddenTagPresets)
          .map((tag) => TAG_PRESETS.find((preset) => preset.toLowerCase() === tag.toLowerCase()))
          .filter(Boolean);
      }
      if (changes.tagPresets !== undefined) {
        const available = [...TAG_PRESETS, ...data.settings.customTagPresets]
          .filter((tag) => !data.settings.hiddenTagPresets.some((hidden) => hidden.toLowerCase() === tag.toLowerCase()));
        data.settings.tagPresets = cleanTags(changes.tagPresets)
          .map((tag) => available.find((preset) => preset.toLowerCase() === tag.toLowerCase()))
          .filter(Boolean);
      }
      if (changes.placeholderCoverByTag !== undefined) {
        const allowed = new Set(['arcane', 'city', 'forest', 'cosmic']);
        data.settings.placeholderCoverByTag = Object.fromEntries(Object.entries(changes.placeholderCoverByTag || {})
          .map(([tag, coverId]) => [String(tag).trim().slice(0, 40), String(coverId)])
          .filter(([tag, coverId], index, entries) => tag && allowed.has(coverId)
            && entries.findIndex(([candidate]) => candidate.toLowerCase() === tag.toLowerCase()) === index));
      }
      if (changes.placeholderCoversEnabled !== undefined) {
        data.settings.placeholderCoversEnabled = Boolean(changes.placeholderCoversEnabled);
      }
      if (changes.language !== undefined) {
        data.settings.language = changes.language === 'en' ? 'en' : 'de';
      }
      if (changes.limitLogs !== undefined) {
        data.settings.limitLogs = Boolean(changes.limitLogs);
      }
      if (changes.colorMode !== undefined) {
        data.settings.colorMode = changes.colorMode === 'light' ? 'light' : 'dark';
      }
      if (changes.searchEngine !== undefined) {
        data.settings.searchEngine = String(changes.searchEngine || 'browser-default');
      }
      if (changes.customSearchEngines !== undefined) {
        data.settings.customSearchEngines = Array.isArray(changes.customSearchEngines)
          ? changes.customSearchEngines
          : data.settings.customSearchEngines;
      }
      if (changes.bookmarkImportMode !== undefined) {
        data.settings.bookmarkImportMode = ['folders', 'keyword', 'manual'].includes(changes.bookmarkImportMode)
          ? changes.bookmarkImportMode
          : 'folders';
      }
      if (changes.bookmarkImportKeyword !== undefined) {
        data.settings.bookmarkImportKeyword = String(changes.bookmarkImportKeyword || '').trim().slice(0, 100);
      }
      if (changes.showBookmarkImportButton !== undefined) {
        data.settings.showBookmarkImportButton = Boolean(changes.showBookmarkImportButton);
      }
      if (changes.showSupportButton !== undefined) {
        data.settings.showSupportButton = Boolean(changes.showSupportButton);
      }
      const english = data.settings.language === 'en';
      const labels = {
        showSupportButton: ['Ko-fi-Button', 'Ko-fi button'], language: ['Sprache', 'Language'],
        colorMode: ['Farbschema', 'Color scheme'], ratingScale: ['Bewertungsskala', 'Rating scale'],
        showCoversInTable: ['Cover in Tabellen', 'Table covers'], chapterDetectionEnabled: ['Automatische Kapitelerkennung', 'Automatic chapter detection'],
        offerRereadOnUpdate: ['Re-Read anbieten', 'Offer re-read'], autoTagRereads: ['Re-Read automatisch taggen', 'Automatically tag re-reads'],
        showOnboardingOnStartup: ['Startdialog', 'Welcome dialog'], onboardingComplete: ['Einführung abgeschlossen', 'Onboarding completed'],
        syncEnabled: ['Browser-Sync', 'Browser sync'], collectionView: ['Sammlungsansicht', 'Collection view'],
        collectionViews: ['Ansichten je Kategorie', 'Views by category'], categoryNames: ['Kategorienamen', 'Category names'],
        customCategories: ['Eigene Kategorien', 'Custom categories'], categoryOrder: ['Kategoriereihenfolge', 'Category order'],
        defaultNewStatus: ['Standardkategorie', 'Default category'], customTagPresets: ['Eigene Tag-Vorgaben', 'Custom tag presets'],
        hiddenTagPresets: ['Ausgeblendete Tag-Vorgaben', 'Hidden tag presets'], tagPresets: ['Aktivierte Tags', 'Enabled tags'],
        placeholderCoverByTag: ['Platzhalter-Zuordnung', 'Placeholder assignments'], placeholderCoversEnabled: ['Platzhalter-Cover', 'Placeholder covers'],
        limitLogs: ['Alte Protokolle automatisch löschen', 'Automatically delete old logs'], searchEngine: ['Suchmaschine', 'Search engine'],
        customSearchEngines: ['Eigene Suchmaschinen', 'Custom search engines'], bookmarkImportMode: ['Lesezeichen-Importart', 'Bookmark import mode'],
        bookmarkImportKeyword: ['Import-Schlüsselwort', 'Import keyword'], showBookmarkImportButton: ['Importknopf', 'Import button']
      };
      const display = (value) => {
        if (typeof value === 'boolean') return value ? (english ? 'On' : 'Ein') : (english ? 'Off' : 'Aus');
        const names = { de: 'Deutsch', en: 'English', dark: english ? 'Dark' : 'Dunkel', light: english ? 'Light' : 'Hell', table: english ? 'Table' : 'Tabelle', cards: english ? 'Cards' : 'Kacheln' };
        if (typeof value === 'string') return names[value] || value || (english ? '(empty)' : '(leer)');
        return JSON.stringify(value) ?? '—';
      };
      for (const key of Object.keys(data.settings)) {
        if (JSON.stringify(previousSettings[key]) === JSON.stringify(data.settings[key])) continue;
        const label = labels[key]?.[english ? 1 : 0] || key;
        appendLog(data, 'info', english ? 'Settings' : 'Einstellungen',
          `${label}: ${display(previousSettings[key])} → ${display(data.settings[key])}`);
      }
    });
  }

  /** Liest den vollständigen Datensatz aus Firefox storage.local. */
  async function load() {
    const result = await browser.storage.local.get(STORAGE_KEY);
    const storedData = result[STORAGE_KEY] || DEFAULT_DATA;
    const invalidCoverCount = Array.isArray(storedData.items)
      ? storedData.items.filter((item) => cleanUrl(item?.url) && cleanUrl(item.url) === cleanCover(item.cover, item.url)).length
      : 0;
    const needsVersionMigration = Number(storedData.version) !== DATA_VERSION;
    const data = normalizeData(storedData);
    // Ältere Versionen speicherten hochgeladene data:-Cover direkt im
    // Hauptdatensatz. Beim ersten Laden werden sie verlustfrei ausgelagert.
    const inlineCovers = data.items.filter((item) => /^data:image\//i.test(item.cover));
    if (inlineCovers.length || invalidCoverCount || needsVersionMigration) {
      await Promise.all(inlineCovers.map((item) => storeCover(item.id, item.cover)));
      inlineCovers.forEach((item) => { item.cover = ''; });
      if (invalidCoverCount) {
        appendLog(data, 'info', 'Cover', `${invalidCoverCount} fehlerhafte Cover-Adresse bereinigt`, 'Kapitel-Link war fälschlich als Cover gespeichert');
      }
      data.updatedAt = Date.now();
      await browser.storage.local.set({ [STORAGE_KEY]: data });
    }
    return data;
  }

  /** Speichert atomar einen vollständig normalisierten Datensatz. */
  async function save(input) {
    const data = normalizeData(input);
    data.updatedAt = Date.now();
    await browser.storage.local.set({ [STORAGE_KEY]: data });
    return data;
  }

  /**
   * Lädt, verändert und speichert Daten in einem Schritt.
   * Der Mutator darf das übergebene Objekt direkt verändern.
   */
  async function update(mutator) {
    const data = await load();
    await mutator(data);
    return save(data);
  }

  /** Retain the latest 100 events unless the user explicitly disables retention. */
  function appendLog(data, level, area, message, details = '') {
    data.logs.unshift({
      id: createId(),
      time: Date.now(),
      level,
      area,
      message,
      details: String(details || '')
    });
    if (data.settings.limitLogs !== false) data.logs = data.logs.slice(0, 100);
  }

  /** Fügt einen Manga ein oder aktualisiert den Eintrag mit gleicher ID/URL. */
  async function upsertItem(input) {
    const localCoverData = /^data:image\//i.test(String(input?.cover || '')) ? String(input.cover) : '';
    const incoming = localCoverData ? { ...input, cover: '' } : input;
    // Ein Re-Read darf absichtlich dieselbe Serien- oder sogar Kapiteladresse
    // besitzen. forceNew ist reine Befehlsinformation und wird von
    // normalizeItem nicht in den Datensatz uebernommen.
    const forceNew = incoming?.forceNew === true;
    const checkedUrl = cleanUrl(incoming?.url);
    if (!checkedUrl) throw new Error('Eine gültige HTTP(S)-Adresse ist erforderlich.');
    let savedItemId = '';
    let clearCachedCover = false;
    const result = await update((data) => {
      const index = data.items.findIndex(
        (existing) => !forceNew && ((incoming.id && existing.id === incoming.id) || existing.url === checkedUrl)
      );
      let item;
      if (index >= 0) {
        const existing = data.items[index];
        clearCachedCover = !localCoverData
          && Object.prototype.hasOwnProperty.call(incoming, 'cover')
          && Boolean(incoming.cover)
          && incoming.cover !== existing.cover;
        // Nicht mitgelieferte Felder (z. B. Tags oder Bookmark-ID) bleiben erhalten.
        item = normalizeItem({
          ...existing,
          ...incoming,
          id: existing.id,
          created: existing.created,
          modified: Date.now()
        });
        const readingLimit = getReadingLimit(data);
        if (item.status === 'reading' && existing.status !== 'reading' && data.items.filter((entry) => entry.status === 'reading').length >= readingLimit) {
          throw new Error(`„Lese ich gerade“ ist voll (${readingLimit}/${readingLimit}). Verschiebe zuerst einen anderen Manga.`);
        }
        data.items[index] = item;
      } else {
        item = normalizeItem({ ...incoming, url: checkedUrl });
        const readingLimit = getReadingLimit(data);
        if (item.status === 'reading' && data.items.filter((entry) => entry.status === 'reading').length >= readingLimit) {
          throw new Error(`„Lese ich gerade“ ist voll (${readingLimit}/${readingLimit}). Verschiebe zuerst einen anderen Manga.`);
        }
        data.items.unshift(item);
      }
      savedItemId = item.id;
      item.tags.forEach((tag) => {
        if (!data.customTags.some((known) => known.toLowerCase() === tag.toLowerCase())) {
          data.customTags.push(tag);
        }
      });
      data.customTags.sort((a, b) => a.localeCompare(b, 'de'));
      appendLog(data, 'info', 'Sammlung', `„${item.title}“ gespeichert`, item.url);
    });
    if (clearCachedCover) await browser.storage.local.remove(coverStorageKey(savedItemId));
    if (localCoverData) await storeCover(savedItemId, localCoverData);
    return result;
  }

  /** Entfernt genau einen Eintrag anhand seiner internen ID. */
  async function removeItem(id) {
    const result = await update((data) => {
      const item = data.items.find((candidate) => candidate.id === id);
      data.items = data.items.filter((candidate) => candidate.id !== id);
      if (item) appendLog(data, 'info', 'Sammlung', `„${item.title}“ entfernt`);
    });
    await browser.storage.local.remove(coverStorageKey(id));
    return result;
  }

  /** Ändert einzelne Felder eines vorhandenen Eintrags. */
  async function patchItem(id, changes) {
    return update((data) => {
      const index = data.items.findIndex((item) => item.id === id);
      if (index < 0) return;
      const existing = data.items[index];
      const readingLimit = getReadingLimit(data);
      if (changes.status === 'reading' && existing.status !== 'reading' && data.items.filter((item) => item.status === 'reading').length >= readingLimit) {
        throw new Error(`„Lese ich gerade“ ist voll (${readingLimit}/${readingLimit}). Verschiebe zuerst einen anderen Manga.`);
      }
      data.items[index] = normalizeItem({
        ...existing,
        ...changes,
        id,
        modified: Date.now()
      });
    });
  }

  /** Liefert auswählbare Firefox-Ordner samt Anzahl enthaltener Lesezeichen. */
  async function getFirefoxBookmarkFolders() {
    const roots = await browser.bookmarks.getTree();

    function countBookmarks(node) {
      return (node.children || []).reduce(
        (count, child) => count + (child.url ? 1 : countBookmarks(child)),
        0
      );
    }

    const folders = [];
    function walkFolders(nodes, path = []) {
      for (const node of nodes || []) {
        if (!node.children) continue;
        const nextPath = node.title ? [...path, node.title] : path;
        if (node.title) {
          folders.push({
            id: String(node.id),
            title: node.title,
            path: nextPath,
            bookmarkCount: countBookmarks(node)
          });
        }
        walkFolders(node.children, nextPath);
      }
    }
    walkFolders(roots);
    return folders.filter((folder) => folder.bookmarkCount > 0);
  }

  /** Liefert alle normalen Firefox-Webseiten-Lesezeichen für die manuelle Auswahl. */
  async function getFirefoxBookmarks() {
    const current = await load();
    const detectChapters = current.settings.chapterDetectionEnabled !== false;
    const roots = await browser.bookmarks.getTree();
    const bookmarks = [];
    function walk(nodes, path = []) {
      for (const node of nodes || []) {
        if (node.url) {
          const url = cleanUrl(node.url);
          if (url) bookmarks.push({
            id: String(node.id),
            title: String(node.title || sourceFromUrl(url)),
            url,
            path,
            currentChapter: detectChapters ? chapterFromUrl(url) : ''
          });
        }
        if (node.children) {
          const nextPath = node.title ? [...path, node.title] : path;
          walk(node.children, nextPath);
        }
      }
    }
    walk(roots);
    return bookmarks;
  }

  /**
   * Importiert nur die ausgewählten Firefox-Ordner.
   * folderRatings ordnet jeder Ordner-ID optional eine Bewertung von 1–10 zu.
   * Ist zusätzlich ein Unterordner ausgewählt, gilt dort dessen eigene Bewertung.
   */
  async function importFirefoxBookmarks(options = {}) {
    const current = await load();
    const detectChapters = current.settings.chapterDetectionEnabled !== false;
    const roots = await browser.bookmarks.getTree();
    const selectedIds = new Set((options.folderIds || []).map(String));
    const selectedBookmarkIds = new Set((options.bookmarkIds || []).map(String));
    const keyword = String(options.keyword || '').trim().toLocaleLowerCase();
    const folderRatings = options.folderRatings || {};
    const flattened = [];

    function walk(nodes, path = [], activeFolderId = '') {
      for (const node of nodes || []) {
        const selectedByFolder = Boolean(activeFolderId);
        const selectedManually = selectedBookmarkIds.has(String(node.id));
        const selectedByKeyword = Boolean(keyword) && `${node.title || ''} ${node.url || ''}`.toLocaleLowerCase().includes(keyword);
        if (node.url && (selectedByFolder || selectedManually || selectedByKeyword)) {
          const bookmark = normalizeItem({
            bookmarkId: node.id,
            title: node.title || sourceFromUrl(node.url),
            url: node.url,
            folderPath: path,
            currentChapter: detectChapters ? chapterFromUrl(node.url) : '',
            chapterManual: false,
            rating: Number(folderRatings[activeFolderId]) || 0,
            created: node.dateAdded || Date.now(),
            modified: node.dateGroupModified || node.dateAdded || Date.now()
          });
          // Firefox kann auch interne oder JavaScript-Lesezeichen enthalten.
          // Das Manga-Regal übernimmt bewusst nur normale Webseiten.
          if (bookmark.url) flattened.push(bookmark);
        }
        if (node.children) {
          const nextPath = node.title ? [...path, node.title] : path;
          const nextActiveFolder = selectedIds.has(String(node.id))
            ? String(node.id)
            : activeFolderId;
          walk(node.children, nextPath, nextActiveFolder);
        }
      }
    }

    walk(roots);

    let imported = 0;
    let linked = 0;
    let rated = 0;
    await update((data) => {
      const byUrl = new Map(data.items.map((item) => [item.url, item]));
      for (const bookmark of flattened) {
        const existing = byUrl.get(bookmark.url);
        if (existing) {
          if (!existing.bookmarkId) {
            existing.bookmarkId = bookmark.bookmarkId;
            existing.folderPath = bookmark.folderPath;
            linked += 1;
          }
          if (bookmark.rating > 0) {
            existing.rating = bookmark.rating;
            existing.modified = Date.now();
            rated += 1;
          }
          if (!existing.currentChapter && bookmark.currentChapter) {
            existing.currentChapter = bookmark.currentChapter;
          }
          continue;
        }
        bookmark.status = data.settings.defaultNewStatus;
        data.items.push(bookmark);
        byUrl.set(bookmark.url, bookmark);
        imported += 1;
      }
      appendLog(
        data,
        'info',
        global.MangaPlatform?.browserName || 'Firefox',
        `${imported} Lesezeichen importiert`,
        `${linked} verknüpft · ${rated} durch Ordnerbewertung aktualisiert`
      );
    });

    return { imported, linked, rated, scanned: flattened.length };
  }

  /**
   * Prüft, ob der zuletzt von Manga-Regal erzeugte Firefox-Ordner auf diesem
   * Gerät noch existiert. Ein bloß gleichnamiger fremder Ordner gilt absichtlich
   * nicht als verwaltet und wird bei einem späteren Export niemals gelöscht.
   */
  async function getFirefoxBookmarkExportStatus() {
    const stored = await browser.storage.local.get(BOOKMARK_EXPORT_STATE_KEY);
    const state = stored[BOOKMARK_EXPORT_STATE_KEY] || null;
    if (!state?.rootId || typeof browser.bookmarks?.get !== 'function') {
      return { available: false, rootId: '', exportedAt: 0, itemCount: 0, folderCount: 0 };
    }
    try {
      const nodes = await browser.bookmarks.get(String(state.rootId));
      const root = Array.isArray(nodes) ? nodes[0] : null;
      return {
        available: Boolean(root && !root.url),
        rootId: String(state.rootId),
        exportedAt: Number(state.exportedAt) || 0,
        itemCount: Number(state.itemCount) || 0,
        folderCount: Number(state.folderCount) || 0
      };
    } catch {
      return { available: false, rootId: '', exportedAt: 0, itemCount: 0, folderCount: 0 };
    }
  }

  /**
   * Schreibt die lokale Sammlung als normale Firefox-Lesezeichen zurück.
   *
   * Datenvertrag des Exports:
   *   - Lesezeichen enthalten ausschließlich Titel und URL.
   *   - Die Einordnung wird durch Unterordner ausgedrückt.
   *   - Bewertungen, Tags, Cover und Logs verlassen den Add-on-Speicher nicht.
   *   - Die Gesamtansicht "Alle" wird nicht dupliziert: Jeder Manga liegt genau
   *     einmal in seinem Statusordner, ist aber über den Oberordner vollständig.
   *
   * Firefox legt einen Knoten ohne parentId standardmäßig unter "Weitere
   * Lesezeichen" an. Erst wird ein vollständiger neuer Baum aufgebaut. Nur wenn
   * das gelingt, wird der zuvor von Manga-Regal verwaltete Baum ersetzt. So
   * bleibt der letzte funktionierende Export bei einem Abbruch unangetastet.
   */
  async function exportToFirefoxBookmarks(options = {}) {
    if (typeof browser.bookmarks?.create !== 'function'
      || typeof browser.bookmarks?.update !== 'function'
      || typeof browser.bookmarks?.removeTree !== 'function') {
      throw new Error('Diese Browser-Version unterstützt den Lesezeichen-Export nicht.');
    }

    const data = await load();
    const rootTitle = String(options.rootTitle || 'Manga-Regal').trim().slice(0, 100) || 'Manga-Regal';
    const suppliedCategories = Array.isArray(options.categories) ? options.categories : [];
    const seenStatuses = new Set();
    const categories = suppliedCategories
      .map((category) => ({
        id: String(category?.id || '').trim(),
        title: String(category?.title || category?.id || '').trim().slice(0, 100)
      }))
      .filter((category) => category.id && category.id !== 'all' && category.title && !seenStatuses.has(category.id) && seenStatuses.add(category.id));

    // Sicherungsnetz für alte/inkonsistente Daten: Auch ein Status, der nicht
    // mehr in der Oberfläche konfiguriert ist, darf beim Export nicht verloren gehen.
    for (const status of [...new Set(data.items.map((item) => item.status))]) {
      if (!seenStatuses.has(status)) {
        seenStatuses.add(status);
        categories.push({ id: status, title: status });
      }
    }

    const previous = await getFirefoxBookmarkExportStatus();
    let newRoot = null;
    let oldTreeRemoved = false;
    const bookmarkLinks = new Map();

    try {
      // Kein parentId: Firefox verwendet den Standardordner "Weitere Lesezeichen".
      const parent = global.MangaPlatform?.isChrome ? { parentId: '2' } : {};
      newRoot = await browser.bookmarks.create({ ...parent, title: `${rootTitle} (wird erstellt)` });
      for (const category of categories) {
        const folder = await browser.bookmarks.create({
          parentId: String(newRoot.id),
          title: category.title
        });
        const items = data.items.filter((item) => item.status === category.id && cleanUrl(item.url));
        // Bewusst sequenziell: Firefox behält so die Reihenfolge der Sammlung.
        for (const item of items) {
          const bookmark = await browser.bookmarks.create({
            parentId: String(folder.id),
            title: String(item.title || sourceFromUrl(item.url)).trim() || sourceFromUrl(item.url),
            url: cleanUrl(item.url)
          });
          bookmarkLinks.set(item.id, {
            bookmarkId: String(bookmark.id),
            folderPath: [rootTitle, category.title]
          });
        }
      }

      if (previous.available && previous.rootId !== String(newRoot.id)) {
        await browser.bookmarks.removeTree(previous.rootId);
        oldTreeRemoved = true;
      }
      await browser.bookmarks.update(String(newRoot.id), { title: rootTitle });

      const exportedAt = Date.now();
      // Die Geräte-ID wird vor den fachlichen Verknüpfungen festgehalten. Falls
      // ein späterer Speicherschritt scheitert, kann der nächste Export den neu
      // angelegten Baum trotzdem eindeutig erkennen und sauber ersetzen.
      await browser.storage.local.set({
        [BOOKMARK_EXPORT_STATE_KEY]: {
          rootId: String(newRoot.id),
          exportedAt,
          itemCount: bookmarkLinks.size,
          folderCount: categories.length
        }
      });
      await update((current) => {
        current.items.forEach((item) => {
          const link = bookmarkLinks.get(item.id);
          if (!link) return;
          item.bookmarkId = link.bookmarkId;
          item.folderPath = link.folderPath;
        });
        appendLog(
          current,
          'info',
          global.MangaPlatform?.browserName || 'Firefox',
          `${bookmarkLinks.size} Manga als Lesezeichen exportiert`,
          `${categories.length} Kategorieordner unter ${rootTitle}`
        );
      });
      return {
        rootId: String(newRoot.id),
        exportedAt,
        itemCount: bookmarkLinks.size,
        folderCount: categories.length,
        replaced: previous.available
      };
    } catch (error) {
      // Vor dem Umschaltpunkt ist der alte Baum noch vollständig. Der nur
      // teilweise aufgebaute neue Baum kann daher gefahrlos entfernt werden.
      if (newRoot?.id && !oldTreeRemoved) {
        try { await browser.bookmarks.removeTree(String(newRoot.id)); } catch { /* best effort */ }
      }
      throw error;
    }
  }

  /** Nimmt getrennt gespeicherte Cover in die lokale JSON-Sicherung auf. */
  async function exportData() {
    const data = await load();
    const localCovers = {};
    await Promise.all(data.items.map(async (item) => {
      const cover = await getStoredCover(item.id);
      if (cover) localCovers[item.id] = cover;
    }));
    const customPlaceholderCovers = (await getCustomPlaceholderCovers({ includeData: true }))
      .filter((cover) => /^data:image\//i.test(cover.dataUrl));
    return { ...data, localCovers, customPlaceholderCovers };
  }

  /** Importiert eine zuvor exportierte JSON-Datei nach kurzer Strukturprüfung. */
  async function importData(input) {
    if (!input || !Array.isArray(input.items)) {
      throw new Error('Die Datei enthält keinen gültigen Manga-Regal-Datensatz.');
    }
    const data = normalizeData(input);
    appendLog(data, 'info', 'Datensicherung', 'JSON-Datensatz importiert');
    const saved = await save(data);
    const localCovers = input.localCovers && typeof input.localCovers === 'object' ? input.localCovers : {};
    await Promise.all(saved.items.map((item) => storeCover(item.id, localCovers[item.id])));
    await Promise.all(PLACEHOLDER_COVER_IDS.map((id) => browser.storage.local.remove(customPlaceholderStorageKey(id))));
    for (const cover of Array.isArray(input.customPlaceholderCovers) ? input.customPlaceholderCovers.slice(0, 4) : []) {
      try { await saveCustomPlaceholderCover(cover); } catch { /* Ungültige alte Bilddaten werden ausgelassen. */ }
    }
    return saved;
  }

  /** Öffentliche Schnittstelle für Hintergrund, Overlay und Dashboard. */
  global.MangaStore = {
    STORAGE_KEY,
    BOOKMARK_EXPORT_STATE_KEY,
    DEFAULT_READING_LIMIT,
    TAG_PRESETS,
    REREAD_TAG,
    load,
    save,
    update,
    getReadingLimit,
    setReadingLimit,
    setPreferences,
    upsertItem,
    removeItem,
    patchItem,
    getStoredCover,
    storeCover,
    cacheCover,
    getCustomPlaceholderCovers,
    saveCustomPlaceholderCover,
    removeCustomPlaceholderCover,
    getFirefoxBookmarkFolders,
    getFirefoxBookmarks,
    importFirefoxBookmarks,
    getFirefoxBookmarkExportStatus,
    exportToFirefoxBookmarks,
    exportData,
    importData,
    appendLog,
    normalizeItem,
    sourceFromUrl,
    chapterFromUrl,
    seriesKeyFromUrl,
    titleKey,
    findLikelyMatch,
    findLikelyMatches,
    cleanTags
  };
})(globalThis);
