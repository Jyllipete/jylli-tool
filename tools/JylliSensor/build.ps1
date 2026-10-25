# Build JylliSensor.exe - run from tools\JylliSensor\
# Requires: .NET Framework 4.8 SDK (csc.exe) + LibreHardwareMonitorLib.dll

$lhmDll = "..\..\assets\lhm\LibreHardwareMonitorLib.dll"
$outDir  = "..\..\assets\sensor"
$csc     = "${env:SystemRoot}\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

if (!(Test-Path $lhmDll)) {
    Write-Error "LibreHardwareMonitorLib.dll not found at: $lhmDll"
    exit 1
}
if (!(Test-Path $csc)) {
    Write-Error "csc.exe not found at: $csc - install .NET Framework 4.8 SDK"
    exit 1
}

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# Copy LHM dll alongside exe (needed at runtime)
Copy-Item $lhmDll "$outDir\LibreHardwareMonitorLib.dll" -Force

& $csc /target:exe /optimize+ /platform:x64 `
    "/out:$outDir\JylliSensor.exe" `
    "/reference:$outDir\LibreHardwareMonitorLib.dll" `
    JylliSensor.cs

if ($LASTEXITCODE -eq 0) {
    Write-Host "Build succeeded: $outDir\JylliSensor.exe"
} else {
    Write-Error "Build failed (exit $LASTEXITCODE)"
}
