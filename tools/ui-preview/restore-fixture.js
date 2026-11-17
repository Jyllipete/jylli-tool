'use strict'
// Restore points tab "Lifeline" preview: the REAL lib/restore service on a fake PC. A restore point is a row in memory; create / delete / protect / storage change that
// row set and the service reads it back through the same probe it uses on a real PC. State comes from ?rs=full|covered|uncovered|stale|empty|off|policy|noadmin|returned|failed-return|unreadable|fail
// on /app (serve.js passes it as ctx.rs). Not used by the app.
const Restore = require('../../lib/restore')

const DAY = 86400000, GB = 1024 ** 3
const cache = new Map()
const NAMES = { 'msi-mode': 'GPU MSI mode', 'game-mode': 'Game Mode', 'hags-off': 'HAGS off', nagle: "Nagle's algorithm", 'power-throttle': 'Power throttling', 'fast-startup-off': 'Fast startup off' }

const wmi = ms => {
  const d = new Date(ms), p = (n, l = 2) => String(n).padStart(l, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}.000000+000`
}
const ymd = ms => { const d = new Date(ms), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` }

function pcFor(state, now) {
  const ago = d => now - d * DAY
  const pc = {
    admin: state !== 'noadmin', readable: state !== 'unreadable' && state !== 'noadmin',
    protection: state === 'off' || state === 'policy' ? 'off' : 'on', policy: state === 'policy', vssStart: 3,
    volume: { size: 953 * GB, free: 212 * GB }, storage: { has: true, used: 6.4 * GB, max: 0.1 * 953 * GB }, battery: { present: false, discharging: false, pct: null },
    bootAt: now - 6 * 3600000, lastStatus: 'The last attempt to restore the computer succeeded.', points: [], journal: [], programs: [], pending: null,
  }
  const P = (seq, desc, d, type = 12) => pc.points.push({ seq, desc, at: ago(d), type })
  const J = (id, tweakId, d, via = 'manual', action = 'apply') => pc.journal.push({ id, ts: ago(d), tweakId, action, via, result: 'ok', changes: [] })
  pc.programs = [{ n: 'Contoso Editor 4', d: ymd(ago(1)) }, { n: 'Fabrikam Player', d: ymd(ago(4)) }, { n: 'Northwind VPN', d: ymd(ago(9)) }, { n: 'Adventure Works Launcher', d: ymd(ago(20)) }]
  if (state === 'empty') { pc.storage.used = 0; return pc }
  if (state === 'off' || state === 'policy') { pc.points = []; pc.storage = { has: false, used: 0, max: 0, alloc: 0 }; return pc }
  if (state === 'covered') {
    P(52, 'JylliTool_AutoOpti', 1.1, 12); P(51, 'Windows Update', 6, 12); P(50, 'JylliTool_Manual - Before drivers', 11, 12); P(49, 'Installed Fabrikam Player', 20, 0)
    J('j1', 'msi-mode', 0.9, 'auto-opti'); J('j2', 'game-mode', 0.9, 'auto-opti'); J('j3', 'hags-off', 7, 'manual')
    return pc
  }
  if (state === 'stale') { P(30, 'JylliTool_Scheduled', 12, 12); P(29, 'Windows Update', 21, 12); J('j1', 'nagle', 15); return pc }
  if (state === 'uncovered') {
    P(44, 'JylliTool_AutoOpti', 3, 12); P(43, 'Windows Update', 9, 12); P(42, 'Installed Contoso Editor 4', 16, 0)
    J('j1', 'msi-mode', 2, 'auto-opti'); J('j2', 'game-mode', 2, 'auto-opti'); J('j3', 'power-throttle', 1.2); J('j4', 'fast-startup-off', 0.4); J('j5', 'hags-off', 0.3)
    return pc
  }
  if (state === 'returned' || state === 'failed-return') {
    const reqAt = ago(0.25), pointAt = ago(2)
    P(61, 'Restore Operation', 0.2, 6); P(60, 'JylliTool_Before_msi-mode', 2, 12); P(59, 'Windows Update', 8, 12)
    J('j1', 'msi-mode', 1.5); J('j2', 'game-mode', 1); J('j3', 'hags-off', 0.5)
    pc.pending = { seq: 60, desc: 'JylliTool_Before_msi-mode', pointAt, at: reqAt }
    pc.bootAt = ago(0.2)
    if (state === 'failed-return') { pc.points = pc.points.filter(p => p.type !== 6); pc.lastStatus = 'The last attempt to restore the computer failed.' }
    return pc
  }
  // full: a busy PC with a mix of origins and a recent batch of changes
  P(58, 'JylliTool_Manual - Before the new GPU driver', 1.6, 12); P(57, 'JylliTool_Before_hags-off', 3.5, 12); P(56, 'Windows Update', 5, 12); P(55, 'JylliTool_Scheduled', 7, 12)
  P(54, 'JylliTool_Debloat', 9.5, 12); P(53, 'Installed Northwind VPN', 9.6, 0); P(52, 'Device Driver Package Install: NVIDIA Display', 13, 10); P(51, 'JylliTool_AutoOpti', 14, 12)
  P(50, 'JylliTool_FirstRun', 19, 12); P(49, 'Windows Update', 23, 12); P(48, 'JylliTool_Diagnostics', 27, 12); P(47, 'Installed Adventure Works Launcher', 33, 0); P(46, 'Windows Modules Installer', 41, 12)
  J('j1', 'msi-mode', 1.4, 'auto-opti'); J('j2', 'game-mode', 1.4, 'auto-opti'); J('j3', 'power-throttle', 1.4, 'auto-opti'); J('j4', 'nagle', 0.7)
  J('j5', 'hags-off', 3.4); J('j6', 'fast-startup-off', 6); J('j7', 'msi-mode', 14, 'auto-opti'); J('j8', 'game-mode', 21); J('j9', 'nagle', 52)
  return pc
}

function rig(state) {
  if (cache.has(state)) return cache.get(state)
  const now = Date.now()
  const pc = pcFor(state, now)
  const settings = { autoSnapshotDays: state === 'full' ? 3 : 0, lastAutoSnapshot: state === 'full' ? new Date(now - 7 * DAY).toISOString() : null }
  let store = pc.pending ? { pending: pc.pending } : null
  const send = []
  const probeJson = () => ({
    admin: pc.admin, drive: 'C:', pointsRead: pc.readable,
    points: pc.readable ? [...pc.points].sort((a, b) => b.seq - a.seq).map(p => ({ seq: p.seq, desc: p.desc, time: wmi(p.at), type: p.type })) : [],
    lastStatus: pc.lastStatus, interval: pc.protection === 'on' ? 1 : 0, disableSR: pc.policy ? 1 : null, disableConfig: null, vssStart: pc.vssStart,
    storage: pc.storage && pc.storage.has ? { has: true, used: pc.storage.used, max: pc.storage.max, alloc: pc.storage.used } : { has: false, used: 0, max: 0, alloc: 0 },
    volume: { size: pc.volume.size, free: pc.volume.free }, battery: pc.battery, bootAt: new Date(pc.bootAt).toISOString(),
    programs: pc.programs,
  })
  const runPS = async script => {
    if (state === 'fail') return { ok: false, out: '' }
    if (script.includes('JJRP:')) return state === 'unreadable' ? { ok: true, out: 'garbage' } : { ok: true, out: 'JJRP:' + JSON.stringify(probeJson()) }
    if (script.includes('Enable-ComputerRestore')) { pc.protection = 'on'; pc.policy = false; pc.vssStart = 3; pc.storage = { has: true, used: 0, max: 0.1 * pc.volume.size, alloc: 0 }; return { ok: true, out: 'RP_OK' } }
    if (script.includes('Disable-ComputerRestore')) { pc.protection = 'off'; pc.points = []; pc.storage = { has: false, used: 0, max: 0, alloc: 0 }; return { ok: true, out: 'RP_OK' } }
    let m
    if ((m = /MaxSize=(\d+)%/.exec(script))) { pc.storage.max = (Number(m[1]) / 100) * pc.volume.size; return { ok: true, out: 'RP_OK' } }
    if ((m = /SequenceNumber -eq (\d+)/.exec(script)) && script.includes('Win32_ShadowCopy')) { pc.points = pc.points.filter(p => p.seq !== Number(m[1])); return { ok: true, out: 'deleted:{00000000-0000-0000-0000-000000000000}' } }
    if (script.startsWith('Restore-Computer')) return { ok: true, out: '' }
    return { ok: false, out: '', err: 'unsupported in the preview' }
  }
  const svc = Restore.create({
    runPS,
    createPoint: async (desc) => {
      await new Promise(r => setTimeout(r, 1600))
      if (!pc.admin) return { ok: false, code: 'not_admin', reason: 'Administrator rights are required', guidance: 'Restart Jylli Tool as administrator, then try again.' }
      const seq = Math.max(0, ...pc.points.map(p => p.seq)) + 1
      pc.points.push({ seq, desc, at: Date.now(), type: 12 }); pc.storage.used += 0.4 * GB
      return { ok: true, seq }
    },
    journal: { list: o => [...pc.journal].sort((a, b) => b.ts - a.ts).slice(0, (o && o.limit) || 200), markUndone: (id, by) => { const e = pc.journal.find(x => x.id === id); if (e) e.undoneBy = by } },
    nameOf: e => NAMES[e.tweakId] || e.tweakId || null,
    settings: { get: () => settings, patch: p => Object.assign(settings, p) },
    flagPatch: p => send.push(p),
    isGameRunning: () => false, openRstrui: async () => true,
    state: { read: () => store, write: v => { store = v } },
    // live events reach the page through serve.js's /__events queue (names are the preload `on...` methods)
    emit: (ch, p) => { const name = { 'restore2-phase': 'onRestore2Phase', 'restore2-changed': 'onRestore2Changed' }[ch]; if (name) (globalThis.__previewEvents || (globalThis.__previewEvents = [])).push({ name, data: p }) },
  })
  const R = { svc, pc, settings, ready: null }
  cache.set(state, R)
  return R
}

async function respond(name, args, ctx) {
  const state = ctx.rs || 'full'
  const R = rig(state)
  const a = (args && args[0]) || {}
  const { svc } = R
  try {
    switch (name) {
      case 'restore2Scan': if (state === 'fail') return { ok: false, error: 'scan failed' }; return await svc.scan()
      case 'restore2Cached': return svc.cached()
      case 'restore2Create': return await svc.createNow({ label: a.label })
      case 'restore2Preview': return await svc.preview({ seq: Number(a.seq) })
      case 'restore2Restore': return await svc.restore({ seq: Number(a.seq) })
      case 'restore2Delete': return await svc.remove({ seq: Number(a.seq) })
      case 'restore2Protect': return await svc.protect({ on: !!a.on })
      case 'restore2Storage': return await svc.storage({ pct: Number(a.pct) })
      case 'restore2Schedule': return svc.schedule({ days: Number(a.days) })
      case 'restore2Ack': return svc.ack()
      case 'restore2Export': return { ok: true, ...svc.exportText() }
      case 'restore2Open': return { ok: true }
      default: return undefined
    }
  } catch (e) { return { ok: false, error: String((e && e.message) || e) } }
}

module.exports = { respond, rig }
