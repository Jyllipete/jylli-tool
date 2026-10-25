# Build JylliJobMon.exe — run from tools\JylliJobMon\
$outDir = "..\..\assets\jobmon"
$csc    = "${env:SystemRoot}\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

if (!(Test-Path $csc)) { Write-Error "csc.exe not found"; exit 1 }
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

& $csc /target:exe /optimize+ /platform:x64 /unsafe `
    "/out:$outDir\JylliJobMon.exe" `
    JylliJobMon.cs

if ($LASTEXITCODE -eq 0) { Write-Host "Build succeeded: $outDir\JylliJobMon.exe" }
else { Write-Error "Build failed (exit $LASTEXITCODE)" }
