'use strict'
// After the restart: did the changes survive, and did the PC really boot faster? Pure helpers; main supplies the event log and the journal.
// Boot duration comes from Microsoft-Windows-Diagnostics-Performance event 100, field BootTime (ms). Windows writes it minutes
// after logon, so "not yet" is a normal state and is reported as such, never as a made-up number.

const BOOT_EVENTS = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-Diagnostics-Performance/Operational'; Id = 100 } -MaxEvents 6 | ForEach-Object {
  $x = [xml]$_.ToXml()
  $bt = ($x.Event.EventData.Data | Where-Object { $_.Name -eq 'BootTime' }).'#text'
  if ($bt) { $_.TimeCreated.ToUniversalTime().ToString('o') + '|' + $bt }
}
$lb = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().ToString('o')
'LASTBOOT=' + $lb
`

function parseBootEvents(out) {
  const events = []
  let lastBootAt = null
  for (const raw of String(out || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('LASTBOOT=')) { const t = Date.parse(line.slice(9)); if (Number.isFinite(t)) lastBootAt = t; continue }
    const m = /^([^|]+)\|(\d+)$/.exec(line)
    if (!m) continue
    const at = Date.parse(m[1]), ms = Number(m[2])
    if (Number.isFinite(at) && ms > 1000 && ms < 3600000) events.push({ at, ms })
  }
  events.sort((a, b) => b.at - a.at)
  return { events, lastBootAt }
}

function median(nums) {
  const a = nums.filter(n => Number.isFinite(n)).sort((x, y) => x - y)
  if (!a.length) return null
  const m = a.length >> 1
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2)
}

/** The boots before `before` (default now): median of the last three. null when the log has none. */
function bootBaseline(events, before = Date.now()) {
  return median(events.filter(e => e.at < before).slice(0, 3).map(e => e.ms))
}

const WAIT_MS = 15 * 60 * 1000

/**
 * pv: settings.aom_pending_verify. facts: { lastBootAt, events, drift: { total, same, drifted: [{ label, tweakId, control }] }, metricsAfter, now }.
 * Returns { pending, rebooted, boot, persisted, rows? }.
 */
function verifyState(pv, facts) {
  if (!pv) return { pending: false }
  const now = facts.now || Date.now()
  const rebooted = facts.lastBootAt != null && facts.lastBootAt > pv.runAt
  if (!rebooted) return { pending: true, rebooted: false, rebootRequired: !!pv.rebootRequired, runAt: pv.runAt, ageMs: now - pv.runAt }
  const after = (facts.events || []).find(e => e.at > pv.runAt)
  let boot
  if (after) boot = { beforeMs: pv.bootBaselineMs || null, afterMs: after.ms, deltaMs: pv.bootBaselineMs ? after.ms - pv.bootBaselineMs : null }
  else if (now - facts.lastBootAt < WAIT_MS) boot = { waiting: true }
  else boot = { unavailable: true }
  const d = facts.drift || { total: 0, same: 0, drifted: [] }
  return { pending: true, rebooted: true, boot, persisted: { total: d.total, same: d.same, drifted: d.drifted }, needsYou: pv.needsYou || [], runAt: pv.runAt }
}

module.exports = { BOOT_EVENTS, parseBootEvents, median, bootBaseline, verifyState, WAIT_MS }
