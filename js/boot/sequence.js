'use strict'
// Boot scan, runtime: drives the loading screen from what the main process really reports (js/boot/pure.js decides what to say).
//   cold launch : rows fill live as each read arrives, a read that fails says so instead of pretending
//   warm launch : last known specs are shown at once (marked "remembered"), live reads verify them in place, and the app opens
//                 as soon as the machine is shown and the admin state is known — no waiting for the slow reads
// Ends on the identity card (rig class, signature, one closing line made only of facts), then resolves with the sysInfo to start from.
;(function (root) {
  if (typeof document === 'undefined') return
  const P = root.JylliBootPure
  const $ = id => document.getElementById(id)
  const wait = ms => new Promise(r => setTimeout(r, ms))
  const reduced = () => document.body.classList.contains('motion-reduced') || (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const T = (k, v) => tG('boot', k, v)
  const IDS = P.STEPS.map(s => s.id)

  const MIN_READ_MS = 240        // a row shows "Reading…" at least this long, so fast reads do not flicker
  const SLOW_MS = 6000           // after this the screen says which read is slow
  const CONTINUE_MS = 8000       // and offers to go on once CPU/RAM/GPU are in
  const ADMIN_CAP_MS = 6000      // warm launch waits at most this long for the admin answer
  const CORE_CAP_MS = 2500       // ...and at most this long (after the rows are up) for CPU/RAM/GPU to be read live and compared
  const CORE = ['cpu', 'ram', 'gpu']
  const GIVE_UP_MS = 15000       // a read that has not answered by now is shown as unavailable (a late answer still lands)
  const BOOT_CAP_MS = 35000      // the scan never holds the app longer than this

  // Which spec-progress label belongs to which row; `os` resolves from the final result.
  const LABEL_TO_STEP = [['CPU detected', 'cpu'], ['RAM detected', 'ram'], ['GPU detected', 'gpu'], ['VRAM detected', 'vram'], ['VRAM detection complete', 'vram'],
    ['Storage detected', 'storage'], ['Display detected', 'display'], ['Board detected', 'board']]

  // ── text effects ────────────────────────────────────────────────────────────
  // Decode: the line settles left to right out of its own letters (same glyphs, so the width barely moves).
  function decode(el, str) {
    if (el._dec) cancelAnimationFrame(el._dec)
    if (reduced() || !str || str.length < 3) { el.textContent = str || ''; return }
    const pool = str.replace(/\s/g, '').split('')
    const t0 = performance.now(), dur = Math.min(700, 260 + str.length * 9)
    const tick = now => {
      const k = Math.min(1, (now - t0) / dur), n = Math.floor(k * str.length)
      let out = str.slice(0, n)
      for (let c = n; c < str.length; c++) out += str[c] === ' ' ? ' ' : pool[Math.floor(Math.random() * pool.length)]
      el.textContent = out
      el._dec = k < 1 ? requestAnimationFrame(tick) : 0
      if (k >= 1) el.textContent = str
    }
    el._dec = requestAnimationFrame(tick)
  }
  // Count-up for a leading whole number ("32 GB"): the figure climbs, the unit is already there.
  function countUp(el, str) {
    const m = /^(\d+)(.*)$/.exec(str || '')
    if (!m || reduced()) { decode(el, str); return }
    if (el._dec) cancelAnimationFrame(el._dec)
    const to = +m[1], t0 = performance.now(), dur = 520
    const tick = now => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3)
      el.textContent = Math.round(to * e) + m[2]
      el._dec = k < 1 ? requestAnimationFrame(tick) : 0
    }
    el._dec = requestAnimationFrame(tick)
  }

  // ── one run ─────────────────────────────────────────────────────────────────
  /** ctx: { api, sysInfoPromise, settings }. Resolves with the sysInfo the app should start from. */
  function run(ctx) {
    const { api, sysInfoPromise, settings } = ctx
    const S = {
      t0: Date.now(), done: new Set(), shown: new Map(), activeAt: new Map(), staged: new Set(), unavail: new Set(), verified: new Set(),
      warm: false, cached: null, liveInfo: null, admin: null, changes: null, signature: null, aborted: false, giveUp: false,
      gpuSub: '', vramText: '', live: {}, remText: new Map(), rowChanges: [],
    }
    const el = id => $('lstep-' + id)
    const stage = root.JylliBootStage

    // static labels
    const setText = (id, v) => { const e = $(id); if (e) e.textContent = v }
    setText('lstep-display-label', T('lblDisplay')); setText('lstep-board-label', T('lblBoard')); setText('lstep-os-label', T('lblOs'))
    setText('boot-trust', T('trust'))
    const cont = $('boot-continue'); if (cont) cont.textContent = T('continueNow')
    for (const id of IDS) { const r = el(id); if (r) r._icon = r.querySelector('.step-icon') ? r.querySelector('.step-icon').innerHTML : '' }
    $('boot-skip') && $('boot-skip').addEventListener('click', () => { S.aborted = true })
    document.addEventListener('keydown', S.onKey = e => { if (e.key === 'Escape') S.aborted = true })

    function setTagline(key, busy) {
      const t = $('boot-tagline'); if (!t) return
      setText('boot-tagline-text', T(key)); t.classList.toggle('is-done', !busy)
      const dots = t.querySelector('.boot-ellipsis'); if (dots) dots.style.display = busy ? '' : 'none'
    }
    function setProgress(final) {
      const p = final ? 1 : P.progress(S.done, [...S.activeAt.keys()].find(i => !S.done.has(i)))
      const f = $('boot-progress-fill'); if (f) f.style.width = (p * 100).toFixed(1) + '%'
      setText('boot-step-counter', Math.round(p * 100) + '%')
    }

    function paintGpuSub() {
      const sub = $('lstep-gpu-sub'); if (!sub) return
      sub.textContent = [S.vramText, S.gpuSub].filter(Boolean).join(' · ')
    }

    // ── row state machine ─────────────────────────────────────────────────────
    function activate(id) {
      const r = el(id); if (!r || S.done.has(id) || S.activeAt.has(id)) return
      S.activeAt.set(id, Date.now())
      r.dataset.state = 'reading'
      if (id !== 'vram') setText('lstep-' + id + '-detail', T('reading'))
      setProgress()
    }

    // text = {main, sub} | null (null = this read gave nothing → "unavailable"). opts.remembered: from disk, not from this launch.
    function resolve(id, text, opts) {
      const r = el(id); if (!r) return
      opts = opts || {}
      if (!text) {
        if (S.done.has(id)) return   // a failed late read never erases a good one
        S.unavail.add(id); S.done.add(id)
        r.dataset.state = 'unavailable'
        const ic = r.querySelector('.step-icon'); if (ic) ic.innerHTML = '<i class="fa fa-triangle-exclamation"></i>'
        if (id === 'vram') { S.vramText = ''; paintGpuSub() } else { setText('lstep-' + id + '-detail', T('unavailable')); setText('lstep-' + id + '-sub', '') }
        setText('lstep-' + id + '-tag', '')
        setProgress(); announce(id, T('unavailable'))
        stageUp(id)
        return
      }
      const prev = S.shown.get(id)
      const mainSame = !!prev && prev.main === text.main, subSame = !!prev && prev.sub === text.sub
      const wasUnavail = S.unavail.delete(id)
      S.shown.set(id, text); S.done.add(id)
      const ic = r.querySelector('.step-icon')
      if (opts.remembered) {
        S.remText.set(id, text)
        r.dataset.state = 'remembered'
        if (ic && r._icon) ic.innerHTML = r._icon
      } else {
        r.dataset.state = 'done'
        if (ic) ic.innerHTML = '<i class="fa fa-check"></i>'
        S.verified.add(id)
        if (S.warm) {
          setText('lstep-' + id + '-tag', T('verified'))
          const was = S.remText.get(id)
          if (was && was.main !== text.main) {
            r.dataset.changed = '1'
            if (id !== 'os') { const lab = r.querySelector('.step-label'); S.rowChanges.push({ key: id, label: id === 'vram' ? 'VRAM' : (lab ? lab.textContent : id), before: was.main, after: text.main }) }
          }
        }
      }
      if (opts.remembered) setText('lstep-' + id + '-tag', T('remembered'))
      if (id === 'vram') {
        S.vramText = text.main; paintGpuSub()
      } else {
        const d = $('lstep-' + id + '-detail')
        if (d && (!mainSame || wasUnavail)) (id === 'ram' ? countUp : decode)(d, text.main)
        if (id === 'gpu') { S.gpuSub = text.sub; paintGpuSub() } else if (!subSame || wasUnavail) setText('lstep-' + id + '-sub', text.sub || '')
      }
      setProgress()
      if (!opts.remembered) announce(id, text.main + (text.sub ? ', ' + text.sub : ''))
      stageUp(id)
    }
    function stageUp(id) {
      if (S.staged.has(id)) return
      S.staged.add(id)
      try { stage && stage.onStepDone(id) } catch {}
    }
    function announce(id, value) {
      const r = el(id), lab = r && r.querySelector('.step-label')
      if (id === 'vram' || !lab) return
      setText('boot-announce', T('ariaRow', { label: lab.textContent, value }))
    }
    // A live read arrives after the minimum "Reading…" time; on a warm launch there is nothing to hold back.
    function resolveLive(id, text) {
      const at = S.activeAt.get(id) || S.t0, left = S.warm ? 0 : Math.max(0, MIN_READ_MS - (Date.now() - at))
      if (left > 0 && !reduced()) setTimeout(() => resolve(id, text), left); else resolve(id, text)
    }

    // ── what main tells us ────────────────────────────────────────────────────
    const split = d => { const p = String(d || '').split(' · '); return { main: p[0] || '', sub: p.slice(1).join(' · ') } }
    function fromEvent(id, detail) {
      const bad = !detail || /^(Detecting…|Detected)$/.test(detail) || /not detected/i.test(detail)
      if (bad) return null
      const t = split(detail)
      if (id === 'display') t.main = t.main.replace('x', ' × ')
      if (id === 'board' && t.sub) t.sub = t.sub.replace(/^BIOS\s*/, 'BIOS ')
      return t
    }
    function cascadeRemembered(info) {
      S.warm = true; S.cached = info
      setTagline('tagRemembered', true)
      const t = (k, v) => T(k, v)
      return (async () => {
        for (const id of IDS) {
          const text = P.rowText(id, info, t)
          if (text) resolve(id, text, { remembered: true })
          else activate(id)
          await wait(reduced() ? 0 : 70)
        }
      })()
    }
    let cascadeP = Promise.resolve()
    let adminResolve; const adminP = new Promise(r => { adminResolve = r })
    api.onSpecProgress && api.onSpecProgress(ev => {
      if (!ev) return
      if (ev.cached && ev.info) { S.signature = ev.signature || null; cascadeP = cascadeRemembered(ev.info); return }
      if (ev.verified) { S.changes = Array.isArray(ev.changes) ? ev.changes : []; if (ev.signature) S.signature = ev.signature; return }
      if (ev.admin) { S.admin = ev.isAdmin === true; adminResolve(S.admin); return }
      const hit = LABEL_TO_STEP.find(([k]) => String(ev.label || '').startsWith(k))
      if (hit) {
        let text
        if (ev.data) { Object.assign(S.live, ev.data); text = P.rowText(hit[1], Object.assign({}, S.cached || {}, S.live), T) }   // same words as the remembered row, so a difference is a real difference
        else text = fromEvent(hit[1], ev.detail)
        resolveLive(hit[1], text)
      }
    })

    // cold launch: rows wake one after another (a cascade, not a wall), each stays until its own read arrives
    ;(async () => {
      setTagline('tagScanning', true)
      for (const id of IDS) {
        if (S.warm || S.aborted) break
        activate(id)
        await wait(reduced() ? 0 : 90)
      }
    })()

    // ── slow / give-up / continue ─────────────────────────────────────────────
    let forceContinue; const forceP = new Promise(r => { forceContinue = r })
    $('boot-continue') && $('boot-continue').addEventListener('click', () => forceContinue('continue'))
    const tick = setInterval(() => {
      const age = Date.now() - S.t0
      const pending = IDS.filter(i => !S.done.has(i) && i !== 'vram')
      const box = $('boot-slow')
      if (box) {
        const slow = !S.warm && age > SLOW_MS && pending.length > 0
        box.hidden = !slow
        if (slow) {
          const lab = el(pending[0]).querySelector('.step-label')
          setText('boot-slow-text', T('slow', { what: lab ? lab.textContent : '' }))
          const c = $('boot-continue'); if (c) c.hidden = !(P.coreDone(S.done) && age > CONTINUE_MS)
        }
      }
      if (age > GIVE_UP_MS && !S.giveUp) { S.giveUp = true; for (const i of IDS) if (!S.done.has(i)) resolve(i, null) }
    }, 500)

    // final answer from main: fills any row the live events did not cover and corrects any that differ
    function fillFromInfo(info) {
      const t = (k, v) => T(k, v)
      for (const id of IDS) resolve(id, P.rowText(id, info, t))
    }
    sysInfoPromise.then(info => {
      if (!info || !(info.cpu || info.gpu)) return
      S.liveInfo = info
      if (Array.isArray(info.changes)) S.changes = info.changes
      if (info.signature) S.signature = info.signature
      fillFromInfo(info)
    }).catch(() => {})

    // ── the end: identity card ────────────────────────────────────────────────
    async function showCard(info) {
      try { stage && stage.onStepActive('os') } catch {}
      const rc = P.rigClass(info)
      const card = $('boot-card'); if (!card) return
      const tier = rc ? { high: 'High', mid: 'Mid', entry: 'Entry' }[rc.tier] : null
      setText('bt-class', rc ? T('rig' + tier + (rc.form === 'laptop' ? 'Laptop' : 'Desktop')) : '')
      setText('bt-sig-label', T('signature'))
      const sig = S.signature || info.signature || ''
      setText('bt-sig', sig)
      const g = P.glyph(sig), svg = $('bt-glyph')
      if (svg) svg.innerHTML = '<path class="bt-glyph-spokes" d="' + g.spokes + '"/><path class="bt-glyph-ring" pathLength="1" d="' + g.ring + '"/>'
      // exact changes from main when it has finished; otherwise what the rows themselves showed — but only once CPU/RAM/GPU were really re-read
      const changes = Array.isArray(S.changes) ? S.changes : CORE.every(i => S.verified.has(i)) ? S.rowChanges : null
      let applied = 0
      for (const [k, v] of Object.entries(settings || {})) if (k.startsWith('tweak_') && v === 'applied') applied++
      const lines = []
      if (S.warm && changes && !changes.length) lines.push(T('pSame'))
      for (const p of P.promiseParts({ changes: changes || [], applied, lastRunAt: settings && settings.aom_last_run && settings.aom_last_run.ts, now: Date.now() })) lines.push(T(p.key, p.vars))
      if (!lines.length) lines.push(T('pFirst'))
      setText('bt-line', lines.join(' · '))
      card.hidden = false
      requestAnimationFrame(() => card.classList.add('is-in'))
      setText('boot-announce', T('ariaDone') + '. ' + lines.join('. '))
      const hold = reduced() ? 250 : (S.warm ? 1000 : 1400)
      const t0 = Date.now()
      while (Date.now() - t0 < hold && !S.aborted) await wait(40)
    }

    // ── gates ─────────────────────────────────────────────────────────────────
    async function gate() {
      // warm: the machine is shown and admin is known — that is enough to open the app (live reads keep landing in sysInfo)
      const warmGate = (async () => {
        await Promise.race([sysInfoPromise.then(() => 0, () => 0), new Promise(r => { const iv = setInterval(() => { if (S.warm) { clearInterval(iv); r() } }, 50); setTimeout(() => { clearInterval(iv); r() }, 1500) })])
        if (!S.warm) return sysInfoPromise   // cold: wait for the full scan
        await cascadeP
        await Promise.race([adminP, sysInfoPromise.then(() => 0, () => 0), wait(ADMIN_CAP_MS)])
        const t1 = Date.now()
        while (Date.now() - t1 < CORE_CAP_MS && !S.aborted && !CORE.every(i => S.verified.has(i)) && !S.liveInfo) await wait(50)
        return S.liveInfo || null
      })()
      const winner = await Promise.race([
        warmGate.then(v => ({ v })),
        forceP.then(() => ({ v: null, forced: true })),
        wait(BOOT_CAP_MS).then(() => ({ v: null, capped: true })),
      ])
      return winner
    }

    return (async () => {
      const w = await gate()
      clearInterval(tick)
      let info = w.v
      if (!info) {   // warm without live data yet, or forced / capped: start from what we know
        info = Object.assign({}, S.cached || {}, S.liveInfo || {})
        if (S.admin !== null) info.isAdmin = S.admin
      }
      // anything still unread is honest about it
      for (const i of IDS) if (!S.done.has(i)) { const t = P.rowText(i, info, T); resolve(i, t) }
      setTagline('tagDone', false)
      setProgress(true)
      await showCard(info)
      document.removeEventListener('keydown', S.onKey)
      return info
    })()
  }

  root.JylliBoot = { run }
})(typeof window !== 'undefined' ? window : globalThis)
