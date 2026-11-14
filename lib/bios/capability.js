'use strict'
// Capability matrix (pure): which BIOS access methods exist on THIS PC and how far each can be trusted.
//   detected  the method is present for this device/firmware (a bundled or imported tool alone is never enough)
//   read      'verified' (proven on real hardware) | 'unverified' (implemented from vendor docs, not yet proven) | 'unavailable'
//   write     'verified' | 'locked' (implemented or planned, deliberately off) | 'unsupported' (no write path exists)
// A setting is only changeable when write === 'verified' AND the read worked (see settingWritable).
const policy = require('./policy')

// Reads proven on real hardware. HP: HP ProBook 440 G8 (tools/bios-hp-test.js). Nothing else yet.
const READ_VERIFIED = { 'hp-wmi': true, 'lenovo-wmi': false, 'dell-wmi': false, scewin: false }
const ENGINE_IDS = Object.keys(READ_VERIFIED)

/**
 * @param {object} id      lib/bios/identity.js identify() result
 * @param {object} probes  { elevated, 'hp-wmi'|'lenovo-wmi'|'dell-wmi': 'ok'|'denied'|'absent'|null, scewin: {state:'missing'|'ok'|'tampered'} }
 * @returns {{ engines: object[], blockers: string[] }}  blockers = reason ids for the Doctor (vm, legacy_bios, not_elevated)
 */
function engines(id, probes = {}) {
  const blockers = []
  const out = []
  const vmBlocked = id.isVM
  const legacy = id.firmware.uefi === false
  if (vmBlocked) blockers.push('vm')
  if (legacy) blockers.push('legacy_bios')
  if (probes.elevated === false) blockers.push('not_elevated')

  const vendors = [id.system.brand, id.board.brand, id.firmware.vendorClass]
  const is = b => vendors.includes(b)
  const wmi = (engineId, brand) => {
    if (!is(brand) || vmBlocked) return
    const p = probes[engineId]
    const detected = p === 'ok'
    out.push({
      id: engineId, detected, state: p === 'ok' ? 'ready' : p === 'denied' ? 'denied' : p === 'absent' ? 'absent' : 'unknown',
      read: detected ? (READ_VERIFIED[engineId] ? 'verified' : 'unverified') : 'unavailable',
      write: policy.writesAllowed(engineId) ? 'verified' : 'locked',
      why: detected ? 'vendor_interface_present' : p === 'denied' ? 'access_denied' : p === 'absent' ? 'interface_absent' : 'not_probed',
      needs: ['admin'],
    })
  }
  wmi('hp-wmi', 'hp'); wmi('lenovo-wmi', 'lenovo'); wmi('dell-wmi', 'dell')

  if (id.firmware.vendorClass === 'ami' && !vmBlocked) {
    const s = probes.scewin && probes.scewin.state
    out.push({
      id: 'scewin', detected: s === 'ok', state: s === 'ok' ? 'ready' : s || 'missing',
      read: s === 'ok' ? 'unverified' : 'unavailable', write: 'unsupported',
      why: s === 'ok' ? 'user_imported' : s === 'tampered' ? 'files_changed' : 'not_imported', needs: ['admin', 'uefi', 'own_copy', 'kernel_driver'],
    })
  }
  // engines that need admin or UEFI cannot read while the blocker stands
  for (const e of out) if (e.detected && (legacy && e.id === 'scewin')) { e.read = 'unavailable'; e.why = 'legacy_bios' }
  return { engines: out, blockers }
}

/** Engine usable for a read request, or null. The renderer only names an engine id; this decides if it is allowed. */
function engineForRead(list, engineId) {
  const e = list.find(x => x.id === engineId)
  return e && e.detected && e.read !== 'unavailable' ? e : null
}

/** Engine usable for a write request, or null. */
function engineForWrite(list, engineId) {
  const e = engineForRead(list, engineId)
  return e && e.write === 'verified' && policy.writesAllowed(engineId) ? e : null
}

/** The one engine that serves reads and advice (first detected wins; only one vendor interface can match a PC). */
function primary(list) {
  return list.find(e => e.detected && e.read !== 'unavailable') || null
}

module.exports = { engines, engineForRead, engineForWrite, primary, READ_VERIFIED, ENGINE_IDS }
