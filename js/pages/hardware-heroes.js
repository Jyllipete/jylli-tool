'use strict'
// Optimize > CPU & memory / Power & storage, and the BIOS board card: facts from the hardware inventory (what Windows reports),
// live numbers through the telemetry formatter. Missing values read "Not available" with the reason; rated vs running memory speed
// is shown only when both are known; no drive temperatures or activity are claimed without a sensor.
async function heroRig() {
  try { const r = await api.getHardwareInventory(); return r && r.ok ? r.rig : null } catch { return null }
}
const metricCell = (key, label) => `<div class="j-gpu-cell"><div class="j-stat-label">${escHtml(tUI(label))}</div><div class="j-gpu-val j-num" data-odo data-metric="${escAttr(key)}">—</div></div>`

async function buildStorageHero(c) {
  const rig = await heroRig()
  const drives = rig ? rig.drives : []
  let plan = null
  try { const r = await api.getPowerPlan(); plan = r && r.name ? r : null } catch {}
  const el = document.createElement('section')
  el.id = 'storage-hero'; el.className = 'j-card j-gpu-hero'
  el.innerHTML = String(ui.html`
    <div class="j-twin-stage j-gpu-stage"><div class="j-twin-slot" id="storage-twin-slot" data-twin-view="rig:home" data-twin-focus="drive0"></div></div>
    <div class="j-gpu-side">
      <div class="j-gpu-strip">${ui.raw(metricCell('disk.c.pct', 'sensorKey_disk.c.pct'))}${ui.raw(metricCell('disk0.temp', 'sensorKey_disk0.temp'))}</div>
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
