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

module.exports = { ENTRIES, findSetting, targetOption, isOff, labelOf }
