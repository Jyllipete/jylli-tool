'use strict'
// model -> findings. THE list of what Diagnostics can say: every rule reads measured data only, and a rule whose data was not measured
// is neither a finding nor a pass ("not measured"). Pure; wording lives in LANG diag2 (t_/w_/f_<id>), evidence stays machine-readable.
//
// rule: { id, sub, needs(m) -> bool, test(m) -> null | { sev, penalty, vars?, ev: { value, unit?, limit?, source }, fix? } }
// fix:  { kind: 'repair', id } | { kind: 'tweak', id } | { kind: 'jump', page, tab? } | { kind: 'view', id } | { kind: 'external', url } | { kind: 'undo', id }
const { deriveCaps } = require('../capabilities')
const display = require('../auto-opti/display')
const grade = require('./grade')

const DAY = 24 * 3600 * 1000
const has = (m, id) => !!(m.data && m.data[id])
const num = x => (x == null || x === '' || !Number.isFinite(Number(x))) ? null : Number(x)
const VENDOR_LINK = { nvidia: 'https://www.nvidia.com/Download/index.aspx', amd: 'https://www.amd.com/en/support/download/drivers.html', intel: 'https://www.intel.com/content/www/us/en/download-center/home.html' }
const WU = 'ms-settings:windowsupdate'

const sysVol = m => {
  const v = (m.data.storage && m.data.storage.vols) || []
  return v.find(x => String(x.l).toUpperCase() === String(m.data.storage.sysDrive || 'C').toUpperCase()) || v[0] || null
}
const count = (m, kind) => (m.incidentSummary && m.incidentSummary.by && m.incidentSummary.by[kind]) || 0
const crashData = m => has(m, 'events') || has(m, 'reliability') || has(m, 'minidumps')
const pf = m => m.preflight || null
const caps = m => { try { return m.profile ? deriveCaps(m.profile) : null } catch { return null } }

const RULES = [
  // ── stability ──────────────────────────────────────────────────────────────────
  { id: 'crash-bugcheck', sub: 'stability', needs: crashData, test: m => {
    const n = count(m, 'bugcheck'); if (!n) return null
    const last = (m.incidents || []).filter(i => i.kind === 'bugcheck').pop()
    return { sev: n >= 2 ? 'critical' : 'high', penalty: n >= 3 ? 60 : n === 2 ? 50 : 35, vars: { n, code: last && last.code ? '0x' + last.code.toUpperCase() : '?', name: last && last.detail || '' }, ev: { value: n, unit: 'bugchecks', limit: 0, source: 'System log 1001 + Windows\\Minidump, 30 days' }, fix: { kind: 'view', id: 'timeline' } }
  } },
  { id: 'crash-power-loss', sub: 'stability', needs: crashData, test: m => {
    const n = count(m, 'power-loss'); if (!n) return null
    return { sev: n >= 3 ? 'high' : 'medium', penalty: n >= 3 ? 30 : 15, vars: { n }, ev: { value: n, unit: 'events', limit: 0, source: 'Kernel-Power 41, 30 days' }, fix: { kind: 'view', id: 'timeline' } }
  } },
  { id: 'crash-whea', sub: 'stability', needs: crashData, test: m => {
    const n = count(m, 'whea'); if (!n) return null
    return { sev: 'high', penalty: 35, vars: { n }, ev: { value: n, unit: 'events', limit: 0, source: 'WHEA-Logger 17/18/19/47, 30 days' }, fix: { kind: 'view', id: 'timeline' } }
  } },
  { id: 'crash-gpu-reset', sub: 'stability', needs: crashData, test: m => {
    const n = count(m, 'gpu-reset'); if (!n) return null
    return { sev: n >= 3 ? 'high' : 'medium', penalty: n >= 3 ? 25 : 10, vars: { n }, ev: { value: n, unit: 'resets', limit: 0, source: 'Display 4101, 30 days' }, fix: { kind: 'view', id: 'drivers' } }
  } },
  { id: 'crash-disk', sub: 'stability', needs: crashData, test: m => {
    const n = count(m, 'disk'); if (!n) return null
    return { sev: n >= 3 ? 'high' : 'medium', penalty: n >= 3 ? 30 : 12, vars: { n }, ev: { value: n, unit: 'events', limit: 0, source: 'disk / stornvme / ntfs events 7, 11, 51, 55, 153' }, fix: { kind: 'view', id: 'timeline' } }
  } },
  { id: 'crash-apps', sub: 'stability', needs: crashData, test: m => {
    const n = count(m, 'app-crash') + count(m, 'app-hang'); if (n < 10) return null
    return { sev: 'low', penalty: n >= 30 ? 10 : 5, vars: { n }, ev: { value: n, unit: 'crashes and hangs', limit: 9, source: 'Reliability records, 30 days' }, fix: { kind: 'view', id: 'timeline' } }
  } },
  { id: 'stability-index', sub: 'stability', needs: m => !!(m.data.reliability && m.data.reliability.idx && m.data.reliability.idx.length), test: m => {
    const idx = m.data.reliability.idx.slice(-7); if (!idx.length) return null
    const avg = idx.reduce((a, x) => a + Number(x.v || 0), 0) / idx.length
    if (avg >= 6) return null
    return { sev: avg < 4 ? 'high' : 'medium', penalty: avg < 4 ? 25 : 10, vars: { v: avg.toFixed(1) }, ev: { value: Math.round(avg * 10) / 10, unit: '/10', limit: 6, source: 'Win32_ReliabilityStabilityMetrics, 7 days' }, fix: { kind: 'view', id: 'timeline' } }
  } },
  { id: 'suspect-change', sub: 'stability', needs: m => !!(m.causes), test: m => {
    const c = (m.causes || []).find(x => x.confidence !== 'low'); if (!c) return null
    const fix = c.change.kind === 'tweak' && c.change.id ? { kind: 'undo', id: c.change.id } : c.change.kind === 'driver' ? { kind: 'view', id: 'drivers' } : { kind: 'view', id: 'timeline' }
    return { sev: 'info', penalty: 0, vars: { what: c.change.label, h: Math.max(1, Math.round(c.gapMs / 3600000)), n: c.count, c: c.confidence }, ev: { value: c.count, unit: 'incidents after', limit: 0, source: 'change journal, driver dates and update history' }, fix }
  } },

  // ── storage ────────────────────────────────────────────────────────────────────
  { id: 'disk-smart-fail', sub: 'storage', needs: m => has(m, 'storage') && m.data.storage.predict != null, test: m => {
    if (m.data.storage.predict !== true) return null
    return { sev: 'critical', penalty: 70, ev: { value: 'PredictFailure', source: 'MSStorageDriver_FailurePredictStatus' }, fix: { kind: 'jump', page: 'restore-points' } }
  } },
  { id: 'disk-health', sub: 'storage', needs: m => has(m, 'storage') && (m.data.storage.disks || []).length > 0, test: m => {
    const bad = m.data.storage.disks.find(d => d.health && !/healthy/i.test(d.health)); if (!bad) return null
    return { sev: /unhealthy/i.test(bad.health) ? 'critical' : 'high', penalty: 50, vars: { disk: bad.n, h: bad.health }, ev: { value: bad.health, source: 'Get-PhysicalDisk HealthStatus' }, fix: { kind: 'jump', page: 'restore-points' } }
  } },
  { id: 'disk-wear', sub: 'storage', needs: m => has(m, 'storage') && m.data.storage.disks.some(d => num(d.wear) != null), test: m => {
    const d = m.data.storage.disks.filter(x => num(x.wear) != null).sort((a, b) => b.wear - a.wear)[0]
    if (d.wear < 80) return null
    return { sev: d.wear >= 90 ? 'critical' : 'high', penalty: d.wear >= 90 ? 45 : 25, vars: { disk: d.n, pct: d.wear }, ev: { value: d.wear, unit: '% worn', limit: 79, source: 'Get-StorageReliabilityCounter Wear' }, fix: { kind: 'jump', page: 'restore-points' } }
  } },
  { id: 'disk-errors', sub: 'storage', needs: m => has(m, 'storage') && m.data.storage.disks.some(d => num(d.rerr) != null || num(d.werr) != null), test: m => {
    const d = m.data.storage.disks.find(x => (num(x.rerr) || 0) + (num(x.werr) || 0) > 0); if (!d) return null
    const n = (num(d.rerr) || 0) + (num(d.werr) || 0)
    return { sev: 'high', penalty: 30, vars: { disk: d.n, n }, ev: { value: n, unit: 'uncorrected errors', limit: 0, source: 'Get-StorageReliabilityCounter' }, fix: { kind: 'jump', page: 'restore-points' } }
  } },
  { id: 'disk-hot', sub: 'storage', needs: m => has(m, 'storage') && m.data.storage.disks.some(d => num(d.temp) != null && d.temp > 0), test: m => {
    const d = m.data.storage.disks.filter(x => num(x.temp) > 0).sort((a, b) => b.temp - a.temp)[0]
    if (d.temp < 70) return null
    return { sev: d.temp >= 80 ? 'high' : 'medium', penalty: d.temp >= 80 ? 25 : 12, vars: { disk: d.n, t: d.temp }, ev: { value: d.temp, unit: '°C', limit: 69, source: 'Get-StorageReliabilityCounter Temperature' } }
  } },
  { id: 'disk-low', sub: 'storage', needs: m => !!sysVol(m), test: m => {
    const v = sysVol(m); if (!v || !v.size) return null
    const pct = Math.round(v.free / v.size * 100); if (pct >= 10) return null
    return { sev: pct < 5 ? 'high' : 'medium', penalty: pct < 5 ? 30 : 15, vars: { pct, gb: Math.round(v.free / 1024 ** 3 * 10) / 10, drive: v.l }, ev: { value: pct, unit: '% free', limit: 10, source: 'Get-Volume' }, fix: { kind: 'jump', page: 'cleanup' } }
  } },
  { id: 'trim-off', sub: 'storage', needs: m => has(m, 'storage') && m.data.storage.trimDisabled != null && m.data.storage.disks.some(d => /ssd|nvme/i.test((d.media || '') + (d.bus || ''))), test: m => {
    if (Number(m.data.storage.trimDisabled) !== 1) return null
    return { sev: 'medium', penalty: 15, ev: { value: 'DisableDeleteNotify=1', source: 'fsutil behavior query DisableDeleteNotify' }, fix: { kind: 'repair', id: 'enable-trim' } }
  } },
  { id: 'battery-wear', sub: 'storage', needs: m => !!(m.data.battery && m.data.battery.present && num(m.data.battery.design) > 0 && num(m.data.battery.full) > 0), test: m => {
    const b = m.data.battery; const w = Math.round((1 - b.full / b.design) * 100); if (w < 25) return null
    return { sev: w >= 40 ? 'medium' : 'low', penalty: w >= 40 ? 12 : 5, vars: { pct: w, cycles: b.cycles == null ? '?' : b.cycles }, ev: { value: w, unit: '% capacity lost', limit: 24, source: 'root\\wmi BatteryFullChargedCapacity / BatteryStaticData' } }
  } },

  // ── memory ─────────────────────────────────────────────────────────────────────
  { id: 'ram-pressure', sub: 'memory', needs: m => has(m, 'memory') && num(m.data.memory.commitPct) != null, test: m => {
    const c = m.data.memory.commitPct; if (c < 85) return null
    return { sev: c >= 95 ? 'high' : 'medium', penalty: c >= 95 ? 25 : 12, vars: { pct: Math.round(c) }, ev: { value: Math.round(c), unit: '% committed', limit: 84, source: 'Win32_OperatingSystem commit charge' }, fix: { kind: 'jump', page: 'process-manager' } }
  } },
  { id: 'pagefile-off', sub: 'memory', needs: m => (m.profile && m.profile.storage && m.profile.storage.pagefileDisabled != null) || (pf(m) && pf(m).tweakStates && 'pagefile-none' in pf(m).tweakStates), test: m => {
    const off = (m.profile && m.profile.storage && m.profile.storage.pagefileDisabled === true) || (pf(m) && pf(m).tweakStates['pagefile-none'] === true)
    if (!off) return null
    return { sev: 'medium', penalty: 15, ev: { value: 'no page file', source: 'Win32_ComputerSystem AutomaticManagedPagefile + PagingFiles' }, fix: { kind: 'repair', id: 'restore-pagefile' } }
  } },
  { id: 'memdiag-errors', sub: 'memory', needs: m => !!(m.data.memory && m.data.memory.memdiag), test: m => {
    const d = m.data.memory.memdiag; if (d.ok !== false) return null
    return { sev: 'critical', penalty: 60, ev: { value: 'errors found', source: 'MemoryDiagnostics-Results 1201' }, fix: { kind: 'repair', id: 'memdiag' } }
  } },
  { id: 'ram-test-failed', sub: 'memory', needs: m => !!m.data.ram, test: m => {
    if (m.data.ram.passed !== false) return null
    return { sev: 'critical', penalty: 60, vars: { n: m.data.ram.errors || 0 }, ev: { value: m.data.ram.errors || 0, unit: 'pattern errors', limit: 0, source: 'RAM pattern test (256 MB, 6 patterns)' }, fix: { kind: 'repair', id: 'memdiag' } }
  } },
  { id: 'ram-xmp-off', sub: 'memory', needs: m => !!(m.profile && m.profile.ram && m.profile.ram.xmp), test: m => {
    const r = m.profile.ram; if (r.xmp !== 'off') return null
    return { sev: 'low', penalty: 6, vars: { cur: r.xmpConfiguredMT || '?', rated: r.xmpRatedMT || '?' }, ev: { value: r.xmpConfiguredMT || 'JEDEC', unit: 'MT/s', limit: r.xmpRatedMT || null, source: 'SMBIOS memory speed vs rated speed' }, fix: { kind: 'jump', page: 'bios-tuner' } }
  } },

  // ── cpu ────────────────────────────────────────────────────────────────────────
  { id: 'cpu-hot', sub: 'cpu', needs: m => !!(m.temps && num(m.temps.cpuTemp) != null), test: m => {
    const t = m.temps.cpuTemp; if (t < 80) return null
    return { sev: t >= 92 ? 'high' : 'medium', penalty: t >= 92 ? 25 : 12, vars: { t: Math.round(t) }, ev: { value: Math.round(t), unit: '°C now', limit: 79, source: 'LibreHardwareMonitor package temperature' }, fix: { kind: 'jump', page: 'pulse' } }
  } },
  { id: 'cpu-throttle', sub: 'cpu', needs: m => !!m.data.thermal, test: m => {
    const t = m.data.thermal; if (!(num(t.throttlePct) >= 8)) return null
    return { sev: t.throttlePct >= 25 ? 'high' : 'medium', penalty: t.throttlePct >= 25 ? 30 : 15, vars: { pct: Math.round(t.throttlePct), cause: t.cause || 'unknown', temp: t.avgTempC == null ? '?' : Math.round(t.avgTempC) }, ev: { value: Math.round(t.throttlePct), unit: '% of samples throttled', limit: 7, source: 'pulse thermal audit, 5 s under load' }, fix: { kind: 'jump', page: 'pulse' } }
  } },
  { id: 'cpu-busy', sub: 'cpu', needs: m => !!(m.data.cpu && num(m.data.cpu.load) != null), test: m => {
    const l = m.data.cpu.load; if (l < 60) return null
    return { sev: 'medium', penalty: 12, vars: { pct: Math.round(l) }, ev: { value: Math.round(l), unit: '% busy while scanning', limit: 59, source: 'Win32_Processor LoadPercentage' }, fix: { kind: 'jump', page: 'process-manager' } }
  } },
  { id: 'power-saver', sub: 'cpu', needs: m => !!(m.profile && m.profile.power && m.profile.power.kind), test: m => {
    const c = caps(m); const p = m.profile.power
    if (p.kind !== 'saver' || !c || c.form !== 'desktop') return null
    return { sev: 'low', penalty: 8, vars: { plan: p.name || '' }, ev: { value: p.name || 'Power saver', source: 'powercfg active scheme' }, fix: { kind: 'jump', page: 'hardware', tab: 'power' } }
  } },

  // ── gpu / display ──────────────────────────────────────────────────────────────
  { id: 'gpu-driver-old', sub: 'gpu', needs: m => !!(m.profile && Array.isArray(m.profile.gpus) && m.profile.gpus.some(g => g.discrete && g.driverAgeDays != null)), test: m => {
    const g = m.profile.gpus.filter(x => x.discrete && x.driverAgeDays != null).sort((a, b) => b.driverAgeDays - a.driverAgeDays)[0]
    if (g.driverAgeDays <= 180) return null
    return { sev: g.driverAgeDays > 365 ? 'medium' : 'low', penalty: g.driverAgeDays > 365 ? 15 : 8, vars: { gpu: g.name, days: g.driverAgeDays, v: g.driverVersion || '?' }, ev: { value: g.driverAgeDays, unit: 'days old', limit: 180, source: 'Win32_PnPSignedDriver DriverDate' }, fix: VENDOR_LINK[g.vendor] ? { kind: 'external', url: VENDOR_LINK[g.vendor] } : { kind: 'view', id: 'drivers' } }
  } },
  { id: 'display-refresh', sub: 'gpu', needs: m => !!(m.profile && Array.isArray(m.profile.displays) && m.profile.displays.length && !m.profile.remoteSession), test: m => {
    const t = m.profile.displays.map(d => ({ d, mode: display.pickMode(d) })).find(x => x.mode); if (!t) return null
    return { sev: 'medium', penalty: 12, vars: { monitor: t.d.monitor || '', cur: t.d.cur.hz, max: t.mode.hz }, ev: { value: t.d.cur.hz, unit: 'Hz', limit: t.mode.hz, source: 'EnumDisplaySettings vs EDID' }, fix: { kind: 'external', url: 'ms-settings:display-advanced' } }
  } },

  // ── drivers ────────────────────────────────────────────────────────────────────
  { id: 'device-problem', sub: 'drivers', needs: m => has(m, 'devices'), test: m => {
    const l = m.data.devices.list || []; if (!l.length) return null
    return { sev: l.length >= 3 ? 'high' : 'medium', penalty: Math.min(50, 15 * l.length), vars: { n: l.length, first: l[0].n || '' }, ev: { value: l.length, unit: 'devices with errors', limit: 0, source: 'Win32_PnPEntity ConfigManagerErrorCode' }, fix: { kind: 'view', id: 'drivers' } }
  } },
  { id: 'driver-old', sub: 'drivers', needs: m => has(m, 'drivers') && (m.data.drivers.list || []).length > 0, test: m => {
    const now = m.takenAt || Date.now()
    const old = (m.data.drivers.list || []).filter(d => d.t && now - d.t > 548 * DAY && /DISPLAY|NET|MEDIA/i.test(d.cls || ''))
    if (!old.length) return null
    return { sev: old.length >= 3 ? 'medium' : 'low', penalty: Math.min(25, 8 * old.length), vars: { n: old.length, first: old[0].n }, ev: { value: old.length, unit: 'drivers over 18 months old', limit: 0, source: 'Win32_PnPSignedDriver DriverDate' }, fix: { kind: 'view', id: 'drivers' } }
  } },
  { id: 'runtimes-missing', sub: 'drivers', needs: m => !!m.data.runtimes, test: m => {
    const miss = m.data.runtimes.missing || []; if (!miss.length) return null
    return { sev: 'medium', penalty: 12, vars: { list: miss.join(', ') }, ev: { value: miss.length, unit: 'runtimes missing', limit: 0, source: 'registry uninstall keys' }, fix: { kind: 'repair', id: 'runtimes' } }
  } },

  // ── windows integrity ──────────────────────────────────────────────────────────
  { id: 'sfc-corrupt', sub: 'windows', needs: m => !!(m.data.health && m.data.health.sfc && m.data.health.sfc !== 'unknown'), test: m => {
    if (m.data.health.sfc !== 'corrupt') return null
    return { sev: 'high', penalty: 40, ev: { value: 'integrity violations', source: 'sfc /verifyonly' }, fix: { kind: 'repair', id: 'dism-sfc' } }
  } },
  { id: 'dism-corrupt', sub: 'windows', needs: m => !!(m.data.health && m.data.health.dism && m.data.health.dism !== 'unknown'), test: m => {
    const d = m.data.health.dism; if (d === 'healthy') return null
    return { sev: d === 'corrupted' ? 'high' : 'medium', penalty: d === 'corrupted' ? 40 : 20, vars: { s: d }, ev: { value: d, source: 'DISM /Online /Cleanup-Image /CheckHealth' }, fix: { kind: 'repair', id: 'dism-sfc' } }
  } },
  { id: 'reboot-pending', sub: 'windows', needs: m => !!(m.data.updates && m.data.updates.rebootPending != null), test: m => {
    if (!m.data.updates.rebootPending) return null
    return { sev: 'medium', penalty: 12, ev: { value: 'restart required', source: 'CBS RebootPending / WindowsUpdate RebootRequired' }, fix: { kind: 'repair', id: 'restart' } }
  } },
  { id: 'updates-stale', sub: 'windows', needs: m => !!(m.data.updates && m.data.updates.lastKbTs), test: m => {
    const d = Math.floor(((m.takenAt || Date.now()) - m.data.updates.lastKbTs) / DAY); if (d < 75) return null
    return { sev: d > 150 ? 'medium' : 'low', penalty: d > 150 ? 15 : 8, vars: { days: d }, ev: { value: d, unit: 'days since last update', limit: 74, source: 'Get-HotFix InstalledOn' }, fix: { kind: 'external', url: WU } }
  } },
  { id: 'win10-eol', sub: 'windows', needs: m => !!(caps(m) && caps(m).os && caps(m).os.win10Eol != null), test: m => {
    if (caps(m).os.win10Eol !== true) return null
    return { sev: 'high', penalty: 25, ev: { value: 'Windows 10', source: 'OS build < 22000, support ended 14 Oct 2025' }, fix: { kind: 'external', url: WU } }
  } },
  { id: 'unlicensed', sub: 'windows', needs: m => !!(pf(m) && pf(m).tweakStates && 'windows-unlicensed' in pf(m).tweakStates), test: m => {
    if (!pf(m).tweakStates['windows-unlicensed']) return null
    return { sev: 'medium', penalty: 12, ev: { value: 'not activated', source: 'SoftwareLicensingProduct LicenseStatus' }, fix: { kind: 'external', url: 'ms-settings:activation' } }
  } },

  // ── security ───────────────────────────────────────────────────────────────────
  { id: 'shield-firewall', sub: 'security', needs: m => !!(m.profile && m.profile.security && m.profile.security.firewallOn != null), test: m => {
    if (m.profile.security.firewallOn !== false) return null
    return { sev: 'high', penalty: 30, ev: { value: 'off', source: 'Get-NetFirewallProfile' }, fix: { kind: 'repair', id: 'enable-firewall' } }
  } },
  { id: 'shield-defender', sub: 'security', needs: m => !!(m.profile && m.profile.security && m.profile.security.defenderRtp != null), test: m => {
    const s = m.profile.security; if (s.defenderRtp !== false || (s.thirdPartyAv || []).length) return null
    return { sev: 'high', penalty: 35, ev: { value: 'real-time protection off, no other antivirus', source: 'Get-MpComputerStatus + SecurityCenter2' }, fix: { kind: 'external', url: 'windowsdefender:' } }
  } },
  { id: 'shield-uac', sub: 'security', needs: m => !!(m.profile && m.profile.security && m.profile.security.uac && m.profile.security.uac !== 'unknown'), test: m => {
    if (m.profile.security.uac !== 'off') return null
    return { sev: 'medium', penalty: 15, ev: { value: 'EnableLUA=0', source: 'HKLM Policies\\System' }, fix: { kind: 'external', url: 'ms-settings:signinoptions' } }
  } },
  { id: 'shield-update', sub: 'security', needs: m => !!(m.profile && m.profile.security && m.profile.security.windowsUpdate && m.profile.security.windowsUpdate !== 'unknown'), test: m => {
    if (m.profile.security.windowsUpdate !== 'disabled') return null
    return { sev: 'medium', penalty: 18, ev: { value: 'disabled', source: 'wuauserv start mode + NoAutoUpdate policy' }, fix: { kind: 'repair', id: 'enable-wu' } }
  } },
  { id: 'secure-boot-off', sub: 'security', needs: m => !!(pf(m) && pf(m).tweakStates && 'secure-boot-off' in pf(m).tweakStates), test: m => {
    if (!pf(m).tweakStates['secure-boot-off']) return null
    return { sev: 'low', penalty: 8, ev: { value: 'off', source: 'Confirm-SecureBootUEFI' }, fix: { kind: 'jump', page: 'bios-tuner' } }
  } },
  { id: 'tpm-missing', sub: 'security', needs: m => !!(m.data.tpm && m.data.tpm.present != null), test: m => {
    if (m.data.tpm.present) return null
    return { sev: 'low', penalty: 6, ev: { value: 'no TPM', source: 'Get-Tpm' }, fix: { kind: 'jump', page: 'bios-tuner' } }
  } },

  // ── network ────────────────────────────────────────────────────────────────────
  { id: 'net-gateway-loss', sub: 'network', needs: m => !!(m.data.net && m.data.net.gw), test: m => {
    const g = m.data.net.gw; const slow = num(g.avg) > 25
    if (!(num(g.loss) > 2) && !slow) return null
    return { sev: g.loss > 10 ? 'high' : 'medium', penalty: g.loss > 10 ? 30 : 15, vars: { loss: g.loss, ms: Math.round(g.avg || 0) }, ev: { value: g.loss > 2 ? g.loss : Math.round(g.avg), unit: g.loss > 2 ? '% loss to router' : 'ms to router', limit: g.loss > 2 ? 2 : 25, source: 'Test-Connection to default gateway, 4 pings' }, fix: { kind: 'jump', page: 'network' } }
  } },
  { id: 'net-internet', sub: 'network', needs: m => !!(m.data.net && m.data.net.inet), test: m => {
    const i = m.data.net.inet; if (!(num(i.loss) > 2) && !(num(i.avg) > 90)) return null
    return { sev: i.loss > 10 ? 'high' : 'low', penalty: i.loss > 10 ? 25 : 8, vars: { loss: i.loss, ms: Math.round(i.avg || 0) }, ev: { value: i.loss > 2 ? i.loss : Math.round(i.avg), unit: i.loss > 2 ? '% loss to the internet' : 'ms to 1.1.1.1', limit: i.loss > 2 ? 2 : 90, source: 'Test-Connection 1.1.1.1, 4 pings' }, fix: { kind: 'jump', page: 'network' } }
  } },
  { id: 'net-slow-link', sub: 'network', needs: m => !!(m.data.net && m.data.net.adapter && num(m.data.net.adapter.mbps) != null && !m.data.net.adapter.wifi), test: m => {
    const a = m.data.net.adapter; if (a.mbps >= 1000 || a.mbps <= 0) return null
    return { sev: 'medium', penalty: 12, vars: { mbps: a.mbps, name: a.name }, ev: { value: a.mbps, unit: 'Mbps link', limit: 1000, source: 'Get-NetAdapter LinkSpeed' } }
  } },

  // ── configuration (the old pre-flight) ─────────────────────────────────────────
  { id: 'cfg-custom-os', sub: 'config', needs: m => !!pf(m), test: m => {
    const r = pf(m); if (r.osType !== 'Custom' && r.osType !== 'Modified') return null
    const high = (r.detections || []).some(d => d.severity === 'high')
    return { sev: r.osType === 'Custom' ? 'high' : 'medium', penalty: high ? 40 : 20, vars: { os: r.osLabel || r.osType }, ev: { value: r.osLabel || r.osType, source: 'OEMInformation, AME / Atlas / ReviOS markers, removed services' }, fix: { kind: 'jump', page: 'windows-opti' } }
  } },
  { id: 'cfg-hvci', sub: 'config', needs: m => !!(pf(m) && pf(m).tweakStates && 'hvci-enabled' in pf(m).tweakStates), test: m => {
    if (!pf(m).tweakStates['hvci-enabled']) return null
    return { sev: 'low', penalty: 6, ev: { value: 'on', source: 'DeviceGuard HypervisorEnforcedCodeIntegrity' }, fix: { kind: 'jump', page: 'hardware' } }
  } },
  { id: 'cfg-insider', sub: 'config', needs: m => !!(pf(m) && pf(m).tweakStates && 'insider-build' in pf(m).tweakStates), test: m => {
    if (!pf(m).tweakStates['insider-build']) return null
    return { sev: 'medium', penalty: 15, ev: { value: 'Insider build', source: 'BuildBranch' }, fix: { kind: 'external', url: 'ms-settings:windowsinsider' } }
  } },
  { id: 'cfg-overlays', sub: 'config', needs: m => !!(pf(m) && pf(m).tweakStates && ('discord-overlay' in pf(m).tweakStates)), test: m => {
    const t = pf(m).tweakStates; const list = [t['discord-overlay'] && 'Discord', t['geforce-overlay'] && 'GeForce Experience'].filter(Boolean)
    if (!list.length) return null
    return { sev: 'low', penalty: 3, vars: { list: list.join(', ') }, ev: { value: list.length, unit: 'overlays', limit: 0, source: 'Discord AppData folder, NvContainerNetworkService' } }
  } },
  { id: 'cfg-conflicts', sub: 'config', needs: m => !!(pf(m) && Array.isArray(pf(m).conflictDetails)), test: m => {
    const bad = pf(m).conflictDetails.filter(c => c.tier === 'incompatible'); if (!bad.length) return null
    return { sev: 'medium', penalty: Math.min(20, 8 * bad.length), vars: { n: bad.length, list: bad.map(c => c.label).join(', ') }, ev: { value: bad.length, unit: 'incompatible changes already on this PC', limit: 0, source: 'registry / service state scan (70+ checks)' }, fix: { kind: 'jump', page: 'windows-opti' } }
  } },
]

/** model: { data, profile, preflight, temps, incidents, incidentSummary, causes, takenAt }. Returns { findings, passed, measured }. */
function evaluate(m) {
  const findings = [], passed = [], measured = {}
  for (const r of RULES) {
    let ok = false
    try { ok = !!r.needs(m) } catch { ok = false }
    if (!ok) continue
    measured[r.sub] = (measured[r.sub] || 0) + 1
    let res = null
    try { res = r.test(m) } catch { res = null }
    if (!res) { passed.push({ id: r.id, subsystem: r.sub }); continue }
    findings.push({ id: r.id, subsystem: r.sub, severity: res.sev, penalty: res.penalty || 0, vars: res.vars || {}, evidence: res.ev || null, fix: res.fix || null })
  }
  findings.sort((a, b) => grade.sevRank(a.severity) - grade.sevRank(b.severity) || b.penalty - a.penalty || a.id.localeCompare(b.id))
  return { findings, passed, measured }
}

module.exports = { RULES, evaluate }
