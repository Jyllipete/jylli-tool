'use strict'
// Easy mode brain (pure): from facts about THIS PC (caps + RAM facts + BIOS info) and, when read, the firmware settings, produce
// suggestions and presets. Rules:
//   - a suggestion exists only when a measured fact or a readable setting backs it; unknown facts produce nothing
//   - changes only ever touch Normal/Moderate settings (policy.classify), never voltages, timings, clocks or read-only items
//   - C-states are never suggested off, on any PC
// statuses: do (change worth making), good (already right), check (needs the user: update BIOS, etc.), leave (set against the evidence)
const K = require('./knowledge')
const policy = require('./policy')

const dayMs = 24 * 3600 * 1000
const NAME_TO_BRAND = [[/asus|asustek/i, 'asus'], [/msi|micro-star/i, 'msi'], [/gigabyte/i, 'gigabyte'], [/asrock/i, 'asrock']]
const brandOf = v => { for (const [re, b] of NAME_TO_BRAND) if (re.test(v || '')) return b; return null }
// usual menu locations; worded "usually" in the UI because they differ between BIOS versions
const WHERE = {
  'memory-profile': { asus: 'Ai Tweaker', msi: 'OC', gigabyte: 'Tweaker', asrock: 'OC Tweaker' },
  rebar: { asus: 'Advanced > PCI Subsystem Settings', msi: 'Settings > Advanced > PCI Subsystem Settings', gigabyte: 'Settings > IO Ports', asrock: 'Advanced > PCI Configuration' },
}

function biosAgeDays(date, now) {
  const t = Date.parse(String(date || '').replace(/^(\d{4})(\d{2})(\d{2}).*$/, '$1-$2-$3'))
  return Number.isFinite(t) ? Math.floor((now - t) / dayMs) : null
}

/**
 * @param {object} a { caps, ram, info:{vendor,board,biosDate,uefi}, settings|null, writable:boolean, now? }
 * @returns {{ facts, suggestions, presets, myths }}
 */
function advise({ caps, ram, info, settings, writable, now = Date.now() }) {
  caps = caps || {}; info = info || {}; ram = ram || {}
  const haveSettings = Array.isArray(settings) && settings.length > 0
  const brand = brandOf(info.board || info.vendor)
  const where = id => (brand && WHERE[id] && WHERE[id][brand]) || null
  const cpu = caps.cpu || null, gpu = caps.gpu || null
  const out = []
  const add = s => { out.push({ changes: [], manual: null, inPreset: true, presets: ['best', 'gaming'], ...s }); return out[out.length - 1] }

  // build a change for one knowledge entry; null when it can't be done safely and unambiguously
  function change(id, { mustBeOff } = {}) {
    if (!haveSettings) return null
    const f = K.findSetting(settings, id); if (!f.setting) return null
    const s = f.setting
    if (mustBeOff && !K.isOff(K.labelOf(s, s.current))) return null
    const o = K.targetOption(s, id); if (!o || o.value === s.current) return null
    const c = policy.classify(s)
    if (c.tier === 'critical' || c.tier === 'readonly') return null
    return { key: s.key, id: s.id, name: s.name, value: o.value, fromLabel: K.labelOf(s, s.current), toLabel: o.label, tier: c.tier }
  }
  const readsOff = id => { if (!haveSettings) return null; const f = K.findSetting(settings, id); return f.setting ? K.isOff(K.labelOf(f.setting, f.setting.current)) : null }
  const apply = (s, chs) => { const list = chs.filter(Boolean); s.changes = list; return s }

  const date = (caps.bios && caps.bios.date) || info.biosDate || null
  const age = biosAgeDays(date, now)

  // ── memory profile ──
  if (ram.xmp === 'off') {
    const am5 = cpu && cpu.vendor === 'amd' && (cpu.family === 'zen4' || cpu.family === 'zen5') && cpu.mobile === false
    const early = am5 && cpu.family === 'zen4' && date && Date.parse(String(date).replace(/^(d{4})(d{2})(d{2}).*$/, '$1-$2-$3')) < Date.parse('2023-06-01')
    const vars = { cur: ram.xmpConfiguredMT, rated: ram.xmpRatedMT || '?', type: ram.type, where: where('memory-profile') }
    const f = haveSettings ? K.findSetting(settings, 'memory-profile') : {}
    const target = f.setting ? K.targetOption(f.setting, 'memory-profile') : null
    if (early) add({ id: 'memory-profile', status: 'check', vars, reason: 'early-am5', presets: [] })
    else if (f.setting && target && target.value === f.setting.current) add({ id: 'memory-profile', status: 'check', vars, reason: 'set-not-effective', presets: [] })
    else {
      const c = change('memory-profile')
      apply(add({ id: 'memory-profile', status: 'do', vars, manual: c ? null : { steps: 'memory-profile' } }), [c])
    }
  } else if (ram.xmp === 'on') {
    add({ id: 'memory-profile', status: 'good', vars: { cur: ram.xmpConfiguredMT, rated: ram.xmpRatedMT || ram.xmpConfiguredMT } })
  }

  // ── Resizable BAR (CSM off + Above 4G + ReBAR: one linked change, all or nothing) ──
  const nv30 = gpu && gpu.vendor === 'nvidia' && ['rtx30', 'rtx40', 'rtx50'].includes(gpu.arch)
  if (gpu && gpu.discrete === true) {
    if (caps.rebar === true) add({ id: 'rebar', status: 'good', vars: { gpu: gpu.name } })
    else if (nv30 && caps.rebar === false) {
      const vars = { gpu: gpu.name, where: where('rebar') }
      if (info.uefi === false) add({ id: 'rebar', status: 'check', vars, reason: 'legacy-boot', presets: [] })
      else {
        const a4 = haveSettings ? K.findSetting(settings, 'above4g').setting : null
        const rb = haveSettings ? K.findSetting(settings, 'rebar').setting : null
        const complete = !!(a4 && rb && K.targetOption(a4, 'above4g') && K.targetOption(rb, 'rebar'))
        const chs = complete ? [change('csm'), change('above4g'), change('rebar')].filter(Boolean) : []
        if (complete && !chs.length) add({ id: 'rebar', status: 'check', vars, reason: 'set-not-effective', presets: [] })
        else apply(add({ id: 'rebar', status: 'do', vars, manual: chs.length ? null : { steps: 'rebar' } }), chs)
      }
    }
  }

  // ── boost and threads ──
  const boostOff = readsOff('turbo')
  if (boostOff === true) { const s = add({ id: 'boost', status: 'do', vars: {} }); apply(s, [change('turbo', { mustBeOff: true })]); if (!s.changes.length) s.manual = { steps: 'boost' } }
  else if (boostOff === false) add({ id: 'boost', status: 'good', vars: {} })
  if (readsOff('smt') === true) { const s = add({ id: 'smt', status: 'do', vars: {}, presets: [] }); apply(s, [change('smt', { mustBeOff: true })]); if (!s.changes.length) s.manual = { steps: 'smt' } }

  // ── C-states: never suggested off ──
  if (readsOff('cstates') === true) { const s = add({ id: 'cstates', status: 'leave', vars: {}, presets: [] }); apply(s, [change('cstates', { mustBeOff: true })]) }

  // ── quiet preset ──
  if (readsOff('aspm') === true) { const s = add({ id: 'aspm', status: 'do', vars: {}, presets: ['quiet'] }); apply(s, [change('aspm', { mustBeOff: true })]) }
  const fan = haveSettings ? K.findSetting(settings, 'fan-always-on') : {}
  if (fan.setting && !K.isOff(K.labelOf(fan.setting, fan.setting.current)) && caps.form === 'laptop') {
    const s = add({ id: 'fan-always-on', status: 'do', vars: {}, presets: ['quiet'] }); apply(s, [change('fan-always-on')])
  }

  // ── laptops with switchable graphics (gaming preset only) ──
  if (caps.form === 'laptop' && caps.hybridGraphics === true && haveSettings) {
    const c = change('gpu-mode')
    if (c) apply(add({ id: 'gpu-mode', status: 'do', vars: { gpu: gpu && gpu.name }, presets: ['gaming'] }), [c])
  }

  // ── things only the user can do ──
  if (cpu && cpu.raptorLakeDesktop && cpu.microcode != null && cpu.microcode < 0x12F) {
    add({ id: 'raptor', status: 'check', vars: { cpu: cpu.name, rev: '0x' + cpu.microcode.toString(16).toUpperCase() }, inPreset: false, presets: [] })
  }
  if (caps.sec && caps.sec.secureBoot === false && caps.host && Array.isArray(caps.host.antiCheat) && caps.host.antiCheat.length) {
    add({ id: 'secureboot', status: 'check', vars: { names: caps.host.antiCheat.join(', ') }, inPreset: false, presets: [] })
  }
  if (age != null && age > 3 * 365) add({ id: 'biosage', status: 'check', vars: { date: String(date), years: Math.floor(age / 365) }, inPreset: false, presets: [] })

  // ── presets ──
  const presets = ['best', 'gaming', 'quiet'].map(pid => {
    const list = out.filter(s => s.presets.includes(pid))
    const changes = []
    for (const s of list) if (s.status !== 'check') for (const c of s.changes) if (!changes.find(x => x.key === c.key)) changes.push(c)
    let state
    if (!haveSettings) state = list.some(s => s.status === 'do') ? 'unknown' : 'none'
    else if (changes.length) state = writable ? 'available' : 'manual'
    else state = list.some(s => s.status === 'good') ? 'applied' : 'none'
    return { id: pid, state, changes, count: changes.length }
  })

  const myths = ['hpet', 'cstates-off', 'spread']
  const facts = {
    cpu: cpu && cpu.name, gpu: gpu && gpu.name, ramType: ram.type || null, ramNow: ram.xmpConfiguredMT || null, ramRated: ram.xmpRatedMT || null,
    biosDate: date, form: caps.form || null, board: info.board || null,
  }
  const rank = { do: 0, check: 1, leave: 2, good: 3 }
  const order = ['memory-profile', 'rebar', 'raptor', 'secureboot', 'boost', 'cstates', 'gpu-mode', 'aspm', 'fan-always-on', 'smt', 'biosage']
  out.sort((a, b) => rank[a.status] - rank[b.status] || order.indexOf(a.id) - order.indexOf(b.id))
  return { facts, suggestions: out, presets, myths }
}

module.exports = { advise, biosAgeDays, brandOf }
