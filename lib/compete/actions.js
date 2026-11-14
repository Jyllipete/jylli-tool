'use strict'
// PowerShell for Competitive Mode: list processes, find the game, check it is still the same process, switch off EcoQoS for it.
// Pure strings and parsers. Inputs are validated here so no caller-supplied text reaches a script unchecked.

const intId = n => { const v = Number(n); return Number.isInteger(v) && v > 0 && v < 4194304 ? v : null }
const baseName = exe => { const m = /^([\w .\-()]{1,100})\.exe$/i.exec(String(exe || '')); return m ? m[1] : null }
const psq = s => "'" + String(s).replace(/'/g, "''") + "'"

/** "@@exe|fullpath" for every process that exposes a path. */
function listScript() {
  return "Get-Process -EA SilentlyContinue | ForEach-Object { try { if ($_.Path) { Write-Output ('@@' + $_.ProcessName + '.exe|' + $_.Path) } } catch {} }"
}

/** The biggest running process called <exe>: prints G|pid|name|startTime|priorityClass. */
function lookupScript(exe) {
  const b = baseName(exe); if (!b) return null
  return "Get-Process -Name " + psq(b) + " -EA SilentlyContinue | Sort-Object WorkingSet64 -Descending | Select-Object -First 1 | ForEach-Object { $st = ''; try { $st = $_.StartTime.ToFileTimeUtc().ToString() } catch {}; $cls = ''; try { $cls = $_.PriorityClass.ToString() } catch {}; Write-Output ('G|' + $_.Id + '|' + $_.ProcessName + '|' + $st + '|' + $cls) }"
}
function parseLookup(out) {
  const m = /^G\|(\d+)\|([^|]+)\|(\d*)\|(\w*)$/m.exec(String(out || '').replace(/\r/g, ''))
  return m ? { pid: Number(m[1]), name: m[2], st: m[3], cls: m[4] } : null
}

/** Prints UP when pid still exists under the same name and start time, GONE otherwise. */
function aliveScript(g) {
  const pid = intId(g && g.pid); if (!pid) return null
  return "$p = Get-Process -Id " + pid + " -EA SilentlyContinue; if (-not $p -or $p.ProcessName -ne " + psq(g.name) + ") { Write-Output 'GONE'; exit }; $st = ''; try { $st = $p.StartTime.ToFileTimeUtc().ToString() } catch {}; if (" + psq(g.st || '') + " -and $st -and $st -ne " + psq(g.st || '') + ") { Write-Output 'GONE' } else { Write-Output 'UP' }"
}
const parseAlive = out => !/GONE/.test(String(out || '')) && /UP/.test(String(out || ''))

/** Cheap "is it still running" check for the watch loop: tasklist (no PowerShell start-up every few seconds while the game runs). */
function aliveArgs(g) {
  const pid = intId(g && g.pid); if (!pid) return null
  return ['/FI', 'PID eq ' + pid, '/FO', 'CSV', '/NH']
}
/** True when tasklist lists that pid under the same image name. */
function parseAliveTasklist(out, g) {
  const m = /^"([^"]+)","(\d+)"/m.exec(String(out || '').replace(/\r/g, ''))
  if (!m || Number(m[2]) !== Number(g && g.pid)) return false
  return m[1].toLowerCase().replace(/\.exe$/, '') === String(g.name || '').toLowerCase()
}

/**
 * Turns off power throttling (EcoQoS) for one process: SetProcessInformation(ProcessPowerThrottling) with the execution-speed control
 * on and the throttle state off, then reads it back. Prints ECO|ok when proven, ECO|denied or ECO|unproven otherwise.
 */
function ecoScript(pid) {
  const id = intId(pid); if (!id) return null
  return [
    "$ErrorActionPreference = 'Stop'",
    "try {",
    "Add-Type -Namespace JJ -Name Eco -MemberDefinition @'",
    "[StructLayout(LayoutKind.Sequential)] public struct PPT { public uint Version; public uint ControlMask; public uint StateMask; }",
    '[DllImport("kernel32.dll", SetLastError=true)] public static extern bool SetProcessInformation(IntPtr h, int cls, ref PPT info, int size);',
    '[DllImport("kernel32.dll", SetLastError=true)] public static extern bool GetProcessInformation(IntPtr h, int cls, ref PPT info, int size);',
    "'@",
    "$h = [System.Diagnostics.Process]::GetProcessById(" + id + ").Handle",
    "$i = New-Object JJ.Eco+PPT; $i.Version = 1; $i.ControlMask = 1; $i.StateMask = 0",
    "if (-not [JJ.Eco]::SetProcessInformation($h, 4, [ref]$i, 12)) { Write-Output 'ECO|denied'; exit }",
    "$o = New-Object JJ.Eco+PPT; $o.Version = 1",
    "if ([JJ.Eco]::GetProcessInformation($h, 4, [ref]$o, 12) -and (($o.ControlMask -band 1) -eq 1) -and (($o.StateMask -band 1) -eq 0)) { Write-Output 'ECO|ok' } else { Write-Output 'ECO|unproven' }",
    "} catch { Write-Output 'ECO|denied' }",
  ].join('\n')
}
const parseEco = out => { const m = /ECO\|(ok|denied|unproven)/.exec(String(out || '')); return m ? m[1] : 'denied' }

module.exports = { aliveArgs, parseAliveTasklist, listScript, lookupScript, parseLookup, aliveScript, parseAlive, ecoScript, parseEco, baseName, intId }
