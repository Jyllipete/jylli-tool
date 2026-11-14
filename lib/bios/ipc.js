'use strict'
// IPC for the BIOS workstation. Every handler is Pro-gated. The renderer sends an engine id and confirmation flags only; paths and
// commands never come from it, and the engine id is checked here against what detection found on THIS PC (lib/bios/capability.js).
const fs = require('fs')
const path = require('path')
const model = require('./model')
const doctor = require('./doctor')
const hp = require('./hp-wmi')
const lenovo = require('./lenovo-wmi')
const dell = require('./dell-wmi')
const install = require('./scewin-install')
const fmt = require('./scewin-format')
const policy = require('./policy')
const tx = require('./transaction')
const snaps = require('./snapshots')
const trial = require('./boot-trial')
const advisor = require('./advisor')
const identity = require('./identity')
const capability = require('./capability')
const auditLog = require('./audit')

// One read-only run. Each source is read in its own try block so one missing class never blanks the rest.
const STATUS_SCRIPT = `
function T($sb) { try { & $sb } catch { $null } }
$b = T { Get-CimInstance Win32_BIOS | Select-Object -First 1 }
$bb = T { Get-CimInstance Win32_BaseBoard | Select-Object -First 1 }
$cs = T { Get-CimInstance Win32_ComputerSystem | Select-Object -First 1 }
$csp = T { Get-CimInstance Win32_ComputerSystemProduct | Select-Object -First 1 }
$enc = T { Get-CimInstance Win32_SystemEnclosure | Select-Object -First 1 }
$os = T { Get-CimInstance Win32_OperatingSystem | Select-Object -First 1 }
$reg = T { Get-ItemProperty 'HKLM:\\HARDWARE\\DESCRIPTION\\System\\BIOS' -ErrorAction Stop }
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$fw = (T { Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control' -ErrorAction Stop }).PEFirmwareType
# second source for the boot mode: GetFirmwareType (1 = BIOS, 2 = UEFI), needs no admin; the registry value is missing on some builds
if ($fw -eq $null) { try { Add-Type -Namespace JT -Name Fw -MemberDefinition '[DllImport("kernel32.dll")] public static extern bool GetFirmwareType(ref uint t);' -ErrorAction Stop; $ft = [uint32]0; if ([JT.Fw]::GetFirmwareType([ref]$ft)) { $fw = [int]$ft } } catch {} }
$sb = (T { Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\SecureBoot\\State' -ErrorAction Stop }).UEFISecureBootEnabled
$hvci = $false
try { $dg = Get-CimInstance -Namespace root\\Microsoft\\Windows\\DeviceGuard -ClassName Win32_DeviceGuard -EA Stop; $hvci = (@($dg.SecurityServicesRunning) -contains 2) } catch {}
$virt = $null
try { $virt = [bool](Get-CimInstance Win32_Processor | Select-Object -First 1).VirtualizationFirmwareEnabled } catch {}
$tpm = $null
try { if ($admin) { $t = Get-Tpm -EA Stop; $tpm = @{ present=[bool]$t.TpmPresent; ready=[bool]$t.TpmReady } } } catch {}
$rd = @{}
foreach ($n in 'BIOSVendor','BIOSVersion','BIOSReleaseDate','BaseBoardManufacturer','BaseBoardProduct','SystemManufacturer','SystemProductName','SystemFamily','SystemSKU') { if ($reg -and $reg.$n -ne $null) { $rd[$n] = [string]$reg.$n } }
$lb = $null; if ($os -and $os.LastBootUpTime) { $lb = [int64]([DateTimeOffset]$os.LastBootUpTime).ToUnixTimeMilliseconds() }
@{
  virtFw=$virt; tpm=$tpm; elevated=$admin; uefi=$(if ($fw -ne $null) { $fw -eq 2 } else { $null }); hvci=$hvci
  secureBoot=$(if ($sb -ne $null) { [int]$sb -eq 1 } else { $null }); lastBoot=$lb
  hypervisorPresent=$(if ($cs) { [bool]$cs.HypervisorPresent } else { $null }); pcSystemType=$(if ($cs) { [int]$cs.PCSystemType } else { $null })
  chassis=$(if ($enc) { @($enc.ChassisTypes) } else { @() })
  smbios=$(if ($b -and $b.SMBIOSMajorVersion -ne $null) { '' + $b.SMBIOSMajorVersion + '.' + $b.SMBIOSMinorVersion } else { $null })
  cim=@{ biosVendor=$b.Manufacturer; biosVersion=$b.SMBIOSBIOSVersion; biosDate=$(if ($b.ReleaseDate) { $b.ReleaseDate.ToString('yyyy-MM-dd') } else { '' })
    boardVendor=$bb.Manufacturer; board=$bb.Product; boardVersion=$bb.Version; systemVendor=$cs.Manufacturer; systemModel=$cs.Model; family=$cs.SystemFamily; sku=$cs.SystemSKUNumber
    productVendor=$csp.Vendor; productName=$csp.Name }
  reg=$rd
} | ConvertTo-Json -Compress -Depth 4
`

const arr = v => (Array.isArray(v) ? v : v == null ? [] : [v])

// Engines that read through a Windows WMI interface. `probe` decides 'ok' | 'denied' | 'absent'.
const WMI = {
  'hp-wmi': { brand: 'hp', read: hp.READ_SCRIPT, parse: hp.parseRead, model: model.fromHp, probe: out => { const r = hp.parseRead(out); return r.ok ? 'ok' : r.error === 'access_denied' ? 'denied' : 'absent' } },
  'lenovo-wmi': { brand: 'lenovo', read: lenovo.READ_SCRIPT, parse: lenovo.parseRead, model: model.fromLenovo, probeScript: lenovo.PROBE_SCRIPT, probe: lenovo.parseProbe },
  'dell-wmi': { brand: 'dell', read: dell.READ_SCRIPT, parse: dell.parseRead, model: model.fromDell, probeScript: dell.PROBE_SCRIPT, probe: dell.parseProbe },
}

function register({ ipcMain, requiresPremium, runPS, runFile, app, dialog, getWindow, log, getCaps }) {
  let lastRead = null   // { engine, settings } from the last explicit read; SCEWIN is never started just to give advice
  const dir = () => path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'JylliTool', 'bios', 'scewin')
  const gate = name => requiresPremium(name)
  const audit = () => auditLog.create(path.join(app.getPath('userData'), 'bios', 'audit.jsonl'))

  async function statusRaw() {
    const r = await runPS(STATUS_SCRIPT, 25000)
    try { return JSON.parse(String(r.out).trim().split(/\r?\n/).pop()) } catch { return {} }
  }

  /**
   * Detection. `assume` = engine id to treat as present without probing (commit/read paths: the read that follows proves it or fails).
   * Without it, every vendor interface that matches the identity is probed (read-only).
   */
  async function detect({ assume } = {}) {
    const raw = await statusRaw()
    const id = identity.identify(raw)
    const probes = { elevated: raw.elevated === true, scewin: install.verify(dir(), { requireSignature: true }) }
    const cache = {}
    const brands = [id.system.brand, id.board.brand, id.firmware.vendorClass]
    if (!id.isVM) {
      for (const [eid, e] of Object.entries(WMI)) {
        if (!brands.includes(e.brand)) continue
        if (assume === eid) { probes[eid] = 'ok'; continue }
        if (assume) continue
        if (e.probeScript) probes[eid] = e.probe((await runPS(e.probeScript, 30000)).out)
        else {
          const r = e.parse((await runPS(e.read, 60000)).out)   // HP has no cheap probe: the full read is the probe, kept for advice
          probes[eid] = r.ok ? 'ok' : r.error === 'access_denied' ? 'denied' : 'absent'
          if (r.ok) cache[eid] = e.model(r.rows)
        }
      }
    }
    const caps = capability.engines(id, probes)
    return { raw, id, probes, caps, cache }
  }

  const deviceOf = id => ({ id: id.fingerprint.id, biosVersion: id.fingerprint.biosVersion })

  async function readEngine(engineId) {
    const e = WMI[engineId]
    const r = e.parse((await runPS(e.read, 60000)).out)
    if (!r.ok) throw new Error(r.error)
    return e.model(r.rows)
  }

  // pending = a successful write newer than the last boot: HP/Dell/Lenovo apply at the next restart
  function pendingFor(raw) {
    const lb = raw && raw.lastBoot
    if (!lb) return null
    return audit().list(50).some(e => (e.action === 'commit' || e.action === 'restore') && e.result === 'ok' && e.ts > lb)
  }

  ipcMain.handle('bios2-status', async () => {
    if (!gate('bios2-status')) return { ok: false, reason: 'premium_required' }
    const d = await detect()
    const sum = identity.summary(d.id)
    const engines = d.caps.engines.map(e => ({ id: e.id, state: e.state, read: e.read, write: e.write, why: e.why, needs: e.needs, detected: e.detected,
      verified: e.write === 'verified', writable: e.write === 'verified' && d.probes.elevated !== false && !d.id.isVM }))
    const findings = doctor.diagnose({
      vendor: d.id.firmware.vendor.value, brand: d.id.system.brand || d.id.board.brand, vm: d.id.isVM, elevated: d.probes.elevated, uefi: d.id.firmware.uefi,
      hvci: d.raw.hvci, scewin: d.probes.scewin, wmi: { 'hp-wmi': d.probes['hp-wmi'], 'lenovo-wmi': d.probes['lenovo-wmi'], 'dell-wmi': d.probes['dell-wmi'] },
      modelStatus: d.id.model.status,
    })
    return {
      ok: true,
      info: { vendor: sum.vendor, biosVersion: sum.biosVersion, biosDate: sum.biosDate, board: sum.board, system: sum.system, modelLabel: sum.modelLabel,
        uefi: d.id.firmware.uefi, secureBoot: d.id.firmware.secureBoot, hvci: d.raw.hvci, elevated: d.probes.elevated, isVM: d.id.isVM, form: d.id.system.form },
      identity: d.id, engines, blockers: d.caps.blockers, findings, pending: pendingFor(d.raw),
    }
  })

  // ── writes: HP's official interface only for now (SCEWIN/native/Lenovo/Dell writes are locked and not implemented) ──
  const trialDir = () => path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'JylliTool', 'bios', 'trial')
  const lockDir = d => runFile('icacls', [d, '/inheritance:r', '/grant:r', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F'], { timeout: 15000 })
  /** Arms the startup watcher after a risky change. Never fails the commit: the result only says whether it armed. */
  async function armTrial(r) {
    try {
      const dir = trialDir()
      fs.mkdirSync(dir, { recursive: true })
      await lockDir(dir)
      const a = trial.arm(dir, { engine: 'hp-wmi', snapshotId: r.snapshotId, restore: r.restore })
      if (!a.ok) return 'failed'
      const t = await runFile('schtasks.exe', trial.createArgs(dir), { timeout: 20000 })
      log && log('[bios] boot trial ' + (t.ok ? 'armed' : 'could not be registered: ' + t.err))
      return t.ok ? 'armed' : 'failed'
    } catch (e) { log && log('[bios] boot trial error: ' + e.message); return 'failed' }
  }
  const store = () => snaps.create(path.join(app.getPath('userData'), 'bios', 'snapshots'))
  const hpEngine = {
    id: 'hp-wmi',
    async read() { return readEngine('hp-wmi') },
    async write(changes) { return hp.parseWrite((await runPS(hp.writeScript(changes), 60000)).out, changes.length) },
  }
  const onBattery = async () => /true/i.test((await runPS('[bool](Get-CimInstance Win32_Battery -EA SilentlyContinue | Where-Object { $_.BatteryStatus -eq 1 })', 15000)).out)
  let busy = false
  const TYPED = 'WRITE'
  async function commit(engineId, changes, typed, reason) {
    if (busy) return { ok: false, error: 'busy' }
    busy = true
    try {
      if (!policy.writesAllowed(engineId)) return { ok: false, error: 'engine_locked' }
      // the engine must be detected for THIS device and must be allowed to write (never a VM, never an engine the matrix locks)
      const d = await detect({ assume: engineId })
      if (!capability.engineForWrite(d.caps.engines, engineId)) return { ok: false, error: d.id.isVM ? 'vm' : 'engine_not_detected' }
      if (engineId !== 'hp-wmi') return { ok: false, error: 'engine_locked' }
      const device = deviceOf(d.id)
      const r = await tx.run(hpEngine, changes, { typed: typed === TYPED, onBattery: await onBattery(), store: store(), device, allowed: e => policy.writesAllowed(e), reason })
      if (r.ok && r.maxTier !== 'normal') r.trial = await armTrial(r)
      // plan-level refusals (typed_required, on_battery, ...) wrote nothing and are not audited as attempts
      if (r.ok || r.snapshotId) audit().append(auditLog.fromResult(reason, engineId, device, r.changes, r))
      return r
    } catch (e) { log && log('[bios] commit failed: ' + e.message); return { ok: false, error: 'write_failed' } }
    finally { busy = false }
  }
  const cleanChanges = c => Array.isArray(c) && c.length <= 200 && c.every(x => x && typeof x.id === 'string' && x.id.length < 200 && typeof x.value === 'string' && x.value.length < 200)

  ipcMain.handle('bios2-commit', async (_, req) => {
    if (!gate('bios2-commit')) return { ok: false, reason: 'premium_required' }
    if (!req || !WMI[req.engine] || !cleanChanges(req.changes)) return { ok: false, error: 'invalid_request' }
    const r = await commit(req.engine, req.changes, req.typed, 'commit')
    log && log('[bios] commit ' + (r.ok ? 'ok' : r.error))
    return r
  })

  ipcMain.handle('bios2-trial', async () => {
    if (!gate('bios2-trial')) return { ok: false, reason: 'premium_required' }
    const t = trial.read(trialDir())
    return { ok: true, trial: t ? { status: t.status, armedAt: t.armedAt, finishedAt: t.finishedAt, names: (t.restore || []).map(x => x.name) } : null }
  })

  ipcMain.handle('bios2-trial-disarm', async () => {
    if (!gate('bios2-trial-disarm')) return { ok: false, reason: 'premium_required' }
    await runFile('schtasks.exe', trial.deleteArgs(), { timeout: 15000 })
    trial.disarm(trialDir())
    audit().append({ action: 'trial-disarm', engine: 'hp-wmi', result: 'ok' })
    return { ok: true }
  })

  ipcMain.handle('bios2-snapshots', async () => {
    if (!gate('bios2-snapshots')) return { ok: false, reason: 'premium_required' }
    return { ok: true, snapshots: store().list() }
  })

  ipcMain.handle('bios2-audit', async () => {
    if (!gate('bios2-audit')) return { ok: false, reason: 'premium_required' }
    return { ok: true, entries: audit().list(100) }
  })

  ipcMain.handle('bios2-restore', async (_, req) => {
    if (!gate('bios2-restore')) return { ok: false, reason: 'premium_required' }
    const snap = req && store().get(req.id)
    if (!snap) return { ok: false, error: req && store().list().some(s => String(s.id) === String(req.id)) ? 'snapshot_corrupt' : 'snapshot_not_found' }
    if (!WMI[snap.engine]) return { ok: false, error: 'snapshot_not_found' }
    // a backup from another PC, or from before a BIOS update (setting ids and values can differ), is never written back
    const d = await detect({ assume: snap.engine })
    const refuse = snaps.checkRestore(snap, deviceOf(d.id))
    if (refuse) return { ok: false, error: refuse }
    let current
    try { current = await readEngine(snap.engine) } catch { return { ok: false, error: 'read_failed' } }
    const changes = snaps.restoreChanges(snap, current)
    if (!changes.length) return { ok: false, error: 'nothing_to_restore' }
    return commit(snap.engine, changes, req.typed, 'restore')
  })

  ipcMain.handle('bios2-advise', async () => {
    if (!gate('bios2-advise')) return { ok: false, reason: 'premium_required' }
    const d = await detect()
    const got = getCaps ? await getCaps().catch(() => null) : null
    const prim = capability.primary(d.caps.engines)
    let settings = null, engine = null
    if (prim) {
      engine = prim.id
      if (WMI[engine]) { settings = d.cache[engine] || null; if (!settings) { try { settings = await readEngine(engine) } catch { settings = null } } }
      else if (lastRead && lastRead.engine === engine) settings = lastRead.settings
    }
    const writable = !!(engine && capability.engineForWrite(d.caps.engines, engine) && d.probes.elevated !== false)
    const ram = got && got.profile && got.profile.ram ? got.profile.ram : {}
    const sum = identity.summary(d.id)
    const info = {
      vendor: sum.vendor, board: sum.board, brand: d.id.system.oem ? null : d.id.board.brand, oem: d.id.system.oem, biosDate: sum.biosDate, uefi: d.id.firmware.uefi,
      virtFw: typeof d.raw.virtFw === 'boolean' ? d.raw.virtFw : null, tpm: d.raw.tpm || null, secureBoot: d.id.firmware.secureBoot, isVM: d.id.isVM, form: d.id.system.form,
    }
    const out = advisor.advise({ caps: got ? got.caps : {}, ram, info, settings, writable })
    return { ok: true, engine, writable, haveSettings: !!settings, capsKnown: !!got, ...out }
  })

  // restart (optionally straight into the BIOS setup screen); only ever from a confirmed button press
  ipcMain.handle('bios2-restart', async (_, req) => {
    if (!gate('bios2-restart')) return { ok: false, reason: 'premium_required' }
    if (!req || req.confirm !== true) return { ok: false, error: 'not_confirmed' }
    const s = await statusRaw()
    const args = ['/r', '/t', '15', '/c', 'Jylli Tool: restarting' + (req.toBios ? ' into the BIOS setup' : '')]
    if (req.toBios) { if (s.uefi === false) return { ok: false, error: 'legacy_bios' }; args.splice(1, 0, '/fw') }
    const r = await runFile('shutdown.exe', args, { timeout: 15000 })
    log && log('[bios] restart requested, toBios=' + !!req.toBios + ', ok=' + r.ok)
    return { ok: r.ok, error: r.ok ? null : 'restart_failed' }
  })

  ipcMain.handle('bios2-scewin-import', async () => {
    if (!gate('bios2-scewin-import')) return { ok: false, reason: 'premium_required' }
    const res = await dialog.showOpenDialog(getWindow && getWindow(), { title: 'Select the folder that holds SCEWIN_64.exe', properties: ['openDirectory'] })
    if (res.canceled || !res.filePaths?.[0]) return { ok: false, error: 'cancelled' }
    const found = install.inspect(res.filePaths[0])
    if (!found.ok) return { ok: false, error: 'files_missing', missing: found.missing }
    // every file must carry a valid Authenticode signature, and the tool itself must be signed by American Megatrends. Nothing is copied otherwise.
    const q = p => `'${p.replace(/'/g, "''")}'`
    const sigScript = `$r=@{}; foreach ($p in @(${install.REQUIRED.map(n => q(found.files[n])).join(',')})) { $s = Get-AuthenticodeSignature -LiteralPath $p; $r[[IO.Path]::GetFileName($p)] = @{ status = [string]$s.Status; subject = [string]$s.SignerCertificate.Subject } }; $r | ConvertTo-Json -Compress`
    let signature = null
    try { signature = JSON.parse(String((await runPS(sigScript, 30000)).out).trim().split(/\r?\n/).pop()) } catch {}
    const byLower = {}
    if (signature) for (const k of Object.keys(signature)) byLower[k.toLowerCase()] = signature[k]
    const sig = {}
    for (const n of install.REQUIRED) sig[n] = byLower[n.toLowerCase()] || null
    const signer = sig['SCEWIN_64.exe'] && sig['SCEWIN_64.exe'].subject || null
    if (!install.signatureOk(sig)) {
      const anyInvalid = install.REQUIRED.some(n => !sig[n] || sig[n].status !== 'Valid')
      log && log(`[bios] SCEWIN import refused (${anyInvalid ? 'unsigned or invalid signature' : 'signer is not American Megatrends'})`)
      return { ok: false, error: anyInvalid ? 'unsigned' : 'bad_signature', signer }
    }
    const r = await install.install(res.filePaths[0], dir(), { lock: d => lockDir(d), signer, signature: sig })
    if (!r.ok) return r
    log && log(`[bios] SCEWIN imported, signer=${signer}`)
    return { ok: true, signer, signedByAmi: true }
  })

  ipcMain.handle('bios2-read', async (_, req) => {
    if (!gate('bios2-read')) return { ok: false, reason: 'premium_required' }
    const engineId = req && req.engine
    if (typeof engineId !== 'string') return { ok: false, error: 'unknown_engine' }
    if (!WMI[engineId] && engineId !== 'scewin') return { ok: false, error: 'unknown_engine' }
    // the engine id is only a request: it must be detected on this PC (vendor, not a VM) before anything runs
    const d = await detect({ assume: WMI[engineId] ? engineId : undefined })
    if (d.id.isVM) return { ok: false, error: 'vm' }
    if (WMI[engineId]) {
      if (!capability.engineForRead(d.caps.engines, engineId)) return { ok: false, error: 'engine_not_detected' }
      let settings
      try { settings = await readEngine(engineId) } catch (e) { return { ok: false, error: e.message || 'wmi_error' } }
      lastRead = { engine: engineId, settings }
      return { ok: true, engine: engineId, settings }
    }
    // SCEWIN: AMI firmware only, UEFI only, own signed copy, and an explicit click (it loads a kernel driver and is not yet proven on real boards)
    if (d.id.firmware.vendorClass !== 'ami') return { ok: false, error: 'engine_not_detected' }
    if (d.id.firmware.uefi === false) return { ok: false, error: 'legacy_bios' }
    if (!req.confirmUnverified) return { ok: false, error: 'confirm_required' }
    const v = install.verify(dir(), { requireSignature: true })
    if (v.state !== 'ok') return { ok: false, error: v.state === 'missing' ? 'scewin_missing' : v.state === 'unsigned' ? 'scewin_unsigned' : 'scewin_tampered' }
    const out = path.join(app.getPath('userData'), 'bios', 'nvram-read.txt')
    fs.mkdirSync(path.dirname(out), { recursive: true })
    try { fs.unlinkSync(out) } catch {}
    const r = await runFile(v.exe, ['/o', '/s', out], { timeout: 120000, cwd: path.dirname(v.exe) })
    const finding = doctor.matchScewinError(`${r.err}\n${r.out}`)
    if (!fs.existsSync(out)) return { ok: false, error: finding || 'read_failed', findings: doctor.diagnose({ vendor: 'American Megatrends', elevated: true, scewin: v, lastRun: r }) }
    const parsed = fmt.parse(fs.readFileSync(out, 'utf8'))
    const settings = model.fromScewin(parsed); lastRead = { engine: 'scewin', settings }
    return { ok: true, engine: 'scewin', settings, crc: parsed.header.crc, tool: parsed.header.version }
  })
}

module.exports = { register, STATUS_SCRIPT, WMI }
