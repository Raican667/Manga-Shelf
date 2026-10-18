# Änderungsverlauf

**Deutsch** | [English](CHANGELOG.en.md)

Alle nennenswerten Änderungen an Manga-Regal werden in dieser Datei dokumentiert.
Das Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
die Versionsnummern folgen der [semantischen Versionierung](https://semver.org/lang/de/).

## [Unreleased]

### Geändert

- Firefox-ID auf `manga-shelf@local.example` geändert. Separate Installation; bestehende Sammlung per JSON übertragen.
- ZIP-Dateinamen und Build-/Release-Verweise verwenden `manga-shelf` statt `manga-regal`.

## [0.20.8] – 2026-10-18

### Geändert

- Projektlizenz auf GPL-3.0-only umgestellt. Frühere MIT-Freigaben bleiben bestehen.
- Öffentlicher Ausgangsstand mit neuer Git-Historie; alte private Daten werden nicht übernommen.
- Englische Standard-README, Deutsch als zweite Option und neue öffentliche Downloadlinks.
- Support-Button und zugehörigen Einstellungsschalter entfernt.
- CI-Berechtigungen eingeschränkt, Actions an Commit-Hashes gebunden und Sicherheitshinweise ergänzt.

## [0.20.7] – 2026-10-10

### Geändert

- Einstellungsprotokolle nennen die konkrete Einstellung und ihren alten und neuen Wert. Unverändertes Speichern erzeugt keinen zusätzlichen Eintrag.
- Browserneutrale Beschriftungen für Lesezeichen-Import, Export und den Importknopf in Deutsch und Englisch.

### Behoben

- Dynamische Chrome-Meldungen verwenden keine Firefox-Bezeichnung mehr; Chrome-Sync-Hinweis verweist nicht mehr auf ein Mozilla-Konto.
- Chrome-Import mit Ordnerauswahl, Schlüsselwort und Einzelauswahl einschließlich Bewertung, Kapitelstand und Duplikatvermeidung durch automatisierte Tests geprüft.

## [0.20.6] – 2026-10-10

### Hinzugefügt

- Freiwilliger Ko-fi-Unterstützungsbutton in der Sammlung vor dem Lesezeichen-Import und oben im Speicher-Pop-up.
- Dauerhafter Einstellungsschalter „Ko-fi-Button anzeigen“ blendet beide Buttons vollständig ohne Leerraum aus.
- Deutsche und englische Beschriftungen. Ko-fi öffnet sich nur auf Wunsch in einem neuen Tab; keine externen Widget-Skripte oder automatischen Zahlungsaufforderungen.

## [0.20.5] – 2026-10-09

### Geändert

- Manga hinzufügen und bearbeiten verwenden „Tags anpassen“ statt eines Tag-Schreibfelds.
- Einheitliche kompakte Tag-Auswahl für Formular, Tabelle und Kacheln, mit grüner Re-Read-Hervorhebung.
- Nur aktivierte Tag-Vorgaben und bereits zugewiesene Tags werden angeboten. Neue Tags werden in den Einstellungen angelegt.
- Formular-Tags werden erst beim Speichern des Mangas gespeichert; Abbrechen der Auswahl verändert nichts.

## [0.20.4] – 2026-10-09

### Geändert

- Aktuellen Stand der Pop-up-Tag-Auswahl als neue Version veröffentlicht: kompakte Tag-Chips, kein Hinweis bei leerer Auswahl und grüne Re-Read-Hervorhebung.
- Versionsangaben, Hilfe und Downloadlinks für Firefox und Chrome auf 0.20.4 aktualisiert.

## [0.20.3] – 2026-10-09

### Geändert

- Tag-Auswahl im Speicher-Pop-up als kompakte, umbrechende Chips in einer dezent gestrichelten Fläche gestaltet.
- Unnötigen Hinweis „Keine Tags ausgewählt“ entfernt; bei leerer Auswahl erscheint direkt der Auswahlbutton.
- Re-Read im Speicher-Pop-up grün hervorgehoben, sowohl in der Auswahl als auch bei den ausgewählten Tags.
- Ausgewählte Tags, Tastaturfokus und Hover-Zustände deutlicher hervorgehoben; helle und dunkle Darstellung abgestimmt.
- Auswahl, Abbrechen und Übernehmen bleiben unverändert und wurden erneut getestet.

## [0.20.2] – 2026-10-09

### Behoben

- Verwaiste Pop-up-Elemente nach einem Add-on-Update blockieren die erneute Initialisierung im bereits geöffneten Tab nicht mehr.
- Öffnen und Schließen des Speicher-Pop-ups bestätigen den Nachrichtenkanal ausdrücklich, damit Chrome nicht wegen einer fehlenden Antwort zur Sammlung ausweicht.
- Fehler beim Laden werden im Hintergrund protokolliert statt vollständig verschluckt.
- Regressionstest prüft erneutes Laden bei vorhandenem Pop-up-Element sowie Antworten beim Öffnen und Schließen.

## [0.20.1] – 2026-10-09

### Geändert

- Tag-Freitextfeld im Speicher-Pop-up entfernt. „Tags anpassen“ öffnet eine Checkbox-Auswahl mit den in den Einstellungen aktivierten Tags, Abbrechen und Übernehmen.
- Bereits gesetzte Tags bleiben sichtbar und entfernbar. Bewusste Änderungen werden auch bei Kapitelupdates übernommen.
- Versionshistorie aus den Einstellungen in der gewählten Sprache verlinkt. GitHub-Release-Hinweise bieten klar getrennte englische und deutsche Abschnitte; Englisch steht zuerst.
- Tag-Auswahl mit einem echten Chrome-UI-Test für Auswahl, Entfernen, Übernehmen und Abbrechen per Escape geprüft.

## [0.20.0] – 2026-10-09

### Hinzugefügt

- Gemeinsamer Codebestand mit getrennten Firefox- und Chrome-Paketen; Chrome ab Version 148.
- Chrome-Service-Worker, PNG-Symbole, Standard-Suchmaschinen-Anbindung und Tastenkürzel-Konfiguration über Chrome.
- Eigener Bestätigungsdialog für Chrome Sync auf Deutsch und Englisch. Die Zustimmung bleibt gerätelokal und wird weder importiert noch synchronisiert.
- Chrome-Paketbeschreibungen nennen Chrome statt Firefox.
- Worker-kompatible lokale Cover-Speicherung und Alarm-basierte automatische Sync-Aufgaben in Chrome.
- Automatische Tests des Chrome-Hintergrunds, Nachrichtenkanals, Cover-Caches und der Paketkonfiguration.

### Hinweise

- Sync verbindet nur Geräte desselben Browsers. Für Firefox ↔ Chrome die JSON-Datensicherung verwenden.
- Die Firefox-Add-on-ID bleibt stabil; es wird kein zweites Repository benötigt.

## [0.19.20] – 2026-10-09

### Geändert

- Begrüßungsdialog mit klaren Schrittüberschriften, Importhinweis und verständlicher Erklärung zur lokalen Speicherung und optionalen Synchronisierung überarbeitet.
- Neue Installationen starten auf Englisch, einschließlich des Begrüßungsdialogs. Bereits gespeicherte Sprachwahlen bleiben erhalten.
- Englischer Anzeigename ist jetzt „Manga Shelf“. Auf Deutsch bleibt „Manga-Regal“ erhalten; technische Kennungen und vorhandene Daten bleiben unverändert.
- Dialog für kleine Fenster scrollbar gemacht und zugängliche Beschriftungen ergänzt.
- Protokolle behalten standardmäßig die neuesten 100 Einträge. Der Schalter neben „Protokoll leeren“ deaktiviert das automatische Löschen alter Einträge; beim Wiedereinschalten werden ältere Einträge entfernt.

## [0.19.19] – 2026-10-09

### Hinzugefügt

- Symbol und Titel im Kopf des Speicher-Pop-ups öffnen jetzt die Sammlung.
- Tastaturbedienung, sichtbarer Fokus und deutsche/englische Beschriftungen für beide Verknüpfungen.

## [0.19.18] – 2026-10-08

### Dokumentation

- Allgemeine Anleitung und Einstellungsanleitung auf den aktuellen Funktionsstand gebracht.
- Deutsche und englische Hilfen parallel aktualisiert und über Sprachschalter verknüpft.
- Illustrationen für Speicher-Pop-up, Sammlung, Einstellungen sowie lokale Cover- und Sync-Speicherung erneuert.
- Hinweise zu Re-Read-Zuordnung nach Titel, Cloudflare-Cover, Platzhalter-Zuordnung und Fehlerbehebung ergänzt.

### Geändert

- Firefox-Paket, README und Patchlog auf Version 0.19.18 aktualisiert.

## [0.19.17] – 2026-10-08

### Hinzugefügt

- Alle vier Platzhalter-Motive können durch eigene lokale JPG-, PNG- oder
  WebP-Bilder ersetzt und einzeln wiederhergestellt werden.
- Ein Schiebeschalter blendet Platzhalter-Cover vollständig aus.
- Eigene Platzhalterbilder werden in die JSON-Sicherung aufgenommen.

### Datenschutz

- Eigene Platzhalterbilder bleiben von Firefox Sync ausgeschlossen.

## [0.19.16] – 2026-10-08

### Hinzugefügt

- `Re-Read` steht im Dialog **Tags anpassen** als aktivierte Standardvorgabe zur
  Verfügung.
- Bestehende Installationen erhalten die Vorgabe über eine Datenmigration.

## [0.19.15] – 2026-10-08

### Hinzugefügt

- Getrennte Re-Read-Lesestände können mit einem Hauptstand verbunden werden.
- Die Kapitellogik schlägt abhängig vom neuen Stand Hauptlesung oder Re-Read vor.
- Das Speicherziel bleibt vor dem Aktualisieren manuell auswählbar.
- Re-Read-Angebot und automatischer Re-Read-Tag sind getrennt konfigurierbar.

## [0.19.14] – 2026-10-01

### Geändert

- Mozillas `data_collection_permissions` wurden im Manifest ergänzt.
- Firefox Sync fordert seine optionalen Datentypen erst beim bewussten
  Einschalten an und bleibt ohne Zustimmung vollständig deaktiviert.
- Mindestversion auf Firefox 142 angehoben.

## [0.19.13] – 2026-09-27

### Behoben

- Die rote Kapitel-Automatik friert den gespeicherten Kapitelstand auch beim
  Aktualisieren eines bestehenden Manga zuverlässig ein.
- Der Link kann weiterhin aktualisiert und das Kapitel anschließend bewusst
  manuell geändert werden.

## [0.19.12] – 2026-09-27

### Behoben

- Die unter Manifest V3 nicht unterstützte Eigenschaft `background.persistent`
  wurde entfernt.

## [0.19.11] – 2026-09-27

### Hinzugefügt

- Cover-Erkennung lässt sich im Speicherformular dauerhaft pro Manga abschalten.
- Ein bereits lokales Cover bleibt dabei sichtbar und unverändert.

### Geändert

- Kategorienverwaltung neu ausgerichtet; Entfernen beziehungsweise Zurücksetzen
  steht am Ende jeder Zeile.

## [0.19.10] – 2026-09-27

### Behoben

- Toolbar-Symbol, Hintergrundstart und Einblendung im aktiven Tab stabilisiert.
- Sammlung öffnet sich als Fallback auf geschützten Firefox-Seiten.
- Ungültige Verschachtelung des Kapitelknopfs im Formular korrigiert.

## [0.19.9] – 2026-09-27

### Hinzugefügt

- Kapitel-Automatik lässt sich direkt hinter dem Kapitelfeld pro Manga dauerhaft
  deaktivieren; manuelle Eingaben bleiben möglich.

## [0.19.8] – 2026-09-26

### Hinzugefügt

- Globale Einstellung zum Abschalten der automatischen Kapitel-Link-Erkennung.
- Manuelle Kapitelstände bleiben unabhängig davon erhalten.

## [0.19.7] – 2026-09-26

### Geändert

- Cover in Tabellen deutlich vergrößert und übrige Spalten kompakter ausgerichtet.
- Kachel-Cover zeigen das vollständige Bild in einer proportionalen Bildspalte.

## [0.19.6] – 2026-09-26

### Behoben

- Firefox-Importe ohne echtes Cover bleiben leer.
- Alte Einträge, deren Cover fälschlich dem Kapitel-Link entspricht, werden beim
  Laden automatisch bereinigt.

## [0.19.5] – 2026-09-26

### Behoben

- Kapitelupdates importierter Lesezeichen bewahren ID, Bewertung, Tags, Kategorie
  und vorhandenes lokales Cover.
- Das verknüpfte Firefox-Lesezeichen wird auf die neue Kapiteladresse aktualisiert.

## [0.19.4] – 2026-09-26

### Geändert

- Bereits sichtbare Cover-Vorschauen werden bevorzugt lokal übernommen.
- Der aktive Manga-Tab darf für Cloudflare-geschützte Bilder seine vorhandene
  Sitzung und den normalen Seiten-Referrer verwenden.
- Cloudflare-Cookies werden nicht ausgelesen, gespeichert oder synchronisiert.

## [0.19.3] – 2026-09-26

### Behoben

- Lokal gespeicherte Cover werden über kurzlebige Blob-Adressen zuverlässig in
  der Sammlung dargestellt.
- Fehlerhafte Bilder fallen kontrolliert auf das passende Platzhalter-Cover zurück.

## [0.19.2] – 2026-09-26

### Hinzugefügt

- `XMLHttpRequest` übernimmt den Cover-Download, wenn `fetch()` scheitert.
- Verbreitete Bildformate werden auch bei fehlerhaftem Content-Type erkannt.

## [0.19.1] – 2026-09-26

### Behoben

- Cover und lokale Platzhalter werden geladen, sobald ihr Rahmen sichtbar wird.

### Hinzugefügt

- Tag-Zuordnung der Platzhalter über verschiebbare Chips und vier Coverkarten.

## [0.19.0] – 2026-09-26

### Hinzugefügt

- Vier lokale Platzhalter-Cover für Manga ohne eigenes Bild.
- Automatische Motivauswahl nach Manga-Tags und feste Zuordnung pro Tag.
- Platzhalter werden wie echte Cover erst bei Sichtbarkeit geladen.

## [0.18.1] – 2026-09-26

### Geändert

- Einstellungen neu geordnet: Oberfläche und Tag-Vorauswahl stehen zuerst,
  Datensicherung und Firefox-Bereiche darunter.

## [0.18.0] – 2026-09-26

### Hinzugefügt

- Sammlung kann als normaler Firefox-Lesezeichenbaum mit Kategorieordnern
  zurückexportiert werden.
- Wiederholte Exporte ersetzen nur den von Manga-Regal verwalteten Ordner.

## [0.17.1] – 2026-09-26

### Hinzugefügt

- Allgemeine Anleitung und Einstellungsanleitung als gemeinsame Hilfe-Tabs.
- Schiebeschalter zum vollständigen Deaktivieren des Startdialogs.

## [0.17.0] – 2026-09-26

### Hinzugefügt

- Eigenständige Hilfe für sämtliche Einstellungen.
- Import-/Fehlerprotokoll und Patchlog als getrennte Reiter.

## [0.16.3] – 2026-09-26

### Behoben

- Aktionsspalte wird nicht mehr abgeschnitten.
- Bewertungsspalte passt sich an fünf oder zehn Sterne an.
- Bearbeiten- und Entfernen-Symbole sind einheitlich ausgerichtet.

## [0.16.2] – 2026-09-26

### Geändert

- Neue Installationen verwenden standardmäßig fünf Sterne.
- Bestehende Installationen behalten ihre gespeicherte Bewertungsskala.

## [0.16.1] – 2026-09-26

### Hinzugefügt

- Dauerhaft vorbereiteter komprimierter Sync-Cache für schnellere Wiederholungen.

## [0.16.0] – 2026-09-26

### Hinzugefügt

- Gesamter Firefox-Sync-Snapshot wird mit gzip komprimiert und in
  größenbegrenzte Transportstücke geteilt.

### Geändert

- Beim Wechsel von zehn auf fünf Sterne werden Werte oberhalb von fünf auf fünf
  begrenzt; kleinere Bewertungen bleiben unverändert.
