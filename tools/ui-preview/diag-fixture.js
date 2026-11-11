'use strict'
// Preview fixtures for Diagnostics 2.0: the REAL incident, cause, finding, grade and report code on a synthetic PC.
// --dx-state trouble (default: crashing PC, worn SSD) | clean (healthy PC) | first (no checkup yet) | fail (scan error)
const model = require('../../lib/diagnostics/model')

const H = 3600000, DAY = 24 * H

function data(now, state) {
  const idx = Array.from({ length: 30 }, (_, i) => ({ t: now - (29 - i) * DAY, v: state === 'clean' ? 9.6 : (i > 22 ? 3.4 + (i % 3) * 0.6 : 8.9) }))
  const base = {
    reliability: { idx, rec: state === 'clean' ? [] : [{ t: now - 3 * H, src: 'Application Error', id: 1000, p: 'FiveM_GTAProcess.exe', m: '' }, { t: now - 26 * H, src: 'Application Hang', id: 1002, p: 'chrome.exe', m: '' }] },
    events: { list: state === 'clean' ? [] : [
      { t: now - 5 * H, id: 1001, p: 'Microsoft-Windows-WER-SystemErrorReporting', m: 'The bugcheck was: 0x00000116 (0xffff, 0x1, 0x0, 0x2).' },
      { t: now - 5 * H - 120000, id: 41, p: 'Microsoft-Windows-Kernel-Power', m: '' },
      { t: now - 28 * H, id: 1001, p: 'Microsoft-Windows-WER-SystemErrorReporting', m: 'The bugcheck was: 0x00000116 (0xffff, 0x1, 0x0, 0x2).' },
      { t: now - 29 * H, id: 4101, p: 'Display', m: '' }, { t: now - 4 * H, id: 4101, p: 'Display', m: '' }, { t: now - 3 * H, id: 4101, p: 'Display', m: '' },
      { t: now - 11 * DAY, id: 153, p: 'disk', m: '' }, { t: now - 20 * DAY, id: 17, p: 'Microsoft-Windows-WHEA-Logger', m: '' }] },
    minidumps: { list: state === 'clean' ? [] : [{ t: now - 5 * H + 60000, n: '111126-9812-01.dmp', size: 1048576 }] },
    storage: { disks: [{ n: 'Samsung SSD 970 EVO 1TB', media: 'SSD', bus: 'NVMe', health: 'Healthy', size: 1e12, wear: state === 'clean' ? 6 : 86, temp: state === 'clean' ? 41 : 63, rerr: 0, werr: 0 }], predict: false, trimDisabled: 0, vols: [{ l: 'C', size: 1e12, free: state === 'clean' ? 6.1e11 : 7.4e10 }], sysDrive: 'C' },
    memory: { totalKB: 33554432, freeKB: 12000000, commitPct: state === 'clean' ? 42 : 71, memdiag: null },
    cpu: { name: 'AMD Ryzen 7 7800X3D', cur: 4200, max: null, load: state === 'clean' ? 4 : 9 },
    devices: { list: state === 'clean' ? [] : [{ n: 'Unknown USB device (Device Descriptor Request Failed)', code: 43, cls: 'USB' }] },
    drivers: { list: [{ n: 'NVIDIA GeForce RTX 4070', m: 'NVIDIA', v: '32.0.15.6614', t: now - (state === 'clean' ? 40 : 0.4) * DAY, cls: 'DISPLAY' }, { n: 'Realtek PCIe 2.5GbE Family Controller', m: 'Realtek', v: '10.68.0.1', t: now - 640 * DAY, cls: 'NET' }, { n: 'Realtek High Definition Audio', m: 'Realtek', v: '6.0.9500.1', t: now - 410 * DAY, cls: 'MEDIA' }, { n: 'Intel Wireless Bluetooth', m: 'Intel', v: '23.30.0.4', t: now - 90 * DAY, cls: 'BLUETOOTH' }] },
    updates: { rebootPending: state !== 'clean', kbs: [{ kb: 'KB5051987', t: now - 9 * DAY }, { kb: 'KB5050094', t: now - 40 * DAY }], lastKbTs: now - 9 * DAY, wu: 'Manual' },
    net: { gw: { ip: '192.168.1.1', avg: 2.4, loss: 0 }, inet: { avg: state === 'clean' ? 11 : 14, loss: 0 }, adapter: { name: 'Ethernet', mbps: 2500, wifi: false } },
    runtimes: { missing: state === 'clean' ? [] : ['vcredist'] },
  }
  if (state !== 'clean') base.drivers.list[0].t = now - 9 * H
  return base
}

function report(ctx, mode) {
  const now = Date.now(), st = ctx.dx || 'trouble'
  return model.buildReport({
    mode: mode || 'quick', takenAt: now, ms: 24800, admin: true, probes: {}, data: data(now, st),
    profile: { gpus: [{ name: 'NVIDIA GeForce RTX 4070', vendor: 'nvidia', discrete: true, driverAgeDays: st === 'clean' ? 40 : 0 }], security: { firewallOn: true, defenderRtp: true, uac: 'on', windowsUpdate: 'ok' }, storage: { pagefileDisabled: false }, ram: { xmp: st === 'clean' ? 'on' : 'off', xmpConfiguredMT: 4800, xmpRatedMT: 6000 }, power: { kind: 'balanced', name: 'Balanced' } },
    preflight: { osType: 'Stock', osLabel: 'Standard Windows installation', tweakStates: { 'secure-boot-off': false, 'hvci-enabled': false, 'windows-unlicensed': false, 'discord-overlay': st !== 'clean', 'insider-build': false }, conflictDetails: [], detections: [] },
    temps: { cpuTemp: st === 'clean' ? 42 : 71 },
    journal: st === 'clean' ? [] : [{ id: 'j1', ts: now - 30 * H, action: 'apply', tweakId: 'power-throttling' }],
  })
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const bench = { runs: [{ ts: Date.now() - 6 * DAY, points: { cpu1: 1480, cpuN: 2210, mem: 1180, disk: 1320 }, detail: { disk: { cached: true } } }, { ts: Date.now() - 1 * DAY, points: { cpu1: 1520, cpuN: 2260, mem: 1210, disk: 1290 }, detail: { disk: { cached: true } } }] }
bench.baseline = bench.runs[0]

function respond(name, args, ctx) {
  const st = ctx.dx || 'trouble'
  switch (name) {
    case 'diag2Cached': return st === 'first' || st === 'fail' ? { ok: true, report: null, history: [], bench: { runs: [], baseline: null } } : { ok: true, report: report(ctx), history: [{ ts: Date.now() - 4 * DAY, score: 71, grades: { stability: 70, storage: 80 }, findings: [] }, { ts: Date.now() - 1 * DAY, score: 66, grades: { stability: 55, storage: 80 }, findings: [] }], bench }
    case 'diag2Scan': return sleep(1800).then(() => st === 'fail' ? { ok: false, error: 'scan-failed' } : { ok: true, report: report(ctx, args[0] && args[0].mode), diff: { since: Date.now() - 4 * DAY, score: -6, deltas: { stability: -15 }, appeared: ['crash-gpu-reset'], resolved: [] }, history: [] })
    case 'diag2RepairMeta': return { id: args[0], risk: ['restore-pagefile'].includes(args[0]) ? 'hold' : ['enable-trim', 'enable-firewall', 'enable-wu'].includes(args[0]) ? 'safe' : 'confirm', rp: false, restart: false }
    case 'diag2Fix': return { ok: true, id: args[0] && args[0].id, restart: false }
    case 'diag2Bench': return sleep(800).then(() => ({ ok: true, run: bench.runs[1], baseline: bench.baseline, runs: bench.runs }))
    case 'diag2BenchBaseline': return { ok: true, baseline: bench.baseline, runs: bench.runs }
    case 'diag2Abort': return { ok: true }
    case 'diag2ExportSave': return { ok: true, path: 'C:\\Users\\you\\Documents\\jylli-health-report.html' }
    default: return undefined
  }
}

module.exports = { respond, report, data }
