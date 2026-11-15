'use strict'
// Devices tab: turns classified device records (classify.js) and the core parts (RigSpec) into what the page shows.
// Every shown fact is { value, source, confidence } and an unknown one is { value:null, reason }. A value is never shown as 0 / "Unknown" / "".
//   source      device    the device itself reported it (HID strings, bus description, EDID)
//               windows   Windows or its driver reported it (class, friendly name, driver version, problem code)
//               table     Jylli's short vendor-id list (lib/devices/vendors.js)
//               inferred  worked out from other facts (name words, usages)
//               measured  counted by a test the user ran (polling rate)
//   confidence  high / medium / low  (device strings and measurements that agree = high; our table or a driver name = medium; a guess or an abbreviation = low)
//   reason      absent (the device does not say) | unread (the part of the probe failed) | denied (needs admin) | unsupported | vendor_only | not_measured
const vendors = require('./vendors')
const { GENERIC_NAME } = require('./classify')

const F = (value, source, confidence, extra) => Object.assign({ value, source, confidence }, extra || {})
const U = reason => ({ value: null, source: null, confidence: null, reason })
const clean = s => { const t = String(s == null ? '' : s).trim(); return !t || /^\(.*\)$/.test(t) || /^(standard|microsoft)\b|^generic/i.test(t) || /^unknown$/i.test(t) ? '' : t }
const GENERIC_BUS = /audio device on high definition audio bus|wireless_device|^usb composite|^usb input/i
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const agrees = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x.slice(0, 4) === y.slice(0, 4) || x.includes(y) || y.includes(x)) }

// EDID maker codes (PnP ids) that monitors report. Anything not here is shown as its code.
const EDID_MAKERS = { MSI: 'MSI', SAM: 'Samsung', DEL: 'Dell', GSM: 'LG', AOC: 'AOC', ACI: 'ASUS', AUS: 'ASUS', BNQ: 'BenQ', GBT: 'Gigabyte', HWP: 'HP', LEN: 'Lenovo', ACR: 'Acer', PHL: 'Philips', VSC: 'ViewSonic', NEC: 'NEC', SNY: 'Sony', MAG: 'MAG', XMI: 'Xiaomi', EVE: 'Eve', KOG: 'KOORUI' }

const dedupe = (a, b) => (norm(a).includes(norm(b)) ? a : (b + ' ' + a).trim())

function nameFacts(rec, sec) {
  const hidOk = sec && sec.hid && sec.hid.ok
  if (rec.category === 'display' && rec.monitor) {
    const maker = EDID_MAKERS[rec.monitor.mfr] || rec.monitor.mfr
    return { model: rec.monitor.model ? F(rec.monitor.model, 'device', 'high') : U('absent'), maker: maker ? F(maker, EDID_MAKERS[rec.monitor.mfr] ? 'table' : 'device', EDID_MAKERS[rec.monitor.mfr] ? 'high' : 'medium') : null }
  }
  if (rec.hidProd) return { model: F(rec.hidProd, 'device', 'high') }
  if (rec.bus && !GENERIC_BUS.test(rec.bus) && !GENERIC_NAME.test(rec.bus)) return { model: F(rec.bus, 'device', 'high') }
  if (rec.friendly) { const generic = GENERIC_NAME.test(rec.friendly) || /^generic/i.test(rec.friendly); return { model: F(rec.friendly, 'windows', generic ? 'low' : 'medium', generic ? { note: 'generic' } : {}) } }
  return { model: U(hidOk || rec.interfaces.every(i => !i.hid) ? 'absent' : 'unread') }
}

function vendorFact(rec, makerFromEdid, sec) {
  if (makerFromEdid) return makerFromEdid
  const tbl = vendors.lookup(rec.vid)
  const devMfr = clean(rec.hidMfr) || clean(rec.pnpMfr) || (rec.pnpMfrs || []).map(clean).find(Boolean) || ''
  const pci = !rec.vid && !devMfr ? vendors.pciVendor(rec.instanceIds) : ''
  if (pci) return F(pci, 'table', 'medium', { note: 'chip_maker' })
  if (tbl && !tbl.oem) {
    const conflict = devMfr && !agrees(tbl.name, devMfr)
    return F(tbl.name, 'table', conflict ? 'low' : tbl.check === 'device' ? 'high' : devMfr ? 'high' : 'medium', conflict ? { note: 'conflict', deviceSays: devMfr } : devMfr ? { deviceSays: devMfr } : {})
  }
  if (devMfr && devMfr.length >= 4) return F(devMfr, 'device', 'medium', tbl ? { note: 'chip_maker', chipMaker: tbl.name } : {})
  if (devMfr) return F(devMfr, 'device', 'low', { note: 'abbreviated', vid: rec.vid })
  if (tbl) return F(tbl.name, 'table', 'medium', { note: 'chip_maker' })
  if (rec.vid) return U('absent')
  return sec && sec.hid && !sec.hid.ok && rec.interfaces.some(i => /^HID\\/i.test(i.id)) ? U('unread') : U('absent')
}

const CONN_FACT = {
  usb: () => F('usb', 'windows', 'high'),
  receiver: () => F('receiver', 'inferred', 'medium'),
  bluetooth: () => F('bluetooth', 'windows', 'high'),
  internal: () => F('internal', 'windows', 'medium'),
  display: () => F('display', 'windows', 'medium'),
  software: () => F('software', 'windows', 'high'),
}

function portText(loc) { const m = /Port_#0*(\d+)\.Hub_#0*(\d+)/i.exec(String(loc || '')); return m ? { hub: Number(m[2]), port: Number(m[1]) } : null }
const diagonalIn = m => (m && m.wCm && m.hCm ? Math.round(Math.sqrt(m.wCm * m.wCm + m.hCm * m.hCm) / 2.54 * 10) / 10 : null)

/** One device record -> the object the page renders. */
function present(rec, ctx) {
  const sec = ctx.sec || {}
  const nf = nameFacts(rec, sec)
  const vendor = vendorFact(rec, nf.maker, sec)
  const model = nf.model
  const useVendor = vendor.value && vendor.confidence !== 'low' && vendor.note !== 'chip_maker' && vendor.note !== 'abbreviated'
  const title = model.value ? (useVendor ? dedupe(model.value, vendor.value) : model.value) : (vendor.value ? vendor.value : '')
  const facts = { vendor, model, connection: CONN_FACT[rec.connection] ? CONN_FACT[rec.connection]() : U('absent') }
  facts.ids = rec.vid && rec.pid ? F('VID ' + rec.vid + ' / PID ' + rec.pid, 'device', 'high', { vid: rec.vid, pid: rec.pid }) : U('absent')
  facts.driver = rec.driver ? F(rec.driver, 'windows', 'high') : U('absent')
  const pt = portText(rec.port)
  facts.port = pt ? F(pt, 'windows', 'high') : U('absent')
  if (rec.category === 'display' && rec.monitor) {
    const d = diagonalIn(rec.monitor)
    facts.size = d ? F(d, 'device', 'medium', { note: 'approx', wCm: rec.monitor.wCm, hCm: rec.monitor.hCm }) : U('absent')
    facts.year = rec.monitor.year ? F(rec.monitor.year, 'device', 'high') : U('absent')
  }
  if (rec.paired) facts.battery = rec.battery != null ? F(rec.battery, 'device', 'high') : U('absent')
  else if (['mouse', 'keyboard', 'gamepad'].includes(rec.category) && rec.connection === 'receiver') facts.battery = U('vendor_only')
  if (rec.category === 'mouse' && !rec.virtual) {
    const p = (ctx.polls || {})[rec.id]
    facts.polling = p ? F(p.hz, 'measured', p.confidence, { rawHz: p.rawHz, at: p.at, snapped: p.snapped }) : U('not_measured')
  }
  const dev = {
    id: rec.id, category: rec.category, virtual: rec.virtual, present: true, core: false,
    title: title || '', unnamed: !title, facts,
    kindSource: rec.category === 'other' ? null : hidKind(rec),
    endpoints: rec.endpoints, interfaces: rec.interfaces,
    problem: rec.problem, app: appOf(rec), instanceIds: rec.instanceIds || [],
  }
  return dev
}

/** Where the category came from: the HID usages the device reports ('device') or a name / class guess ('inferred'). */
function hidKind(rec) {
  const usages = rec.interfaces.filter(i => i.hid).map(i => i.hid.page + '/' + i.hid.usage)
  const hid = { mouse: '0001/0002', keyboard: '0001/0006', gamepad: '0001/0005' }[rec.category]
  if (hid && usages.includes(hid)) return { source: 'device', confidence: 'high' }
  return { source: 'inferred', confidence: 'medium' }
}
function appOf(rec) { const a = vendors.appFor(rec.vid); return a ? { id: a.id, name: a.name } : null }

// ── core parts, straight from the RigSpec (lib/inventory.js), source "windows" ─────────────────────────────────────────────
function coreParts(rig) {
  if (!rig) return []
  const out = []
  const W = (v, c) => (v == null || v === '' ? U('absent') : F(v, 'windows', c || 'high'))
  const mk = (id, category, name, facts, items) => out.push({ id, category, virtual: false, present: true, core: true, title: name || '', unnamed: !name, facts, items: items || [], endpoints: [], interfaces: [], problem: null, app: null })
  if (rig.cpu) mk('core-cpu', 'cpu', rig.cpu.name, { vendor: W(rig.cpu.vendor), cores: W(rig.cpu.cores), threads: W(rig.cpu.threads), socket: W(rig.cpu.socket) })
  ;(rig.gpus || []).forEach((g, i) => mk('core-gpu-' + i, 'gpu', g.name, { vendor: W(g.vendor), driver: W(g.driver), integrated: g.integrated == null ? U('absent') : F(!!g.integrated, 'windows', 'medium') }))
  if (rig.ram && rig.ram.sticks && rig.ram.sticks.length) {
    const total = rig.ram.sticks.reduce((a, s) => a + (s.sizeGB || 0), 0)
    mk('core-ram', 'ram', total ? total + ' GB' : '', { slots: W(rig.ram.slotsTotal), type: W(rig.ram.sticks[0].type) },
      rig.ram.sticks.map(s => ({ locator: s.locator || '', sizeGB: s.sizeGB || null, ratedMT: s.ratedMT || null, speedMT: s.speedMT || null, part: s.part || '', type: s.type || '' })))
  }
  ;(rig.drives || []).forEach((d, i) => mk('core-drive-' + i, 'storage', d.name, { media: W(d.media), bus: W(d.bus), sizeGB: W(d.sizeGB), health: W(d.health, 'medium') }))
  if (rig.board && (rig.board.vendor || rig.board.model)) mk('core-board', 'board', [rig.board.vendor, rig.board.model].filter(Boolean).join(' '), { vendor: W(rig.board.vendor), model: W(rig.board.model) })
  ;(rig.adapters || []).forEach((a, i) => mk('core-net-' + i, 'network', a.desc || a.name, { speed: W(a.speed, 'medium'), kind: W(a.kind, 'medium'), up: a.up == null ? U('absent') : F(!!a.up, 'windows', 'high') }))
  return out
}

// ── remembering devices, so one that is unplugged shows as "Disconnected" instead of vanishing ──────────────────────────
const MAX_REMEMBERED = 200
function remember(state, devices, now) {
  const s = Object.assign({ devices: {}, polls: {} }, state || {})
  s.devices = Object.assign({}, s.devices)
  for (const d of devices) {
    if (d.virtual || d.core || !d.title) continue
    const prev = s.devices[d.id]
    s.devices[d.id] = { id: d.id, title: d.title, category: d.category, vendor: d.facts.vendor && d.facts.vendor.value || null, firstSeen: prev ? prev.firstSeen : now, lastSeen: now }
  }
  const ids = Object.keys(s.devices)
  if (ids.length > MAX_REMEMBERED) for (const id of ids.sort((a, b) => s.devices[a].lastSeen - s.devices[b].lastSeen).slice(0, ids.length - MAX_REMEMBERED)) delete s.devices[id]
  return s
}

/** The whole snapshot. `probe` null = the probe itself failed; `rig` may be null. */
function build({ probe, records, rig, state, now }) {
  const st = state || {}
  const sec = probe ? probe.sec : {}
  const real = [], software = []
  for (const rec of records || []) {
    const d = present(rec, { sec, polls: st.polls })
    ;(d.virtual ? software : real).push(d)
  }
  const nowIds = new Set(real.map(d => d.id))
  const disconnected = probe && sec.pnp && sec.pnp.ok
    ? Object.values(st.devices || {}).filter(r => !nowIds.has(r.id)).sort((a, b) => b.lastSeen - a.lastSeen).map(r => ({ id: r.id, title: r.title, category: r.category, vendor: r.vendor, lastSeen: r.lastSeen, present: false, disconnected: true }))
    : []
  const core = coreParts(rig)
  let unknown = 0
  for (const d of real) for (const k of d.category === 'display' ? ['vendor', 'model'] : ['vendor', 'model', 'connection']) if (d.facts[k] && d.facts[k].value == null) unknown++
  const counts = {}
  for (const d of real) counts[d.category] = (counts[d.category] || 0) + 1
  return {
    devices: real, software, disconnected, core,
    sections: sec, admin: probe ? probe.admin : null, read: !!probe,
    counts, unknown, problems: real.filter(d => d.problem).length,
    when: now,
  }
}

module.exports = { F, U, present, coreParts, remember, build, EDID_MAKERS, agrees, portText }
