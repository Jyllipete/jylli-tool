'use strict'
// Power tab stage instruments. Two parts, both fed by the same live frames:
//   meter  the one number that matters (what the CPU and GPU draw together right now) with the last minute behind it
//   flow   Source (wall or battery) -> Active plan -> CPU and GPU, one slim row, with the current moving along the links
// Every number is a measured value with its source named; a value nobody measured prints "–" and says why. The links only move while something is
// measured and live sampling runs; their speed follows the measured watts. Nodes are buttons: each opens the view that explains it.
;(function (root) {
  const api = { mount() { return null } }
  root.JylliPowerFlow = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
  const TRACE = 60

  function mount(meterSlot, flowSlot, { T, P, esc }) {
    let facts = null, frame = null, paused = false, live = false
    const trace = []

    // ── meter ──
    const meter = el('div', 'pw-mh')
    meter.innerHTML = `<div class="pw-mh-k"><span data-f="heroK">${esc(T('meterHeroK'))}</span><span class="pw-mh-live" data-f="liveTag"></span></div>
      <div class="pw-mh-v"><b data-f="total" aria-live="off">–</b><small data-f="unit"></small></div>
      <div class="pw-mh-s" data-f="split"></div>
      <svg class="pw-area" viewBox="0 0 240 56" preserveAspectRatio="none" aria-hidden="true"><path class="pw-area-fill" data-f="area"/><path class="pw-area-line" data-f="line"/></svg>
      <p class="pw-mh-n" data-f="note"></p>`
    meterSlot.appendChild(meter)

    // ── flow ──
    const flowEl = el('div', 'pw-flow'); flowEl.dataset.flow = '0'; flowEl.setAttribute('role', 'group'); flowEl.setAttribute('aria-label', T('flowAria'))
    flowEl.innerHTML = `
      <button type="button" class="pw-node" data-node="src" data-go="energy"><span class="pw-n-k"><i class="fa fa-plug" aria-hidden="true"></i><span data-f="src-k"></span></span><span class="pw-n-v"><b data-f="src-v">–</b><small data-f="src-u"></small></span><span class="pw-n-s" data-f="src-s"></span></button>
      <div class="pw-link" data-link="a" aria-hidden="true"><i></i></div>
      <button type="button" class="pw-node pw-gov" data-node="gov" data-go="plans"><span class="pw-n-k"><i class="fa fa-layer-group" aria-hidden="true"></i><span>${esc(T('govK'))}</span></span><span class="pw-n-v"><b class="pw-gov-name" data-f="gov-v">–</b></span><span class="pw-n-s" data-f="gov-s"></span></button>
      <div class="pw-link" data-link="b" aria-hidden="true"><i></i></div>
      <button type="button" class="pw-node" data-node="cpu" data-go="energy"><span class="pw-n-k"><i class="fa fa-microchip" aria-hidden="true"></i><span>${esc(T('cpuK'))}</span></span><span class="pw-n-v"><b data-f="cpu-v">–</b><small>W</small></span><span class="pw-n-s" data-f="cpu-s"></span><span class="pw-bar"><i data-f="cpu-b"></i></span></button>
      <button type="button" class="pw-node" data-node="gpu" data-go="energy"><span class="pw-n-k"><i class="fa fa-display" aria-hidden="true"></i><span>${esc(T('gpuK'))}</span></span><span class="pw-n-v"><b data-f="gpu-v">–</b><small>W</small></span><span class="pw-n-s" data-f="gpu-s"></span><span class="pw-bar"><i data-f="gpu-b"></i></span></button>`
    flowSlot.appendChild(flowEl)

    const f = {}
    for (const n of [...meter.querySelectorAll('[data-f]'), ...flowEl.querySelectorAll('[data-f]')]) f[n.dataset.f] = n
    const links = [...flowEl.querySelectorAll('.pw-link')]
    const set = (k, v) => { if (f[k] && f[k].textContent !== v) f[k].textContent = v }
    const fill = (k, v) => { if (f[k]) { f[k].style.setProperty('--p', v == null ? 0 : v); f[k].parentElement.dataset.on = v == null ? '0' : '1' } }

    function paintMeter(w) {
      const have = w.total != null
      meter.dataset.state = have ? (live && !paused ? 'live' : 'held') : 'none'
      set('heroK', T({ both: 'meterHeroK', gpu: 'meterHeroGpu', cpu: 'meterHeroCpu' }[P.totalKind(w)] || 'meterHeroK'))
      set('total', have ? P.fmtW(w.total) : '–'); set('unit', have ? 'W' : '')
      set('liveTag', !live ? T('liveOff') : paused ? T('livePaused') : have ? T('liveOn') : '')
      const parts = []
      if (w.cpuW != null) parts.push(`<span class="pw-dot" data-k="cpu"></span>${esc(T('cpuK'))} <b>${esc(P.fmtW(w.cpuW))} W</b>`)
      if (w.gpuW != null) parts.push(`<span class="pw-dot" data-k="gpu"></span>${esc(T('gpuK'))} <b>${esc(P.fmtW(w.gpuW))} W</b>`)
      const split = parts.join('<span class="pw-sep" aria-hidden="true">·</span>')
      if (f.split.innerHTML !== split) f.split.innerHTML = split
      if (!have) set('note', live ? T('meterNoneLive') : T('flowNoLive'))
      else {
        const price = facts && facts.price
        set('note', price && price.perKwh != null ? T('meterCostHr', { c: P.fmtCost(w.total / 1000 * price.perKwh, price.currency) }) : T('flowTotalNote'))
      }
      const d = P.areaPaths(trace, 240, 56)
      f.line.setAttribute('d', d.line); f.area.setAttribute('d', d.area)
    }

    function paint() {
      const src = P.sourceOf(facts, frame)
      flowEl.querySelector('[data-node="src"] .pw-n-k i').className = 'fa fa-' + (src.kind === 'battery' ? 'battery-three-quarters' : 'plug')
      set('src-k', T(src.kind === 'battery' ? 'srcBatteryK' : 'srcWallK'))
      f['src-v'].dataset.t = !facts || src.kind === 'wall' ? 'word' : ''
      if (!facts) { set('src-v', '–'); set('src-u', ''); set('src-s', T('flowUnread')) }
      else if (src.kind === 'wall') { set('src-v', T('srcWallV')); set('src-u', ''); set('src-s', facts.laptop ? T('srcLaptopWall') : T('srcDesktop')) }
      else {
        set('src-v', src.percent == null ? '–' : String(Math.round(src.percent))); set('src-u', src.percent == null ? '' : '%')
        const rate = src.rateW != null ? P.fmtW(src.rateW) : null
        set('src-s', src.state === 'discharging' ? (rate ? T('srcDischarge', { w: rate }) + (src.minutes != null ? ' · ' + T('srcLeft', { t: P.fmtMinutes(src.minutes) }) : '') : T('srcOnBattery'))
          : src.state === 'charging' ? (rate ? T('srcCharge', { w: rate }) + (src.minutes != null ? ' · ' + T('srcToFull', { t: P.fmtMinutes(src.minutes) }) : '') : T('srcCharging'))
          : src.state === 'full' ? T('srcFull') : T('srcPlugged'))
      }
      if (!facts) { set('gov-v', '–'); set('gov-s', T('flowUnread')) }
      else {
        set('gov-v', facts.activeName || '–')
        const card = P.planCards(facts).find(p => p.guid === facts.activeGuid)
        set('gov-s', T('char_' + (card ? card.character.kind : 'unread')))
      }
      const w = P.wattsRow(frame)
      set('cpu-v', P.fmtW(w.cpuW)); set('gpu-v', P.fmtW(w.gpuW))
      set('cpu-s', w.cpuW == null ? (live ? T('cpuNoSensor') : T('flowNoLive')) : w.perf != null ? T('cpuClock', { pct: Math.round(w.perf) }) : T('srcSensor'))
      set('gpu-s', w.gpuW == null ? (live ? T('gpuNoReading') : T('flowNoLive')) : w.gpuLoad != null ? T('gpuLoadSub', { pct: Math.round(w.gpuLoad) }) : T('srcSensor'))
      fill('cpu-b', P.wattFill(w.cpuW, 200)); fill('gpu-b', P.wattFill(w.gpuW, 450))
      const dur = live && !paused ? P.flowDur(w.total) : null
      flowEl.dataset.flow = dur ? '1' : '0'
      for (const l of links) { if (dur) l.style.setProperty('--dur', dur + 's'); else l.style.removeProperty('--dur') }
      paintMeter(w)
    }
    paint()
    return {
      setFacts(x) { facts = x && x.read !== false ? x : null; paint() },
      update(fr) {
        frame = fr; live = true
        const w = P.wattsRow(fr); trace.push(w.total); if (trace.length > TRACE) trace.shift()
        paint()
      },
      setPaused(p) { if (paused !== p) { paused = p; paint() } },
      setLive(v) { if (live !== v) { live = v; if (!v) frame = null; paint() } },
      reset() { frame = null; trace.length = 0; paint() },
      destroy() { meter.remove(); flowEl.remove() },
    }
  }
  api.mount = mount
})(typeof window !== 'undefined' ? window : globalThis)
