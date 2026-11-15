'use strict'
// Devices service: scan (ONE read-only probe + the core parts from the RigSpec), the polling-rate test (listens only), the keyboard repeat setting
// (journaled, applied to the running session, READ BACK, undoable), forget a remembered device, open a vendor app.
// Every side effect comes in through `deps`, so tests drive it with fakes.
//   deps: { runPS(script, ms)->{ok,out,err}, runRecorded(control, action, meta, fn(ps,cmd,note)), undoControl(control)->{ok},
//           getRig?()->rig|null, windowsStatus?()->{windowsId: 'on'|'off'|'unknown'}, appInstalled?()->{appId: bool}, resolveApp?(appId)->path|null, openPath?(path)->Promise,
//           state:{read(),write(obj)}, emit?(channel, payload), now?, platform? }
const detect = require('./detect')
const classify = require('./classify')
const model = require('./model')
const findings = require('./findings')
const controls = require('./controls')
const polling = require('./polling')
const pollscript = require('./pollscript')
const vendors = require('./vendors')

const SCAN_TTL = 15 * 1000
const PROBE_MS = 40 * 1000

function create(deps) {
  const now = deps.now || Date.now
  const platform = deps.platform || process.platform
  const supported = () => platform === 'win32'
  const unsupported = () => ({ ok: false, error: 'unsupported_platform' })
  const load = () => { try { return Object.assign({ devices: {}, polls: {} }, deps.state.read() || {}) } catch { return { devices: {}, polls: {} } } }
  const save = s => { try { deps.state.write(s) } catch { /* best effort */ } }
  const runPS = async (script, ms) => { try { return (await deps.runPS(script, ms)) || { ok: false, out: '' } } catch (e) { return { ok: false, out: '', err: String(e && e.message || e) } } }
  const safe = async (fn, dflt) => { try { const v = fn ? await fn() : dflt; return v === undefined ? dflt : v } catch { return dflt } }

  let busy = null, last = null, lastAt = 0, records = []

  /** What goes to the page: no full instance ids, only the masked ones the model already carries. */
  function publish(snap, ctx) {
    const withControls = d => Object.assign({}, d, { controls: controls.forDevice(d, ctx) })
    const strip = d => { const x = withControls(d); delete x.instanceIds; return x }
    return Object.assign({}, snap, { devices: snap.devices.map(strip), software: snap.software.map(d => { const x = Object.assign({}, d); delete x.instanceIds; return x }), findings: findings.compute(snap), kbd: ctx.kbd })
  }

  async function readKbd() { const r = await runPS(controls.kbdReadScript(), 8000); return r.out ? controls.kbdParse(r.out) : null }

  async function scan(opts) {
    if (!supported()) return unsupported()
    const force = !!(opts && opts.force)
    if (!force && last && now() - lastAt < SCAN_TTL) return { ok: true, snap: last }
    if (busy) return busy
    busy = (async () => {
      try {
        const [raw, rig, windows, appInstalled, kbd] = await Promise.all([
          runPS(detect.buildScript(), PROBE_MS),
          safe(deps.getRig, null),
          safe(deps.windowsStatus, {}),
          safe(deps.appInstalled, {}),
          readKbd(),
        ])
        const probe = raw.out ? detect.parse(raw.out) : null
        const st = load()
        let recs = []
        if (probe) recs = classify.classify(probe).devices
        records = recs
        const snap0 = model.build({ probe, records: recs, rig, state: st, now: now() })
        if (probe && probe.sec.pnp && probe.sec.pnp.ok) save(model.remember(st, snap0.devices.concat(snap0.software), now()))
        const snap = publish(snap0, { windows, appInstalled, kbd })
        snap.error = probe ? '' : 'probe_failed'
        last = snap; lastAt = now()
        return { ok: true, snap }
      } catch (e) { return { ok: false, error: String(e && e.message || e).slice(0, 200) } }
      finally { busy = null }
    })()
    return busy
  }

  // ── polling-rate test: listens only ─────────────────────────────────────────────────────────────────────────────────────
  let polling_ = false
  async function pollTest(opts) {
    if (!supported()) return unsupported()
    if (polling_) return { ok: false, error: 'busy' }
    polling_ = true
    try {
      if (!records.length) await scan({ force: true })
      const seconds = Math.max(2, Math.min(10, Math.round(Number(opts && opts.seconds) || 4)))
      const r = await runPS(pollscript.buildScript(seconds), (seconds + 25) * 1000)
      const p = r.out ? polling.parse(r.out) : null
      if (!p) return { ok: false, error: 'helper_failed' }
      if (!p.ok) return { ok: false, error: p.error || 'helper_failed' }
      const st = load()
      const results = []
      const unmatched = []
      for (const d of p.devices) {
        const rec = records.find(x => (x.instanceIds || []).some(i => i.toUpperCase() === d.instance || classify.maskId(i).toUpperCase() === classify.maskId(d.instance)))
        const est = polling.estimate(d.bins)
        if (!rec) { unmatched.push({ events: d.events }); continue }
        const prev = results.find(x => x.id === rec.id)
        if (prev) { prev.events += d.events; if (est.ok && (!prev.estimate.ok || est.events > prev.estimate.events)) prev.estimate = est; continue }  // several interfaces of one mouse: keep the best
        results.push({ id: rec.id, title: rec.hidProd || rec.bus || rec.friendly, events: d.events, estimate: est })
      }
      for (const x of results) if (x.estimate.ok) st.polls[x.id] = { hz: x.estimate.hz, rawHz: x.estimate.rawHz, confidence: x.estimate.confidence, snapped: x.estimate.snapped, at: now() }
      save(st)
      last = null
      return { ok: true, seconds, results, synthetic: p.synthetic, unmatched: unmatched.length }
    } finally { polling_ = false }
  }

  // ── keyboard repeat delay / rate: Windows setting, journaled ────────────────────────────────────────────────────────
  async function kbdSet(req) {
    if (!supported()) return unsupported()
    // null / '' / undefined must not become 0 (Number(null) is 0, which is a valid repeat value and would be written).
    const n = v => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') ? Number(v) : NaN)
    const delay = n(req && req.delay), speed = n(req && req.speed)
    if (!controls.kbdValid(delay, speed)) return { ok: false, error: 'invalid_value' }
    const before = await readKbd()
    if (!before) return { ok: false, error: 'unreadable' }
    let failed = null
    try {
      await deps.runRecorded('devices:kbd-repeat', 'apply', { via: 'manual', onFailures: f => { failed = f } }, async (ps, cmd) => { for (const c of controls.kbdCommands(delay, speed)) await cmd(c) })
    } catch (e) { return { ok: false, error: String(e && e.message || e).slice(0, 200) } }
    const after = await readKbd()
    const verified = !!after && after.delay === delay && after.speed === speed
    if (verified) await runPS(controls.kbdLiveScript(delay, speed), 8000)
    last = null
    if (!verified) return { ok: false, error: 'verify_failed', before, after, failed }
    return { ok: true, before, after }
  }
  async function kbdUndo() {
    if (!supported()) return unsupported()
    const u = await deps.undoControl('devices:kbd-repeat')
    const after = await readKbd()
    if (after && controls.kbdValid(after.delay, after.speed)) await runPS(controls.kbdLiveScript(after.delay, after.speed), 8000)
    last = null
    return { ok: !!(u && u.ok), found: u ? u.found : 0, after }
  }

  function forget(req) {
    const id = String(req && req.id || '')
    const st = load()
    if (!st.devices[id] && !st.polls[id]) return { ok: false, error: 'unknown_device' }
    delete st.devices[id]; delete st.polls[id]
    save(st); last = null
    return { ok: true }
  }

  async function openApp(req) {
    if (!supported()) return unsupported()
    const id = String(req && req.id || '')
    if (!Object.values(vendors.VENDORS).some(v => v.app === id)) return { ok: false, error: 'unknown_app' }
    const p = await safe(() => deps.resolveApp && deps.resolveApp(id), null)
    if (!p) return { ok: false, error: 'not_installed' }
    try { const err = deps.openPath ? await deps.openPath(p) : ''; return err ? { ok: false, error: 'open_failed' } : { ok: true } } catch { return { ok: false, error: 'open_failed' } }
  }

  return { scan, pollTest, kbdSet, kbdUndo, forget, openApp, last: () => last }
}

module.exports = { create }
