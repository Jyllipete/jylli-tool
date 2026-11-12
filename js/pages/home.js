'use strict'
// Home (dashboard) page: the page itself is js/home/page.js (JylliHomePage, "Helm"). This file keeps the 3D rig helpers it mounts
// (twinInit / twinInspect / twinFirstRun / twinOpenGpu), which the boot handoff and the tours also use.
function buildDashboard(c) { JylliHomePage.mount(c) }

// ── 3D twin on Home ─────────────────────────────────────────────────────────────────────────────────
// The stage shows the real rig (JylliTwin). Hover/click a part for its inspector; a keyboard-reachable list mirrors the canvas.
const TWIN_PART_LABEL = { cpu: 'twinPartCpu', gpu: 'twinPartGpu', ram: 'twinPartRam', storage: 'twinPartStorage', board: 'twinPartBoard', cooler: 'twinPartCooler' }
function twinInit() {
  const slot = document.getElementById('home-twin-slot')
  if (!slot || !window.JylliTwin) return
  JylliTwin.attach(slot)
  const list = document.getElementById('twin-parts')
  const wire = () => {
    const lay = JylliTwin.layout
    if (!lay || !list) return false
    const seen = new Set()
    list.innerHTML = lay.parts.filter(p => !p.decor && !(p.kind === 'ram-slot' && !p.slot.stick && p.id !== 'ram0')).map(p => {
      const k = p.label || p.id
      if (seen.has(k) && k !== 'storage') return ''
      seen.add(k)
      return `<li><button type="button" class="j-btn j-btn-ghost j-btn-sm" data-twin-part="${escAttr(p.id)}">${escHtml(tUI(TWIN_PART_LABEL[k] || 'twinPartBoard'))}${p.ghost ? ' · ' + escHtml(tUI('twinNotDetected')) : ''}</button></li>`
    }).join('')
    list.querySelectorAll('[data-twin-part]').forEach(b => { b.onclick = () => JylliTwin.select(b.dataset.twinPart) })
    return true
  }
  let tries = 0
  const t = setInterval(() => { if (wire() || ++tries > 20) clearInterval(t) }, 250)
  JylliTwin.on('select', id => twinInspect(id))
  JylliTwin.on('assemble', () => { try { JylliSound.play('click') } catch {} })
  if (!settings.assemblyDone) twinFirstRun(slot)
  document.getElementById('home-twin-stage')?.addEventListener('keydown', e => { if (e.key === 'Escape') JylliTwin.back() })
}

function twinInspect(id) {
  const box = document.getElementById('twin-inspector')
  const hint = document.getElementById('twin-hint')
  if (!box) return
  if (!id) { box.hidden = true; box.innerHTML = ''; if (hint) hint.hidden = false; return }
  const info = JylliTwin.partInfo(id)
  if (!info) return
  if (hint) hint.hidden = true
  const key = TWIN_PART_LABEL[info.label] || 'twinPartBoard'
  const facts = twinFacts(info).map(([k, v]) => `<div class="j-twin-row"><span>${escHtml(k)}</span><span>${escHtml(v)}</span></div>`).join('')
  const metrics = info.metrics.map(m => `<div class="j-twin-row"><span>${escHtml(tUI('sensorKey_' + m))}</span><span class="j-num" data-odo data-metric="${escAttr(m)}">—</span></div>`).join('')
  const openGpu = id === 'gpu' && !info.ghost ? `<button type="button" class="j-btn j-btn-sm" onclick="twinOpenGpu()">${escHtml(tUI('twinOpenGpu'))}</button>` : ''
  const ghost = info.ghost ? `<div class="j-twin-ghost-note">${escHtml(tUI(info.note === 'integrated-only' ? 'twinIntegratedOnly' : 'twinNotDetected'))}${twinSetIt(info)}</div>` : ''
  box.innerHTML = `<div class="j-twin-insp-head"><b>${escHtml(tUI(key))}</b><button type="button" class="j-btn j-btn-ghost j-btn-sm j-btn-icon" id="twin-back" aria-label="${escAttr(tUI('twinBack'))}"><i class="fa fa-xmark" aria-hidden="true"></i></button></div>${ghost}${facts}${metrics}${openGpu}`
  box.hidden = false
  document.getElementById('twin-back').onclick = () => JylliTwin.back()
  try { JylliTelemetry.applyToDom() } catch {}
}

function twinFacts(info) {
  const i = info.info || {}, rows = []
  const add = (k, v) => { if (v != null && v !== '' && v !== false) rows.push([tUI(k), String(v)]) }
  if (info.label === 'cpu') { add('twinFactModel', i.name); if (i.cores) add('twinFactCores', i.cores + ' / ' + (i.threads || '?')) }
  else if (info.label === 'gpu') { add('twinFactModel', i.name); add('twinFactDriver', i.driver) }
  else if (info.label === 'ram') { add('twinFactModel', i.part); if (i.sizeGB) add('twinFactSize', i.sizeGB + ' GB'); if (i.ratedMT) add('twinFactRated', i.ratedMT + ' MT/s'); if (i.speedMT) add('twinFactRunning', i.speedMT + ' MT/s'); if (i.channel) add('twinFactSlot', i.channel + ' (' + tUI('twinSlotUnknown') + ')') }
  else if (info.label === 'storage') { add('twinFactModel', i.name); if (i.sizeGB) add('twinFactSize', i.sizeGB + ' GB'); add('twinFactBus', i.bus); add('twinFactHealth', i.health) }
  else if (info.label === 'board') { add('twinFactModel', [i.vendor, i.model].filter(Boolean).join(' ')) }
  else if (info.label === 'cooler') { add('twinFactType', i.type && i.type !== 'unknown' ? tUI(i.type === 'aio' ? 'twinCoolerAio' : 'twinCoolerAir') : ''); add('twinFactSource', i.source === 'user' ? tUI('twinSourceUser') : '') }
  return rows
}

function twinSetIt(info) {
  if (info.label !== 'cooler') return ''
  return ` <button type="button" class="j-btn j-btn-sm" onclick="twinDeclare('aio')">${escHtml(tUI('twinCoolerAio'))}</button> <button type="button" class="j-btn j-btn-sm" onclick="twinDeclare('air')">${escHtml(tUI('twinCoolerAir'))}</button>`
}
async function twinDeclare(kind) {
  await api.setDeclaredRig({ cooler: kind })
  await JylliTwin.setRigDeclared()
  JylliTwin.back()
}

// First run: the rig assembles itself from what was detected, then offers Auto-Optimize. It never runs anything by itself.
function twinFirstRun(slot) {
  let tries = 0
  const wait = setInterval(async () => {
    if (JylliTwin.bootActive) return           // the boot stage still owns the canvas; wait for the handoff
    if (JylliTwin.state === 'live') {
      clearInterval(wait)
      const stage = document.getElementById('home-twin-stage')
      if (!stage) return
      const bar = document.createElement('div')
      bar.className = 'j-twin-assembly'
      // the loading screen already built the rig from the detection results: no second assembly, only the Auto-Optimize offer below
      if (!JylliTwin.bootAssembled) {
        bar.innerHTML = `<span>${escHtml(tUI('twinAssembling'))}</span><button type="button" class="j-btn j-btn-ghost j-btn-sm" id="twin-skip">${escHtml(tUI('twinSkip'))}</button>`
        stage.appendChild(bar)
        const skip = bar.querySelector('#twin-skip'); if (skip) skip.onclick = () => JylliTwin.skipAssembly()
        await JylliTwin.assemble({ reduced: document.body.classList.contains('motion-reduced') || matchMedia('(prefers-reduced-motion: reduce)').matches })
      } else stage.appendChild(bar)
      settings.assemblyDone = true; api.saveSettings(settings)
      if (!bar.isConnected) return          // the user left Home during the animation
      // the Next Best Move beside the rig carries the recommendation; a second Auto-Optimize offer would compete with it
      const autoBtn = ''
      bar.innerHTML = `<span>${escHtml(tUI('twinAssembled'))}</span>${autoBtn}<button type="button" class="j-btn j-btn-ghost j-btn-sm" id="twin-assembly-close">${escHtml(tUI('close'))}</button>`
      bar.querySelector('#twin-assembly-close').onclick = () => bar.remove()
    } else if (JylliTwin.state === 'static' || ++tries > 40) { clearInterval(wait); settings.assemblyDone = true; api.saveSettings(settings) }
  }, 300)
}

// "Open GPU": the stage morphs into the GPU hero's stage (View Transitions; plain navigation when unsupported or motion is reduced).
function twinOpenGpu() {
  const go = () => { window._activeTab = window._activeTab || {}; window._activeTab.optimize = 'gpu'; showPage('hardware') }
  const stage = document.getElementById('home-twin-stage')
  const reduced = document.body.classList.contains('motion-reduced') || matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!document.startViewTransition || reduced || !stage) return go()
  stage.style.viewTransitionName = 'part-gpu'
  const vt = document.startViewTransition(async () => {
    go()
    await new Promise(r => setTimeout(r, 450))
    const s2 = document.getElementById('gpu-hero')?.querySelector('.j-twin-stage')
    if (s2) s2.style.viewTransitionName = 'part-gpu'
  })
  vt.finished.finally(() => { document.querySelectorAll('.j-twin-stage').forEach(e => { e.style.viewTransitionName = '' }) })
}
