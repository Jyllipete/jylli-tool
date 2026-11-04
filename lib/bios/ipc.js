'use strict'
// IPC for the BIOS workstation. Read-only in this phase: status, SCEWIN import, read through an engine. Every handler is Pro-gated.
// The renderer sends an engine id and confirmation flags only; paths and commands never come from it.
const fs = require('fs')
const path = require('path')
const model = require('./model')
const doctor = require('./doctor')
const hp = require('./hp-wmi')
const install = require('./scewin-install')
const fmt = require('./scewin-format')
const policy = require('./policy')
const tx = require('./transaction')
const snaps = require('./snapshots')

const STATUS_SCRIPT = `
$b = Get-CimInstance Win32_BIOS | Select-Object -First 1
$bb = Get-CimInstance Win32_BaseBoard | Select-Object -First 1
$cs = Get-CimInstance Win32_ComputerSystem | Select-Object -First 1
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$fw = (Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control' -EA SilentlyContinue).PEFirmwareType
$hvci = $false
try { $dg = Get-CimInstance -Namespace root\\Microsoft\\Windows\\DeviceGuard -ClassName Win32_DeviceGuard -EA Stop; $hvci = (@($dg.SecurityServicesRunning) -contains 2) } catch {}
@{ vendor=$b.Manufacturer; biosVersion=$b.SMBIOSBIOSVersion; biosDate=$(if ($b.ReleaseDate) { $b.ReleaseDate.ToString('yyyy-MM-dd') } else { '' });
   boardVendor=$bb.Manufacturer; board=$bb.Product; system=$cs.Model; elevated=$admin; uefi=($fw -eq 2); hvci=$hvci } | ConvertTo-Json -Compress
`

function register({ ipcMain, requiresPremium, runPS, runFile, app, dialog, getWindow, log }) {
  const dir = () => path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'JylliTool', 'bios', 'scewin')
  const gate = name => requiresPremium(name)

  async function status() {
    const r = await runPS(STATUS_SCRIPT, 20000)
    let s = {}
    try { s = JSON.parse(String(r.out).trim().split(/\r?\n/).pop()) } catch {}
    const sc = install.verify(dir())
    return { s, scewin: sc }
  }

  ipcMain.handle('bios2-status', async () => {
    if (!gate('bios2-status')) return { ok: false, reason: 'premium_required' }
    const { s, scewin } = await status()
    let hpWmi = null
    if (/\bhp\b|hewlett/i.test(s.vendor || '')) {
      const r = hp.parseRead((await runPS(hp.READ_SCRIPT, 30000)).out)
      hpWmi = r.ok ? 'ok' : r.error === 'access_denied' ? 'denied' : 'absent'
    }
    const engines = []
    if (hpWmi === 'ok') engines.push({ id: 'hp-wmi', state: 'ready', verified: policy.WRITES_VERIFIED['hp-wmi'] === true, writable: policy.writesAllowed('hp-wmi') })
    if (/american megatrends|\bami\b/i.test(s.vendor || '')) engines.push({ id: 'scewin', state: scewin.state === 'ok' ? 'ready' : scewin.state, verified: false })
    const findings = doctor.diagnose({ vendor: s.vendor, elevated: s.elevated, uefi: s.uefi, hvci: s.hvci, scewin, hpWmi })
    return { ok: true, info: { vendor: s.vendor, biosVersion: s.biosVersion, biosDate: s.biosDate, board: [s.boardVendor, s.board].filter(Boolean).join(' '), system: s.system, uefi: s.uefi, hvci: s.hvci, elevated: s.elevated }, engines, findings }
  })

  // ── writes: HP's official interface only for now (SCEWIN/native writes are locked and not implemented) ──
  const store = () => snaps.create(path.join(app.getPath('userData'), 'bios', 'snapshots'))
  const hpEngine = {
    id: 'hp-wmi',
    async read() { const r = hp.parseRead((await runPS(hp.READ_SCRIPT, 60000)).out); if (!r.ok) throw new Error(r.error); return model.fromHp(r.rows) },
    async write(changes) { return hp.parseWrite((await runPS(hp.writeScript(changes), 60000)).out, changes.length) },
  }
  const onBattery = async () => /true/i.test((await runPS('[bool](Get-CimInstance Win32_Battery -EA SilentlyContinue | Where-Object { $_.BatteryStatus -eq 1 })', 15000)).out)
  let busy = false
  const TYPED = 'WRITE'
  async function commit(changes, typed, reason) {
    if (busy) return { ok: false, error: 'busy' }
    busy = true
    try {
      if (!policy.writesAllowed('hp-wmi')) return { ok: false, error: 'engine_locked' }
      return await tx.run(hpEngine, changes, { typed: typed === TYPED, onBattery: await onBattery(), store: store(), allowed: e => policy.writesAllowed(e), reason })
    } catch (e) { log && log('[bios] commit failed: ' + e.message); return { ok: false, error: 'write_failed' } }
    finally { busy = false }
  }
  const cleanChanges = c => Array.isArray(c) && c.length <= 200 && c.every(x => x && typeof x.id === 'string' && x.id.length < 200 && typeof x.value === 'string' && x.value.length < 200)

  ipcMain.handle('bios2-commit', async (_, req) => {
    if (!gate('bios2-commit')) return { ok: false, reason: 'premium_required' }
    if (!req || req.engine !== 'hp-wmi' || !cleanChanges(req.changes)) return { ok: false, error: 'invalid_request' }
    const r = await commit(req.changes, req.typed, 'commit')
    log && log('[bios] commit ' + (r.ok ? 'ok' : r.error))
    return r
  })

  ipcMain.handle('bios2-snapshots', async () => {
    if (!gate('bios2-snapshots')) return { ok: false, reason: 'premium_required' }
    return { ok: true, snapshots: store().list() }
  })

  ipcMain.handle('bios2-restore', async (_, req) => {
    if (!gate('bios2-restore')) return { ok: false, reason: 'premium_required' }
    const snap = req && store().get(req.id)
    if (!snap || snap.engine !== 'hp-wmi') return { ok: false, error: 'snapshot_not_found' }
    let current
    try { current = await hpEngine.read() } catch { return { ok: false, error: 'read_failed' } }
    const changes = snaps.restoreChanges(snap, current)
    if (!changes.length) return { ok: false, error: 'nothing_to_restore' }
    return commit(changes, req.typed, 'restore')
  })

  ipcMain.handle('bios2-scewin-import', async () => {
    if (!gate('bios2-scewin-import')) return { ok: false, reason: 'premium_required' }
    const res = await dialog.showOpenDialog(getWindow && getWindow(), { title: 'Select the folder that holds SCEWIN_64.exe', properties: ['openDirectory'] })
    if (res.canceled || !res.filePaths?.[0]) return { ok: false, error: 'cancelled' }
    const found = install.inspect(res.filePaths[0])
    if (!found.ok) return { ok: false, error: 'files_missing', missing: found.missing }
    let signer = null
    const sig = await runPS(`(Get-AuthenticodeSignature -LiteralPath '${found.files['SCEWIN_64.exe'].replace(/'/g, "''")}').SignerCertificate.Subject`, 15000)
    signer = String(sig.out || '').trim() || null
    const lock = async d => { await runFile('icacls', [d, '/inheritance:r', '/grant:r', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F'], { timeout: 15000 }) }
    const r = await install.install(res.filePaths[0], dir(), { lock, signer })
    if (!r.ok) return r
    log && log(`[bios] SCEWIN imported, signer=${signer || 'none'}`)
    return { ok: true, signer, signedByAmi: /american megatrends/i.test(signer || '') }
  })

  ipcMain.handle('bios2-read', async (_, req) => {
    if (!gate('bios2-read')) return { ok: false, reason: 'premium_required' }
    const engine = req && req.engine
    if (engine === 'hp-wmi') {
      const r = hp.parseRead((await runPS(hp.READ_SCRIPT, 60000)).out)
      if (!r.ok) return { ok: false, error: r.error }
      return { ok: true, engine, settings: model.fromHp(r.rows) }
    }
    if (engine === 'scewin') {
      if (!req.confirmUnverified) return { ok: false, error: 'confirm_required' }   // loads a kernel driver; not yet proven on real boards
      const v = install.verify(dir())
      if (v.state !== 'ok') return { ok: false, error: v.state === 'missing' ? 'scewin_missing' : 'scewin_tampered' }
      const out = path.join(app.getPath('userData'), 'bios', 'nvram-read.txt')
      fs.mkdirSync(path.dirname(out), { recursive: true })
      try { fs.unlinkSync(out) } catch {}
      const r = await runFile(v.exe, ['/o', '/s', out], { timeout: 120000, cwd: path.dirname(v.exe) })
      const finding = doctor.matchScewinError(`${r.err}\n${r.out}`)
      if (!fs.existsSync(out)) return { ok: false, error: finding || 'read_failed', findings: doctor.diagnose({ vendor: 'American Megatrends', elevated: true, scewin: v, lastRun: r }) }
      const parsed = fmt.parse(fs.readFileSync(out, 'utf8'))
      return { ok: true, engine, settings: model.fromScewin(parsed), crc: parsed.header.crc, tool: parsed.header.version }
    }
    return { ok: false, error: 'unknown_engine' }
  })
}

module.exports = { register, STATUS_SCRIPT }
