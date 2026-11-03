# Builds the branded installer (default) or the branded uninstaller (-Uninstaller).
#   -Uninstaller  -> build\extra\Jylli Tool Uninstaller.exe   (run BEFORE electron-builder; shipped via extraFiles)
#   default       -> dist\Jylli-Tool-Installer.exe            (run AFTER electron-builder; wraps dist\Jylli-Tool-Setup.exe)
# Requires only the .NET Framework 4.x csc.exe that ships with Windows.
param([switch]$Uninstaller)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$root = Resolve-Path (Join-Path $here '..\..')
$fw   = "$env:SystemRoot\Microsoft.NET\Framework64\v4.0.30319"
$csc  = "$fw\csc.exe"
if (!(Test-Path $csc)) { throw "csc.exe not found at $csc" }

$version = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$payload = Join-Path $root 'dist\Jylli-Tool-Setup.exe'
$unpackedDir = Join-Path $root 'dist\win-unpacked'

$size = 0
if (!$Uninstaller) {
    if (!(Test-Path $payload)) { throw "dist\Jylli-Tool-Setup.exe not found - run 'npm run build' first" }
    if (Test-Path $unpackedDir) {
        $size = (Get-ChildItem $unpackedDir -Recurse -File | Measure-Object Length -Sum).Sum
    } else {
        $size = [long]((Get-Item $payload).Length * 2.6)
    }
} elseif (Test-Path $unpackedDir) {
    $size = (Get-ChildItem $unpackedDir -Recurse -File | Measure-Object Length -Sum).Sum
}

@"
namespace JylliSetup {
    static class BuildInfo {
        public const string Version = "$version";
        public const long UnpackedSize = ${size}L;
    }
}
"@ | Set-Content -Path (Join-Path $here 'BuildInfo.cs') -Encoding UTF8

if ($Uninstaller) {
    $outDir = Join-Path $root 'build\extra'
    $out    = Join-Path $outDir 'Jylli Tool Uninstaller.exe'
} else {
    $outDir = Join-Path $root 'dist'
    $out    = Join-Path $outDir 'Jylli-Tool-Installer.exe'
}
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$args = @(
    '/nologo', '/target:winexe', '/optimize+', '/platform:x64', '/langversion:5',
    "/out:$out",
    "/win32manifest:$here\app.manifest",
    "/win32icon:$root\assets\icon.ico",
    "/lib:$fw\WPF",
    '/reference:PresentationFramework.dll', '/reference:PresentationCore.dll', '/reference:WindowsBase.dll',
    '/reference:System.Xaml.dll', '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll',
    "/resource:$here\Ui.xaml,ui.xaml",
    "/resource:$root\assets\icon.png,icon.png"
)
if ($Uninstaller) { $args += '/define:UNINSTALLER' } else { $args += "/resource:$payload,payload" }
$args += @("$here\App.cs", "$here\Engine.cs", "$here\Pages.cs", "$here\BuildInfo.cs")

& $csc @args
if ($LASTEXITCODE -ne 0) { throw "csc failed (exit $LASTEXITCODE)" }
Write-Host "Built: $out"
