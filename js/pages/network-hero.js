'use strict'
// Optimize > Network hero: PC -> router -> internet with one link per active adapter. Particle flow comes from the REAL per-adapter
// rx/tx counters (telemetry keys net.<adapter>.rx|tx); with no reading a link is drawn still, with no particles. Router identity
// is from UPnP on the gateway only (or "not identified"). The speed test is the user's explicit action and reports what it measured.
function buildNetworkHero(c) {
  const { html } = ui
  const el = document.createElement('section')
  el.id = 'net-hero'
  el.className = 'j-card j-net-hero'
  el.innerHTML = String(html`
    <div class="j-twin-stage j-net-stage"><canvas id="net-canvas" class="j-net-canvas" aria-hidden="true"></canvas><div class="j-net-labels" id="net-labels"></div></div>
    <div class="j-net-side">
      <div class="j-net-id" id="net-id" aria-live="polite">${ui.callout(tUI('netHeroChecking'), 'info')}</div>
      <div class="j-net-speed">
        <div class="j-hstack"><b>${tUI('netSpeedTitle')}</b><span class="j-grow"></span>${ui.button({ id: 'net-speed-btn', label: tUI('netSpeedRun'), icon: 'gauge-high', variant: 'primary', size: 'sm', onclick: 'netSpeedRun()' })}</div>
        <p class="j-muted j-settings-hint">${tUI('netSpeedNote')}</p>
        <div class="j-net-speed-grid" id="net-speed-grid">${['netDown', 'netUp', 'netLatency', 'netJitter'].map(k => html`<div><div class="j-stat-label">${tUI(k)}</div><div class="j-gpu-val j-num" data-nsv="${k}">—</div></div>`)}</div>
        <div class="j-muted" id="net-speed-meta"></div>
        <div id="net-speed-history" class="j-net-hist"></div>
      </div>
    </div>`)
  c.prepend(el)
  netHeroInit(el)
  return el
}

const NET_FLOW = { particles: [], raf: 0, adapters: [], t: 0 }

async function netHeroInit(el) {
  let topo = null
  try { topo = await api.netTopology() } catch {}
  const box = el.querySelector('#net-id')
  if (!box) return
  if (!topo || !topo.ok) { box.innerHTML = String(ui.callout(tUI('netHeroUnavailable'), 'warn')) }
  else {
    const gw = topo.gateway, id = topo.identity
    const idText = id ? [id.manufacturer, id.model].filter(Boolean).join(' ') || id.friendlyName : null
    box.innerHTML = String(ui.group('', [
      ui.row({ title: tUI('netRouter'), sub: idText ? tUI('netRouterFromUpnp') : tUI('netRouterUnknown'), control: html`<span class="j-num">${idText || tUI('metricNA')}</span>` }),
      ui.row({ title: tUI('netGateway'), sub: gw && gw.latencyMs != null ? tUI('netGatewayLatency').replace('{ms}', gw.latencyMs) : tUI('netGatewayNoLatency'), control: html`<span class="j-num">${gw ? gw.ip : tUI('metricNA')}</span>` }),
    ]))
    NET_FLOW.adapters = (topo.adapters || []).filter(a => a.up)
  }
  netHistoryRender(el)
  netDrawStart(el)
}

function netDrawStart(el) {
  const cv = el.querySelector('#net-canvas')
  if (!cv) return
  cancelAnimationFrame(NET_FLOW.raf)
  const ctx = cv.getContext('2d')
  if (!ctx) return
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || 'rgb(139,124,246)'
  let last = performance.now()
  const frame = now => {
    if (!document.body.contains(cv)) return
    NET_FLOW.raf = requestAnimationFrame(frame)
    const dt = Math.min(0.1, (now - last) / 1000); last = now
    if (document.visibilityState !== 'visible') return
    const r = cv.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2)
    if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr) }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, r.width, r.height)
    const W = r.width, H = r.height, accent = css('--c-accent'), dim = 'rgba(255,255,255,0.22)'
    const pc = [W * 0.14, H * 0.5], rt = [W * 0.5, H * 0.5], net = [W * 0.86, H * 0.5]
    const ads = NET_FLOW.adapters.length ? NET_FLOW.adapters : [{ name: '', desc: '', up: true }]
    const snap = window.JylliTelemetry && JylliTelemetry.state.snap
    const links = ads.map((a, i) => {
      const off = (i - (ads.length - 1) / 2) * 34
      const rx = snap && a.name ? snap.s['net.' + a.name + '.rx'] : null, tx = snap && a.name ? snap.s['net.' + a.name + '.tx'] : null
      return { a, off, rx: rx && rx[0] != null ? rx[0] : null, tx: tx && tx[0] != null ? tx[0] : null }
    })
    ctx.lineWidth = 1.5; ctx.strokeStyle = dim
    for (const l of links) { ctx.beginPath(); ctx.moveTo(pc[0], pc[1]); ctx.quadraticCurveTo((pc[0] + rt[0]) / 2, pc[1] + l.off * 1.6, rt[0], rt[1] + l.off * 0.3); ctx.stroke() }
    ctx.beginPath(); ctx.moveTo(rt[0], rt[1]); ctx.lineTo(net[0], net[1]); ctx.stroke()
    // particles: spawn rate follows the real byte rate (log scale); nothing spawns without a reading
    for (const l of links) {
      for (const [dir, bps] of [[-1, l.rx], [1, l.tx]]) {
        if (bps == null || bps < 1024) continue
        const rate = Math.min(14, 1.5 + Math.log10(bps / 1024) * 3.2)
        if (Math.random() < rate * dt) NET_FLOW.particles.push({ l, dir, p: dir > 0 ? 0 : 1, s: 0.35 + Math.random() * 0.25 })
      }
    }
    ctx.fillStyle = accent
    NET_FLOW.particles = NET_FLOW.particles.filter(pt => {
      pt.p += pt.dir * pt.s * dt
      if (pt.p < 0 || pt.p > 1) return false
      const t = pt.p, l = pt.l
      const cx = (pc[0] + rt[0]) / 2, cy = pc[1] + l.off * 1.6
      const x = (1 - t) * (1 - t) * pc[0] + 2 * (1 - t) * t * cx + t * t * rt[0]
      const y = (1 - t) * (1 - t) * pc[1] + 2 * (1 - t) * t * cy + t * t * (rt[1] + l.off * 0.3)
      ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 7); ctx.fill(); ctx.globalAlpha = 1
      return true
    })
    if (NET_FLOW.particles.length > 220) NET_FLOW.particles.splice(0, NET_FLOW.particles.length - 220)
    // nodes
    ctx.lineWidth = 1.5
    for (const [p, label] of [[pc, 'netNodePc'], [rt, 'netNodeRouter'], [net, 'netNodeInternet']]) {
      ctx.fillStyle = 'rgba(16,16,21,0.95)'; ctx.strokeStyle = 'rgba(255,255,255,0.5)'
      ctx.beginPath(); ctx.roundRect(p[0] - 28, p[1] - 20, 56, 40, 10); ctx.fill(); ctx.stroke()
      ctx.fillStyle = 'rgba(233,233,239,0.9)'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(tUI(label), p[0], p[1] + 38)
    }
  }
  NET_FLOW.raf = requestAnimationFrame(frame)
}

async function netHistoryRender(el) {
  const box = (el || document).querySelector('#net-speed-history')
  if (!box) return
  let hist = []
  try { hist = await api.getSpeedHistory() } catch {}
  box.innerHTML = String(hist.slice(0, 5).map(h => ui.row({ title: html`<span class="j-num">${h.downMbps != null ? h.downMbps.toFixed(0) : '—'} / ${h.upMbps != null ? h.upMbps.toFixed(0) : '—'} Mbit/s</span>`, sub: `${new Date(h.t).toLocaleString()}${h.colo ? ' · ' + h.colo : ''}` })).join(''))
}

async function netSpeedRun() {
  const btn = document.getElementById('net-speed-btn')
  if (!btn || btn.disabled) return
  try { await showConfirm({ title: tUI('netSpeedConfirmTitle'), body: escHtml(tUI('netSpeedConfirmBody')), okText: tUI('netSpeedRun'), okStyle: 'info', icon: 'fa-gauge-high' }) } catch { return }
  btn.disabled = true
  const grid = document.getElementById('net-speed-grid'), meta = document.getElementById('net-speed-meta')
  const set = (k, v) => { const e = grid.querySelector(`[data-nsv="${k}"]`); if (e) e.textContent = v }
  set('netDown', '…'); set('netUp', '…'); set('netLatency', '…'); set('netJitter', '…'); meta.textContent = tUI('netSpeedRunning')
  const off = api.onSpeedTestProgress ? api.onSpeedTestProgress(p => { set(p.phase === 'down' ? 'netDown' : 'netUp', p.mbps ? p.mbps.toFixed(0) + ' Mbit/s' : '…') }) : null
  let r = null
  try { r = await api.runSpeedTest() } catch {}
  try { off && off() } catch {}
  btn.disabled = false
  if (!r || !r.ok) { meta.textContent = tUI(r && r.reason === 'already-running' ? 'netSpeedBusy' : 'netSpeedFailed'); set('netDown', '—'); set('netUp', '—'); set('netLatency', '—'); set('netJitter', '—'); return }
  set('netDown', r.downMbps != null ? r.downMbps.toFixed(0) + ' Mbit/s' : '—'); set('netUp', r.upMbps != null ? r.upMbps.toFixed(0) + ' Mbit/s' : '—')
  set('netLatency', r.latency.ms != null ? r.latency.ms.toFixed(0) + ' ms' : '—'); set('netJitter', r.latency.jitterMs != null ? r.latency.jitterMs.toFixed(1) + ' ms' : '—')
  meta.textContent = [r.colo ? tUI('netSpeedServer').replace('{colo}', r.colo) : '', r.loadedLatency && r.loadedLatency.ms != null ? tUI('netSpeedLoaded').replace('{ms}', r.loadedLatency.ms.toFixed(0)) : '', tUI('netSpeedUsed').replace('{mb}', Math.round(r.bytes / 1048576))].filter(Boolean).join(' · ')
  try { JylliSound.play('apply') } catch {}
  netHistoryRender(document)
}
