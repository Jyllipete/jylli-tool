// Game automation answers for the browser preview: the REAL lib/gameauto service on a fake PC (fake Windows Update service, fake Game Shield,
// fake Pulse), so switches, sliders, exclusions and Retry really round-trip through the service. State comes from ?gx= on /app (serve.js passes ctx.gx):
//   idle | playing | ended | failed | degraded | off | paused | fail     (add &tier=free for a free account)
// "ended" is a finished session where Windows Update and one program could not be put back; Retry succeeds the second time.
const Auto = require('../../lib/gameauto')

const presets = {
  csgo: { name: 'CS2 / CS:GO', exe: 'cs2' }, valorant: { name: 'Valorant', exe: 'VALORANT-Win64-Shipping' }, apex: { name: 'Apex Legends', exe: 'r5apex*' },
  fortnite: { name: 'Fortnite', exe: 'FortniteClient-Win64-Shipping' }, fivem: { name: 'FiveM', exe: 'FiveM_GTAProcess' }, minecraft: { name: 'Minecraft', exe: 'javaw' },
}
const known = [{ id: 'gtav', name: 'GTA V', exes: ['GTA5.exe'], pulse: 'fivem' }, { id: 'cyberpunk', name: 'Cyberpunk 2077', exes: ['Cyberpunk2077.exe'], pulse: null }]
const library = [{ id: 'custom:D:\\Games\\Tiny\\tiny.exe', name: 'Tiny Tactics', exes: ['tiny.exe'], source: 'custom' }]

const cache = new Map()
function rig(state, premium) {
  const key = state + '|' + premium
  if (cache.has(key)) return cache.get(key)
  const w = { names: new Set(), listOk: true, settings: { gameWatcherEnabled: state !== 'off', updateGuardEnabled: true, gameShieldEnabled: true, autoPulseEnabled: true, gameShieldExclusions: ['obs64.exe'], gameShieldTier3Threshold: 70, gameShieldMidSessionThreshold: 80 }, store: null, pulse: null, ugRelease: state !== 'ended', shieldFail: state === 'ended' ? 'no-path' : null, ugHeld: false, pulseOk: state !== 'failed' }
  const svc = Auto.create({
    tickMs: 3600000,
    settings: () => w.settings,
    saveSettings: p => { Object.assign(w.settings, p); return true },
    premium: () => premium,
    processes: async () => ({ ok: w.listOk, names: w.names }),
    sources: () => ({ presets, known, library }),
    competeActive: () => state === 'paused',
    state: { read: () => w.store, write: v => { w.store = JSON.parse(JSON.stringify(v)); return true } },
    updateGuard: {
      pendingUpdates: async () => (state === 'failed' ? { count: null, error: 'timeout' } : { count: 3 }),
      hold: async () => { if (state === 'failed') return { ok: false, state: 'failed', reason: 'not-held' }; w.ugHeld = true; return { ok: true, state: 'holding' } },
      release: async () => { if (!w.ugRelease) { w.ugRelease = true; return { ok: false, state: 'failed' } } w.ugHeld = false; return { ok: true, state: 'restored' } },
      pendingRestore: () => w.ugHeld && !w.ugRelease,
    },
    shield: {
      activate: async () => ({ ok: true, stopped: ['onedrive.exe', 'teams.exe', 'discord.exe'] }),
      deactivate: async () => (w.shieldFail ? { ok: false, restored: ['onedrive.exe', 'discord.exe'], failed: [{ name: 'teams.exe', verdict: w.shieldFail }], stoppedCount: 3, freedMB: 612 } : { ok: true, restored: ['onedrive.exe', 'teams.exe', 'discord.exe'], failed: [], stoppedCount: 3, freedMB: 612 }),
      recover: async () => { w.shieldFail = null; return { ok: true, restored: ['teams.exe'], failed: [] } },
      active: () => false,
    },
    pulse: {
      active: () => w.pulse,
      start: async id => { if (!w.pulseOk) return { ok: false, error: 'Unknown preset' }; w.pulse = id; return { ok: true } },
      stop: async () => { w.pulse = null; return { ok: true } },
    },
    effects: {
      start: async () => [{ feature: 'mmcss', kind: 'applied', key: 'mmcss', detail: 'verified' }, { feature: 'profile', kind: 'applied', detail: 'kept', vars: { name: 'Competitive' } }],
      end: async () => [{ feature: 'mmcss', kind: 'restored', key: 'mmcss', ok: true, detail: 'ok' }],
    },
    emit: () => {}, legacyEvent: () => {}, log: () => {},
  })
  const r = { w, svc, ready: null }
  r.ready = (async () => {
    if (state === 'idle' || state === 'off' || state === 'paused') { if (state !== 'off') await svc.startWatcher(); return }
    w.names = new Set(['cs2'])
    await svc.startWatcher()
    if (state === 'ended') { w.names = new Set(); await svc.tick(); await svc.tick() }
    if (state === 'degraded') { w.listOk = false; for (let i = 0; i < 3; i++) await svc.tick() }
  })()
  cache.set(key, r)
  return r
}

async function respond(name, args, ctx) {
  const state = ctx.gx || 'playing'
  if (state === 'fail') return name === 'gameautoState' ? { ok: false, error: 'failed' } : { ok: false, error: 'failed' }
  const r = rig(state, !!ctx.premium)
  await r.ready
  const a = (args && args[0]) || {}
  switch (name) {
    case 'gameautoState': return { ok: true, state: r.svc.snapshot() }
    case 'gameautoSet': return r.svc.set(a)
    case 'gameautoExclusion': return r.svc.exclusion(a)
    case 'gameautoRetry': return r.svc.retry(args && args[0])
    default: return undefined
  }
}

module.exports = { respond }
