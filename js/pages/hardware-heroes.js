'use strict'
// Optimize > CPU & memory / Power & storage, and the BIOS board card: facts from the hardware inventory (what Windows reports),
// live numbers through the telemetry formatter. Missing values read "Not available" with the reason; rated vs running memory speed
// is shown only when both are known; no drive temperatures or activity are claimed without a sensor.
async function heroRig() {
  try { const r = await api.getHardwareInventory(); return r && r.ok ? r.rig : null } catch { return null }
}
const metricCell = (key, label) => `<div class="j-gpu-cell"><div class="j-stat-label">${escHtml(tUI(label))}</div><div class="j-gpu-val j-num" data-metric="${escAttr(key)}">—</div></div>`

async function buildCpuMemHero(c) {
  const rig = await heroRig()
  const el = document.createElement('section')
  el.id = 'cpumem-hero'; el.className = 'j-card j-gpu-hero'
  const cpu = rig && rig.cpu
  const sticks = rig && rig.ram ? rig.ram.sticks : []
  const stickRows = sticks.map(s => {
    const below = s.ratedMT && s.speedMT && s.speedMT < s.ratedMT * 0.95
    const tip = below ? `<span class="j-badge j-badge-warning" title="${escAttr(tUI('hwMemBelowTip'))}">${escHtml(tUI('hwMemBelow'))}</span>` : (s.ratedMT && s.speedMT ? `<span class="j-badge j-badge-success">${escHtml(tUI('hwMemAtRated'))}</span>` : '')
    return ui.row({ title: `${s.channel ? tUI('twinFactSlot') + ' ' + s.channel + ' · ' : ''}${s.sizeGB || '?'} GB ${s.type || ''}`, sub: [s.part, s.ratedMT ? tUI('twinFactRated') + ' ' + s.ratedMT + ' MT/s' : '', s.speedMT ? tUI('twinFactRunning') + ' ' + s.speedMT + ' MT/s' : ''].filter(Boolean).join(' · '), control: tip })
  }).join('')
  el.innerHTML = String(ui.html`
    <div class="j-twin-stage j-gpu-stage"><div class="j-twin-slot" id="cpumem-twin-slot" data-twin-view="rig:home"></div></div>
    <div class="j-gpu-side">
      <div class="j-gpu-strip">${[['cpu.load', 'sensorKey_cpu.load'], ['cpu.temp.package', 'sensorKey_cpu.temp.package'], ['cpu.power', 'sensorKey_cpu.power'], ['ram.used', 'sensorKey_ram.used'], ['ram.load', 'sensorKey_ram.load']].map(([k, l]) => ui.raw(metricCell(k, l)))}</div>
      ${cpu ? ui.group('', [ui.row({ title: tUI('twinFactModel'), control: ui.html`<span class="j-num">${cpu.name}</span>` }), ui.row({ title: tUI('twinFactCores'), control: ui.html`<span class="j-num">${cpu.cores || '?'} / ${cpu.threads || '?'}</span>` })]) : ui.callout(tUI('hwNotDetected'), 'info')}
      <div class="j-stat-label">${tUI('twinPartRam')}</div>
      ${sticks.length ? ui.group('', ui.raw(stickRows)) : ui.callout(tUI('hwNotDetected'), 'info')}
    </div>`)
  c.prepend(el)
  const slot = el.querySelector('#cpumem-twin-slot'); if (slot && window.JylliTwin) JylliTwin.attach(slot)
  try { JylliTelemetry.applyToDom() } catch {}
}

async function buildStorageHero(c) {
  const rig = await heroRig()
  const drives = rig ? rig.drives : []
  let plan = null
  try { const r = await api.getPowerPlan(); plan = r && r.name ? r : null } catch {}
  const el = document.createElement('section')
  el.id = 'storage-hero'; el.className = 'j-card j-gpu-hero'
  el.innerHTML = String(ui.html`
    <div class="j-twin-stage j-gpu-stage"><div class="j-twin-slot" id="storage-twin-slot" data-twin-view="rig:home"></div></div>
    <div class="j-gpu-side">
      <div class="j-gpu-strip">${ui.raw(metricCell('disk.c.pct', 'sensorKey_disk.c.pct'))}</div>
      <div class="j-stat-label">${tUI('twinPartStorage')}</div>
      ${drives.length ? ui.group('', ui.raw(drives.map(d => ui.row({ title: d.name, sub: [d.bus, d.media, d.sizeGB ? d.sizeGB + ' GB' : ''].filter(Boolean).join(' · '), control: d.health ? ui.badge(d.health, d.health === 'Healthy' ? 'success' : 'warning') : '' })).join(''))) : ui.callout(tUI('hwNotDetected'), 'info')}
      <p class="j-muted j-settings-hint">${tUI('hwDriveTempNA')}</p>
      ${ui.group('', [ui.row({ title: tUI('hwPowerPlan'), sub: plan ? '' : tUI('metricNA'), control: ui.html`<span class="j-num">${plan ? plan.name : '—'}</span>` })])}
    </div>`)
  c.prepend(el)
  const slot = el.querySelector('#storage-twin-slot'); if (slot && window.JylliTwin) JylliTwin.attach(slot)
  try { JylliTelemetry.applyToDom() } catch {}
}

async function buildBoardCard(c) {
  const rig = await heroRig()
  const b = rig && rig.board
  const name = b && [b.vendor, b.model].filter(Boolean).join(' ')
  const card = document.createElement('div')
  card.id = 'bios-board-card'
  card.innerHTML = String(ui.card({ title: tUI('twinPartBoard'), body: ui.html`<div class="j-home-chips">${name ? ui.badge(name) : ui.html`<span class="j-muted">${tUI('twinNotDetected')}</span>`}<span class="j-muted">${tUI('hwBoardSource')}</span></div>` }))
  c.prepend(card)
}
