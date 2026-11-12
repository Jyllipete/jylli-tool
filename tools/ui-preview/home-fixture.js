'use strict'
// Preview fixtures for Home: the REAL lib/home service (index maths, facts, Proof Ledger) on a synthetic PC, so the page shows real engine output.
// --hm-state attention (default: stale restore point, drift, open findings) | healthy (all clear, full ledger) | first (nothing measured yet) | fail (snapshot fails)
const Home = require('../../lib/home')

const H = 3600000, DAY = 24 * H
const MB = 1048576, GB = 1073741824

function world(state) {
  const now = Date.now()
  const first = state === 'first', healthy = state === 'healthy'
  const finding = (id, severity, penalty) => ({ id, subsystem: 'storage', severity, penalty, vars: {} })
  const report = first ? null : {
    score: healthy ? 91 : 72, takenAt: now - (healthy ? 2 * H : 3 * DAY), tone: healthy ? 'ok' : 'warn', stats: { findings: healthy ? 1 : 4, urgent: healthy ? 0 : 1 },
    grades: healthy ? { stability: 98, storage: 92, memory: 95, cpu: 97, gpu: 90, drivers: 84, windows: 88, security: 93, network: 96, config: 81 }
      : { stability: 90, storage: 58, memory: 88, cpu: 94, gpu: 86, drivers: 71, windows: 64, security: 79, network: 91, config: 47 },
    findings: healthy ? [finding('low-1', 'low', 3)] : [finding('ssd-wear', 'high', 34), finding('drivers-old', 'medium', 12), finding('pending-reboot', 'low', 4), finding('config-x', 'low', 3)],
  }
  const tweaks = {}
  const ids = ['game-dvr', 'visual-effects', 'gpu-hwsch', 'disable-fso', 'disable-mouse-accel', 'vrr-borderless', 'disable-background-apps', 'disable-netbios', 'disable-wpad', 'power-plan', 'nagle', 'sysmain']
  const nApplied = first ? 0 : healthy ? 11 : 6
  ids.forEach((id, i) => { tweaks['tweak_' + id] = i < nApplied ? 'applied' : 'default' })
  const settings = { ...tweaks, isPremium: true }
  if (!first) settings.aom_last_run = { ts: now - (healthy ? 2 * DAY : 41 * DAY), batchId: 'b-home-1', applied: nApplied, counters: { settingsChanged: nApplied, startupRemoved: 5, tasksDisabled: 3, bytesReclaimed: 0 } }
  const map = {}; ids.forEach(id => { map[id] = { show: true, state: 'recommended' } })
  const journal = first ? [] : [
    { id: 11, batchId: 'b-home-1', ts: now - (healthy ? 2 * DAY : 41 * DAY), via: 'auto-opti', result: 'ok', action: 'apply', tweakId: 'game-dvr', changes: [{}] },
    { id: 12, batchId: 'b-home-1', ts: now - (healthy ? 2 * DAY : 41 * DAY), via: 'auto-opti', result: 'ok', action: 'apply', tweakId: 'gpu-hwsch', changes: [{}] },
    { id: 13, batchId: 'b-home-2', ts: now - 30 * H, via: 'manual', result: 'ok', action: 'apply', tweakId: 'disable-fso', changes: [{}] },
    ...(healthy ? [{ id: 21, batchId: 'b-home-4', ts: now - 3 * DAY, via: 'manual', result: 'ok', action: 'apply', control: 'debloat:app:Microsoft.YourPhone', changes: [{}] }, { id: 22, batchId: 'b-home-4', ts: now - 3 * DAY, via: 'manual', result: 'ok', action: 'apply', control: 'debloat:app:Microsoft.BingNews', changes: [{}] }] : []),
    { id: 14, batchId: 'b-home-3', ts: now - 4 * DAY, via: 'manual', result: 'ok', action: 'apply', tweakId: 'disable-netbios', changes: [{}], undoneBy: 'u1' },
  ]
  return { now, report, settings, map: first ? null : map, journal, healthy, first }
}

const insts = new Map()
function svc(ctx) {
  const key = ctx.hm || 'attention'
  let o = insts.get(key)
  if (o) return o
  const w = world(key)
  let disk = null
  const service = Home.create({
    now: () => Date.now(),
    state: { read: () => disk, write: v => { disk = JSON.parse(JSON.stringify(v)) } },
    settings: () => w.settings,
    applicability: () => w.map,
    restore: () => ({ newestAt: w.first ? null : Date.now() - (w.healthy ? 1 * DAY : 12 * DAY), lastCreatedAt: null }),
    diagCached: () => ({ report: w.report }),
    isAdmin: () => w.healthy || w.first ? true : false,
    cleanupHistory: () => (w.first ? [] : [{ ts: Date.now() - 6 * DAY, freedBytes: 3.4 * GB, itemCount: 12 }, { ts: Date.now() - 41 * DAY, freedBytes: 1.1 * GB, itemCount: 7 }]),
    cleanupScans: () => (w.first ? [] : [{ ts: Date.now() - 2 * H, sizes: { 'clean-temp': w.healthy ? 90 * MB : 4.2 * GB } }]),
    cleanupLane: () => 'safe',
    debloatSummary: () => (w.first ? null : { count: w.healthy ? 14 : 3, safe: w.healthy ? 0 : 6, ram: 640, disk: null }),
    journal: () => w.journal,
    game: () => null,
    driftCheck: async () => ({ checked: 6, reverted: w.healthy ? [] : ['disable-fso', 'gpu-hwsch'] }),
  })
  o = { service, w }
  if (!w.healthy && !w.first) service.drift()
  if (w.healthy) service.noteVerify({ rebooted: true, boot: { beforeMs: 41800, afterMs: 29600 }, runAt: Date.now() - 2 * DAY })
  insts.set(key, o)
  return o
}

const T = ['cpu.load', 'gpu0.load', 'ram.load', 'net.rx', 'disk.c.pct']

async function handle(name, args, sender, ctx) {
  const st = ctx.hm || 'attention'
  if (/^home2/.test(name)) {
    if (st === 'fail') return { ok: false, error: 'snapshot-failed' }
    const { service } = svc(ctx)
    if (name === 'home2Cached') return service.cached()
    if (name === 'home2Snapshot') return service.snapshot()
    if (name === 'home2Drift') return service.drift()
    if (name === 'home2Legacy') return { ok: true }
  }
  if (!ctx.hm) return undefined            // the other mocks only change when a Home state is asked for
  const { w } = svc(ctx)
  const now = Date.now()
  if (name === 'journalList') return w.journal.slice().sort((a, b) => b.ts - a.ts)
  if (name === 'getMetricsHistory') return Array.from({ length: 7 * 24 * 6 }, (_, i) => { const t = now - (7 * 24 * 6 - i) * 600e3; return i % 97 > 90 ? null : { ts: t, cpu: Math.round(18 + 22 * Math.abs(Math.sin(i / 19)) + 14 * Math.abs(Math.sin(i / 5))), ram: Math.round(46 + 9 * Math.sin(i / 40)) } }).filter(Boolean)
  if (name === 'listSessions') return w.first ? [] : [{ id: 'aaaaaaaaaaa1', game: 'Valorant', startedAt: now - 5 * H, durationSec: 2520, summary: { avgFps: 238, low1Fps: 171 } }]
  if (name === 'aiGetStatus') return { loaded: !w.first, provider: 'cpu' }
  if (name === 'aiGetRecommendations') return { ok: true, recommendations: w.healthy ? [] : [{ id: 'nagle', name: 'Disable Nagle\'s algorithm', score: 0.88 }] }
  if (name === 'telemetrySubscribe') return { ok: true, snapshot: { v: 1, seq: 1, t: now, s: { 'cpu.load': [23, 200, 'preview'], 'gpu0.load': [41, 200, 'preview'], 'ram.load': [58, 200, 'preview'], 'net.rx': [1.4e6, 200, 'preview'], 'net.tx': [2.2e5, 200, 'preview'], 'disk.c.pct': [64, 200, 'preview'], 'disk.c.used': [320, 200, 'preview'], 'disk.c.total': [500, 200, 'preview'], 'ram.used': [19.2, 200, 'preview'], 'ram.total': [33.5, 200, 'preview'], 'sys.processes': [214, 200, 'preview'], 'cpu.temp.package': [61, 200, 'preview'], 'gpu0.temp.core': [57, 200, 'preview'], 'gpu0.vram.pct': [38, 200, 'preview'], 'sys.uptime': [93720, 200, 'preview'] } } }
  return undefined
}

module.exports = { handle, T }
