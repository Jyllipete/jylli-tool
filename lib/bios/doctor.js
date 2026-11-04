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

/**
 * @param {object} s { vendor, elevated, uefi, hvci, blocklist, scewin: {state:'missing'|'ok'|'tampered', files}, lastRun: {err,out}, hpWmi: 'ok'|'denied'|'absent'|null }
 */
function diagnose(s) {
  const f = []
  const add = (id, level, engine) => f.push({ id, level, engine })
  if (!s.elevated) add('not_elevated', 'block')
  if (s.uefi === false) add('legacy_bios', 'block')
  const ami = /american megatrends|\bami\b/i.test(s.vendor || '')
  const hp = /\bhp\b|hewlett/i.test(s.vendor || '')
  if (ami) {
    if (s.scewin?.state === 'missing') add('scewin_missing', 'info', 'scewin')
    else if (s.scewin?.state === 'tampered') add('scewin_tampered', 'block', 'scewin')
    else if (s.scewin?.state === 'ok') add('scewin_ready', 'ok', 'scewin')
    if (s.hvci) add('driver_may_be_blocked', 'warn', 'scewin')
  } else if (hp) {
    if (s.hpWmi === 'ok') add('hp_ready', 'ok', 'hp-wmi')
    else if (s.hpWmi === 'denied') add('hp_denied', 'block', 'hp-wmi')
    else if (s.hpWmi === 'absent') add('hp_absent', 'warn', 'hp-wmi')
  } else if (s.vendor) {
    add('vendor_unsupported', 'info')
  }
  const e = matchScewinError(`${s.lastRun?.err || ''}\n${s.lastRun?.out || ''}`)
  if (e) add(e, 'block', 'scewin')
  return f
}

module.exports = { diagnose, matchScewinError, SCEWIN_ERRORS }
