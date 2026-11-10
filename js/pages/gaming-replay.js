'use strict'
// Gaming > Replay: recorded game sessions (frame bins from PresentMon + 1 Hz telemetry) with a scrubbable timeline, the twin
// replaying heat and fan data from the recording, and rule-based advice that always shows its evidence. Series that were not
// recorded are not offered; nothing is interpolated or filled in.
const REPLAY_SERIES = [
  ['gpu0.load', 'sensorKey_gpu0.load', '%'], ['cpu.load', 'sensorKey_cpu.load', '%'],
  ['gpu0.temp.core', 'sensorKey_gpu0.temp.core', '°C'], ['gpu0.power', 'sensorKey_gpu0.power', 'W'],
]
const REPLAY = { session: null, t: 0, series: new Set(['gpu0.load']) }

// Pure: totals for the hero from the session list (unit-tested)
function replaySummary(list) {
  const n = list.length
  const sec = list.reduce((a, s) => a + (Number(s.durationSec) || 0), 0)
  const games = new Set(list.map(s => s.game && s.game.name).filter(Boolean)).size
  const best = list.reduce((m, s) => Math.max(m, Number(s.summary && s.summary.avgFps) || 0), 0)
  return { n, minutes: Math.round(sec / 60), games, bestAvg: best || null }
}

async function buildReplay(c) {
  const { html } = ui
  const T = (k, v) => tG('repHero', k, v)
  c.innerHTML = String(html`
    <div class="tk-hero" id="rep-hero-host"></div>
    <div class="tk-md-host"><div class="tk-md">
      <div class="tk-md-list" id="replay-list-wrap">${ui.card({ title: tUI('replayTitle'), sub: tUI('replaySub'), body: html`<div id="replay-list">${ui.empty({ icon: 'film', title: tUI('replayLoading') })}</div>` })}</div>
      <div class="tk-md-detail" id="replay-detail"></div>
    </div></div>`)
  const hero = JylliHero.mount(c.querySelector('#rep-hero-host'), {
    id: 'replay-hero', eyebrow: '', title: tUI('replayTitle'), lead: tUI('replaySub'), dial: { label: T('dial'), unit: '' },
    stats: [{ k: 'games', label: T('statGames') }, { k: 'time', label: T('statTime') }, { k: 'best', label: T('statBest') }],
  })
  hero.scanning(true)
  hero.update({ value: '–', tone: 'idle', eyebrow: tUI('replayLoading') })
  registerPageCleanup('replay', () => hero.destroy())

  let list = null
  try { list = await api.listSessions() } catch { list = null }
  const box = document.getElementById('replay-list')
  if (!box) return
  hero.scanning(false)
  // a failed read is an error with Retry, never "no recordings"
  if (!Array.isArray(list)) {
    hero.update({ value: '–', tone: 'idle', eyebrow: T('failed'), lead: T('failedLead') })
    box.innerHTML = String(ui.error({ title: T('failed'), sub: T('failedLead'), action: ui.button({ label: tG('tab', 'retry'), variant: 'secondary', onclick: "showPage('replay')" }) }))
    return
  }
  const sum = replaySummary(list)
  if (!list.length) {
    hero.update({ value: '0', tone: 'idle', eyebrow: T('none'), lead: tUI('replayEmpty'), stats: { games: '–', time: '–', best: '–' } })
    box.innerHTML = String(ui.empty({ icon: 'film', title: tUI('replayEmpty') }))
    return
  }
  hero.update({
    value: String(sum.n), tone: 'accent', eyebrow: T('latest', { game: (list[0].game && list[0].game.name) || '?', when: new Date(list[0].startedAt).toLocaleDateString() }),
    stats: { games: sum.games, time: sum.minutes >= 90 ? (sum.minutes / 60).toFixed(1) + ' h' : sum.minutes + ' min', best: sum.bestAvg ? sum.bestAvg + ' FPS' : '–' },
  })
  box.innerHTML = String(list.map(s => ui.row({
    id: 'rp-s-' + String(s.id).replace(/[^0-9a-f]/g, ''),
    title: html`${s.game && s.game.name || '?'} <span class="j-muted j-num">${Math.round(s.durationSec / 60)} min</span>`,
    sub: html`<span class="j-num">${new Date(s.startedAt).toLocaleString()} · ${s.summary.avgFps} FPS · <span title="${tUI('fpsLowTip')}">${tUI('replayLow1')} ${s.summary.low1Fps ?? '—'}</span></span>`,
    control: ui.button({ label: tUI('replayOpen'), size: 'sm', onclick: `replayOpen('${String(s.id).replace(/[^0-9a-f]/g, '')}')` }),
  })).join(''))
}

async function replayOpen(id) {
  const r = await api.getSession(id).catch(() => null)
  const el = document.getElementById('replay-detail')
  if (!el) return
  if (!r || !r.ok) { toast(tG('repHero', 'failed'), tG('repHero', 'openFailed'), 'err'); return }
  document.querySelectorAll('#replay-list .j-row').forEach(x => x.classList.toggle('tk-active', x.id === 'rp-s-' + id))
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
      ${(() => { const r = window.JylliShareCard && JylliShareCard.recap(s); return r ? html`<p class="j-muted" id="replay-recap">${tUIf('replayRecapDip', { fps: r.dip.fps, t: JylliShareCard.clock(r.dip.at) })} · ${tUIf('replayRecapSteady', { pct: r.steadyPct })}</p>` : '' })()}
      ${have.length ? html`<div class="j-twin-stage j-replay-stage"><div class="j-twin-slot" id="replay-twin-slot" data-twin-view="rig:home"></div></div>` : ''}
      <canvas id="replay-canvas" class="j-replay-canvas" width="900" height="200" role="img" aria-label="${tUI('replayChartAria')}"></canvas>
      <input type="range" id="replay-scrub" min="0" max="${Math.max(0, s.bins.length - 1)}" value="0" step="1" aria-label="${tUI('replayScrub')}" class="j-replay-scrub">
      <div id="replay-readout" class="j-muted j-num" aria-live="polite"></div>
      ${ui.button({ label: tUI('shareCard'), icon: 'image', size: 'sm', onclick: 'replayShareCard()' })}
      <div class="j-home-chips" id="replay-series">${have.length ? have.map(([k, label]) => html`<label class="j-check"><input type="checkbox" data-rs="${k}" ${REPLAY.series.has(k) ? 'checked' : ''}> ${tUI(label)}</label>`) : html`<span class="j-muted">${tUI('replayNoSensors')}</span>`}</div>
      <div class="j-stat-label j-home-label">${tUI('replayAdvice')}</div>
      <div id="replay-advice">${r.advice.length ? r.advice.map(a => ui.callout(tUI('replayAdvice_' + a.id).replace(/\{(\w+)\}/g, (m, k) => a.evidence[k] ?? m), a.severity === 'warn' ? 'warn' : 'info')).join('') : html`<span class="j-muted">${tUI('replayAdviceNone')}</span>`}</div>`,
  }))
  el.querySelectorAll('[data-rs]').forEach(cb => { cb.onchange = () => { cb.checked ? REPLAY.series.add(cb.dataset.rs) : REPLAY.series.delete(cb.dataset.rs); replayDraw() } })
  const sc = el.querySelector('#replay-scrub')
  sc.oninput = () => { REPLAY.t = Number(sc.value); replayDraw() }
  const tw = el.querySelector('#replay-twin-slot'); if (tw && window.JylliTwin) JylliTwin.attach(tw)
  replayDraw()
  if (el.getBoundingClientRect().top > window.innerHeight * 0.6) el.scrollIntoView({ behavior: 'smooth', block: 'start' })   // stacked layout only; beside the list it is already in view
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
function replayShareCard() {
  if (!REPLAY.session || !window.JylliShareCard) return
  const rig = window.JylliTwin && JylliTwin.rig ? { gpu: ((JylliTwin.rig.gpus || [])[0] || {}).name, cpu: (JylliTwin.rig.cpu || {}).name } : null
  JylliShareCard.save(REPLAY.session, rig)
}
function replayClose() { try { JylliTelemetry.setOverride(null) } catch {} }

if (typeof module !== 'undefined' && module.exports) module.exports = { replaySummary }
