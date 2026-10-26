# Manga Shelf Backup Helper (Windows / Firefox)

Windows 10/11 with .NET Framework 4.x. Chrome uses its browser folder picker and does not need this helper. The binary is unsigned; review the included source before installing. Do not disable Windows security protections.

1. Extract this entire helper ZIP into a normal folder.
2. Run Install.cmd and confirm Y or J. This registers one native-messaging host for the current Windows user; no administrator access or always-running service is required.
3. Open Manga Shelf > Settings > Technical & Data > Select backup folder. Allow the optional native-messaging permission, then select your folder (for example Documents/MangaShelf/Backups).
4. Create a manual backup and check the displayed result before enabling daily backups.

The helper writes only full JSON backups to the folder selected in its own dialog. An owner-specific hidden index records which files it created. Only those indexed files above your retention count may be permanently deleted, and only after a new complete backup. Other files are not scanned or removed. Keep the hidden index with the backups. It has no network access or shell-command API. Sources/build: BackupHost.cs and scripts/build-helper.ps1 in the repository. Allowed extension IDs are manga-shelf@local.example and legacy manga-regal@local.example.

Run Uninstall.ps1 manually to unregister it. It does not delete backups or remembered folders. Chrome directory grants and helper configuration are not synchronized. Removing a temporary add-on can clear extension data; external files do not replace careful testing in a separate profile.

## Deutsch

Die komplette ZIP entpacken und Install.cmd starten. Mit Y/J bestaetigen; die Installation betrifft nur diesen Windows-Benutzer, ohne Administratorrechte oder Hintergrunddienst. Danach in Manga Shelf unter Einstellungen > Technik & Daten > Zielordner auswaehlen die optionale Berechtigung erlauben und einen Ordner waehlen, etwa Dokumente/MangaShelf/Sicherungen. Zuerst eine manuelle Sicherung pruefen, danach die taegliche Sicherung aktivieren.

Chrome benoetigt diesen Helfer nicht. Die Anwendung ist nicht digital signiert; bei Sicherheitswarnungen Quelltext und Herkunft pruefen, Schutzfunktionen nicht abschalten. Die versteckte Indexdatei gehoert zur Sicherung und darf nicht geloescht werden. Dauerhaft entfernt werden nur eigene darin verzeichnete alte Sicherungen nach erfolgreicher neuer Datei. Uninstall.ps1 entfernt nur die Registrierung, keine Sicherungen oder gespeicherten Zielordner.
