'use strict'
// Chronoline (4.0): a thin glass timeline with three tracks drawn from what the app really recorded: changes (the journal),
// game sessions (the session recorder) and CPU load (the metrics history, one sample a minute). Drag the playhead and the twin
// replays that moment through JylliTelemetry.setOverride, using only the recorded values: load and memory. Temperatures were
// never recorded, so the rig shows no heat while replaying, and gaps stay gaps. The pure parts are unit-tested.
;(function (root) {
  const DAY = 864e5
  const GAP_MS = 5 * 60e3   // a sample further than this from the playhead is a gap, not a value

  /** Visible window: at least 6 h, at most 7 days, ending now and reaching back to the oldest thing recorded. */
  function span(now, oldestTs) {
    const want = oldestTs ? now - oldestTs + 30 * 60e3 : 6 * 3600e3
    return Math.max(6 * 3600e3, Math.min(7 * DAY, want))
  }
  /** ts -> 0..100 (percent along the track) */
  const pct = (ts, from, to) => Math.max(0, Math.min(100, ((ts - from) / Math.max(1, to - from)) * 100))
  /** Nearest recorded sample within GAP_MS of ts, or null. samples: [{ts, cpu, ram}] ascending. */
  function sampleAt(samples, ts) {
    let best = null, bd = Infinity
    for (const s of samples || []) { const d = Math.abs(s.ts - ts); if (d < bd) { bd = d; best = s } }
    return best && bd <= GAP_MS ? best : null
  }
  /** Telemetry-shaped snapshot of a recorded sample (only what was recorded), or null for a gap. */
  function snapshotFor(sample, seq) {
    if (!sample) return null
    const s = {}
    if (Number.isFinite(sample.cpu)) s['cpu.load'] = [sample.cpu, 0, 'history']
    if (Number.isFinite(sample.ram)) s['ram.load'] = [sample.ram, 0, 'history']
    return { v: 1, seq, t: sample.ts, s }
  }
  /** Journal entries (newest first) -> one mark per batch: [{ key, ts, ids[], via, batchId, n }] ascending by time. */
  function marks(entries) {
    const m = new Map()
    for (const e of entries || []) {
      const key = e.batchId || 'single:' + e.id
      if (!m.has(key)) m.set(key, { key, ts: e.ts, ids: [], via: e.via, batchId: e.batchId || null, entryId: e.id, n: 0 })
      const g = m.get(key); g.ids.push(e.id); g.n++; g.ts = Math.max(g.ts, e.ts)
    }
    return [...m.values()].sort((a, b) => a.ts - b.ts)
  }

  const api = { span, pct, sampleAt, snapshotFor, marks, GAP_MS }
  root.JylliChronoPure = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  // ── runtime ──────────────────────────────────────────────────────────────────────
  const esc = s => (typeof escHtml === 'function' ? escHtml(s) : String(s))
  const T = (k, v) => (typeof tUIf === 'function' && v ? tUIf(k, v) : tUI(k))
  const fmtTime = ts => new Date(ts).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
  let box, track, data = { marks: [], sessions: [], samples: [], from: 0, to: 0 }, replayTs = null, seq = 0, touched = false, closeT = 0, newKey = null

  function build() {
    if (box) return
    box = document.createElement('section'); box.id = 'jx-chrono'; box.setAttribute('role', 'region')
    box.innerHTML = `<div class="jx-ch-head"><b data-t="chronoTitle"></b><span class="j-muted" id="jx-ch-legend"></span><span class="j-grow"></span><span id="jx-ch-state" class="j-muted"></span><button type="button" class="j-btn j-btn-sm" id="jx-ch-now"></button><button type="button" class="j-btn j-btn-ghost j-btn-sm j-btn-icon" id="jx-ch-close"><i class="fa fa-chevron-down" aria-hidden="true"></i></button></div><div id="jx-ch-track" tabindex="0"></div>`
    const tab = document.createElement('button'); tab.type = 'button'; tab.id = 'jx-chrono-tab'; tab.className = 'j-btn j-btn-sm'
    tab.innerHTML = '<i class="fa fa-clock-rotate-left" aria-hidden="true"></i> <span data-t="chronoTitle"></span>'
    const pop = document.createElement('div'); pop.id = 'jx-ch-pop'; pop.setAttribute('role', 'dialog')
    document.body.append(box, tab, pop)
    track = box.querySelector('#jx-ch-track')
    tab.onclick = () => open(true)
    box.querySelector('#jx-ch-close').onclick = () => close()
    box.querySelector('#jx-ch-now').onclick = () => setReplay(null)
    wireScrub()
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && box.classList.contains('open')) { if (pop.classList.contains('show')) pop.classList.remove('show'); else close() } })
    labels()
  }
  function labels() {
    if (!box) return
    document.querySelectorAll('#jx-chrono [data-t], #jx-chrono-tab [data-t]').forEach(el => { el.textContent = tUI(el.dataset.t) })
    box.querySelector('#jx-ch-now').textContent = tUI('chronoNow')
    box.querySelector('#jx-ch-close').setAttribute('aria-label', tUI('close'))
    box.querySelector('#jx-ch-legend').textContent = `${tUI('chronoChanges')} · ${tUI('chronoSessions')} · ${tUI('chronoLoad')}`
    track.setAttribute('aria-label', tUI('chronoAria'))
  }

  async function load() {
    const [entries, sessions, samples] = await Promise.all([
      root.api.journalList({ limit: 400 }).catch(() => []), root.api.listSessions().catch(() => []), root.api.getMetricsHistory({ hours: 168 }).catch(() => []),
    ])
    const now = Date.now()
    const ms = marks(entries || []), ss = (sessions || []).filter(s => s && s.startedAt)
    const times = [...ms.map(m => m.ts), ...ss.map(s => +new Date(s.startedAt)), ...(samples || []).slice(0, 1).map(s => s.ts)].filter(Number.isFinite)
    const oldest = times.length ? Math.min(...times) : null
    data = { marks: ms, sessions: ss, samples: samples || [], from: now - span(now, oldest), to: now }
  }

  function draw() {
    if (!track) return
    const { from, to } = data
    const spark = data.samples.filter(s => s.ts >= from && Number.isFinite(s.cpu))
    const pts = spark.map(s => `${(pct(s.ts, from, to) * 10).toFixed(1)},${(46 - Math.min(100, s.cpu) / 100 * 40).toFixed(1)}`).join(' ')
    const days = []
    for (let d = new Date(to); d.getTime() > from; d = new Date(d.getTime() - DAY)) { const m = new Date(d); m.setHours(0, 0, 0, 0); if (m.getTime() > from) days.push(m.getTime()) }
    const empty = !data.marks.length && !data.sessions.length && !spark.length
    track.innerHTML = `<svg viewBox="0 0 1000 50" preserveAspectRatio="none" aria-hidden="true">${pts ? `<defs><linearGradient id="jx-cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4C9EFF" stop-opacity=".32"/><stop offset="1" stop-color="#4C9EFF" stop-opacity="0"/></linearGradient></defs><polyline points="${pts.split(' ')[0].split(',')[0]},50 ${pts} ${pts.split(' ').pop().split(',')[0]},50" fill="url(#jx-cg)"/><polyline points="${pts}" fill="none" stroke="#4C9EFF" stroke-width="1.4" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>` : ''}</svg>`
      + data.sessions.map(s => { const a = +new Date(s.startedAt), b = a + (s.durationSec || 60) * 1000; return b >= from ? `<button type="button" class="jx-ch-sess" data-sess="${esc(s.id)}" style="left:${pct(a, from, to)}%;width:${Math.max(0.5, pct(b, from, to) - pct(a, from, to))}%" aria-label="${esc(s.game || '')}" title="${esc((s.game || '') + ' · ' + fmtTime(a))}"></button>` : '' }).join('')
      + data.marks.map(m => `<button type="button" class="jx-ch-mark${m.key === newKey ? ' new' : ''}" data-mark="${esc(m.key)}" style="left:${pct(m.ts, from, to)}%" aria-label="${esc(markLabel(m))}" title="${esc(markLabel(m) + ' · ' + fmtTime(m.ts))}"></button>`).join('')
      + days.map(t => `<span class="jx-ch-day" style="left:${pct(t, from, to)}%">${new Date(t).toLocaleDateString(undefined, { weekday: 'short' })}</span>`).join('')
      + (empty ? `<div class="j-muted" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">${esc(tUI('chronoEmpty'))}</div>` : '')
      + `<div id="jx-ch-head" style="left:${replayTs == null ? 100 : pct(replayTs, from, to)}%" data-t="${esc(replayTs == null ? tUI('chronoNow') : fmtTime(replayTs))}"></div>`
    track.querySelectorAll('[data-mark]').forEach(b => { b.onpointerdown = e => e.stopPropagation(); b.onclick = e => { e.stopPropagation(); popMark(data.marks.find(m => m.key === b.dataset.mark), b) } })
    track.querySelectorAll('[data-sess]').forEach(b => { b.onpointerdown = e => e.stopPropagation(); b.onclick = e => { e.stopPropagation(); close(); if (typeof showPage === 'function') showPage('replay') } })
    newKey = null
  }
  const markLabel = m => { const names = m.ids.map(id => (typeof tName === 'function' && tName(id)) || id); return m.n === 1 ? names[0] : T('chronoBatch', { n: m.n }) }

  function popMark(m, anchor) {
    if (!m) return
    const pop = document.getElementById('jx-ch-pop'), r = anchor.getBoundingClientRect()
    const via = tUI('journalVia_' + (m.via || 'manual'))
    pop.innerHTML = `<b>${esc(markLabel(m))}</b><div class="j-muted">${esc(fmtTime(m.ts))} · ${esc(via)}</div>
      <div class="j-hstack" style="margin-top:10px"><button type="button" class="j-btn j-btn-sm" id="jx-pop-hist">${esc(tUI('chronoOpenHistory'))}</button>${m.batchId || m.entryId ? `<button type="button" class="j-btn j-btn-sm" id="jx-pop-undo">${esc(tUI('chronoUndo'))}</button>` : ''}</div>`
    pop.classList.add('show')
    pop.style.left = Math.max(8, Math.min(innerWidth - 262, r.left - 125)) + 'px'; pop.style.top = (r.top - pop.offsetHeight - 14) + 'px'
    if (root.JylliWorld) { const parts = JylliWorld.partsFor(m.ids); JylliWorld.pulseTo(anchor, parts) }
    pop.querySelector('#jx-pop-hist').onclick = () => { pop.classList.remove('show'); close(); if (typeof showPage === 'function') showPage('changelog', 'history') }
    const u = pop.querySelector('#jx-pop-undo')
    if (u) u.onclick = async () => {
      pop.classList.remove('show')
      const target = m.batchId ? { batchId: m.batchId } : { entryId: m.entryId }
      let res = null; try { res = await root.api.journalUndo({ target }) } catch {}
      if (typeof toast === 'function') toast(res && res.ok !== false ? tUI('chronoUndone') : tUI('chronoUndoFailed'), '', res && res.ok !== false ? 'ok' : 'warn')
      await refresh()
    }
  }

  function setReplay(ts) {
    replayTs = ts
    const snap = ts == null ? null : snapshotFor(sampleAt(data.samples, ts), ++seq)
    try { JylliTelemetry.setOverride(ts != null && !snap ? { v: 1, seq: ++seq, t: ts, s: {} } : snap) } catch {}   // a gap shows "not available", never a made-up value
    document.body.classList.toggle('jx-replay', ts != null)
    const head = document.getElementById('jx-ch-head')
    if (head) { head.style.left = (ts == null ? 100 : pct(ts, data.from, data.to)) + '%'; head.dataset.t = ts == null ? tUI('chronoNow') : fmtTime(ts) }
    const st = document.getElementById('jx-ch-state'); if (st) st.textContent = ts == null ? '' : (snap ? T('chronoReplaying', { t: fmtTime(ts) }) : tUI('chronoGap'))
  }
  function wireScrub() {
    let down = false
    const at = e => { const r = track.getBoundingClientRect(), f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); touched = true; setReplay(f > 0.985 ? null : data.from + f * (data.to - data.from)) }
    track.addEventListener('pointerdown', e => { down = true; try { track.setPointerCapture(e.pointerId) } catch {} document.getElementById('jx-ch-pop').classList.remove('show'); at(e) })
    track.addEventListener('pointermove', e => { if (down) at(e) })
    track.addEventListener('pointerup', () => { down = false })
    track.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault(); touched = true
      const step = (data.to - data.from) / 100 * (e.shiftKey ? 5 : 1), cur = replayTs == null ? data.to : replayTs
      const next = cur + (e.key === 'ArrowLeft' ? -step : step)
      setReplay(next >= data.to - step / 2 ? null : Math.max(data.from, next))
    })
  }

  async function refresh() { if (!box) return; await load(); draw() }
  async function open(user) { build(); touched = !!user; await refresh(); box.classList.add('open'); clearTimeout(closeT) }
  function close() { if (!box) return; box.classList.remove('open'); document.getElementById('jx-ch-pop').classList.remove('show'); clearTimeout(closeT); if (replayTs != null) setReplay(null) }

  /** A batch was just applied: the new mark lands on the timeline, shown for a few seconds if the user is not already using it. */
  async function noteApplied(info) {
    build(); newKey = info.batchId || null
    await open(false)
    clearTimeout(closeT); closeT = setTimeout(() => { if (!touched) close() }, 6000)
  }
  function init() { if (root.JylliWorld && root.JylliWorld.enabled()) build() }

  root.JylliChrono = { open, close, refresh, noteApplied, setReplay, labels, init, get replaying() { return replayTs != null } }
})(typeof window !== 'undefined' ? window : globalThis)
