'use strict'
// GPU tab, the Headroom test card and its load generator. The page draws a heavy shader on its own canvas for 30 seconds while the service samples the
// card (lib/gpu/loadtest.js decides when to stop and writes the report). Nothing here touches a setting.
// The generator keeps every GPU call short (about 30 ms, never over 80 ms) so Windows never sees a hang, and reports work as billions of shader
// iterations per second, which stays comparable between runs even though the per-frame amount is calibrated to the card.
;(function (root) {
  const api = { mount() { return null }, runLoad() { return null } }
  root.JylliGpuTest = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  const TARGET_MS = 30, MAX_MS = 80, CALIBRATE_MS = 2500, N_MIN = 16, N_MAX = 8192

  const VS = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }'
  const FS = 'precision highp float; uniform float n; uniform float t; void main() { vec2 z = gl_FragCoord.xy * 0.001; float a = t; for (int i = 0; i < 8192; i++) { if (float(i) >= n) break; a = sin(a * 1.0001 + z.x) * cos(a + z.y) + a * 0.9999; z = z.yx * 0.999 + vec2(a * 0.001); } gl_FragColor = vec4(fract(a), fract(z.x * 7.0), fract(z.y * 5.0), 1.0); }'

  /** Starts drawing on `canvas`. Returns { stop(), done: Promise<{ work, frames, renderer, ms } | { error }> }. */
  function runLoad(canvas, { durationMs = 30000, onTick } = {}) {
    const gl = canvas.getContext('webgl', { powerPreference: 'high-performance', antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true, failIfMajorPerformanceCaveat: true })
    if (!gl) return { stop() {}, done: Promise.resolve({ error: 'webgl' }) }
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null }
    const vs = mk(gl.VERTEX_SHADER, VS), fs = mk(gl.FRAGMENT_SHADER, FS), prog = gl.createProgram()
    if (!vs || !fs) return { stop() {}, done: Promise.resolve({ error: 'webgl' }) }
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return { stop() {}, done: Promise.resolve({ error: 'webgl' }) }
    gl.useProgram(prog)
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const un = gl.getUniformLocation(prog, 'n'), ut = gl.getUniformLocation(prog, 't')
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : ''
    const px = new Uint8Array(4), pixels = canvas.width * canvas.height
    gl.viewport(0, 0, canvas.width, canvas.height)

    let n = 128, stopped = false, frames = 0, workIt = 0, workMs = 0, raf = 0
    const t0 = performance.now()
    let resolve
    const done = new Promise(r => { resolve = r })
    const finish = (extra) => {
      stopped = true; cancelAnimationFrame(raf)
      try { const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext() } catch (e) { /* context already gone */ }
      const ms = performance.now() - t0
      resolve(extra || { work: workMs > 0 ? workIt / (workMs / 1000) / 1e9 : null, frames, renderer, ms })
    }
    function step() {
      if (stopped) return
      const now = performance.now(), el = now - t0
      if (el >= durationMs) return finish()
      gl.uniform1f(un, n); gl.uniform1f(ut, el / 1000)
      const a = performance.now()
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)   // waits for the card: this is the timing
      const ms = performance.now() - a
      frames++
      if (el >= CALIBRATE_MS) { workIt += pixels * n; workMs += ms }
      // aim for TARGET_MS per call while calibrating; afterwards only back off if a call gets long (the card slowed down)
      if (el < CALIBRATE_MS || ms > MAX_MS) n = Math.max(N_MIN, Math.min(N_MAX, Math.round(n * Math.max(0.5, Math.min(2, TARGET_MS / Math.max(1, ms))))))
      if (onTick) onTick({ el, n, ms })
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return { stop() { if (!stopped) finish({ error: 'stopped' }) }, done }
  }

  // ── the card ──
  function mount(card, ctx) {
    const { T, P, esc, S, root: R } = ctx
    let canvas = null, run = null, tick = null, started = 0, dur = 30000
    const reasonKey = r => ({ 'hot-core': 'hot_core', 'hot-spot': 'hot_spot', game: 'game', timeout: 'timeout', hidden: 'hidden', stopped: 'stopped', webgl: 'webgl', 'too-few-frames': 'few', busy: 'busy', unavailable: 'unavailable' }[r] || 'stopped')
    const agoText = ms => { const a = P.ago(ms); return a ? T('ago_' + a.k, { n: a.n }) : '' }

    function paint() {
      const t = S.test
      const head = `<header class="nt-card-h"><div><b>${esc(T('testTitle'))}</b><span>${esc(T('testSub'))}</span></div>${t.phase === 'run' ? `<button type="button" class="nt-sec sm" data-t="stop"><i class="fa fa-stop" aria-hidden="true"></i>${esc(T('testStop'))}</button>` : ''}</header>`
      if (t.phase === 'run') {
        card.innerHTML = head + `<div class="gp-test-run"><canvas width="640" height="360" aria-hidden="true"></canvas><div class="gp-test-prog" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i style="--p:0"></i></div><p class="gp-test-note" data-note>${esc(T('testRunning', { s: Math.round(dur / 1000) }))}</p></div>`
        canvas = card.querySelector('canvas')
        return
      }
      canvas = null
      const rep = S.report || (S.tests && S.tests[0]) || null
      let body = ''
      if (t.phase === 'abort') body += `<div class="gp-test-abort" data-tone="${t.reason === 'hot-core' || t.reason === 'hot-spot' ? 'warn' : 'info'}"><i class="fa fa-circle-info" aria-hidden="true"></i><div><b>${esc(T('abT_' + reasonKey(t.reason)))}</b><span>${esc(T('abS_' + reasonKey(t.reason)))}</span></div></div>`
      if (rep && rep.ok) {
        const rows = P.reportRows(rep)
        const d = S.delta
        const dtxt = { work: d && d.work != null ? P.signed(d.work, 1) + '%' : null, clock: d && d.clock != null ? P.signed(d.clock) + ' MHz' : null, power: d && d.power != null ? P.signed(d.power) + ' W' : null, temp: d && d.temp != null ? P.signed(d.temp) + ' °C' : null }
        body += `<dl class="gp-rep">${rows.map(r => `<div data-tone="${r.tone || ''}"><dt>${esc(T('rep_' + r.k))}</dt><dd class="mono">${esc(r.main)}<small>${esc(r.unit)}</small></dd><dd class="gp-rep-sub">${r.sub ? esc(T('repSub_' + r.k, { v: r.sub })) : ''}${dtxt[r.k] ? `<span class="gp-delta" data-sign="${dtxt[r.k][0] === '+' ? 'up' : 'down'}">${esc(dtxt[r.k])}</span>` : ''}</dd></div>`).join('')}</dl>`
        const lim = rep.limiter ? T('repLim_' + rep.limiter.id, { pct: rep.limiter.pct }) : ''
        body += `<p class="gp-rep-lim">${esc(lim)}${rep.wrongGpu ? ` <span class="gp-warn"><i class="fa fa-triangle-exclamation" aria-hidden="true"></i>${esc(T('repWrongGpu', { r: rep.renderer || '?' }))}</span>` : ''}</p>`
        body += `<p class="gp-rep-meta">${esc(T('repWhen', { when: agoText(rep.at) }))}${d && d.workSame ? ' · ' + esc(T('repSame')) : ''}</p>`
      } else if (t.phase !== 'abort') body += `<p class="gp-test-hint">${esc(T('testHint'))}</p>`
      const why = S.live === 'paused' ? 'game' : null
      card.innerHTML = head + body + `<div class="nt-actions"><button type="button" class="nt-cta" data-t="start"${why || S.phase !== 'ready' ? ' disabled' : ''}><i class="fa fa-play" aria-hidden="true"></i>${esc(T(rep && rep.ok ? 'testAgain' : 'testRun'))}</button>${why ? `<span class="gp-test-why">${esc(T('abS_game'))}</span>` : ''}</div>`
    }

    async function start() {
      if (S.test.phase === 'run' || S.phase !== 'ready') return
      let r = null
      try { r = await R.api.gpu2TestStart() } catch (e) { r = null }
      if (!r || !r.ok) { S.test = { phase: 'abort', reason: (r && r.error) || 'unavailable' }; paint(); return }
      dur = r.durationMs || 30000; started = performance.now()
      S.test = { phase: 'run', t0: r.t0 }; S.report = null; S.delta = null
      paint()
      run = runLoad(canvas, { durationMs: dur })
      if (run && run.done) run.done.then(onLoad)
      tick = setInterval(() => {
        const el = performance.now() - started, bar = card.querySelector('.gp-test-prog i'), note = card.querySelector('[data-note]')
        if (bar) { bar.style.setProperty('--p', Math.min(100, el / dur * 100)); bar.parentElement.setAttribute('aria-valuenow', String(Math.round(Math.min(100, el / dur * 100)))) }
        if (note) note.textContent = T('testRunningLeft', { s: Math.max(0, Math.ceil((dur - el) / 1000)) })
      }, 250)
    }
    async function onLoad(res) {
      clearInterval(tick); tick = null; run = null
      if (S.disposed) return
      if (S.test.phase !== 'run') return
      if (!res || res.error) {
        if (res && res.error === 'stopped') { try { await R.api.gpu2TestStop() } catch (e) { /* already stopped */ } if (S.test.phase === 'run') S.test = { phase: 'abort', reason: 'stopped' } }
        else { try { await R.api.gpu2TestStop() } catch (e) { /* already stopped */ } S.test = { phase: 'abort', reason: res ? res.error : 'webgl' } }
        paint(); return
      }
      let f = null
      try { f = await R.api.gpu2TestFinish({ work: res.work, frames: res.frames, renderer: res.renderer }) } catch (e) { f = null }
      if (S.disposed) return
      if (f && f.ok) { S.report = f.report; S.delta = f.delta; S.tests = f.tests; S.test = { phase: 'done' }; try { R.JylliSound.play('apply') } catch (e) { /* no sound */ } }
      else S.test = { phase: 'abort', reason: (f && f.error) || 'too-few-frames' }
      paint()
    }
    /** The service stopped the test (hot card, game, timeout, tab hidden). */
    function aborted(reason) {
      if (S.test.phase !== 'run') return
      clearInterval(tick); tick = null
      if (run) { const r = run; run = null; r.stop() }
      S.test = { phase: 'abort', reason }
      paint()
    }
    function stop() {
      if (S.test.phase !== 'run') return
      if (run) run.stop(); else aborted('stopped')
    }
    card.addEventListener('click', e => {
      const b = e.target.closest('[data-t]'); if (!b) return
      if (b.dataset.t === 'start') start(); else if (b.dataset.t === 'stop') stop()
    })
    paint()
    return { paint, aborted, destroy() { clearInterval(tick); if (run) { try { run.stop() } catch (e) { /* done */ } } card.innerHTML = '' } }
  }

  api.mount = mount
  api.runLoad = runLoad
})(typeof window !== 'undefined' ? window : globalThis)
