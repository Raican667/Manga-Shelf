# Entwicklerdokumentation

**Deutsch** | [English](DEVELOPMENT.en.md)

Technische Referenz des aktuellen Repository-Stands. Einstieg: [README](../README.de.md).
Wartungsregeln: [CONTRIBUTING](../CONTRIBUTING.md). Änderungen: [Changelog](../CHANGELOG.md).
Diese Datei beschreibt implementiertes Verhalten, keine geplanten Funktionen.

## 1. Laufzeit und Module

Browser-Erweiterung mit Manifest V3, JavaScript, HTML und CSS. Kein Anwendungsserver,
keine SQL-Datenbank, kein Framework und kein npm-Build erforderlich. Die Laufzeit
verwendet globale Module statt ES-Modulimporte.

| Modul | Verantwortung |
| --- | --- |
| `manifest.json`, `_locales/` | Firefox-Einstiegspunkte, Berechtigungen und lokalisierte Erweiterungsmetadaten |
| `shared/platform.js` | Erkennt Chrome anhand des fehlenden Gecko-Manifesteintrags; kapselt Browsername und Such-API |
| `shared/store.js` / `MangaStore` | Normalisierung, lokale Speicherung, Kapitel-/Serienerkennung, Cover, Lesezeichen und JSON-Sicherung |
| `shared/sync.js` / `MangaSync` | Zustimmung, Snapshot-Kompression, Transport über `storage.sync`, Wiederherstellung und Status |
| `background/background.js` | Toolbar, Tastenkürzel, Nachrichten, Lesezeichenereignisse und Sync-Zeitplanung |
| `background/service-worker.js` | Chrome-Einstiegspunkt; lädt gemeinsame Hintergrundmodule über `importScripts` |
| `content/overlay.js`, `.css` | Speicherformular im aktiven Webseiten-Tab; liest Metadaten aus dessen DOM |
| `dashboard/` | Sammlung, Filter, Tabelle/Kacheln, Bearbeitung und Einstellungen |
| `help/` | Lokale deutsch-/englischsprachige Hilfe |
| `scripts/`, `build.ps1` | Browser-Pakete und Release-Hinweise |

Firefox lädt die Hintergrundskripte in Manifest-Reihenfolge. Chrome erhält einen
Service Worker. Dashboard und Content Script haben eigene JavaScript-Kontexte;
gemeinsame globale Variablen sind kein kontextübergreifender Zustand.

## 2. Öffnen und Nachrichten

Toolbar-Klick oder `toggle-manga-regal` aktiviert das Overlay. Bei HTTP(S)-Tabs
sendet der Hintergrund zuerst `manga-regal:toggle-overlay`. Fehlt ein Empfänger,
injiziert er CSS sowie `platform.js`, `store.js` und `overlay.js` und sendet erneut.
Interne/geschützte Seiten und fehlgeschlagene Injektion öffnen die Sammlung.

Das Overlay verwendet ein natives `dialog` für die Tag-Auswahl. Sein Wurzelelement
ist `#manga-regal-overlay`; CSS ist darüber eingegrenzt, nicht über Shadow DOM.
Ein Kontext-Sentinel verhindert doppelte Initialisierung. Verwaistes DOM nach
einem Erweiterungsneuladen wird entfernt. Öffnen/Schließen bestätigt die Nachricht
asynchron. Das ist kein `action.default_popup` im Manifest.

| Nachricht | Empfänger / Wirkung |
| --- | --- |
| `manga-regal:toggle-overlay` | Content Script: Overlay öffnen oder schließen |
| `manga-regal:open-dashboard` | Hintergrund: Sammlung öffnen bzw. vorhandenen Tab verwenden |
| `manga-regal:cache-cover` | Hintergrund: Cover des Eintrags lokal sichern |
| `manga-regal:update-linked-bookmark` | Hintergrund: verknüpftes Browser-Lesezeichen aktualisieren |

Chrome hält für bekannte Hintergrundnachrichten den Antwortkanal mit `return true`
offen und antwortet über `sendResponse`. Unbekannte Nachrichten beanspruchen keinen
Kanal. Fehlerantworten enthalten `ok: false` und eine Meldung. Die konkreten
Payloads sind in `handleMessage()` und den jeweiligen Aufrufstellen definiert.

## 3. Lokaler Speichervertrag

Alle Daten liegen im Erweiterungsspeicher des Browserprofils, nicht in einem frei
wählbaren Windows-Ordner. Entfernen der Erweiterung kann diese Daten löschen.

| Schlüssel | Inhalt |
| --- | --- |
| `mangaRegalDataV1` | `{version, items, customTags, logs, settings, updatedAt}` |
| `mangaRegalCoverV1:<itemId>` | Lokales Cover als Bild-Data-URL |
| `mangaRegalCustomPlaceholderV1:<id>` | Benutzerbild für `arcane`, `city`, `forest` oder `cosmic` |
| `mangaRegalBookmarkExportStateV1` | Profilbezogener Verwaltungsstand des Lesezeichenexports |
| `mangaRegalSyncStateV1` | Letzte Sync-Revision, Status und Größenangaben |
| `mangaRegalCompressedSyncCacheV1` | Komprimierter Snapshot mit Inhaltssignatur |
| `mangaRegalChromeSyncConsentV1` | Zustimmung für dieses Chrome-Profil |

`DATA_VERSION = 20` ist die Schema-Version, unabhängig von `manifest.version`.
`load()` normalisiert alte Daten und bereinigt Cover-Adressen, die der Kapitel-URL
entsprechen. `save()` normalisiert, setzt `updatedAt` und schreibt den Hauptdatensatz.
`update(mutator)` lädt, verändert und speichert den gesamten Hauptdatensatz.

Es gibt keine Sperre, Transaktion oder Compare-and-Swap über mehrere Kontexte.
Gleichzeitige Read-Modify-Write-Aufrufe können Änderungen verlieren. Cover-Schlüssel
und Hauptdatensatz werden ebenfalls nicht atomar zusammen geschrieben.

### Manga-Eintrag

| Felder | Bedeutung |
| --- | --- |
| `id`, `title`, `url`, `source`, `description` | Identität und Webseitenmetadaten; `url` nur HTTP(S) |
| `currentChapter`, `chapterManual` | Kapitel als String; Kennzeichnung manueller Pflege |
| `chapterDetectionDisabled`, `coverDetectionDisabled` | Dauerhafte Automatik-Ausnahmen je Eintrag |
| `rating`, `tags`, `status` | Bewertung, bereinigte Tag-Liste und Kategorie |
| `rereadOf`, `rereadRound` | Haupt-Eintrags-ID und Nummer des erneuten Lesedurchlaufs |
| `cover`, `favicon` | Bildadresse/Metadaten; lokale Coverbytes stehen separat |
| `bookmarkId`, `folderPath` | Profilbezogene Browser-Lesezeichenverknüpfung |
| `created`, `modified` | Millisekunden seit Unix-Epoch |

Standardstatus: `reading`, `active`, `hold`, `dropped`, `completed`.
`all` ist eine aggregierte Ansicht, kein Manga-Status. Eigene Status verwenden
`custom-…`. Das Reading-Limit wird beim Wechsel nach `reading` und beim Anlegen
geprüft; das konfigurierbare Limit liegt zwischen 1 und 50.

`normalizeItem()` begrenzt Bewertungen auf 0–10. Die aktive Skala ist 5 oder 10;
beim Wechsel auf 5 werden Werte über 5 nach Bestätigung auf 5 begrenzt, nicht
proportional umgerechnet. Standard: 5 Sterne, Englisch, Dark Mode, Kategorie `active`.

### Einstellungen und Logs

`setPreferences()` verwaltet Ansicht je Kategorie, Kategorienamen/-reihenfolge,
Tags, Platzhalterzuordnung, Sprache, Theme, Rating-Skala, Importmodus,
Suchmaschinen, Automatik, Startdialog und Sync. `showSupportButton` bleibt als
Legacy-Speicherfeld erhalten; der Support-Button und sein Schalter sind entfernt.
Bildbytes gehören nicht in `settings`.

Bei tatsächlichen Änderungen wird je Einstellung der alte und neue Wert
protokolliert. Unveränderte Werte erzeugen keinen Eintrag. Nicht alle anderen
Ereignisprotokolle sind bereits zweisprachig.
Logs enthalten `{id, time, level, area, message, details}`. `appendLog()` fügt
vorne ein. Bei `limitLogs !== false` bleiben die neuesten 100 Einträge erhalten;
bei deaktivierter Begrenzung kann die Liste unbegrenzt wachsen.

## 4. Speichern, Kapitel und Re-Read

Das Overlay liest Titel, URL, Beschreibung und Cover-Kandidaten aus der geöffneten
Seite. Es crawlt keine externen Manga-Kataloge. `chapterFromUrl()` wertet bekannte
URL-Muster aus, fragt aber keinen aktuellen Veröffentlichungsstand ab.

`upsertItem()` aktualisiert den ersten Treffer nach ID **oder** gleicher URL.
`forceNew: true` umgeht dieses Matching für einen zusätzlichen Eintrag; das Flag
wird nicht gespeichert. Nicht mitgelieferte Felder bleiben bei Updates erhalten.

Die Serien-/Re-Read-Auswahl liegt oberhalb davon: `findLikelyMatches()` bewertet
Titel und Serien-URL, sodass Quellenwechsel möglich sind. `findLikelyMatch()`
bevorzugt den Hauptstand, wenn das neue Kapitel höher liegt; andernfalls wird
ein passender Re-Read vorgeschlagen. Der Benutzer kann die Auswahl korrigieren.
`rereadOf` ist die technische Verknüpfung; das sichtbare Tag `Re-Read` ist davon
getrennt und kann optional automatisch gesetzt werden.

Tag-Dialoge bieten aktivierte Vorgaben und vorhandene Zuweisungen an. Neue Tags
werden in den Einstellungen angelegt. Im Hinzufügen-/Bearbeiten-Formular bleibt
die Tag-Auswahl bis zum Speichern im Arbeitsspeicher; Abbrechen schreibt nichts.

## 5. Cover und Platzhalter

`cacheCover()` verwendet ein vorhandenes lokales Cover zuerst. Bei abgeschalteter
Cover-Automatik wird ohne `force` kein Remote-Download versucht. Änderungen der
Cover-Adresse können den bisherigen Cache über `upsertItem()` invalidieren.

Download: `fetch()` mit Timeout; mit gültigem Seiten-Referrer werden Credentials
einbezogen und `strict-origin-when-cross-origin` verwendet, sonst `omit` und
`no-referrer`. Ein XHR-Fallback existiert nur ohne Seiten-Referrer und wenn XHR
im Kontext verfügbar ist. Chrome-Service-Worker haben keinen XHR/FileReader.
Cloudflare, Cookie-Regeln und Hotlink-Schutz können Downloads weiterhin verhindern.
Es gibt keine garantierte Umgehung von Zugriffsschutz.

`normalizeCoverBlob()` prüft maximal 8 MiB, MIME-Type und Dateisignaturen. Der
Store encodiert als Data-URL; diese Funktion ist kein allgemeiner Bild-Resizer.
Overlay- und Hintergrundpfade können andere Aufnahme-/Downloadwege verwenden.
Die Sammlung lädt Bilder über Sichtbarkeitsbeobachtung (`IntersectionObserver`);
das bedeutet nicht, dass alle Cover erst dann heruntergeladen werden.

Platzhalter: vier mitgelieferte Motive, optional je Tag zugeordnet; Benutzerbilder
ersetzen deren lokale Bilddaten. Der Platzhalterschalter blendet Ersatzbilder aus,
löscht aber keine Zuordnungen oder Benutzerbilder. Cover und Platzhalterbytes
werden nicht synchronisiert.

## 6. Browser-Lesezeichen und JSON-Sicherung

Die historisch benannten `getFirefoxBookmarkFolders()`, `getFirefoxBookmarks()`,
`importFirefoxBookmarks()` und `exportToFirefoxBookmarks()` verwenden
`browser.bookmarks` auch in Chrome. Namen und Speicherschlüssel sind daher nicht
als Browser-Erkennung zu verwenden.

Import: Ordnerbaum rekursiv lesen; Auswahl nach Ordner-ID, Bookmark-ID oder
Schlüsselwort in Titel/URL. Nur normale Webseiten übernehmen. Gleiche URLs
vermeiden doppelte Importe; optionale Ordnerbewertungen und Standardkategorie
werden berücksichtigt. Ein Bookmark liefert keine garantierte Cover-Datei.

Export: neuen Oberordner und Kategorieordner erstellen, anschließend den neuen
Stand abschließen und den vorher verwalteten Baum bei Ersatz entfernen. Chrome
verwendet dafür `parentId: '2'`, Firefox seinen Standardordner. `all` wird nicht
als zusätzlicher Duplikatordner exportiert. Exportiert werden Bookmarkdaten,
keine Bewertungen, Cover oder Tag-Metadaten.

Bookmark-Änderungsereignisse aktualisieren verknüpfte Einträge; das Löschen eines
Bookmarks entfernt nur die Verknüpfung, nicht den Manga.

`exportData()` ergänzt den Hauptdatensatz um `localCovers` und
`customPlaceholderCovers`. `importData()` ersetzt den Hauptdatensatz und stellt
Bilddaten wieder her; es ist kein Merge. Backup enthält keine Chrome-Sync-Zustimmung.

## 7. Sync-Vertrag

`storage.local` bleibt der Arbeitsdatensatz. Komprimiert ist eine zusätzliche
lokale Snapshot-Kopie, nicht die gesamte lokale Datenhaltung.

Snapshot: `{v, s, t, i}` für Schema-Version, Einstellungen, eigene Tags und
kompakte Eintragsarrays. Eintragsreihenfolge:

```text
id, title, url, description, currentChapter, chapterManual, tags, rating,
status, created, modified, chapterDetectionDisabled, coverDetectionDisabled,
rereadOf, rereadRound
```

Titel/URL/Beschreibung/Kapitel werden im Sync auf 300/1500/500/100 Zeichen und
Tags auf 50 pro Eintrag begrenzt. Cover, Favicon, Bookmark-ID, Ordnerpfad und Logs
sind ausgeschlossen. Einstellungen und eigene Tags werden übernommen;
`onboardingComplete` und `syncEnabled` werden im Snapshot auf `true` gesetzt.

`prepare()` serialisiert, bildet eine Inhaltssignatur, komprimiert per gzip und
encodiert Base64. Unveränderte Snapshots verwenden den lokalen Cache.
`upload()` erzeugt revisionsmarkierte Teile unter `mangaRegalSyncV1:chunk:…`
und Metadaten unter `mangaRegalSyncV1:meta`.

Implementierte Budgetprüfung: 8.192 Byte je Schlüssel/Wert, 512 Schlüssel,
102.400 Byte insgesamt; Sicherheitsgrenze 98.000 Byte, Nutzlastziel 7.400 Zeichen
je Teil. Andere Schlüssel werden bei der Budgetberechnung mitgezählt.
Alte eigene Schlüssel werden vor dem Schreiben entfernt; bei Fehler wird eine
Wiederherstellung des alten Snapshots versucht. Das ist keine atomare Transaktion.

`readRemote()` prüft Revision je Teil und Nutzlastlänge und liest auch ältere,
unkomprimierte Formate. `restore()` ersetzt die Sammlung vollständig und erhält
lokale Cover-/Bookmark-Metadaten nur bei gleicher Eintrags-ID. Es gibt keinen
feldweisen Merge und keine garantierte konfliktfreie Mehrgerätebearbeitung.

Zustimmung: Firefox über die optionalen Datenrechte im Manifest; Chrome über
einen lokalen Bestätigungsdialog. Ein importiertes `syncEnabled` gewährt keine
Zustimmung. Firefox und Chrome nutzen getrennte Browser-Sync-Dienste.
Chrome terminiert Jobs über Alarme; Firefox verwendet Timer. Änderungen an
lokalen Daten bereiten den Cache vor und planen Uploads; Remoteänderungen planen
Restore. Browserquoten und verzögerte Übertragung bleiben externe Grenzen.

## 8. Berechtigungen und externe Zugriffe

Das Manifest verlangt `activeTab`, `bookmarks`, `search`, `scripting`, `storage`,
`tabs`, `unlimitedStorage` und Hostzugriff auf `<all_urls>`. Chrome ergänzt `alarms`.
Das Overlay wird auf Nutzeraktion injiziert; der breite Hostzugriff existiert
trotzdem für externe Bildzugriffe. `unlimitedStorage` hebt Sync-Quoten nicht auf.

Benutzernamen und Tags dürfen nicht ungeprüft als HTML eingebaut werden.
Neue DOM-Texte über `textContent` setzen; dynamische Listen verwenden DOM-Erzeugung
und Text-/Werteigenschaften statt HTML-Parsing. Nur das statische Overlay-Grundgerüst
verwendet ein HTML-Literal ohne Interpolation. Nachrichten und importierte Daten müssen am Speichervertrag
validiert werden. Keine Geheimnisse oder Zugangsdaten in Repository/Logs ablegen.

Es gibt keinen Support-Button und keine nachgeladenen Widget-Skripte.
Suchanfragen öffnen den gewählten Browser-/Web-Suchdienst.
Es gibt keinen eigenen Telemetrie- oder Zahlungsserver.

## 9. Entwicklung, Tests und Releases

Voraussetzungen: PowerShell 7, Node.js für Prüfungen, Firefox 142+ oder Chrome 148+.
Für reproduzierbare Paketprüfung Node.js nicht weglassen: `build.ps1` überspringt
die Node-Prüfungen andernfalls beim Firefox-Build. CI verwendet Node.js 24.

```powershell
.\build.ps1                   # beide Browser
.\build.ps1 -Browser firefox
.\build.ps1 -Browser chrome
node .\scripts\release-notes.js
```

Chrome-Manifest wird aus dem Firefox-Manifest abgeleitet; Gecko-Konfiguration
wird entfernt, Worker/PNG-Icons/Alarme/Mindestversion werden gesetzt und staged
Locale-Texte angepasst. Nicht den generierten Build als separate Codebasis pflegen.

| Test | Abdeckung |
| --- | --- |
| `store.test.js` | Datenmodell, Migrationen, Cover, Lesezeichen, Sync, Einstellungslogs |
| `wiring.test.js` | HTML/JS-Verknüpfungen, Hilfe, Versionsreferenzen |
| `background.test.js` | Firefox-Hintergrund, Toolbar und Fallback |
| `chrome.test.js` | Chrome-Worker mit API-Mocks, Import, Nachrichten, Cover, Sync-Alarme |
| `overlay-tags.test.js` | Optionaler Chromium-UI-Test: Tags, Abbrechen, Neuinjektion, kein Support-Button |
| `dashboard-tags.test.js` | Optionaler Chromium-UI-Test: Formular-Tags und entfernte Support-Elemente |
| `dom-rendering.test.js` | Optionaler Chromium-UI-Test: HTML-ähnliche Eingaben, Tabelle/Kacheln, Einstellungen, Logs und Import |

Die vier ersten Tests laufen im Build. Die UI-Tests benötigen zusätzlich
Playwright und ein Chromium-Executable als erstes Argument. Sie verwenden
isolierte Fixtures/Mocks, keine Benutzerprofile. Sie ersetzen keinen Test einer
wirklich installierten Erweiterung.

Release-Ablauf:

1. `manifest.version`, aktuelle README-/Hilfereferenzen und Versionsassertionen
   aktualisieren. Schema-Version nur bei Datenvertragsänderungen erhöhen.
2. DE/EN-Changelog ergänzen und aktuelle Dashboard-Patchnotes aktualisieren.
3. Build und relevante UI-Tests ausführen; beide Browser manuell prüfen.
4. Commit pushen und passendes Tag `v<manifest.version>` pushen.
5. Release-Workflow und beide Assets prüfen; Source-code-ZIP ist kein Browser-Build.

`release.yml` läuft bei Versions-Tags oder manuell. Neue Releases erhalten Notes
aus den Changelogs. Existiert das Release bereits, ersetzt der Workflow die ZIPs
mit `--clobber`, aktualisiert aber nicht automatisch den Release-Text.
Ein Push ohne Tag oder manuellen Release-Lauf ersetzt **keine** bestehenden ZIPs.
Beim Ersetzen derselben Version können Tag-Source und ZIP-Inhalt auseinanderlaufen;
für nachvollziehbare Veröffentlichungen eine neue Patchversion bevorzugen.

## 10. Diagnose und Änderungsgrenzen

- Overlay öffnet Sammlung: HTTP(S)-Tab prüfen; Hintergrundkonsole auf Injektions-
  oder Nachrichtenfehler prüfen. Geschützte Browserseiten erlauben kein Overlay.
- Cover fehlt: gespeicherten Cover-Schlüssel, Bildadresse, Automatik-Ausnahme,
  HTTP-Status und Sichtbarkeitsbeobachtung getrennt prüfen. Kapitel-URL ist kein Cover.
- Sync fehlt: Zustimmung und `syncEnabled` getrennt prüfen; Budget, Revisionen
  und Alarm-/Timer-Ausführung prüfen. JSON-Sicherung vor einem erzwungenen Restore.
- Änderungen nicht im Download: Commit, Manifestversion, Release-Lauf und
  Asset-Inhalt prüfen; Repository-Push allein genügt nicht.

Stabile IDs, Schlüssel und Sync-Arraypositionen nicht ohne Migration ändern.
Jede neue Einstellung braucht Default, Normalisierung, Schreibpfad, UI-Zustand,
Übersetzung und Tests. Neue Nachrichten brauchen beide Browser-Antwortpfade.
Neue Fehlerpfade dürfen den letzten gültigen lokalen Datensatz nicht still ersetzen.

Dokumentationsstruktur: technische Referenz getrennt von Benutzerhilfe und
Wartungsabläufen, angelehnt an [Diátaxis](https://www.diataxis.fr/reference/).
