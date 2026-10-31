'use strict'
// Change journal: an append-only JSONL log of what each apply really changed (real before/after values) and the code that
// undoes it by writing the recorded before-values back. Owned by main; the renderer only ever sees list()/undo results.
// All I/O is injected (fs, ps, cmd), so the module is unit-testable without PowerShell.
const nodefs = require('fs')
const crypto = require('crypto')
const cmdParse = require('./cmd-parse')

const VERSION = 1
const MAX_BYTES = 5 * 1024 * 1024
const MAX_AGE_MS = 90 * 24 * 3600 * 1000
const VIAS = ['manual', 'stage', 'auto-opti', 'spw', 'ai', 'game-watcher', 'scheduler', 'safety-revert', 'undo']

const newId = () => crypto.randomBytes(6).toString('hex')

function fidelityOf(changes) {
  if (!changes || !changes.length) return 'intent'
  return changes.some(c => c.kind === 'unresolved') ? 'partial' : 'exact'
}

function buildEntry(f, now = Date.now()) {
  const changes = Array.isArray(f.changes) ? f.changes : []
  return {
    v: VERSION,
    id: f.id || newId(),
    batchId: f.batchId || null,
    sessionId: f.sessionId || null,
    ts: now,
    tweakId: f.tweakId || null,
    control: f.control || null,
    action: f.action || 'apply',
    via: VIAS.includes(f.via) ? f.via : 'manual',
    fidelity: fidelityOf(changes),
    changes,
    result: f.result || 'ok',
    rebootRequired: !!f.rebootRequired,
    ...(f.undoes ? { undoes: f.undoes } : {}),
  }
}

function createJournal({ file, fs = nodefs, now = Date.now, sessionId = newId() }) {
  function append(obj) { fs.appendFileSync(file, JSON.stringify(obj) + '\n', 'utf8') }

  function readAll() {
    let text = ''
    try { text = fs.readFileSync(file, 'utf8') } catch { return [] }
    const entries = new Map()
    for (const line of text.split('\n')) {
      if (!line) continue
      let o
      try { o = JSON.parse(line) } catch { continue }   // a torn last line (crash mid-write) is skipped, never fatal
      if (o.type === 'mark') { const e = entries.get(o.id); if (e) e.undoneBy = o.undoneBy }
      else if (o.id) entries.set(o.id, o)
    }
    return [...entries.values()]
  }

  return {
    sessionId,
    record(fields) {
      const e = buildEntry({ sessionId, ...fields }, now())
      append(e)
      return e
    },
    markUndone(id, undoneBy) { append({ type: 'mark', id, undoneBy, ts: now() }) },
    list({ limit = 200, via, tweakId, batchId, sessionId: sid } = {}) {
      let all = readAll().reverse()
      if (via) all = all.filter(e => e.via === via)
      if (tweakId) all = all.filter(e => e.tweakId === tweakId)
      if (batchId) all = all.filter(e => e.batchId === batchId)
      if (sid) all = all.filter(e => e.sessionId === sid)
      return all.slice(0, limit)
    },
    get(id) { return readAll().find(e => e.id === id) || null },
    /** Drops entries older than 90 days and keeps the file under 5 MB (oldest first). Returns how many were removed. */
    rotate() {
      let size = 0
      try { size = fs.statSync(file).size } catch { return 0 }
      const all = readAll()
      const cutoff = now() - MAX_AGE_MS
      let keep = all.filter(e => e.ts >= cutoff)
      if (size <= MAX_BYTES && keep.length === all.length) return 0
      let text = keep.map(e => JSON.stringify(e)).join('\n')
      while (text.length > MAX_BYTES * 0.8 && keep.length > 1) { keep = keep.slice(Math.ceil(keep.length * 0.1)); text = keep.map(e => JSON.stringify(e)).join('\n') }
      fs.writeFileSync(file, text ? text + '\n' : '', 'utf8')
      return all.length - keep.length
    },
  }
}

// ── Undo ────────────────────────────────────────────────────────────────────────────────────────────────────
const psq = s => "'" + String(s).replace(/'/g, "''") + "'"
const str = v => Array.isArray(v) ? v.join(',') : String(v)
const sameState = (a, b) => !!a?.exists === !!b?.exists && (!a?.exists || str(a.value) === str(b.value))

function psTyped(type, v) {
  switch (type) {
    case 'DWord': { const n = Number(v); return n > 2147483647 ? `([BitConverter]::ToInt32([BitConverter]::GetBytes([uint32]${n}),0))` : `[int]${n}` }
    case 'QWord': return `[long]${Number(v)}`
    case 'Binary': return `[byte[]]@(${(Array.isArray(v) ? v : [v]).map(Number).join(',')})`
    case 'MultiString': return `[string[]]@(${(Array.isArray(v) ? v : [v]).map(psq).join(',')})`
    default: return psq(v)
  }
}

function psReadScript(c) {
  return `$k = $null; try { $k = Get-Item -LiteralPath ${psq(c.path)} -ErrorAction Stop } catch {}
if ($k -and ($k.GetValueNames() -contains ${psq(c.name)})) { $v = $k.GetValue(${psq(c.name)}, $null, 'DoNotExpandEnvironmentNames'); Write-Output ('JJSTATE' + (@{ e = $true; t = $k.GetValueKind(${psq(c.name)}).ToString(); v = $v } | ConvertTo-Json -Compress -Depth 3)) }
else { Write-Output 'JJSTATE{"e":false}' }`
}

function psRegRestoreScript(c) {
  const b = c.before
  if (!b.exists) return `Remove-ItemProperty -LiteralPath ${psq(c.path)} -Name ${psq(c.name)} -ErrorAction SilentlyContinue; Write-Output 'JJOK'`
  return `$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath ${psq(c.path)})) { New-Item -Path ${psq(c.path)} -Force | Out-Null }
Set-ItemProperty -LiteralPath ${psq(c.path)} -Name ${psq(c.name)} -Value (${psTyped(b.type, b.value)}) -Type ${b.type}
Write-Output 'JJOK'`
}

async function readCurrent(c, { ps, cmd }) {
  if (c.kind === 'reg' && c.via === 'ps') {
    const r = await ps(psReadScript(c))
    const m = String(r.out || '').match(/JJSTATE(\{.*\})/)
    if (!m) return { unknown: true }
    const j = JSON.parse(m[1])
    return j.e ? { exists: true, type: j.t, value: j.v } : { exists: false }
  }
  const d = nativeDesc(c)
  if (!d) return { unknown: true }
  const r = await cmd(cmdParse.readBackCmd(d))
  return cmdParse.parseReadBack(d, r.out, r.code)
}

/** Descriptor used by cmd-parse for a stored change. */
function nativeDesc(c) {
  if (c.kind === 'reg') return { kind: 'reg', key: c.key, name: c.name }
  if (c.kind === 'service') return { kind: 'service', name: c.name }
  if (c.kind === 'bcd') return { kind: 'bcd', id: c.id || '{current}', name: c.name }
  if (c.kind === 'powercfg') return { kind: 'powercfg', ac: c.ac, scheme: c.scheme, sub: c.sub, setting: c.setting }
  if (c.kind === 'powercfg-active') return { kind: 'powercfg-active' }
  return null
}

/**
 * Undoes one entry by writing its recorded before-values back, last change first.
 * Pass 1 re-reads every current value: if one differs from what the entry recorded as "after", nothing is written and the
 * conflicts are returned (retry with force:true to overwrite). Pass 2 restores; it stops at the first failure.
 * handlers['gpu-power-limit'] = { read(), restore(change) } is supplied by main for the NVIDIA power limit.
 */
async function undoEntry(entry, { ps, cmd, force = false, handlers = {} }) {
  const todo = []
  for (let i = entry.changes.length - 1; i >= 0; i--) {
    const c = entry.changes[i]
    if (c.kind === 'unresolved') { todo.push({ i, c, skip: 'unresolved' }); continue }
    if (c.kind === 'gpu-power-limit') { todo.push({ i, c, handler: handlers['gpu-power-limit'] }); continue }
    todo.push({ i, c })
  }
  const conflicts = []
  for (const t of todo) {
    if (t.skip) continue
    let cur
    if (t.handler) cur = await t.handler.read(t.c)
    else cur = await readCurrent(t.c, { ps, cmd })
    t.cur = cur
    if (cur.unknown) { conflicts.push({ i: t.i, kind: t.c.kind, name: t.c.name || t.c.key, reason: 'unreadable' }); continue }
    if (!force && !sameState(cur, t.c.after)) conflicts.push({ i: t.i, kind: t.c.kind, name: t.c.name || t.c.key, now: cur, recordedAfter: t.c.after, reason: 'changed' })
  }
  if (conflicts.length && !force) return { ok: false, conflicts, results: [] }

  const results = []
  for (const t of todo) {
    if (t.skip) { results.push({ i: t.i, kind: t.c.kind, status: 'skipped', detail: t.skip }); continue }
    try {
      let ok
      if (t.handler) ok = await t.handler.restore(t.c)
      else if (t.c.kind === 'reg' && t.c.via === 'ps') { const r = await ps(psRegRestoreScript(t.c)); ok = /JJOK/.test(r.out || '') }
      else {
        const rc = cmdParse.restoreCmd(nativeDesc(t.c), t.c.before)
        if (!rc) { results.push({ i: t.i, kind: t.c.kind, status: 'skipped', detail: 'no-restore-command' }); continue }
        const r = await cmd(rc); ok = r.ok !== false
      }
      results.push({ i: t.i, kind: t.c.kind, status: ok ? 'restored' : 'failed' })
      if (!ok) return { ok: false, conflicts: [], results, failedAt: t.i }
    } catch (e) {
      results.push({ i: t.i, kind: t.c.kind, status: 'failed', detail: String(e.message || e) })
      return { ok: false, conflicts: [], results, failedAt: t.i }
    }
  }
  return { ok: true, conflicts: [], results }
}

module.exports = { VERSION, VIAS, buildEntry, fidelityOf, createJournal, undoEntry, sameState, psRegRestoreScript, psReadScript, psTyped }
