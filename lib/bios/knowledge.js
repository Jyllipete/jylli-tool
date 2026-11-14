'use strict'
// What we know about firmware settings, in one place: how to recognise a setting across vendors and which option to choose.
// Matching is deliberately strict. A change is only produced when exactly ONE setting matches the names AND exactly ONE option
// matches the wanted pattern; anything ambiguous falls back to manual steps. Names come from public dumps and vendor docs and are
// NOT yet checked against many real boards (docs/BIOS_EVIDENCE.md says where each one comes from).

const OFF = /^(disabled?|off)$/i
const isOff = label => OFF.test(String(label || '').trim())

/**
 * id: stable id used by the advisor and LANG keys (easy_<id>_*)
 * names: setting-name patterns (any)   not: name patterns that disqualify
 * want:  ordered option patterns; the first pattern that matches exactly one option label wins
 * wantOff: true when the target is the "off" option (CSM)
 */
const ENTRIES = {
  'memory-profile': {
    names: [/\b(xmp|docp|expo)\b/i, /\b(a-xmp|ai overclock tuner|dram profile|memory profile)\b/i],
    not: [/name|voltage|timing|frequency|speed|size|gear|latency/i],
    want: [/^(profile\s*1|xmp\s*(i|1|profile\s*1)|expo\s*(i|1|profile\s*1)|docp\s*(i|1|profile\s*1))$/i, /^enabled?$/i],
  },
  'above4g': { names: [/above\s*4\s*g|4\s*g\s*decoding|above 4gb/i], want: [/^enabled?$/i] },
  'rebar': { names: [/re-?siz(?:e|able|eable)\s*bar|\brebar\b|smart access memory|\bsam\b/i], want: [/^(enabled?|auto)$/i, /^enabled?$/i] },
  'csm': { names: [/^(csm|csm support|compatibility support module|launch csm)$/i], want: [OFF], wantOff: true },
  'turbo': { names: [/turbo\s*(boost|mode)|core performance boost|\bcpb\b|precision boost/i], not: [/ratio|limit|voltage|offset|time/i], want: [/^auto$/i, /^enabled?$/i] },
  'smt': { names: [/hyper-?threading|\bsmt\b|simultaneous multi-?threading|\bht\b technology/i], not: [/mode.*core|count/i], want: [/^(auto|enabled?)$/i] },
  'cstates': { names: [/global c-?state|c-?states?\s*(control|support)?$|\bc-?states?\b/i], not: [/package|limit|latency|ratio|dram|df /i], want: [/^auto$/i, /^enabled?$/i] },
  'aspm': { names: [/\baspm\b|active state power management/i], not: [/pch|dmi|l0s/i], want: [/^l1$/i, /^auto$/i, /^enabled?$/i] },
  'fan-always-on': { names: [/fan always on/i], want: [OFF], wantOff: true },
  'virt': { names: [/virtualization tech|vt-?x|svm( mode)?|secure virtual machine/i], not: [/vt-?d|iommu|sr-?iov|nested/i], want: [/^enabled?$/i] },
  'mcr': { names: [/memory context restore|memory fast boot|fast boot memory/i], want: [/^(auto|enabled?)$/i] },
  'gpu-mode': { names: [/graphics (mode|type)|switchable graphics|hybrid graphics|discrete graphics|primary display/i], not: [/legacy|vga/i], want: [/^(discrete|dgpu|discrete graphics|pcie)$/i] },
}

/** Exactly one option-kind setting whose name matches; { setting } | { reason: 'none'|'ambiguous' }. */
function findSetting(settings, id) {
  const e = ENTRIES[id]
  const hits = (settings || []).filter(s => s.kind === 'option' && e.names.some(r => r.test(s.name)) && !(e.not || []).some(r => r.test(s.name)))
  if (hits.length === 1) return { setting: hits[0] }
  return { reason: hits.length ? 'ambiguous' : 'none' }
}

/** The value of the option to choose, or null when no pattern matches exactly one option. */
function targetOption(setting, id) {
  const e = ENTRIES[id]
  for (const re of e.want) {
    const m = setting.options.filter(o => re.test(String(o.label).trim()))
    if (m.length === 1) return m[0]
  }
  return null
}

const labelOf = (s, v) => ((s.options.find(o => o.value === v) || {}).label || v)


// ── Purpose cards ("Settings that matter") ──────────────────────────────────────────────────────────────────────────────
// One card = one plain-language setting that may be several raw settings (group). Cards are shown only when found on this board.
//   cat    category id (js/bios/category.js)       group  true = several raw settings share one card (read and explain only)
//   names / not  name patterns                     rec    'on' | 'off' | null: only where docs/BIOS_EVIDENCE.md backs a recommendation
//   level  'default' (factory-style, safe) | 'system' (depends on this PC) | 'expert'   recIf(facts) false = no recommendation shown
//   controlIf(facts) false = shown, never offered as a control (e.g. CSM off on a legacy-boot install can leave Windows unbootable)
//   readonly true = shown, never offered as a control (changing it can erase keys or lock the PC out)
// Deliberately NO rec for C-states, C1E, EIST, spread spectrum, ASPM, LTR or L1 sub-states: no measured gain, see BIOS_EVIDENCE.md.
const CARDS = [
  { id: 'rebar', cat: 'pcie', names: ENTRIES.rebar.names, rec: 'on' },
  { id: 'above4g', cat: 'pcie', names: ENTRIES.above4g.names, rec: 'on' },
  { id: 'virt', cat: 'cpu', names: [/virtualization tech|\bvt-?x\b|\bsvm( mode)?\b|secure virtual machine/i], not: [/vt-?d|iommu|sr-?iov|nested/i] },
  { id: 'iommu', cat: 'pcie', names: [/vt-?d\b|iommu/i], not: [/pre-?boot|dma (control|protection)|ioapic|interrupt remap/i] },
  { id: 'sriov', cat: 'pcie', names: [/sr-?iov/i] },
  { id: 'predma', cat: 'security', names: [/dma (control|protection)|pre-?boot dma|kernel dma/i] },
  { id: 'secureboot', cat: 'security', names: [/^secure ?boot( (control|support|enable))?$/i], readonly: true },
  { id: 'tpm', cat: 'security', names: [/\b(ftpm|ptt|tpm( 2\.0)?|security device support)\b/i], not: [/state|clear|owner|type|device selection|version|provision/i], readonly: true },
  { id: 'csm', cat: 'boot', names: ENTRIES.csm.names, rec: 'off', recIf: f => f.uefi === true, controlIf: f => f.uefi === true },
  { id: 'fastboot', cat: 'boot', names: [/^fast ?boot$/i] },
  { id: 'mcr', cat: 'boot', names: [/memory context restore|memory fast boot|fast boot memory/i] },
  { id: 'turbo', cat: 'cpu', names: ENTRIES.turbo.names, not: ENTRIES.turbo.not, rec: 'on' },
  { id: 'smt', cat: 'cpu', names: ENTRIES.smt.names, not: ENTRIES.smt.not },
  { id: 'tbmax', cat: 'cpu', names: [/turbo boost max|favou?red core|preferred core/i] },
  { id: 'speedshift', cat: 'cpu', names: [/speed ?shift|\bcppc\b|\bhwp\b/i] },
  { id: 'prefetch', cat: 'cpu', names: [/prefetch/i], group: true },
  { id: 'cstates', cat: 'power', names: [/^(intel )?c-?states?( control| support)?$|global c-?state/i], not: [/package|limit|latency|ratio|dram|df /i], group: true },
  { id: 'c1e', cat: 'power', names: [/\bc1e\b|enhanced halt/i] },
  { id: 'eist', cat: 'cpu', names: [/\beist\b|speed ?step|cool'?n'?quiet/i] },
  { id: 'spread', cat: 'cpu', names: [/spread spectrum/i], group: true },
  { id: 'aspm', cat: 'power', names: [/\baspm\b|active state power management/i], group: true },
  { id: 'ltr', cat: 'power', names: [/\bltr\b|latency tolerance/i], group: true },
  { id: 'l1sub', cat: 'power', names: [/l1 sub-?state|l1\.[12]|\bl1ss\b/i], group: true },
  { id: 'erp', cat: 'power', names: [/\berp\b|erp ready/i] },
  { id: 'acloss', cat: 'power', names: [/restore (on )?ac|ac power loss|after power (loss|failure)|power state after/i] },
  { id: 'memprofile', cat: 'memory', names: ENTRIES['memory-profile'].names, not: ENTRIES['memory-profile'].not },
]

/** Every option-kind setting that matches a card (group cards may match many). */
function findAll(settings, card) {
  return (settings || []).filter(s => s.kind === 'option' && card.names.some(r => r.test(s.name)) && !(card.not || []).some(r => r.test(s.name)))
}

const ON = /^(enabled?|on)$/i
/** One state for a card from its raw settings: on | off | auto | mixed | value (a single non-on/off option) */
function stateOf(list) {
  const labels = list.map(s => String(labelOf(s, s.current) || '').trim())
  if (!labels.length) return { state: null, offCount: 0 }
  const offCount = labels.filter(l => OFF.test(l)).length
  if (offCount === labels.length) return { state: 'off', offCount }
  if (labels.every(l => ON.test(l))) return { state: 'on', offCount }
  if (labels.every(l => /^auto$/i.test(l))) return { state: 'auto', offCount }
  if (labels.length === 1) return { state: 'value', offCount, label: labels[0] }
  return { state: 'mixed', offCount }
}

module.exports = { ENTRIES, CARDS, findSetting, findAll, stateOf, targetOption, isOff, labelOf }
