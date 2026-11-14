'use strict'
// Engine Doctor: turns what we know (and what a tool printed) into named conditions with a next step. Pure; texts live in LANG.bios.
// finding: { id, level: 'ok'|'info'|'warn'|'block', engine? }  (the UI looks up doctor_<id>_title / doctor_<id>_fix)

/** Patterns taken from documented SCEWIN/AMISCE messages (SCEHUB README). */
const SCEWIN_ERRORS = [
  [/LoadDeviceDriver returned false|Unable to load Driver/i, 'driver_load'],
  [/HII data does not have setup questions/i, 'hii_missing'],
  [/Retrieving HII Database|BIOS not compatible|ERROR:\s*(4|82)\b/i, 'bios_incompatible'],
  [/Platform identification failed/i, 'platform_id'],
  [/Error in writing variable/i, 'write_protected'],
  [/ERROR:\s*57/i, 'bad_arguments'],
]

function matchScewinError(text) {
  for (const [re, id] of SCEWIN_ERRORS) if (re.test(text || '')) return id
  return null
}

const { brandOf } = require('./identity')

/**
 * @param {object} s { vendor (firmware vendor string), brand? (system/board brand id), vm?, elevated, uefi, hvci, scewin: {state}, lastRun: {err,out},
 *                     wmi?: { 'hp-wmi'|'lenovo-wmi'|'dell-wmi': 'ok'|'denied'|'absent'|null }, hpWmi? (older shape) }
 */
function diagnose(s) {
  const f = []
  const add = (id, level, engine) => f.push({ id, level, engine })
  const wmi = { 'hp-wmi': s.hpWmi, ...(s.wmi || {}) }
  if (s.vm) add('vm', 'block')
  if (!s.elevated) add('not_elevated', 'block')
  if (s.uefi === false) add('legacy_bios', 'block')
  const ami = /american megatrends|ami/i.test(s.vendor || '')
  const brand = s.brand || brandOf(s.vendor)
  const WMI = { hp: ['hp-wmi', 'hp'], lenovo: ['lenovo-wmi', 'lenovo'], dell: ['dell-wmi', 'dell'] }
  if (s.vm) {
    // no firmware access from inside a virtual machine
  } else if (WMI[brand]) {
    const [engine, p] = WMI[brand]
    const st = wmi[engine]
    if (st === 'ok') add(p + '_ready', 'ok', engine)
    else if (st === 'denied') add(p + '_denied', 'block', engine)
    else if (st === 'absent') add(p + '_absent', 'warn', engine)
  } else if (ami) {
    if (s.scewin?.state === 'missing') add('scewin_missing', 'info', 'scewin')
    else if (s.scewin?.state === 'tampered') add('scewin_tampered', 'block', 'scewin')
    else if (s.scewin?.state === 'unsigned') add('scewin_unsigned', 'block', 'scewin')
    else if (s.scewin?.state === 'ok') add('scewin_ready', 'ok', 'scewin')
    if (s.hvci) add('driver_may_be_blocked', 'warn', 'scewin')
  } else if (s.vendor) {
    add('vendor_unsupported', 'info')
  }
  if (s.modelStatus && s.modelStatus !== 'confirmed') add('model_unconfirmed', 'info')
  const e = matchScewinError(`${s.lastRun?.err || ''}
${s.lastRun?.out || ''}`)
  if (e) add(e, 'block', 'scewin')
  return f
}

module.exports = { diagnose, matchScewinError, SCEWIN_ERRORS }
