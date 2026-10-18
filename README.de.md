<p align="center"><img src="icons/manga-regal-128.png" width="80" height="80" alt="Manga-Regal"></p>

# Manga-Regal

Manga- und Light-Novel-Seiten im Browser speichern. Kapitelstände, Bewertungen,
Tags und Re-Reads in einer lokalen Sammlung verwalten.

[English](README.md) · **Deutsch**

[Firefox herunterladen](https://github.com/Raican667/Manga-Shelf/releases/download/v0.20.9/manga-shelf-firefox-0.20.9.zip) ·
[Chrome herunterladen](https://github.com/Raican667/Manga-Shelf/releases/download/v0.20.9/manga-shelf-chrome-0.20.9.zip) ·
[Alle Releases](https://github.com/Raican667/Manga-Shelf/releases) · [Änderungsverlauf](CHANGELOG.md)

**Version 0.20.9** · Firefox 142+ · Chrome 148+ · Deutsch / Englisch · GPLv3

![Sammlung – schematische Vorschau](help/images/collection.svg)

## Funktionen

- Titel, Link und verfügbare Metadaten aus dem aktuellen Tab übernehmen.
- Kapitel aus Links erkennen oder manuell pflegen; bestehende Lesestände aktualisieren.
- Sammlung als Tabelle oder Kacheln mit Suche, Filtern und Sortierung anzeigen.
- Mit fünf oder zehn Sternen bewerten, Tags auswählen und eigene Kategorien verwalten.
- Separate Re-Reads mit dem Hauptstand verknüpfen.
- Cover lokal speichern und bei Sichtbarkeit anzeigen; eigene Platzhalter nach Tags zuordnen.
- Browser-Lesezeichen nach Ordner, Schlüsselwort oder einzeln importieren und zurückexportieren.
- JSON-Sicherung inklusive Cover erstellen; Metadaten optional per Browser-Sync übertragen.
- Dark-/Light-Modus, Deutsch/Englisch und einstellbare Tastenkürzel.

## Installation

Die ZIPs sind Testpakete. **„Code → Download ZIP“ und „Source code“ sind
Quellcode-Archive, keine fertigen Browser-Pakete.**

### Firefox

Der aktuelle Build verwendet die neue Firefox-ID `manga-shelf@local.example` und
wird getrennt von der bisherigen Manga-Regal-ID installiert. Sammlung zuerst
aus der alten Erweiterung als JSON sichern und anschließend in Manga Shelf importieren.

1. Firefox-ZIP herunterladen.
2. `about:debugging#/runtime/this-firefox` öffnen.
3. **Temporäres Add-on laden …** anklicken und die ZIP auswählen.
4. Symbol anheften und auf einer normalen Webseite öffnen.

Alternativ ZIP entpacken und `manifest.json` auswählen. Temporäre Installationen
enden beim Beenden von Firefox. Dauerhafte Installation erfordert Mozilla-Signierung.

### Chrome

1. Chrome-ZIP herunterladen und entpacken.
2. `chrome://extensions` öffnen und **Entwicklermodus** aktivieren.
3. **Entpackte Erweiterung laden** wählen und den Ordner mit `manifest.json` auswählen.
4. Symbol anheften und auf einer normalen Webseite öffnen.

## Verwendung

1. Manga-Seite öffnen und das Erweiterungssymbol anklicken.
2. Angaben prüfen, **Tags anpassen**, Bewertung und Kategorie setzen.
3. Speichern oder einen vorhandenen Lesestand aktualisieren.
4. Über das Symbol oder den Titel im Speicherformular die Sammlung öffnen.

[Allgemeine Hilfe](help/index.html) · [Einstellungen erklärt](help/settings.html)

## Daten und Datenschutz

Kein eigenes Benutzerkonto oder Anwendungsserver. Sammlung und Cover liegen im
Browserprofil. Optionaler Sync benötigt Zustimmung und überträgt keine Cover,
Protokolle oder profilspezifischen Bookmark-IDs. Firefox Sync und Chrome Sync sind
getrennt; zum Wechsel JSON-Sicherungen verwenden.

Cover-Anfragen können die bestehende Webseiten-Sitzung verwenden. Die Erweiterung
liest oder speichert selbst keine Cookies. Browser-Lesezeichenrechte dienen Import,
Export und Aktualisierung; Tab-/Scripting-Rechte öffnen das Formular auf Nutzeraktion.

[Technische Details und Berechtigungen](docs/DEVELOPMENT.md)

## Häufige Fragen

**Warum öffnet das Symbol manchmal die Sammlung?**

Geschützte Browserseiten erlauben kein eingeblendetes Formular.

**Werden neu veröffentlichte Kapitel automatisch gesucht?**

Nein. Die Kapitelerkennung wertet den Link aus, nicht den Veröffentlichungsstand.

**Warum fehlt ein Cover?**

Nicht jede Seite liefert ein nutzbares Bild; Zugriffsschutz kann Downloads verhindern.
Eigene Cover und lokale Platzhalter sind möglich.

**Bleiben Daten nach dem Entfernen erhalten?**

Nicht zuverlässig. Vorher eine JSON-Sicherung erstellen.

## Entwicklung

Gemeinsame Codebasis für beide Browser. PowerShell 7 und Node.js (CI: 24)
erforderlich; keine npm-Installation für den Paketbau.

```powershell
.\build.ps1                   # Tests und beide Browser-Pakete
.\build.ps1 -Browser firefox
.\build.ps1 -Browser chrome
```

Ausgabe unter `build/`. Das Chrome-Manifest wird aus dem Firefox-Manifest abgeleitet.

[Mitwirken und Wartung](CONTRIBUTING.md) · [Entwicklerdokumentation](docs/DEVELOPMENT.md)

[Sicherheitsrichtlinie](SECURITY.md)

## Fehler melden

[GitHub Issues](https://github.com/Raican667/Manga-Shelf/issues): Browser samt Version,
Erweiterungsversion und Schritte zur Reproduktion angeben. Keine Cookies,
Zugangsdaten oder privaten Sammlungen veröffentlichen.

## Lizenz

Copyright © 2026 Raican667.

Der aktuelle Projektstand steht unter der [GNU General Public License, Version 3](LICENSE)
(SPDX: `GPL-3.0-only`). Weitergabe und Änderungen erfolgen unter den Bedingungen
dieser Lizenz. Die Software wird ohne Gewährleistung bereitgestellt.

GPLv3 erlaubt kommerzielle Weitergabe; sie ist kein Verkaufsverbot.
Früher unter MIT veröffentlichte Stände behalten ihre damaligen Lizenzrechte.
[Lizenzhistorie](docs/LICENSING.md)
