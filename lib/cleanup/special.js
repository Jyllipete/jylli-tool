'use strict'
// Targets that are not "delete the files in these folders": Recycle Bin, component store, event logs, Windows.old.
// Scripts are exported as strings so tests can read them. runPS(script, timeoutMs) -> { out }.
const walkLib = require('./walk')
const targets = require('./targets')

const RECYCLE_SIZE = `try { $s=New-Object -ComObject Shell.Application; $b=$s.Namespace(10); $z=($b.Items()|Measure-Object -Property Size -Sum); Write-Output ('SIZE=' + [long]$z.Sum + ';COUNT=' + [int]$z.Count) } catch { Write-Output 'SIZE=0;COUNT=0' }`
const RECYCLE_CLEAN = `Clear-RecycleBin -Force -ErrorAction SilentlyContinue`
const EVENTLOG_SIZE = `$f = Get-ChildItem 'C:\\Windows\\System32\\winevt\\Logs' -Filter '*.evtx' -Force -EA SilentlyContinue; $z = $f | Measure-Object -Property Length -Sum; Write-Output ('SIZE=' + [long]$z.Sum + ';COUNT=' + [int]$z.Count)`
const EVENTLOG_CLEAN = `wevtutil el | ForEach-Object { wevtutil cl "$_" 2>$null }`
const DISM_ANALYZE = `Dism.exe /Online /Cleanup-Image /AnalyzeComponentStore 2>&1 | Out-String`
const DISM_CLEAN = `Dism.exe /Online /Cleanup-Image /StartComponentCleanup 2>&1 | Out-Null`
const OLDWIN_CLEAN = `$p='C:\\Windows.old'; if (Test-Path -LiteralPath $p) { takeown /F $p /R /A /D Y | Out-Null; icacls $p /grant Administrators:F /T /C /Q | Out-Null; cmd /c rd /s /q $p }`

const num = (re, s) => { const m = re.exec(String(s || '')); return m ? Number(m[1]) : null }

/** "Cache and Temporary Data : 1.23 GB" style lines (English DISM only; any other locale returns null = size unknown, never guessed). */
function parseDism(out) {
  const m = /Cache and Temporary Data\s*:\s*([\d.,]+)\s*(KB|MB|GB)/i.exec(String(out || ''))
  const rec = /Component Store Cleanup Recommended\s*:\s*(Yes|No)/i.exec(String(out || ''))
  if (!m) return { bytes: null, recommended: rec ? /yes/i.test(rec[1]) : null }
  const v = parseFloat(m[1].replace(',', '.')), mult = { KB: 1024, MB: 1048576, GB: 1073741824 }[m[2].toUpperCase()]
  return { bytes: Math.round(v * mult), recommended: rec ? /yes/i.test(rec[1]) : null }
}
function parseSizeCount(out) {
  return { bytes: num(/SIZE=(\d+)/, out) || 0, files: num(/COUNT=(\d+)/, out) || 0 }
}

/** Measure a special target. Returns the same shape as walk.scanTarget (+ `unknown: true` when no honest number exists). */
async function measure(target, env, runPS, opts = {}) {
  const base = { id: target.id, present: false, bytes: 0, files: 0, oldBytes: 0, recentBytes: 0, personalFiles: 0, personalBytes: 0, newest: 0, roots: [] }
  if (target.special === 'recycle') { const r = parseSizeCount((await runPS(RECYCLE_SIZE, 12000)).out); return { ...base, present: r.bytes > 0, bytes: r.bytes, oldBytes: r.bytes, files: r.files } }
  if (target.special === 'eventlogs') { const r = parseSizeCount((await runPS(EVENTLOG_SIZE, 12000)).out); return { ...base, present: r.files > 0, bytes: r.bytes, oldBytes: r.bytes, files: r.files } }
  if (target.special === 'oldwindows') return walkLib.scanTarget(target, env, opts)
  if (target.special === 'dism') {
    if (!opts.analyzeDism) return { ...base, present: true, unknown: true }          // slow (tens of seconds): only on request
    const d = parseDism((await runPS(DISM_ANALYZE, 180000)).out)
    return { ...base, present: true, bytes: d.bytes || 0, oldBytes: d.bytes || 0, unknown: d.bytes == null, recommended: d.recommended }
  }
  return base
}

/** Clean a special target. freed = measured before - measured after (never the estimate). */
async function clean(target, env, runPS, opts = {}) {
  const before = (await measure(target, env, runPS, opts)).bytes || 0
  if (target.special === 'recycle') await runPS(RECYCLE_CLEAN, 120000)
  else if (target.special === 'eventlogs') await runPS(EVENTLOG_CLEAN, 120000)
  else if (target.special === 'dism') await runPS(DISM_CLEAN, 600000)
  else if (target.special === 'oldwindows') { await runPS(OLDWIN_CLEAN, 1800000); return { id: target.id, freed: before - ((await walkLib.scanTarget(target, env, opts)).bytes || 0), files: 0, skipped: { inUse: 0, access: 0, tooNew: 0, personal: 0 }, skippedBytes: 0, present: true } }
  const after = target.special === 'dism' ? before : (await measure(target, env, runPS, opts)).bytes || 0
  return { id: target.id, freed: target.special === 'dism' ? 0 : Math.max(0, before - after), unknownFreed: target.special === 'dism', files: 0, skipped: { inUse: 0, access: 0, tooNew: 0, personal: 0 }, skippedBytes: 0, present: true }
}

module.exports = { measure, clean, parseDism, parseSizeCount, RECYCLE_SIZE, RECYCLE_CLEAN, EVENTLOG_SIZE, EVENTLOG_CLEAN, DISM_ANALYZE, DISM_CLEAN, OLDWIN_CLEAN, targets }
