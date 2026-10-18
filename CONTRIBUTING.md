# Mitwirken und Wartung

Technische Referenz: [Entwicklerdokumentation](docs/DEVELOPMENT.md).

**Deutsch** | [English](CONTRIBUTING.en.md)

Dieses Dokument beschreibt die technische Arbeit am Manga-Regal. Die
Projektübersicht und Benutzerinstallation stehen in der [README](README.de.md), die
Versionshistorie im [Changelog](CHANGELOG.md).

## Voraussetzungen

- Firefox 142 oder neuer
- Node.js für Syntax- und Logiktests
- PowerShell 7 für `build.ps1`

Es gibt keine npm-Abhängigkeiten. Die Erweiterung wird direkt aus den Dateien im
Repository geladen; `manifest.json` muss im Wurzelverzeichnis bleiben.

## Projektstruktur

```text
manifest.json               Firefox-Berechtigungen und Einstiegspunkte
icons/                      Symbol für Werkzeugleiste und Erweiterungsverwaltung
assets/placeholders/        Mitgelieferte lokale Ersatzcover
shared/store.js             Datenmodell, Migrationen und lokale Speicherung
shared/sync.js              Komprimierter Firefox-Sync-Transport
background/background.js   Toolbar, Tastenkürzel und Hintergrundereignisse
content/overlay.js          Speicherformular im aktuellen Webseiten-Tab
content/overlay.css         Isolierte Gestaltung des Speicherformulars
dashboard/                  Sammlung und Einstellungen
help/                       Eingebaute Hilfe und lokale Illustrationen
tests/                      Automatische Speicher-, UI- und Hintergrundtests
build.ps1                   Prüfung und Erstellung des Firefox-ZIP-Pakets
```

## Lokal testen

1. `about:debugging#/runtime/this-firefox` in Firefox öffnen.
2. **Temporäres Add-on laden …** anklicken.
3. `manifest.json` auswählen.
4. Nach Änderungen beim Add-on auf **Neu laden** klicken.
5. Über **Untersuchen** die Erweiterungskonsole auf Laufzeitfehler prüfen.

## Automatische Prüfungen

```powershell
node .\tests\store.test.js
node .\tests\wiring.test.js
node .\tests\background.test.js
```

- `store.test.js` prüft Datenmigration, Lesezeichen, Cover und Firefox Sync.
- `wiring.test.js` prüft, ob HTML, JavaScript, CSS und Hilfe korrekt verbunden sind.
- `background.test.js` prüft Hintergrundstart, Toolbar-Klick und Fallbacks.

Der vollständige Lauf inklusive Syntaxprüfung und Paketbau erfolgt mit:

```powershell
.\build.ps1
```

## Datenmodell

Der Hauptdatensatz liegt unter `mangaRegalDataV1` in `browser.storage.local`.
Normale Manga-Cover verwenden Schlüssel mit dem Präfix `mangaRegalCoverV1:`.
Eigene Platzhalterbilder liegen getrennt unter
`mangaRegalCustomPlaceholderV1:`. Oberflächen greifen ausschließlich über die
öffentliche `MangaStore`-Schnittstelle auf diese Daten zu.

Ein Manga-Eintrag enthält insbesondere:

- `id`, `title`, `url`, `source` und `description`
- `currentChapter` und `chapterManual`
- `rating`, `tags` und `status`
- `rereadOf` und `rereadRound` für verbundene Re-Reads
- `cover`, `favicon`, `created` und `modified`
- optional `bookmarkId` und `folderPath` für lokale Firefox-Verknüpfungen

Bei einer Änderung des gespeicherten Formats muss `DATA_VERSION` erhöht und
`normalizeData()` um eine rückwärtskompatible Migration ergänzt werden.

## Firefox Sync

`shared/sync.js` erstellt einen kompakten Snapshot, komprimiert ihn mit gzip und
teilt die Base64-Daten in Stücke unterhalb des Firefox-Limits von 8 KB pro
Speichereintrag. Der vorbereitete Snapshot bleibt lokal unter
`mangaRegalCompressedSyncCacheV1` erhalten.

Cover, eigene Platzhalterbilder, Favicons, Logs, Lesezeichen-IDs und Ordnerpfade
gehören nicht in den Sync-Snapshot. Werden neue synchronisierte Manga-Felder
ergänzt, müssen `compactItem()` und `expandItem()` gemeinsam angepasst und durch
einen Test abgedeckt werden.

## Release-Checkliste

1. Funktionsänderung implementieren und passende Regressionstests ergänzen.
2. Versionsnummer in `manifest.json` erhöhen.
3. neuen deutschen und englischen Patchlog-Eintrag in `dashboard/app.js` ergänzen.
4. `CHANGELOG.md` mit Datum und nachvollziehbaren Änderungen aktualisieren.
5. Versionsnummer und betroffene Texte in `help/index.html`,
   `help/index.en.html`, `help/settings.html` und `help/settings.en.html`
   aktualisieren.
6. Versionsangaben in `README.md`, `README.en.md` und `README.de.md` aktualisieren.
7. bei Datenformatänderungen `DATA_VERSION` und Migration prüfen.
8. `build.ps1` vollständig und fehlerfrei ausführen.
9. erzeugtes ZIP kontrollieren: `manifest.json` muss direkt im ZIP-Wurzelverzeichnis liegen.
10. Änderungen committen, pushen und das geprüfte Paket für Mozilla bereitstellen.

Erzeugte ZIP-/XPI-Dateien und der Ordner `build/` werden nicht eingecheckt. Die
GitHub-Aktion führt die Prüfungen erneut aus und stellt ein zeitlich begrenztes
Testpaket als Workflow-Artefakt bereit.

## Pull Requests

- Änderungen klein und fachlich zusammenhängend halten.
- bestehende Daten und lokale Cover bei Migrationen bewahren.
- neue sichtbare Texte auf Deutsch und Englisch ergänzen.
- keine Geheimnisse, Cookies, Sicherungsdateien oder erzeugten Pakete committen.
- bei UI-Änderungen Tabellen- und Kachelansicht sowie Dark und Light Mode prüfen.
