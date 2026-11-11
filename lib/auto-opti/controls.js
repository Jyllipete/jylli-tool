'use strict'
// Controls: Auto-Optimize steps that take parameters (which monitor, which startup items), so they cannot be plain TWEAKS entries.
// Each control receives { params, profile, rec, runPS, askConfirm, count, now } and returns { status, ... }.
//   rec: the journal recorder's { ps, note } (null for controls that journal nothing, e.g. the junk cleaner).
//   count(name, n): adds to a live counter the UI shows.
const display = require('./display')

const psq = s => "'" + String(s).replace(/'/g, "''") + "'"
const BYTES = (4294967296)

// ── display-refresh ───────────────────────────────────────────────────────────────────────────────────────
// Two-phase: apply dynamically, ask, persist only on Keep. A black screen or no answer reverts (the timer lives in main).
async function displayRefresh({ params, profile, rec, runPS, askConfirm }) {
  const known = new Map(((profile && profile.displays) || []).map(d => [d.device, d]))
  const results = []
  for (const t of (params && params.targets) || []) {
    const d = known.get(t.device)
    if (!d) { results.push({ device: t.device, status: 'skipped', reason: 'unknown-device' }); continue }
    // Only modes the profile saw this display offer, at its current resolution.
    if (!d.modes.some(m => m.w === t.w && m.h === t.h && m.hz === t.hz) || d.cur.w !== t.w || d.cur.h !== t.h) { results.push({ device: t.device, status: 'skipped', reason: 'mode-not-offered' }); continue }
    const from = d.cur.hz
    const test = await runPS(display.setScript(t.device, t, 'test'), 15000)
    if (!display.setOk(test.out)) { results.push({ device: t.device, status: 'skipped', reason: 'driver-refused' }); continue }
    const dyn = await runPS(display.setScript(t.device, t, 'dynamic'), 15000)
    if (!display.setOk(dyn.out)) { results.push({ device: t.device, status: 'failed', reason: 'apply-failed' }); continue }
    const answer = await askConfirm({ device: t.device, from, to: t.hz })
    if (answer === 'keep') {
      const keep = await runPS(display.setScript(t.device, t, 'persist'), 15000)
      if (display.setOk(keep.out)) {
        if (rec) rec.note({ kind: 'display-mode', device: t.device, w: t.w, h: t.h, before: { exists: true, value: from }, after: { exists: true, value: t.hz } })
        results.push({ device: t.device, status: 'ok', from, to: t.hz })
      } else {
        await runPS(display.setScript(t.device, { w: t.w, h: t.h, hz: from }, 'dynamic'), 15000)
        results.push({ device: t.device, status: 'failed', reason: 'persist-failed' })
      }
    } else {
      await runPS(display.setScript(t.device, { w: t.w, h: t.h, hz: from }, 'dynamic'), 15000)
      results.push({ device: t.device, status: 'reverted', from, to: t.hz })
    }
  }
  const ok = results.filter(r => r.status === 'ok').length
  const status = ok ? 'ok' : results.some(r => r.status === 'reverted') ? 'reverted' : results.some(r => r.status === 'failed') ? 'failed' : 'skipped'
  return { status, results }
}

// ── startup-cleanup ───────────────────────────────────────────────────────────────────────────────────────
// Task Manager's own mechanism: a StartupApproved binary whose first byte is 03 (disabled). Nothing is deleted; Task Manager
// shows the item as Disabled and re-enabling it there works.
const APPROVED = {
  HKCU: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run',
  HKLM: 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run',
  HKLM32: 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run32',
}
const DISABLED_BYTES = '3,0,0,0,0,0,0,0,0,0,0,0'

async function startupCleanup({ params, profile, rec, count }) {
  const items = (profile && profile.startup && profile.startup.items) || []
  const byName = new Map(items.map(i => [i.name, i]))
  const done = []
  for (const name of (params && params.items) || []) {
    const it = byName.get(name)
    if (!it || !it.enabled || !it.safeToDisable || !APPROVED[it.src]) continue     // only what the scan saw, and only what the classifier allows
    const path = APPROVED[it.src]
    await rec.ps(`New-Item -Path ${psq(path)} -Force -ErrorAction SilentlyContinue | Out-Null\nSet-ItemProperty -Path ${psq(path)} -Name ${psq(name)} -Value ([byte[]](${DISABLED_BYTES})) -Type Binary -Force`)
    done.push(name)
    if (count) count('startupRemoved', 1)
  }
  return { status: done.length ? 'ok' : 'skipped', removed: done }
}

// ── junk-clean ────────────────────────────────────────────────────────────────────────────────────────────
// Shader caches are excluded on purpose: deleting them makes the next game launch recompile and stutter.
const SHADER_RX = String.raw`\\(DxCache|DXCache|GLCache|NV_Cache|D3DSCache|ShaderCache|VkCache|ProgramCache|AMD\\DxCache)(\\|$)`

function junkScript(folder, hours) {
  return `$ErrorActionPreference = 'SilentlyContinue'
$p = ${folder}
$cut = (Get-Date).AddHours(-${Number(hours) | 0})
$freed = [int64]0
if (Test-Path -LiteralPath $p) {
  Get-ChildItem -LiteralPath $p -Recurse -File -Force | Where-Object { $_.LastWriteTime -lt $cut -and $_.FullName -notmatch '${SHADER_RX}' } | ForEach-Object {
    $l = $_.Length
    try { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop; $freed += $l } catch {}
  }
}
Write-Output ('FREED=' + $freed)`
}

const JUNK_FOLDERS = [
  { id: 'temp', folder: '$env:TEMP', hours: 24 },
  { id: 'wintemp', folder: "'C:\\Windows\\Temp'", hours: 24 },
  { id: 'wu', folder: "'C:\\Windows\\SoftwareDistribution\\Download'", hours: 240, skipWhenPending: true },
]

async function junkClean({ profile, runPS, count }) {
  let total = 0
  const pending = !!(profile && profile.storage && profile.storage.wuRebootPending)
  for (const f of JUNK_FOLDERS) {
    if (f.skipWhenPending && pending) continue
    const r = await runPS(junkScript(f.folder, f.hours), 120000)
    const m = /FREED=(\d+)/.exec(String(r.out || ''))
    const n = m ? Math.min(Number(m[1]), BYTES * 64) : 0
    total += n
    if (count) count('bytesReclaimed', n)
  }
  return { status: total > 0 ? 'ok' : 'skipped', bytes: total }
}

// ── fivem-settings (Premium) ──────────────────────────────────────────────────────────────────────────────
// Writes the recommended graphics values into gta5_settings.xml through the existing writer (which validates, backs up to .bak and
// writes atomically). Only values that differ are written, and the backup is journaled so Undo puts the file back.
async function fivemSettings({ rec, fivem }) {
  if (!fivem) return { status: 'skipped', reason: 'unavailable' }
  const cur = await fivem.read()
  if (!cur || !cur.ok) return { status: 'skipped', reason: 'no-settings-file' }
  const want = require('./fivem-rec').recommend(await fivem.vramMB())
  const changes = {}
  for (const [k, v] of Object.entries(want)) if (cur.vals[k] != null && cur.vals[k] !== v) changes[k] = v      // only keys the file really has
  if (!Object.keys(changes).length) return { status: 'skipped', reason: 'already-recommended' }
  const w = await fivem.write(changes)
  if (!w || !w.ok) return { status: 'failed', reason: String((w && w.reason) || 'write-failed').slice(0, 200) }
  if (rec) rec.note({ kind: 'file-backup', file: cur.path, backup: cur.path + '.bak', before: { exists: true, value: cur.size || 0 }, after: { exists: true, value: w.size || 0 } })
  return { status: 'ok', changed: Object.entries(changes).map(([k, v]) => ({ key: k, from: cur.vals[k], to: v })) }
}

const CONTROLS = { 'display-refresh': displayRefresh, 'startup-cleanup': startupCleanup, 'junk-clean': junkClean, 'fivem-settings': fivemSettings }
/** Controls that write through the journal recorder (the others change nothing the journal could undo). */
const JOURNALED = new Set(['display-refresh', 'startup-cleanup', 'fivem-settings'])

module.exports = { fivemSettings, CONTROLS, JOURNALED, displayRefresh, startupCleanup, junkClean, junkScript, SHADER_RX, APPROVED, DISABLED_BYTES }
