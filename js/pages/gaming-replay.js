'use strict'
// Gaming > Replay: recorded game sessions (frame bins from PresentMon + 1 Hz telemetry) with a scrubbable timeline, the twin
// replaying heat and fan data from the recording, and rule-based advice that always shows its evidence. Series that were not
// recorded are not offered; nothing is interpolated or filled in.
const REPLAY_SERIES = [
  ['gpu0.load', 'sensorKey_gpu0.load', '%'], ['cpu.load', 'sensorKey_cpu.load', '%'],
  ['gpu0.temp.core', 'sensorKey_gpu0.temp.core', '°C'], ['gpu0.power', 'sensorKey_gpu0.power', 'W'],
]
const REPLAY = { session: null, t: 0, series: new Set(['gpu0.load']) }

async function buildReplay(c) {
  const { html } = ui
  c.innerHTML = String(html`
    ${ui.card({ title: tUI('replayTitle'), sub: tUI('replaySub'), body: html`<div id="replay-list">${ui.empty({ icon: 'film', title: tUI('replayLoading') })}</div>` })}
    <div id="replay-detail"></div>`)
  let list = []
  try { list = await api.listSessions() } catch {}
  if (!Array.isArray(list)) list = []
  const box = document.getElementById('replay-list')
  if (!box) return
  if (!list.length) { box.innerHTML = String(ui.empty({ icon: 'film', title: tUI('replayEmpty') })); return }
  box.innerHTML = String(list.map(s => ui.row({
    title: html`${s.game && s.game.name || '?'} <span class="j-muted j-num">${Math.round(s.durationSec / 60)} min</span>`,
    sub: html`<span class="j-num">${new Date(s.startedAt).toLocaleString()} · ${s.summary.avgFps} FPS · <span title="${tUI('fpsLowTip')}">${tUI('replayLow1')} ${s.summary.low1Fps ?? '—'}</span></span>`,
    control: ui.button({ label: tUI('replayOpen'), size: 'sm', onclick: `replayOpen('${String(s.id).replace(/[^0-9a-f]/g, '')}')` }),
  })).join(''))
}

async function replayOpen(id) {
  const r = await api.getSession(id)
  const el = document.getElementById('replay-detail')
  if (!el || !r || !r.ok) return
  const s = r.session
  REPLAY.session = s; REPLAY.t = 0
  REPLAY.series = new Set(REPLAY_SERIES.filter(([k]) => s.series[k] && s.series[k].some(v => v != null)).map(x => x[0]).slice(0, 1))
  const have = REPLAY_SERIES.filter(([k]) => s.series[k] && s.series[k].some(v => v != null))
  const { html } = ui
  const sm = s.summary
  el.innerHTML = String(ui.card({
    title: html`${s.game.name} <span class="j-muted j-num">${new Date(s.startedAt).toLocaleString()}</span>`,
    body: html`
      <div class="j-home-chips">
        ${ui.badge(tUI('replayAvg') + ' ' + sm.avgFps + ' FPS')}
        ${html`<span class="j-badge" title="${tUI('fpsLowTip')}">${tUI('replayLow1')} ${sm.low1Fps ?? '—'} FPS</span>`}
        ${html`<span class="j-badge" title="${tUI('fpsLowTip')}">${tUI('replayLow01')} ${sm.low01Fps ?? '—'} FPS</span>`}
        ${ui.badge(Math.round(s.durationSec / 60) + ' min')}
      </div>
      ${have.length ? html`<div class="j-twin-stage j-replay-stage"><div class="j-twin-slot" id="replay-twin-slot" data-twin-view="rig:home"></div></div>` : ''}
      <canvas id="replay-canvas" class="j-replay-canvas" width="900" height="200" role="img" aria-label="${tUI('replayChartAria')}"></canvas>
      <input type="range" id="replay-scrub" min="0" max="${Math.max(0, s.bins.length - 1)}" value="0" step="1" aria-label="${tUI('replayScrub')}" class="j-replay-scrub">
      <div id="replay-readout" class="j-muted j-num" aria-live="polite"></div>
      <div class="j-home-chips" id="replay-series">${have.length ? have.map(([k, label]) => html`<label class="j-check"><input type="checkbox" data-rs="${k}" ${REPLAY.series.has(k) ? 'checked' : ''}> ${tUI(label)}</label>`) : html`<span class="j-muted">${tUI('replayNoSensors')}</span>`}</div>
      <div class="j-stat-label j-home-label">${tUI('replayAdvice')}</div>
      <div id="replay-advice">${r.advice.length ? r.advice.map(a => ui.callout(tUI('replayAdvice_' + a.id).replace(/\{(\w+)\}/g, (m, k) => a.evidence[k] ?? m), a.severity === 'warn' ? 'warn' : 'info')).join('') : html`<span class="j-muted">${tUI('replayAdviceNone')}</span>`}</div>`,
  }))
  el.querySelectorAll('[data-rs]').forEach(cb => { cb.onchange = () => { cb.checked ? REPLAY.series.add(cb.dataset.rs) : REPLAY.series.delete(cb.dataset.rs); replayDraw() } })
  const sc = el.querySelector('#replay-scrub')
  sc.oninput = () => { REPLAY.t = Number(sc.value); replayDraw() }
  const tw = el.querySelector('#replay-twin-slot'); if (tw && window.JylliTwin) JylliTwin.attach(tw)
  replayDraw()
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function replayValueAt(s, key, t) { const a = s.series[key]; return a && t < a.length ? a[t] : null }

function replayDraw() {
  const s = REPLAY.session, cv = document.getElementById('replay-canvas')
  if (!s || !cv) return
  const ctx = cv.getContext('2d'), W = cv.width, H = cv.height
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim()
  ctx.clearRect(0, 0, W, H)
  const fps = s.bins.map(b => b.fps), max = Math.max(60, ...fps.filter(v => v != null)) * 1.1
  const x = i => (i / Math.max(1, s.bins.length - 1)) * (W - 8) + 4, y = v => H - 10 - (v / max) * (H - 20)
  ctx.strokeStyle = css('--hairline-strong') || 'rgba(255,255,255,.12)'; ctx.lineWidth = 1
  for (const g of [30, 60, 90, 120, 144, 240]) { if (g > max) break; ctx.beginPath(); ctx.moveTo(0, y(g)); ctx.lineTo(W, y(g)); ctx.stroke() }
  ctx.strokeStyle = css('--c-accent') || 'rgb(139,124,246)'; ctx.lineWidth = 2; ctx.beginPath()
  let pen = false
  fps.forEach((v, i) => { if (v == null) { pen = false; return } pen ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)); pen = true })
  ctx.stroke()
  const colors = { 'gpu0.load': '--c-info', 'cpu.load': '--c-success', 'gpu0.temp.core': '--c-danger', 'gpu0.power': '--c-warning' }
  for (const [k, , unit] of REPLAY_SERIES) {
    if (!REPLAY.series.has(k)) continue
    const a = s.series[k], hi = unit === '%' ? 100 : unit === '°C' ? 100 : Math.max(1, ...a.filter(v => v != null))
    ctx.strokeStyle = css(colors[k]) || 'rgb(200,200,200)'; ctx.lineWidth = 1.2; ctx.beginPath(); pen = false
    a.forEach((v, i) => { if (v == null) { pen = false; return } const yy = H - 10 - (v / hi) * (H - 20); pen ? ctx.lineTo(x(i), yy) : ctx.moveTo(x(i), yy); pen = true })
    ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.moveTo(x(REPLAY.t), 0); ctx.lineTo(x(REPLAY.t), H); ctx.stroke()
  const b = s.bins[REPLAY.t] || {}
  const parts = [`${Math.floor(REPLAY.t / 60)}:${String(REPLAY.t % 60).padStart(2, '0')}`, b.fps != null ? `${b.fps} FPS` : `FPS ${tUI('metricNA')}`]
  for (const [k, label, unit] of REPLAY_SERIES) { if (!REPLAY.series.has(k)) continue; const v = replayValueAt(s, k, REPLAY.t); parts.push(`${tUI(label)} ${v == null ? tUI('metricNA') : v + ' ' + unit}`) }
  const ro = document.getElementById('replay-readout'); if (ro) ro.textContent = parts.join(' · ')
  // The twin replays the recording: same visual rules as live, fed from the recorded values (null stays null).
  if (window.JylliTelemetry) {
    const snap = { v: 1, seq: 1000000 + REPLAY.t, t: Date.now(), s: {} }
    for (const key of Object.keys(s.series)) { const v = replayValueAt(s, key, REPLAY.t); snap.s[key] = [v, 0, 'replay'] }
    JylliTelemetry.setOverride(snap)
  }
}
function replayClose() { try { JylliTelemetry.setOverride(null) } catch {} }
