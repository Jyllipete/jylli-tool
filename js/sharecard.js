'use strict'
// Share card (4.0): a 1200x630 PNG of a recorded game session for posting. It only prints what the recording holds: average FPS,
// 1 % low, length and the peak GPU temperature when that series was recorded; a missing value is left out, never invented.
// `stats` is the pure part (unit-tested); `draw` paints it on a canvas with the app's own fonts and accent.
;(function (root) {
  /** session -> [{ value, label }] in display order, only values that exist */
  function stats(s) {
    const sm = (s && s.summary) || {}, out = []
    if (Number.isFinite(sm.avgFps)) out.push({ value: String(Math.round(sm.avgFps)), label: 'avg FPS' })
    if (Number.isFinite(sm.low1Fps)) out.push({ value: String(Math.round(sm.low1Fps)), label: '1% low FPS' })
    const temps = ((s && s.series && s.series['gpu0.temp.core']) || []).filter(Number.isFinite)
    if (temps.length) out.push({ value: Math.round(Math.max(...temps)) + '°', label: 'GPU peak °C' })
    return out.slice(0, 3)
  }
  const minutes = s => { const m = Math.round((s.durationSec || 0) / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min` }

  const api = { stats, minutes }
  root.JylliShareCard = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  function draw(cv, s, rig) {
    const x = cv.getContext('2d'), W = cv.width = 1200, H = cv.height = 630
    const accent = (root.cssVar && cssVar('--c-accent', '#8B7CF6')) || '#8B7CF6'
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#171126'); g.addColorStop(0.6, '#0b0b11'); g.addColorStop(1, '#101018'); x.fillStyle = g; x.fillRect(0, 0, W, H)
    const r = x.createRadialGradient(950, 90, 10, 950, 90, 560); r.addColorStop(0, accent + '66'); r.addColorStop(1, 'transparent'); x.fillStyle = r; x.fillRect(0, 0, W, H)
    x.fillStyle = '#fff'; x.font = '600 58px Geist, "Segoe UI", sans-serif'; x.fillText((s.game && s.game.name) || '', 64, 124)
    x.fillStyle = 'rgba(255,255,255,.62)'; x.font = '26px Geist, "Segoe UI", sans-serif'
    x.fillText([minutes(s), rig && rig.gpu, rig && rig.cpu].filter(Boolean).join(' · '), 64, 170)
    stats(s).forEach((st, i) => {
      x.fillStyle = '#fff'; x.font = '600 100px "Geist Mono", Consolas, monospace'; x.fillText(st.value, 64 + i * 360, 340)
      x.fillStyle = 'rgba(255,255,255,.55)'; x.font = '24px Geist, "Segoe UI", sans-serif'; x.fillText(st.label, 68 + i * 360, 382)
    })
    const fps = (s.bins || []).map(b => b.fps), vals = fps.filter(Number.isFinite)
    if (vals.length > 1) {
      const max = Math.max(60, ...vals) * 1.1, px = i => 64 + (i / (fps.length - 1)) * (W - 128), py = v => 575 - (v / max) * 120
      x.strokeStyle = accent; x.lineWidth = 4; x.lineJoin = 'round'; x.beginPath()
      let pen = false; fps.forEach((v, i) => { if (!Number.isFinite(v)) { pen = false; return } pen ? x.lineTo(px(i), py(v)) : x.moveTo(px(i), py(v)); pen = true }); x.stroke()
    }
    x.fillStyle = 'rgba(255,255,255,.4)'; x.font = '20px Geist, "Segoe UI", sans-serif'; x.fillText('frame rate over the session · recorded by Jylli Tool', 64, 604)
    return cv
  }

  function save(s, rig) {
    const cv = draw(document.createElement('canvas'), s, rig)
    cv.toBlob(b => {
      if (!b) return
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `jylli-${String((s.game && s.game.name) || 'session').replace(/[^\w-]+/g, '_')}.png`
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000)
      if (typeof toast === 'function') toast(tUI('shareCardDone'), '', 'ok')
    }, 'image/png')
  }
  root.JylliShareCard.draw = draw; root.JylliShareCard.save = save
})(typeof window !== 'undefined' ? window : globalThis)
