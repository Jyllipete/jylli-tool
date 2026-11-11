'use strict'
// The only things Diagnostics may change, by id. The page sends an id; nothing here takes a command from the renderer.
// Each repair runs through the change journal (deps.runRecorded) so it shows in History. rp = make a restore point first.
//   risk: 'safe' (one click) | 'hold' (hold-to-confirm) | 'confirm' (dialog, it restarts or takes a long time)
// run(deps, ps, ctx) -> { ok, error?, restart? }    ps = the journal-recorded PowerShell runner (script, ms) -> { ok, out, err }
const fail = e => ({ ok: false, error: String(e || 'failed').slice(0, 200) })

const REPAIRS = {
  'enable-trim': { risk: 'safe', rp: false, restart: false, run: async (d, ps) => {
    const r = await ps('fsutil behavior set DisableDeleteNotify 0', 20000)
    return r.ok ? { ok: true } : fail(r.err || r.out)
  } },
  'enable-firewall': { risk: 'safe', rp: false, restart: false, run: async (d, ps) => {
    const r = await ps("Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled True -ErrorAction Stop", 30000)
    return r.ok ? { ok: true } : fail(r.err || r.out)
  } },
  'enable-wu': { risk: 'safe', rp: false, restart: false, run: async (d, ps) => {
    const r = await ps(String.raw`$ErrorActionPreference='Stop'
Set-Service -Name wuauserv -StartupType Manual
Start-Service -Name wuauserv -ErrorAction SilentlyContinue
Remove-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU' -Name NoAutoUpdate -ErrorAction SilentlyContinue`, 30000)
    return r.ok ? { ok: true } : fail(r.err || r.out)
  } },
  'restore-pagefile': { risk: 'hold', rp: true, restart: true, run: async (d, ps) => {
    const r = await ps("$ErrorActionPreference='Stop'; $cs = Get-CimInstance Win32_ComputerSystem; Set-CimInstance -InputObject $cs -Property @{ AutomaticManagedPagefile = $true }", 30000)
    return r.ok ? { ok: true, restart: true } : fail(r.err || r.out)
  } },
  'memdiag': { risk: 'confirm', rp: false, restart: true, run: async (d, ps) => {
    // Windows Memory Diagnostic on the next boot. Nothing restarts here: the page asks first.
    const r = await ps('bcdedit /bootsequence {memdiag} | Out-Null; if ($LASTEXITCODE -ne 0) { throw "bcdedit failed" }', 20000)
    return r.ok ? { ok: true, restart: true } : fail(r.err || r.out)
  } },
  'dism-sfc': { risk: 'confirm', rp: true, restart: false, long: true, run: async (d, ps, ctx) => {
    ctx.step && ctx.step('dism')
    const a = await d.runPS("$ErrorActionPreference='Stop'; Repair-WindowsImage -Online -RestoreHealth | Out-Null; 'JJOK'", 30 * 60 * 1000)
    if (!/JJOK/.test(a.out || '')) return fail(a.err || a.out || 'dism')
    ctx.step && ctx.step('sfc')
    const b = await d.runPS("& sfc /scannow | Out-Null; 'JJCODE=' + $LASTEXITCODE", 30 * 60 * 1000)
    const code = /JJCODE=(\d+)/.exec(b.out || '')
    return code && code[1] === '0' ? { ok: true } : fail('sfc')
  } },
  'restart': { risk: 'confirm', rp: false, restart: false, run: async d => {
    // 30 s so the page can show "restarting"; `shutdown /a` cancels it.
    const r = await d.runPS('shutdown /r /t 30 /c "Jylli Tool: restart to finish pending changes"', 15000)
    return r.ok ? { ok: true } : fail(r.err || r.out)
  } },
  'runtimes': { risk: 'confirm', rp: false, restart: false, long: true, run: async (d, ps, ctx) => {
    if (!d.installRuntimes) return fail('unavailable')
    const miss = (ctx.missing || []).filter(x => typeof x === 'string')
    if (!miss.length) return fail('nothing-missing')
    const r = await d.installRuntimes(miss, ctx.step)
    return r && r.ok ? { ok: true } : fail(r && (r.error || r.reason) || 'partial')
  } },
}

const ids = () => Object.keys(REPAIRS)
const get = id => Object.prototype.hasOwnProperty.call(REPAIRS, id) ? REPAIRS[id] : null

/** What the page may show for a repair without running it. */
function meta(id) { const r = get(id); return r ? { id, risk: r.risk, rp: r.rp, restart: r.restart, long: !!r.long } : null }

module.exports = { REPAIRS, get, ids, meta }
