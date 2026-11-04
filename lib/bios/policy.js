'use strict'
// Safety policy for firmware settings. One table decides how a setting may be changed; everything that writes goes through assess().
//   readonly  never writable (firmware locks, key stores, passwords, flash protection, TPM/ME)
//   critical  voltages, timings, clocks, and any unknown raw number: typed confirmation + recovery card
//   moderate  real trade-offs (C-states, power limits, Secure Boot on/off, unknown choices): hold to commit with the trade-off shown
//   normal    harmless conveniences
// The name rules are evidence-light on purpose: they only ever make a setting STRICTER than "normal". Unknown numbers are critical,
// unknown choices are moderate, nothing unknown is ever "normal".

const TIERS = ['normal', 'moderate', 'critical', 'readonly']
const rank = t => TIERS.indexOf(t)

const READONLY = [
  /\b(boot ?guard|bios ?guard|flash (lock|protect)|bios (lock|write protect)|spi (lock|protect)|write protect|descriptor|bios region|smm (lock|protect))\b/i,
  /\b(pk|kek|db|dbx|platform key|key (management|exchange)|restore factory keys|secure ?boot keys?|install default)\b.*\bkey/i,
  /\b(secure ?boot) (key|mode|keys)\b|\bkey management\b|\bfactory keys\b/i,
  /\b(tpm|ptt|ftpm|psp|fsp)\b.*\b(clear|reset|owner|state|provision|ownership)\b/i,
  /\b(management engine|\bme\b|csme|amt|me firmware|ish)\b.*\b(disable|state|mode|ver|hmrfpo|unconfig)/i,
  /\bpassword\b|\bsupervisor\b|\buser pass/i,
  /\bruntime variables?\b/i,
  /\bfirmware update\b|\bcapsule\b|\bflash\b/i,
  /\bsgx\b|\btxt\b|\bsev\b|\bsme\b.*\b(enable|memory encryption)|\bmemory encryption\b/i,
  /\bvendor lock|\bcfg lock|\block\b.*\b(msr|0xe2)\b/i,
]
const CRITICAL = [
  /\b(voltage|vcore|vccin|vccsa|vccio|vddcr|vsoc|vddio|vddp|vdd|vpp|vtt|vddq|vrm|dvid|svid|ia vr|iccmax|icc max|current limit|tdc|edc|llc|load[- ]?line|calibration)\b/i,
  /\b(bclk|base clock|pll|spread spectrum|ratio|multiplier|overclock|core clock|fabric clock|fclk|uclk|mclk|memclk|cpu frequency|frequency)\b/i,
  /\b(t(cl|rcd|rp|ras|rc|rfc|refi|rrd|faw|wr|wtr|rtp|cwl|cke)|cas latency|command rate|gear mode|round trip|rtl|iol|training)\b/i,
  /\b(curve optimizer|pbo (scalar|limit)|offset)\b/i,
]
const MODERATE = [
  /\b(c[- ]?states?|c1e|c6|cstate|package c|power limit|pl1|pl2|ppt|tdp|turbo|boost|speed ?step|speed ?shift|hwp|eist|cool'?n'?quiet|spread)\b/i,
  /\b(xmp|docp|expo|memory profile|dram profile|ddr .*profile)\b/i,
  /\b(secure ?boot|csm|compatibility support|above 4g|4g decoding|resizable bar|re-?size bar|sr-?iov|iommu|vt-?d|svm|vt-?x|virtualization|hyper-?threading|smt|core (disable|count)|active (cores|processor)|pcie.*(speed|gen)|link speed|aspm.*l1|above 4gb)\b/i,
  /\b(fan|thermal|tjmax|throttl|prochot|igpu|integrated graphics|primary display|init display|gpu)\b/i,
  /\b(sata mode|raid|ahci|nvme|vmd|optane|rst)\b/i,
]
const NORMAL = [
  /\b(fast ?boot|boot logo|full screen logo|numlock|post delay|boot (delay|beep)|quiet boot|wait for .f1|bootup num|setup prompt|wake on|restore on ac|power on|ac power loss|usb (legacy|support)|hot-?plug|xhci|ehci|audio|hd audio|onboard (lan|audio)|wlan|bluetooth|rgb|led|aura|mystic)\b/i,
]

/** @returns {{ tier: string, reason: string }} */
function classify(setting) {
  const hay = `${setting.name || ''} ${(setting.path || []).join(' ')}`
  for (const r of READONLY) if (r.test(hay)) return { tier: 'readonly', reason: 'firmware protection or identity' }
  let tier = null, reason = ''
  const hit = (list, t, why) => { if (!tier && list.some(r => r.test(hay))) { tier = t; reason = why } }
  hit(CRITICAL, 'critical', 'voltage, clock or timing')
  hit(MODERATE, 'moderate', 'behaviour trade-off')
  hit(NORMAL, 'normal', 'convenience')
  if (!tier) {
    // unknown: never "normal"
    if (setting.kind === 'number' || setting.kind === 'string') { tier = setting.kind === 'string' ? 'readonly' : 'critical'; reason = 'unknown raw value' }
    else { tier = 'moderate'; reason = 'unrecognised setting' }
  }
  // a plain number that looks harmless by name is still a raw number: floor it at moderate
  if (setting.kind === 'number' && rank(tier) < rank('moderate')) { tier = 'moderate'; reason = 'raw number' }
  if (setting.kind === 'unsupported' || setting.ambiguous) { tier = 'readonly'; reason = setting.ambiguous ? 'ambiguous record' : 'unsupported record' }
  return { tier, reason }
}

// Engines whose writes have been proven on real hardware. hp-wmi: round trip + restart persistence verified on an HP ProBook 440 G8 (tools/bios-hp-test.js).
// Release builds keep SCEWIN/native locked until an AMI board passes.
const WRITES_VERIFIED = { scewin: false, native: false, 'hp-wmi': true, 'lenovo-wmi': false, 'dell-wmi': false }
function writesAllowed(engine, env = process.env) {
  if (env.JYLLI_BIOS_UNLOCK === engine) return true   // developer unlock for the hardware test only
  return WRITES_VERIFIED[engine] === true
}

/**
 * Can this change be staged/committed?
 * @returns {{ ok: boolean, tier: string, confirm: 'hold'|'typed'|null, why?: string }}
 */
function assess(setting, value, { engine } = {}) {
  const { tier, reason } = classify(setting)
  if (tier === 'readonly') return { ok: false, tier, confirm: null, why: reason }
  if (engine && !writesAllowed(engine)) return { ok: false, tier, confirm: null, why: 'engine_locked' }
  return { ok: true, tier, confirm: tier === 'critical' ? 'typed' : 'hold', reason }
}

module.exports = { classify, assess, writesAllowed, WRITES_VERIFIED, TIERS }
