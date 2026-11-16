'use strict'
// Update Guard: holds the Windows Update service (wuauserv) while a game runs and puts back exactly what was there before.
// Honest scope: it stops and disables ONE service. It does not stop the Store, scheduled restarts, Update Medic or other
// updaters, and Windows may switch the service back on. Every change is read back; a failed restore keeps the snapshot so the
// next start retries it. All operations run one after the other (a queue), so a quick start/exit can never interleave.

const SNAP = 'update-guard'
const MAX_HOLD_MS = 8 * 3600 * 1000
const MODE_ARG = { delayed: 'delayed-auto', auto: 'auto', manual: 'demand', disabled: 'disabled' }
const START_SCRIPT = [
  "$k = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\wuauserv'",
  '$p = Get-ItemProperty -Path $k -EA SilentlyContinue',
  '$st = (Get-Service -Name wuauserv -EA SilentlyContinue).Status',
  "'JJWU|' + $p.Start + '|' + $p.DelayedAutostart + '|' + $st",
].join('\n')

/** "JJWU|start|delayed|status" -> { mode: delayed|auto|manual|disabled, running } or null when it cannot be read. */
function parseProbe(out) {
  const m = /JJWU\|(\d*)\|(\d*)\|(\w*)/.exec(String(out || ''))
  if (!m || m[1] === '') return null
  const start = Number(m[1])
  const mode = start === 4 ? 'disabled' : start === 3 ? 'manual' : start === 2 ? (m[2] === '1' ? 'delayed' : 'auto') : null
  if (!mode) return null
  return { mode, running: m[3] === 'Running' }
}

/** Snapshot written by older versions: { prev: 'Automatic'|'Manual'|'Disabled' }. */
function normalizeSnapshot(s) {
  if (!s || typeof s !== 'object') return null
  if (s.v === 2 && MODE_ARG[s.prevMode]) return { prevMode: s.prevMode, wasRunning: s.wasRunning !== false, at: s.at || 0 }
  if (s.prev === 'Automatic') return { prevMode: 'auto', wasRunning: true, at: 0, legacy: true }
  if (s.prev === 'Manual') return { prevMode: 'manual', wasRunning: true, at: 0, legacy: true }
  if (s.prev === 'Disabled') return { prevMode: 'disabled', wasRunning: false, at: 0, legacy: true }
  return null
}

function create({ runPS, snapshots, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, onExpire = () => {} }) {
  let queue = Promise.resolve()
  let timer = null
  const run = fn => { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p }
  const probe = async () => { try { const r = await runPS(START_SCRIPT, 8000); return parseProbe(r && r.out) } catch { return null } }
  const disarm = () => { if (timer) { clearTimer(timer); timer = null } }

  async function restoreTo(prev, wasRunning) {
    let cur = null
    for (let i = 0; i < 2; i++) {
      await runPS('sc.exe config wuauserv start= ' + MODE_ARG[prev] + ' | Out-Null' + (wasRunning ? '; Start-Service -Name wuauserv -EA SilentlyContinue' : ''), 15000).catch(() => {})
      cur = await probe()
      if (cur && cur.mode === prev) return { ok: true, cur }
    }
    return { ok: false, cur }
  }

  /** Hold Windows Update. Results: holding | skipped (already disabled, nothing changed) | failed. */
  // opts.wasRunning: whether the service was running BEFORE anything of ours touched it. The pending-updates search starts wuauserv itself, so a
  // probe taken after it would record "was running" and the release would start a service that was stopped.
  function hold(opts) {
    return run(async () => {
      const existing = normalizeSnapshot(snapshots.load(SNAP))
      if (existing && !existing.legacy) return { ok: true, state: 'holding', prev: existing.prevMode, again: true }
      const cur = await probe()
      if (!cur) return { ok: false, state: 'failed', reason: 'probe' }
      if (cur.mode === 'disabled' && !existing) return { ok: true, state: 'skipped', reason: 'already-disabled' }
      // a leftover legacy snapshot means an earlier run never got restored: keep ITS previous mode, it is the user's real setting
      const prevMode = existing ? existing.prevMode : cur.mode
      const wasRunning = existing ? existing.wasRunning : (opts && typeof opts.wasRunning === 'boolean' ? opts.wasRunning : cur.running)
      snapshots.save(SNAP, { v: 2, prevMode, wasRunning, at: now() })
      await runPS('sc.exe config wuauserv start= disabled | Out-Null; Stop-Service -Name wuauserv -Force -EA SilentlyContinue', 20000).catch(() => {})
      const after = await probe()
      if (!after || after.mode !== 'disabled') {
        const back = await restoreTo(prevMode, wasRunning)
        if (back.ok) snapshots.remove(SNAP)
        return { ok: false, state: 'failed', reason: 'not-held', restored: back.ok }
      }
      disarm()
      timer = setTimer(() => { timer = null; release().then(r => onExpire(r)).catch(() => {}) }, MAX_HOLD_MS)
      if (timer && timer.unref) timer.unref()
      return { ok: true, state: 'holding', prev: prevMode }
    })
  }

  /** Put the service back as it was. Results: restored | idle (nothing was held) | failed (snapshot kept, retried at start). */
  function release() {
    return run(async () => {
      disarm()
      const raw = snapshots.load(SNAP)
      if (!raw) return { ok: true, state: 'idle' }
      const snap = normalizeSnapshot(raw)
      if (!snap) { snapshots.remove(SNAP); return { ok: true, state: 'idle' } }
      if (snap.prevMode === 'disabled') { snapshots.remove(SNAP); return { ok: true, state: 'restored', prev: 'disabled', reenabled: false } }
      const before = await probe()
      const reenabled = !!(before && before.mode !== 'disabled')
      const r = await restoreTo(snap.prevMode, snap.wasRunning)
      if (r.ok) { snapshots.remove(SNAP); return { ok: true, state: 'restored', prev: snap.prevMode, reenabled } }
      return { ok: false, state: 'failed', reason: 'restore', prev: snap.prevMode }
    })
  }

  /** Pending updates from the local cache. count is null (never 0) when it could not be read. */
  async function pendingUpdates() {
    try {
      const r = await runPS("$q = (New-Object -ComObject Microsoft.Update.Session).CreateUpdateSearcher(); $q.Online = $false; 'JJPEND|' + $q.Search('IsInstalled=0 and IsHidden=0').Updates.Count", 20000)
      const m = /JJPEND\|(\d+)/.exec(String((r && r.out) || ''))
      return m ? { count: Number(m[1]) } : { count: null, error: 'unreadable' }
    } catch { return { count: null, error: 'failed' } }
  }

  const holding = () => { const s = normalizeSnapshot(snapshots.load(SNAP)); return !!(s && !s.legacy) }
  const pendingRestore = () => !!snapshots.load(SNAP)
  return { hold, release, pendingUpdates, probe, holding, pendingRestore }
}

module.exports = { create, parseProbe, normalizeSnapshot, MODE_ARG, MAX_HOLD_MS, SNAP }
