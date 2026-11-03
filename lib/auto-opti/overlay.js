'use strict'
// Windows 11 "power mode" (Best power efficiency / Balanced / Best performance) is a power-scheme overlay. powercfg has no command for
// it on current builds, so it goes through powrprof.dll: PowerGetActualOverlayScheme / PowerSetActiveOverlayScheme (per user, no admin).

const GUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ZERO = '00000000-0000-0000-0000-000000000000'
const PERFORMANCE = 'ded574b5-45a0-4f42-8737-46345c09c238'

const LOAD = `Add-Type -Namespace JO -Name P -MemberDefinition '[DllImport("powrprof.dll")] public static extern uint PowerSetActiveOverlayScheme(ref System.Guid g); [DllImport("powrprof.dll")] public static extern uint PowerGetActualOverlayScheme(out System.Guid g);' -ErrorAction Stop`

/** Script that prints the active overlay (JOVL=<guid>). */
const readScript = () => `${LOAD}\n$g = [guid]::Empty; $rc = [JO.P]::PowerGetActualOverlayScheme([ref]$g)\nWrite-Output ('JOVL=' + $g + ' RC=' + $rc)`

/** Script that sets the overlay and prints JOSET=<rc> (0 = success). Throws on anything that is not a GUID. */
function setScript(guid) {
  if (!GUID_RX.test(String(guid))) throw new Error('bad overlay guid')
  return `${LOAD}\n$g = [guid]'${guid}'; $rc = [JO.P]::PowerSetActiveOverlayScheme([ref]$g)\nWrite-Output ('JOSET=' + $rc)`
}

const parseRead = out => { const m = /JOVL=([0-9a-f-]{36}) RC=(\d+)/i.exec(String(out || '')); return m && Number(m[2]) === 0 ? m[1].toLowerCase() : null }
const setOk = out => /JOSET=0\b/.test(String(out || ''))

module.exports = { readScript, setScript, parseRead, setOk, ZERO, PERFORMANCE, GUID_RX }
