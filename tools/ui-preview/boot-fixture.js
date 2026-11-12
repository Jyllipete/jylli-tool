'use strict'
// Boot-scan scenes for `npm run preview -- --boot [--bt-state first|returning|changed|slow|fail]`.
// Plays the same spec-progress events main.js sends (including Cached / Admin / Verified), on a timeline, then answers getSystemInfo.
const { sysInfo } = require('./fixtures')
const Fp = require('../../lib/sysinfo/fingerprint')
const sleep = ms => new Promise(r => setTimeout(r, ms))

const BASE = Object.assign({}, sysInfo, { board: 'ASUSTeK ROG STRIX B650-A', biosVersion: '3010', osBuild: '26200' })

// [delay ms from start, label, detail, data] — data is what main.js sends with each event
const LIVE = (b, t) => [
  [t.cpu, 'CPU detected', `${b.cpu} · ${(b.cpuSpeed / 1000).toFixed(1)} GHz`, { cpu: b.cpu, cpuSpeed: b.cpuSpeed, cpuCores: b.cpuCores }],
  [t.ram, 'RAM detected', `${b.ramGB} GB · ${b.ramSpeed} MHz`, { ramGB: b.ramGB, ramSpeed: b.ramSpeed }],
  [t.gpu, 'GPU detected', b.gpu || 'Unknown', { gpu: b.gpu }],
  [t.vram, 'VRAM detected', `${Math.round(b.vramMB / 1024)}GB VRAM`, { vramMB: b.vramMB }],
  [t.storage, 'Storage detected', `${b.diskType} · ${b.diskUsedGB}/${b.diskTotalGB} GB`, { diskType: b.diskType, nvme: b.nvme, diskUsedGB: b.diskUsedGB, diskTotalGB: b.diskTotalGB }],
  [t.display, 'Display detected', `${b.displayRes} · ${b.displayRefresh} Hz`, { displayRes: b.displayRes, displayRefresh: b.displayRefresh }],
  [t.board, 'Board detected', `${b.board} · BIOS ${b.biosVersion}`, { board: b.board, biosVersion: b.biosVersion }],
]
const FAST = { cpu: 500, ram: 800, gpu: 1100, vram: 1500, storage: 2200, display: 2400, board: 2700, done: 3000 }
const COLD = { cpu: 700, ram: 1400, gpu: 2000, vram: 2700, storage: 4200, display: 4600, board: 5200, done: 5800 }
const SLOW = { cpu: 800, ram: 1500, gpu: 2400, vram: 3200, storage: 13000, display: 13500, board: 14000, done: 14500 }

async function handle(name, args, sender, ctx) {
  if (name !== 'getSystemInfo' || !ctx.bt) return undefined
  const send = (ch, d) => { try { sender.send('mock-event', ch, d) } catch { /* window gone */ } }
  const state = ctx.bt
  let live = Object.assign({}, BASE), t = COLD, events = null
  if (state === 'returning' || state === 'changed') {
    const prev = Object.assign({}, BASE)
    if (state === 'changed') live = Object.assign({}, BASE, { ramGB: 64, gpuDriver: '566.14' })
    t = FAST
    send('onSpecProgress', { label: 'Cached', detail: '', cached: true, info: prev, signature: Fp.signature(prev), savedAt: Date.now() - 86400000 * 2 })
    events = { changes: Fp.diff(prev, live), signature: Fp.signature(live), warm: true }
    sleep(900).then(() => send('onSpecProgress', { label: 'Admin', detail: '', admin: true, isAdmin: true }))
  }
  if (state === 'slow') t = SLOW
  if (state === 'fail') { live = Object.assign({}, BASE, { gpu: 'Detecting…', vramMB: 0, displayRes: '', displayRefresh: 0, board: '', biosVersion: '' }) }
  const lines = LIVE(live, t).filter(([, l]) => !(state === 'fail' && /Display|Board/.test(l)))
  const t0 = Date.now()
  lines.forEach(([d, l, det, data]) => sleep(d).then(() => send('onSpecProgress', { label: l, detail: l === 'VRAM detected' && state === 'fail' ? 'VRAM not detected' : det, data })))
  await sleep(t.done)
  const info = Object.assign({}, live, { signature: Fp.signature(live), changes: events ? events.changes : [], remembered: !!events })
  send('onSpecProgress', { label: 'Verified', detail: '', verified: true, signature: info.signature, changes: info.changes })
  send('onSpecProgress', { label: 'Done', detail: 'Running as Administrator' })
  return info
}

module.exports = { handle }
