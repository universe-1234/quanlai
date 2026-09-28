param([string]$SevenZip)
$ErrorActionPreference = 'Stop'
# Explicit, opt-in recovery from the exact public v1.0.5 binary. No user credentials are read.
$repoRoot = Split-Path $PSScriptRoot -Parent
$stage = Join-Path ([IO.Path]::GetTempPath()) ('quanlai-runtime-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $stage | Out-Null
if (-not $SevenZip) {
  $installed = Get-Command 7z -ErrorAction SilentlyContinue
  if ($installed) { $SevenZip = $installed.Source }
  else { $SevenZip = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'electron-builder\Cache\7zip@1.0.0') -Recurse -Filter 7za.exe | Select-Object -First 1 -ExpandProperty FullName }
}
if (-not $SevenZip) { throw '7-Zip is required. Pass -SevenZip with its executable path.' }
$archive = Join-Path $stage 'v1.0.5.exe'
Invoke-WebRequest 'https://github.com/universe-1234/quanlai/releases/download/v1.0.5/QuanLai-Setup-1.0.5-x64.exe' -OutFile $archive
if ((Get-FileHash $archive -Algorithm SHA256).Hash -ne '99f9a19d5517d3037a18b50ee0428ca8cd42cf666c2815c774d8ac4954b5a189') { throw 'Runtime source checksum mismatch' }
& $SevenZip x $archive "-o$stage" '$PLUGINSDIR\app-64.7z' -y | Out-Null
if ($LASTEXITCODE) { throw 'Installer extraction failed' }
& $SevenZip x (Join-Path $stage '$PLUGINSDIR\app-64.7z') "-o$stage\app" 'resources/runtime/*' -y | Out-Null
if ($LASTEXITCODE) { throw 'Runtime extraction failed; 7-Zip 24.09 or newer is required' }
$target = Join-Path $repoRoot 'build\runtime'
New-Item -ItemType Directory -Force -Path $target | Out-Null
Get-ChildItem -LiteralPath (Join-Path $stage 'app\resources\runtime') -Force | Copy-Item -Destination $target -Recurse -Force
Write-Host 'Recovered published runtime (Python 3.13.12 / Skill 1.0.0). Run npm run runtime:prepare to verify.'
Write-Host "Download staging directory: $stage"
