'use strict'
// Preview fixtures for the Windows tab: the REAL lib/windows service (probe parser, model, run + verify) on a synthetic PC.
// --wn-state open (default: a few switches already set by Windows, none by Jylli) | applied (many set by Jylli, 2 put back by Windows, 1 waiting for a restart)
//            | first (Windows cannot be read, nothing remembered) | fail (apply fails, no restore point)
const fs = require('fs'), path = require('path')
const Windows = require('../../lib/windows')
const detect = require('../../lib/windows/detect')
const catalog = require('../../lib/windows/catalog')
const { entries } = require('../list-tweaks')
const { RISK } = require('../../lib/tweak-risk')

const main = fs.readFileSync(path.join(__dirname, '..', '..', 'main.js'), 'utf8')
const RETIRED = Object.fromEntries([...main.slice(main.indexOf('const RETIRED_TWEAKS = {'), main.indexOf('function retireFivemTweaks')).matchAll(/^  '([a-z0-9-]+)':\s+'((?:[^'\\]|\\.)*)'/gm)].map(m => [m[1], m[2].replace(/\\'/g, "'")]))
const TIER = Object.fromEntries(entries.map(e => [e.id, Number(e.tier) || 1]))
const HIGH = new Set(['game-dvr', 'disable-fso', 'gpu-hwsch', 'disable-mouse-accel', 'disable-background-apps', 'power-throttling', 'global-timer-resolution'])

const plan = detect.plan()
const reqs = detect.requests(plan)
const defaults = () => { const r = {}; for (const q of reqs) r[q.k] = q.a === 's' || q.a === 't' ? 'Automatic' : q.a === 'f' || q.a === 'x' ? 'True' : null; return r }
function setProbe(reg, id, on) {
  for (const c of plan[id] || []) {
    const k = detect.keyOf(c)
    if (!on) { reg[k] = c.s || c.t ? 'Automatic' : c.nofile || c.x ? 'True' : null; continue }
    reg[k] = c.s || c.t ? 'Disabled' : c.nofile || c.x ? 'False' : c.eq && typeof c.eq === 'object' ? String('ge' in c.eq ? c.eq.ge : 0) : String(c.eq)
  }
}

function build(state, now) {
  const reg = defaults(), settings = { isPremium: true }, journal = []
  const mark = (id, how) => { settings['tweak_' + id] = how }
  if (state === 'applied') {
    const on = ['game-dvr', 'disable-fso', 'disable-mouse-accel', 'sticky-keys-guard', 'disable-background-apps', 'disable-delivery-opt', 'compat-scanner-off', 'diag-tasks-off', 'win-tips', 'nudge-blocker',
      'boot-sound-off', 'search-box-local', 'search-cloud-off', 'explorer-perf', 'sysmain', 'power-throttling', 'proximity-deny', 'security-toast-off']
    for (const id of on) { setProbe(reg, id, true); mark(id, 'applied') }
    for (const id of ['telemetry', 'gpu-hwsch']) { setProbe(reg, id, false); mark(id, 'applied') }      // put back by Windows
    mark('disable-mpo', 'applied')                                                                          // applied just now, waits for a restart
    setProbe(reg, 'hibernate', true); setProbe(reg, 'mouse-pointer-1to1', true)                           // already set by Windows
    on.forEach((id, i) => journal.push({ id: 'e' + i, batchId: i < 10 ? 'b-1' : 'b-2', tweakId: id, action: 'apply', via: 'manual', ts: now - (i < 10 ? 26 : 3) * 3600000, result: 'ok', fidelity: 'exact', changes: [{ kind: 'reg' }] }))
    journal.push({ id: 'eu', batchId: 'b-3', tweakId: 'telemetry', action: 'apply', via: 'auto-opti', ts: now - 6 * 86400000, result: 'ok', fidelity: 'exact', changes: [{ kind: 'reg' }], undoneBy: 'u9' })
  } else if (state !== 'first') {
    setProbe(reg, 'disable-mouse-accel', true); setProbe(reg, 'mouse-pointer-1to1', true); setProbe(reg, 'hibernate', true); setProbe(reg, 'search-cloud-off', true)
  }
  return { reg, settings, journal }
}

const insts = new Map()
function svc(sender, ctx) {
  const key = sender.id + ':' + (ctx.wn || 'open')
  let o = insts.get(key)
  if (o) return o
  const state = ctx.wn || 'open'
  const now = Date.now(), w = build(state, now), store = { v: state === 'applied' ? { applied: { 'disable-mpo': now - 10 * 60000 } } : null }
  const clock = { t: now }
  const deps = {
    runPS: async () => (state === 'first' ? { ok: false, out: '' } : { ok: true, out: 'JJWIN:' + JSON.stringify(w.reg) }),
    applyBatch: async req => {
      if (state === 'fail') return { ok: false, aborted: true, reason: 'restore-point-failed', guidance: 'Turn on System Protection for the system drive, then try again.', restorePoint: { ok: false } }
      const items = req.items.map(i => {
        setProbe(w.reg, i.tweakId, i.action === 'apply' && !catalog.byId[i.tweakId].reboot)
        w.settings['tweak_' + i.tweakId] = i.action === 'apply' ? 'applied' : 'restored'
        w.journal.unshift({ id: 'n' + Math.random().toString(36).slice(2, 7), batchId: 'nb', tweakId: i.tweakId, action: i.action, via: 'manual', ts: Date.now(), result: 'ok', fidelity: 'exact', changes: [{ kind: 'reg' }] })
        return { id: i.tweakId, action: i.action, status: 'ok', journalId: 'j-' + i.tweakId, fidelity: 'exact' }
      })
      await new Promise(r => setTimeout(r, 700))
      return { ok: true, batchId: 'nb', items, restorePoint: { ok: true } }
    },
    journalList: () => w.journal,
    undo: async t => { for (const e of w.journal.filter(x => x.batchId === t.batchId || x.id === t.entryId)) { setProbe(w.reg, e.tweakId, false); w.settings['tweak_' + e.tweakId] = 'restored'; e.undoneBy = 'u' } return { ok: true } },
    tweakMeta: ids => ids.filter(id => TIER[id]).map(id => ({ id, safetyTier: RETIRED[id] ? 1 : TIER[id], gamerImpact: HIGH.has(id) ? 'high' : 'low', retired: RETIRED[id] || null, risk: RISK[id] || null, fidelity: 'exact' })),
    applicability: () => ({ 'gpu-hwsch': { show: true, state: 'recommended' }, 'disable-fso': { show: true, state: 'available' }, 'usb-suspend': { show: true, state: 'caution', why: 'laptop' } }),
    settings: () => w.settings, state: { read: () => store.v, write: v => { store.v = v } }, bootMs: () => clock.t - 3 * 3600000, now: () => Date.now(),
  }
  o = { svc: Windows.create(deps), w }
  insts.set(key, o)
  return o
}

async function handle(name, args, sender, ctx) {
  const o = svc(sender, ctx)
  switch (name) {
    case 'win2Scan': return o.svc.scan()
    case 'win2Cached': return o.svc.cached() || { ok: false }
    case 'win2Run': return o.svc.run({ ids: (args[0] && args[0].ids) || [], action: args[0] && args[0].action })
    case 'win2History': return o.svc.history()
    case 'win2Undo': return o.svc.undo((args[0] && args[0].target) || {}, { force: !!(args[0] && args[0].force) })
    default: return undefined
  }
}

module.exports = { handle }
