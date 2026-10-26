# Unregister only this host. Backups and remembered folders are preserved.
$ErrorActionPreference = 'Stop'
$helperDirectory = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'MangaShelf\BackupHelper'
$expectedManifest = Join-Path $helperDirectory 'io.mangashelf.backup_helper.json'
$helperKey = 'HKCU:\Software\Mozilla\NativeMessagingHosts\io.mangashelf.backup_helper'
if (Test-Path -LiteralPath $helperKey) {
  $registered = (Get-Item -LiteralPath $helperKey).GetValue('')
  if ($registered -ne $expectedManifest) { throw 'Unexpected host registration; nothing removed.' }
  Remove-Item -LiteralPath $helperKey
}
Write-Host 'Helper unregistered. No backup files or folder settings were deleted.'
