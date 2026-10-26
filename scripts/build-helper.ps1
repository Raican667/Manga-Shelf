$ErrorActionPreference = 'Stop'
$helperRoot = Split-Path $PSScriptRoot -Parent
$helperVersion = (Get-Content (Join-Path $helperRoot 'manifest.json') -Raw | ConvertFrom-Json).version
$helperStage = Join-Path $helperRoot 'build\helper-windows'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw 'Windows .NET Framework compiler unavailable' }
New-Item -ItemType Directory -Path $helperStage -Force | Out-Null
& $compiler /nologo /target:exe /platform:anycpu /optimize+ "/out:$helperStage\MangaShelf.BackupHelper.exe" /reference:System.Web.Extensions.dll /reference:System.Windows.Forms.dll (Join-Path $helperRoot 'helper\BackupHost.cs')
if ($LASTEXITCODE -ne 0) { throw 'Native helper compilation failed' }
foreach ($helperFile in @('Install.ps1','Install.cmd','Uninstall.ps1','README.md','BackupHost.cs')) {
  Copy-Item -LiteralPath (Join-Path $helperRoot ('helper\'+$helperFile)) -Destination $helperStage -Force
}
Copy-Item -LiteralPath (Join-Path $helperRoot 'LICENSE') -Destination $helperStage -Force
Compress-Archive -Path (Join-Path $helperStage '*') -DestinationPath (Join-Path $helperRoot "build\manga-shelf-backup-helper-windows-$helperVersion.zip") -Force
