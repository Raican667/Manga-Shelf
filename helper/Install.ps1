# Run manually from the extracted helper package. No administrator rights.
# Only our own HKCU native-host entry and helper binaries are changed.
$ErrorActionPreference = 'Stop'
$helperDirectory = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'MangaShelf\BackupHelper'
$helperExecutable = Join-Path $helperDirectory 'MangaShelf.BackupHelper.exe'
$helperManifest = Join-Path $helperDirectory 'io.mangashelf.backup_helper.json'
Write-Host "Manga Shelf Backup Helper: $helperDirectory"
if ((Read-Host 'Install for this Windows user? / Fuer diesen Benutzer installieren? (Y/J)') -notmatch '^[YyJj]$') { exit }
New-Item -ItemType Directory -Path $helperDirectory -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'MangaShelf.BackupHelper.exe') -Destination $helperExecutable -Force
$helperJson = @{ name='io.mangashelf.backup_helper'; description='Manga Shelf local JSON backups'; path=$helperExecutable; type='stdio'; allowed_extensions=@('manga-shelf@local.example','manga-regal@local.example') } | ConvertTo-Json -Depth 4
[IO.File]::WriteAllText($helperManifest, $helperJson, [Text.UTF8Encoding]::new($false))
$helperKey = 'HKCU:\Software\Mozilla\NativeMessagingHosts\io.mangashelf.backup_helper'
New-Item -Path $helperKey -Force | Out-Null
Set-Item -LiteralPath $helperKey -Value $helperManifest
Write-Host 'Installed. In Manga Shelf: Settings > Technical & Data > Select backup folder.'
Write-Host 'Installiert. In Manga Shelf: Einstellungen > Technik & Daten > Zielordner auswaehlen.'
