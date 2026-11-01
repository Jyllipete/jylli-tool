'use strict'
// Pure rig layout: RigSpec -> list of parts with positions, sizes and honest flags. No three.js, no DOM, so it is unit-tested and
// shared by the 3D engine and the SVG fallback. Rules: undetected parts are `ghost` (drawn faint with a "Not detected" chip),
// nothing is invented, and a laptop is laid out as a laptop. Units are arbitrary "case units" (a tower interior is ~8 x 10).
;(function (root) {
  const RAM_SLOT_ORDER = ['A1', 'A2', 'B1', 'B2']

  /** Physical slot of a stick, if the firmware says so ("DIMM_A2", "ChannelB-DIMM1"). Otherwise null (position not reported). */
  function slotFromStick(s) {
    const m = String(s.locator || '').match(/([A-D])\s*[-_ ]?\s*(?:DIMM)?\s*([1-4])\b/i) || String(s.locator || '').match(/CHANNEL\s*([A-D]).*?DIMM\s*([1-4])/i)
    return m ? m[1].toUpperCase() + m[2] : null
  }

  /** slots[]: one per physical slot (slotsTotal, or 4 when unknown), each { index, stick|null, positionKnown }. */
  function ramSlots(rig) {
    const total = Math.min(8, Math.max(rig.ram?.slotsTotal || 0, rig.ram?.sticks?.length || 0) || 4)
    const slots = Array.from({ length: total }, (_, i) => ({ index: i, name: RAM_SLOT_ORDER[i] || String(i + 1), stick: null, positionKnown: false }))
    const sticks = rig.ram?.sticks || []
    const unplaced = []
    for (const s of sticks) {
      const nm = slotFromStick(s)
      const slot = nm && slots.find(x => x.name === nm && !x.stick)
      if (slot) { slot.stick = s; slot.positionKnown = true } else unplaced.push(s)
    }
    // Position not reported: spread them over the slots in the order manufacturers recommend (2nd and 4th for two sticks), flagged as unknown.
    const free = slots.filter(x => !x.stick)
    const pref = unplaced.length === 2 && total === 4 ? [1, 3] : free.map(x => x.index)
    unplaced.forEach((s, i) => { const slot = slots[pref[i]] && !slots[pref[i]].stick ? slots[pref[i]] : free.find(x => !x.stick); if (slot) slot.stick = s })
    return slots
  }

  function part(id, kind, pos, size, extra = {}) { return Object.assign({ id, kind, pos, size, ghost: false, metrics: [] }, extra) }

  function towerLayout(rig) {
    const parts = []
    parts.push(part('case', 'case', [0, 0, 0], [8.4, 10.4, 4.6], { decor: true }))
    parts.push(part('board', 'board', [0, 0.2, -1.7], [6.6, 8.0, 0.16], { label: 'board', info: rig.board || {} }))
    // CPU + cooler
    parts.push(part('cpu', 'cpu', [-0.5, 1.9, -1.55], [1.1, 1.1, 0.12], { ghost: !rig.cpu, label: 'cpu', info: rig.cpu || {}, metrics: ['cpu.load', 'cpu.temp.package', 'cpu.power'] }))
    const c = rig.cooler || { type: 'unknown' }
    if (c.type === 'aio') {
      parts.push(part('cooler', 'aio', [-0.5, 1.9, -1.0], [1.7, 1.7, 1.0], { label: 'cooler', info: c, rad: { pos: [0, 4.78, -0.55], size: [5.6, 0.55, 2.6] }, metrics: ['cooler.pump.rpm'] }))
    } else if (c.type === 'air') {
      parts.push(part('cooler', 'air', [-0.5, 1.95, -0.65], [2.2, 2.6, 1.6], { label: 'cooler', info: c, metrics: [] }))
    } else {
      parts.push(part('cooler', 'cooler-unknown', [-0.5, 1.9, -1.0], [1.7, 1.7, 1.0], { ghost: true, label: 'cooler', info: c }))
    }
    // RAM
    const slots = ramSlots(rig)
    slots.forEach((s, i) => {
      parts.push(part('ram' + i, 'ram-slot', [1.45 + i * 0.42, 2.0, -1.2], [0.34, 3.4, 0.8], { slot: s, ghost: !s.stick, label: 'ram', info: s.stick || { slot: s.name }, metrics: s.stick ? ['ram.used', 'ram.load'] : [] }))
    })
    // GPU: only a detected, non-integrated adapter is drawn as a card; the fan count is never guessed
    const dgpu = (rig.gpus || []).find(g => !g.integrated)
    parts.push(part('gpu', 'gpu', [-0.3, -1.6, -0.7], [5.8, 1.8, 1.1], {
      ghost: !dgpu, label: 'gpu', info: dgpu || {}, fans: null,
      note: !dgpu && (rig.gpus || []).length ? 'integrated-only' : null,
      metrics: ['gpu0.load', 'gpu0.temp.core', 'gpu0.temp.hotspot', 'gpu0.power', 'gpu0.clock.core', 'gpu0.vram.used', 'gpu0.fan.rpm', 'gpu0.fan.pct'],
    }))
    // Drives
    let nv = 0, sata = 0
    ;(rig.drives || []).slice(0, 6).forEach((d, i) => {
      if (/nvme/i.test(d.bus || '')) { parts.push(part('drive' + i, 'nvme', [-1.9, 0.45 - nv * 0.7, -1.54], [1.9, 0.5, 0.14], { label: 'storage', info: d, metrics: ['disk.c.pct'] })); nv++ }
      else { parts.push(part('drive' + i, 'sata', [3.5, 1.4 - sata * 1.0, -0.9], [0.18, 0.9, 1.5], { label: 'storage', info: d, metrics: ['disk.c.pct'] })); sata++ }
    })
    if (!(rig.drives || []).length) parts.push(part('drive0', 'nvme', [-1.9, 0.45, -1.54], [1.9, 0.5, 0.14], { ghost: true, label: 'storage', info: {} }))
    parts.push(part('psu', 'psu', [0, -4.45, -0.4], [7.2, 1.3, 3.4], { decor: true }))
    // Showcase fans: three intake fans behind the front glass (+x wall) and one exhaust fan on the rear (-x) wall. Cosmetic decor: a
    // tower always has them, but glow level and spin come only from real sensor readings (js/twin/mapping.js state.caseFans, engine.js).
    // They never imply a part or fan count was detected. An AIO adds two decor radiator fans under its top-mounted radiator.
    ;[3.45, 0.55, -2.35].forEach((y, i) => parts.push(part('fanFront' + i, 'case-fan', [3.74, y, 0.45], [2.4, 2.4, 0.12], { decor: true, rot: [0, Math.PI / 2, 0] })))
    parts.push(part('fanRear', 'case-fan', [-3.95, 2.8, -0.6], [2.4, 2.4, 0.12], { decor: true, rot: [0, Math.PI / 2, 0] }))
    if (c.type === 'aio') [-1.4, 1.4].forEach((x, i) => parts.push(part('fanRad' + i, 'case-fan', [x, 4.4, -0.55], [2.4, 2.4, 0.12], { decor: true, rot: [Math.PI / 2, 0, 0] })))
    return parts
  }

  function laptopLayout(rig) {
    const parts = []
    parts.push(part('case', 'laptop-body', [0, -0.2, 0], [8.2, 0.5, 5.4], { decor: true }))
    parts.push(part('board', 'board', [0, -0.05, 0], [6.6, 0.1, 4.2], { label: 'board', info: rig.board || {} }))
    parts.push(part('cpu', 'cpu', [-1.4, 0.05, -0.6], [0.9, 0.1, 0.9], { ghost: !rig.cpu, label: 'cpu', info: rig.cpu || {}, metrics: ['cpu.load', 'cpu.temp.package', 'cpu.power'] }))
    const dgpu = (rig.gpus || []).find(g => !g.integrated)
    parts.push(part('gpu', 'gpu-laptop', [0.2, 0.05, -0.6], [1.3, 0.1, 1.1], { ghost: !dgpu, label: 'gpu', info: dgpu || {}, fans: null, metrics: ['gpu0.load', 'gpu0.temp.core', 'gpu0.power', 'gpu0.clock.core', 'gpu0.vram.used', 'gpu0.fan.rpm'] }))
    const slots = ramSlots({ ...rig, ram: { ...rig.ram, slotsTotal: Math.min(2, rig.ram?.slotsTotal || rig.ram?.sticks?.length || 2) } })
    slots.forEach((s, i) => parts.push(part('ram' + i, 'ram-slot-flat', [1.9, 0.05, -0.8 + i * 0.5], [1.6, 0.1, 0.34], { slot: s, ghost: !s.stick, label: 'ram', info: s.stick || { slot: s.name }, metrics: s.stick ? ['ram.used', 'ram.load'] : [] })))
    ;(rig.drives || []).slice(0, 2).forEach((d, i) => parts.push(part('drive' + i, 'nvme', [-2.0, 0.05, 0.9 + i * 0.5], [1.7, 0.1, 0.34], { label: 'storage', info: d, metrics: ['disk.c.pct'] })))
    parts.push(part('battery', 'battery', [0, 0.05, 1.6], [4.4, 0.12, 1.2], { decor: true }))
    return parts
  }

  /** layoutRig(rig) -> { formFactor, parts[], ghosts[] }. Unknown form factor renders as a tower and says so. */
  function layoutRig(rig) {
    rig = rig || {}
    const laptop = rig.formFactor === 'laptop'
    const parts = laptop ? laptopLayout(rig) : towerLayout(rig)
    return { formFactor: laptop ? 'laptop' : 'tower', formFactorKnown: rig.formFactor === 'laptop' || rig.formFactor === 'tower', parts, ghosts: parts.filter(p => p.ghost && !p.decor).map(p => p.id) }
  }

  const api = { layoutRig, ramSlots, slotFromStick }
  root.JylliTwinLayout = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
