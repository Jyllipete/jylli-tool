# READ-ONLY: lists every CPU temperature and power sensor the bundled LibreHardwareMonitor library reports on this PC.
# Run from an ADMINISTRATOR *Windows PowerShell 5.1* (powershell.exe, not pwsh):   powershell -ExecutionPolicy Bypass -File tools\sensor-dump.ps1
# Close Jylli Tool first (its sensor helper uses the same driver).
$d = Join-Path $PSScriptRoot '..\assets\sensor'
Get-ChildItem $d -Filter *.dll | ForEach-Object { try { [Reflection.Assembly]::LoadFrom($_.FullName) | Out-Null } catch {} }
$c = New-Object LibreHardwareMonitor.Hardware.Computer
$c.IsCpuEnabled = $true
$c.Open()
foreach ($h in $c.Hardware) {
  $h.Update()
  "HW: $($h.HardwareType) | $($h.Name)"
  foreach ($s in $h.Sensors) { if ($s.SensorType -in 'Temperature', 'Power') { "  $($s.SensorType) | $($s.Name) | $($s.Value)" } }
}
$c.Close()
