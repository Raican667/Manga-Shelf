# Erstellt ein sauberes Firefox-Paket ohne Tests oder temporäre Dateien.
# Firefox-XPI-Dateien sind technisch ZIP-Dateien; zur Mozilla-Signierung kann
# die erzeugte ZIP-Datei direkt verwendet werden.

param([ValidateSet('all', 'firefox', 'chrome')][string]$Browser = 'all')
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$buildDirectory = Join-Path $projectRoot 'build'
$manifestPath = Join-Path $projectRoot 'manifest.json'
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$packagePath = Join-Path $buildDirectory "manga-regal-firefox-$($manifest.version).zip"

# Manifest vor dem Packen auf gültiges JSON prüfen.
$manifest | Out-Null

# JavaScript-Syntax prüfen, sofern Node.js auf dem Rechner vorhanden ist.
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
  $scripts = @(
    'shared\store.js',
    'shared\platform.js',
    'shared\sync.js',
    'background\background.js',
    'background\service-worker.js',
    'content\overlay.js',
    'dashboard\app.js',
    'help\app.js'
  )
  foreach ($script in $scripts) {
    & $node.Source --check (Join-Path $projectRoot $script)
    if ($LASTEXITCODE -ne 0) { throw "Syntaxfehler in $script" }
  }

  # Datenlogik und Verknüpfungen zwischen HTML und JavaScript testen.
  & $node.Source (Join-Path $projectRoot 'tests\store.test.js')
  if ($LASTEXITCODE -ne 0) { throw 'Speichertests fehlgeschlagen' }
  & $node.Source (Join-Path $projectRoot 'tests\wiring.test.js')
  if ($LASTEXITCODE -ne 0) { throw 'Oberflächen-Verknüpfungstest fehlgeschlagen' }
  & $node.Source (Join-Path $projectRoot 'tests\background.test.js')
  if ($LASTEXITCODE -ne 0) { throw 'Firefox-Hintergrundtest fehlgeschlagen' }
  & $node.Source (Join-Path $projectRoot 'tests\chrome.test.js')
  if ($LASTEXITCODE -ne 0) { throw 'Chrome-Kompatibilitätstests fehlgeschlagen' }
}

New-Item -ItemType Directory -Path $buildDirectory -Force | Out-Null
if ($Browser -ne 'chrome' -and (Test-Path -LiteralPath $packagePath)) {
  Remove-Item -LiteralPath $packagePath -Force
}

# Wichtig: Die Dateien selbst müssen im Wurzelverzeichnis des ZIP liegen.
$packageFiles = @(
  (Join-Path $projectRoot 'manifest.json'),
  (Join-Path $projectRoot 'LICENSE'),
  (Join-Path $projectRoot 'SECURITY.md'),
  (Join-Path $projectRoot 'README.md'),
  (Join-Path $projectRoot 'README.en.md'),
  (Join-Path $projectRoot 'README.de.md'),
  (Join-Path $projectRoot 'CHANGELOG.md'),
  (Join-Path $projectRoot 'CHANGELOG.en.md'),
  (Join-Path $projectRoot 'CONTRIBUTING.md'),
  (Join-Path $projectRoot 'CONTRIBUTING.en.md'),
  (Join-Path $projectRoot '_locales'),
  (Join-Path $projectRoot 'assets'),
  (Join-Path $projectRoot 'icons'),
  (Join-Path $projectRoot 'shared'),
  (Join-Path $projectRoot 'background'),
  (Join-Path $projectRoot 'content'),
  (Join-Path $projectRoot 'dashboard'),
  (Join-Path $projectRoot 'help')
  (Join-Path $projectRoot 'docs')
)
if ($Browser -ne 'chrome') {
  Compress-Archive -LiteralPath $packageFiles -DestinationPath $packagePath -CompressionLevel Optimal
  Write-Host "Paket erstellt: $packagePath"
}
if ($Browser -ne 'firefox') {
  if (!$node) { throw 'Für die Chrome-Konfiguration wird Node.js benötigt.' }
  # Build in a fresh directory: no destructive cleanup of user checkouts.
  $chromeStage = Join-Path $buildDirectory ('chrome-stage-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $chromeStage | Out-Null
  foreach ($file in $packageFiles) { Copy-Item -LiteralPath $file -Destination $chromeStage -Recurse }
  & $node.Source (Join-Path $projectRoot 'scripts\chrome-manifest.js') (Join-Path $chromeStage 'manifest.json')
  if ($LASTEXITCODE -ne 0) { throw 'Chrome-Manifest konnte nicht erstellt werden' }
  $chromePackage = Join-Path $buildDirectory "manga-regal-chrome-$($manifest.version).zip"
  Compress-Archive -Path (Join-Path $chromeStage '*') -DestinationPath $chromePackage -CompressionLevel Optimal -Force
  Write-Host "Paket erstellt: $chromePackage"
}
