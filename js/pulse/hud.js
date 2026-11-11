'use strict'
// Pulse HUD: the click-through in-game overlay (pulse-hud.html). Three layouts: minimal (FPS and 1 % low), standard (adds the frame-time
// ribbon and the Limiter in one word) and full (adds CPU and GPU load and temperature). Updates at 4 Hz, no animation, a contrast plate
// keeps it readable over any game. Copy: LANG group `pulse2`, keys hud_*.
;(function (root) {
  const pure = {
    /** engine live frame -> the few numbers the HUD prints; a missing value stays null */
    read(live) {
      const n = v => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null)
      const vit = k => (live && live.vitals && live.vitals[k] ? live.vitals[k].v : null)
      return {
        fps: live && live.fps ? n(live.fps.avg) : null, low1: live && live.fps ? n(live.fps.low1) : null,
        lim: live && live.fresh ? live.limiter.id : null, tone: live && live.fresh ? live.limiter.tone : 'idle',
        cpu: n(vit('cpu.load')), cpuT: n(vit('cpu.temp.package')), gpu: n(vit('gpu0.load')), gpuT: n(vit('gpu0.temp.core')),
      }
    },
  }
  root.JylliPulseHud = pure
  if (typeof module !== 'undefined' && module.exports) { module.exports = pure; return }
  if (typeof document === 'undefined') return

  const A = root.api
  const lang = new URLSearchParams(location.search).get('lang') === 'fi' ? 'fi' : 'en'
  const T = (k, v) => {
    const d = (root.LANG[lang] && root.LANG[lang].pulse2) || {}
    let s = d[k]; if (s == null) s = root.LANG.en.pulse2[k]; if (s == null) return k
    return v ? s.replace(/\{(\w+)\}/g, (m, n) => (v[n] == null ? m : v[n])) : s
  }
  const $ = id => document.getElementById(id)
  const hud = $('ph')
  const dash = '–'
  const river = root.JylliPulseRiverView.mount($('ph-ribbon'), { mode: 'ribbon' })

  function paint(live) {
    const r = pure.read(live)
    $('ph-fps').textContent = r.fps == null ? dash : String(r.fps)
    $('ph-low1').textContent = r.low1 == null ? '' : T('hud_low1', { n: r.low1 })
    $('ph-lim').textContent = r.lim ? T('hud_lim_' + r.lim) : T('hud_wait')
    hud.dataset.tone = r.tone
    $('ph-vit').innerHTML = `<span>${esc(T('hud_cpu'))} ${r.cpu == null ? dash : r.cpu + '%'}${r.cpuT == null ? '' : ' · ' + r.cpuT + '°'}</span><span>${esc(T('hud_gpu'))} ${r.gpu == null ? dash : r.gpu + '%'}${r.gpuT == null ? '' : ' · ' + r.gpuT + '°'}</span>`
    river.update(root.JylliPulseRiverView.fromLive(live))
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const setPrefs = p => { if (p && p.hud) hud.dataset.layout = p.hud.layout }

  A.onPulse2Live(paint)
  A.onPulse2Event(m => { if (m && m.type === 'prefs') setPrefs(m.prefs) })
  A.pulse2Subscribe().then(r => { if (r && r.ok) { setPrefs(r.prefs); paint(r.live) } })
  window.addEventListener('beforeunload', () => { try { A.pulse2Unsubscribe() } catch { /* gone */ } })
})(typeof window !== 'undefined' ? window : globalThis)
