<#
  FiveM probe: READ-ONLY. Run it on a PC with FiveM, ideally while connected to a server, to answer the open questions in
  docs/FIVEM_PROBES.md. It changes nothing, injects nothing and sends nothing anywhere except the optional -Server request to
  that server's own public info.json. It writes one JSON report next to the script; look at it before sharing it (it contains the
  remote addresses FiveM is connected to and your Windows user name in file paths).

  Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File probe.ps1 [-Server host:port] [-Out report.json]
#>
param(
  [string]$Server = '',
  [string]$Out = (Join-Path $PSScriptRoot 'fivem-probe-report.json')
)
$ErrorActionPreference = 'SilentlyContinue'
$r = [ordered]@{ at = (Get-Date).ToString('s'); os = [Environment]::OSVersion.VersionString }

# 1. Which FiveM-related processes exist (names carry the build number), when they started, and their remote TCP endpoints.
$procs = Get-Process | Where-Object { $_.Name -match '^(FiveM|GTA5|GTAVLauncher|PlayGTAV|CitizenFX)' }
$r.processes = @($procs | ForEach-Object { [ordered]@{ name = $_.Name; id = $_.Id; start = $_.StartTime.ToString('s'); path = $_.Path; wsMB = [math]::Round($_.WorkingSet64 / 1MB) } })
$conns = @()
foreach ($p in $procs) {
  $conns += Get-NetTCPConnection -OwningProcess $p.Id -State Established | Where-Object { $_.RemoteAddress -notmatch '^(127\.|::1|0\.0\.0\.0)' } |
    ForEach-Object { [ordered]@{ process = $p.Name; remote = $_.RemoteAddress; port = $_.RemotePort; local = $_.LocalPort } }
}
$r.tcpConnections = $conns
# UDP has no remote address in the socket table; only the local ports can be listed (the game's UDP endpoint needs ETW, see the doc).
$r.udpLocalPorts = @($procs | ForEach-Object { $id = $_.Id; Get-NetUDPEndpoint -OwningProcess $id | ForEach-Object { [ordered]@{ process = $_.OwningProcess; port = $_.LocalPort } } })

# 2. Legacy install folders and anything named like the Enhanced client (paths of the Enhanced client are not documented).
$local = $env:LOCALAPPDATA; $roam = $env:APPDATA
$r.folders = [ordered]@{
  legacyApp = Test-Path (Join-Path $local 'FiveM\FiveM.app')
  localNamedFiveM = @(Get-ChildItem $local -Directory | Where-Object { $_.Name -match 'FiveM|Cfx|CitizenFX' } | ForEach-Object { $_.FullName })
  roamingNamedFiveM = @(Get-ChildItem $roam -Directory | Where-Object { $_.Name -match 'FiveM|Cfx|CitizenFX' } | ForEach-Object { $_.FullName })
}
$enh = @($r.folders.localNamedFiveM + $r.folders.roamingNamedFiveM | Where-Object { $_ -match 'Enhanced' })
$r.enhanced = @($enh | ForEach-Object { [ordered]@{ dir = $_; files = @(Get-ChildItem $_ -Recurse -Depth 2 -File | Select-Object -First 60 | ForEach-Object { $_.FullName }) } })

# 3. Settings file: which values does a real file hold? (answers the graphics step ranges)
$xml = Join-Path $roam 'CitizenFX\gta5_settings.xml'
if (Test-Path $xml) {
  $keys = 'TextureQuality','ShaderQuality','ShadowQuality','ReflectionQuality','WaterQuality','ParticleQuality','GrassQuality','PostFX','SSAO','Tessellation','MSAA','ReflectionMSAA','AnisotropicFiltering'
  $text = Get-Content $xml -Raw
  $r.settings = [ordered]@{}
  foreach ($k in $keys) { if ($text -match "<$k\s+value=""([^""]*)""") { $r.settings[$k] = $matches[1] } }
}

# 4. Newest log files and their connection lines (does the log name the joined endpoint?). Tail only, 200 lines.
$logDirs = @((Join-Path $local 'FiveM\FiveM.app\logs')) + @($roam | ForEach-Object { Get-ChildItem $_ -Directory | Where-Object { $_.Name -match 'FiveM.*Enhanced' } | ForEach-Object { Join-Path $_.FullName 'logs' } })
$r.logs = @()
foreach ($d in $logDirs) {
  $f = Get-ChildItem $d -Filter 'CitizenFX*.log' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($f) {
    $lines = Get-Content $f.FullName -Tail 4000
    $hits = @($lines | Where-Object { $_ -match 'connect|endpoint|Authenticating|Connecting to|server' -and $_ -match '\d+\.\d+\.\d+\.\d+|cfx\.re|:\d{4,5}' } | Select-Object -Last 20)
    $r.logs += [ordered]@{ file = $f.FullName; modified = $f.LastWriteTime.ToString('s'); connectionLines = $hits }
  }
}

# 5. Profiler output: where do saved profiles land? Looks for recent JSON files in the FiveM folders.
$r.profilerFiles = @(Get-ChildItem (Join-Path $local 'FiveM') -Recurse -Depth 3 -Filter '*.json' | Where-Object { $_.LastWriteTime -gt (Get-Date).AddDays(-2) -and $_.Name -match 'prof|trace' } | Select-Object -First 10 | ForEach-Object { [ordered]@{ file = $_.FullName; kb = [math]::Round($_.Length / 1KB) } })

# 6. Optional: what does one server publish? Field NAMES and a few values of info.json / dynamic.json (answers: build, pure level, resource count).
if ($Server -match '^[A-Za-z0-9.\-]{1,253}(:\d{1,5})?$') {
  if ($Server -notmatch ':') { $Server += ':30120' }
  $r.server = [ordered]@{ target = $Server }
  foreach ($page in 'info.json','dynamic.json') {
    try {
      $j = Invoke-RestMethod -Uri "http://$Server/$page" -TimeoutSec 6
      $o = [ordered]@{ topKeys = @($j.PSObject.Properties.Name) }
      if ($j.vars) { $o.varNames = @($j.vars.PSObject.Properties.Name); $o.build = $j.vars.sv_enforceGameBuild; $o.pure = $j.vars.sv_pureLevel }
      if ($j.resources) { $o.resourceCount = @($j.resources).Count }
      $r.server[$page] = $o
    } catch { $r.server[$page] = [ordered]@{ error = $_.Exception.Message } }
  }
}

$r | ConvertTo-Json -Depth 6 | Set-Content -Path $Out -Encoding UTF8
Write-Host "Report written to $Out"
