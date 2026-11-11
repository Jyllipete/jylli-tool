'use strict'
// Stop codes (bug checks) Windows reports after a blue screen, with the class of cause that usually sits behind each.
// Wording lives in LANG diag2 `bc_<code>`; this table only carries the machine-readable part. Codes are lowercase hex without 0x, no padding.
// cause classes: driver | memory | storage | power | thermal | software | hardware | overclock
const TABLE = {
  '1':   { name: 'APC_INDEX_MISMATCH', cause: 'driver' },
  'a':   { name: 'IRQL_NOT_LESS_OR_EQUAL', cause: 'driver' },
  '19':  { name: 'BAD_POOL_HEADER', cause: 'driver' },
  '1a':  { name: 'MEMORY_MANAGEMENT', cause: 'memory' },
  '1e':  { name: 'KMODE_EXCEPTION_NOT_HANDLED', cause: 'driver' },
  '24':  { name: 'NTFS_FILE_SYSTEM', cause: 'storage' },
  '3b':  { name: 'SYSTEM_SERVICE_EXCEPTION', cause: 'driver' },
  '3f':  { name: 'NO_MORE_SYSTEM_PTES', cause: 'driver' },
  '4e':  { name: 'PFN_LIST_CORRUPT', cause: 'memory' },
  '50':  { name: 'PAGE_FAULT_IN_NONPAGED_AREA', cause: 'memory' },
  '7a':  { name: 'KERNEL_DATA_INPAGE_ERROR', cause: 'storage' },
  '7e':  { name: 'SYSTEM_THREAD_EXCEPTION_NOT_HANDLED', cause: 'driver' },
  '7f':  { name: 'UNEXPECTED_KERNEL_MODE_TRAP', cause: 'hardware' },
  '8e':  { name: 'KERNEL_MODE_EXCEPTION_NOT_HANDLED', cause: 'driver' },
  '9f':  { name: 'DRIVER_POWER_STATE_FAILURE', cause: 'power' },
  'be':  { name: 'ATTEMPTED_WRITE_TO_READONLY_MEMORY', cause: 'driver' },
  'c1':  { name: 'SPECIAL_POOL_DETECTED_MEMORY_CORRUPTION', cause: 'driver' },
  'c2':  { name: 'BAD_POOL_CALLER', cause: 'driver' },
  'c4':  { name: 'DRIVER_VERIFIER_DETECTED_VIOLATION', cause: 'driver' },
  'c5':  { name: 'DRIVER_CORRUPTED_EXPOOL', cause: 'driver' },
  'ce':  { name: 'DRIVER_UNLOADED_WITHOUT_CANCELLING_PENDING_OPERATIONS', cause: 'driver' },
  'd1':  { name: 'DRIVER_IRQL_NOT_LESS_OR_EQUAL', cause: 'driver' },
  'd5':  { name: 'DRIVER_PAGE_FAULT_IN_FREED_SPECIAL_POOL', cause: 'driver' },
  'e2':  { name: 'MANUALLY_INITIATED_CRASH', cause: 'software' },
  'ea':  { name: 'THREAD_STUCK_IN_DEVICE_DRIVER', cause: 'driver' },
  'ed':  { name: 'UNMOUNTABLE_BOOT_VOLUME', cause: 'storage' },
  'ef':  { name: 'CRITICAL_PROCESS_DIED', cause: 'software' },
  'f4':  { name: 'CRITICAL_OBJECT_TERMINATION', cause: 'storage' },
  '101': { name: 'CLOCK_WATCHDOG_TIMEOUT', cause: 'overclock' },
  '109': { name: 'CRITICAL_STRUCTURE_CORRUPTION', cause: 'memory' },
  '116': { name: 'VIDEO_TDR_FAILURE', cause: 'driver' },
  '117': { name: 'VIDEO_TDR_TIMEOUT_DETECTED', cause: 'driver' },
  '119': { name: 'VIDEO_SCHEDULER_INTERNAL_ERROR', cause: 'driver' },
  '11a': { name: 'EM_INITIALIZATION_FAILURE', cause: 'hardware' },
  '124': { name: 'WHEA_UNCORRECTABLE_ERROR', cause: 'overclock' },
  '133': { name: 'DPC_WATCHDOG_VIOLATION', cause: 'driver' },
  '139': { name: 'KERNEL_SECURITY_CHECK_FAILURE', cause: 'driver' },
  '13a': { name: 'KERNEL_MODE_HEAP_CORRUPTION', cause: 'driver' },
  '141': { name: 'VIDEO_ENGINE_TIMEOUT_DETECTED', cause: 'driver' },
  '154': { name: 'UNEXPECTED_STORE_EXCEPTION', cause: 'storage' },
  '15f': { name: 'ATTEMPTED_EXECUTE_OF_NOEXECUTE_MEMORY', cause: 'memory' },
  '18b': { name: 'SECURE_KERNEL_ERROR', cause: 'software' },
  '1c6': { name: 'FAST_ERESOURCE_PRECONDITION_VIOLATION', cause: 'driver' },
  '1ca': { name: 'SYNTHETIC_WATCHDOG_TIMEOUT', cause: 'hardware' },
  '1e9': { name: 'ERESOURCE_INVALID_RELEASE', cause: 'driver' },
}

/** '0x000000D1', 'D1', 0xd1 all give 'd1'. Anything that is not hex gives null. */
function norm(code) {
  if (code == null) return null
  const s = String(code).trim().toLowerCase().replace(/^0x/, '').replace(/^0+(?=.)/, '')
  return /^[0-9a-f]{1,8}$/.test(s) ? s : null
}

function lookup(code) {
  const k = norm(code)
  if (!k) return null
  return TABLE[k] ? { code: k, ...TABLE[k] } : { code: k, name: null, cause: 'unknown' }
}

/** The WER-SystemErrorReporting 1001 message: "The computer has rebooted from a bugcheck. The bugcheck was: 0x000000d1 (...)". */
function fromMessage(msg) {
  const m = /bugcheck was:?\s*(0x[0-9a-f]+)/i.exec(String(msg || ''))
  return m ? lookup(m[1]) : null
}

module.exports = { TABLE, norm, lookup, fromMessage }
