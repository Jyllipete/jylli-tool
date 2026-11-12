'use strict'
// Preview fixtures for the Network tab: the REAL lib/network service (probe parser, model, findings, run + verify, route verdict) on a synthetic PC.
// --nt-state ethernet (default: wired, clean route, a few recommended switches) | wifi-weak (weak 2.4 GHz Wi-Fi that jitters) | lossy (packet loss at the ISP, slow DNS, bufferbloat)
//            | first (Windows cannot be read, nothing remembered) | fail (apply fails, no restore point)
// The same fixtures answer the speed test, the DNS test and the game-server test that the Measure view reuses from the old Network tab.
const { EventEmitter } = require('events')
const fs = require('fs'), path = require('path')
const Network = require('../../lib/network')
const detect = require('../../lib/network/detect')
const { entries } = require('../list-tweaks')
const { RISK } = require('../../lib/tweak-risk')

const main = fs.readFileSync(path.join(__dirname, '..', '..', 'main.js'), 'utf8')
const RETIRED = Object.fromEntries([...main.slice(main.indexOf('const RETIRED_TWEAKS = {'), main.indexOf('function retireFivemTweaks')).matchAll(/^  '([a-z0-9-]+)':\s+'((?:[^'\\]|\\.)*)'/gm)].map(m => [m[1], m[2].replace(/\\'/g, "'")]))
const TIER = Object.fromEntries(entries.map(e => [e.id, Number(e.tier) || 1]))
const EVT = { 'net2-progress': 'onNet2Progress', 'net2-route': 'onNet2Route' }
const sleep = ms => new Promise(r => setTimeout(r, ms))

const WPAD = 's|WinHttpAutoProxySvc'
function readings(state) {
  const wifi = state === 'wifi-weak'
  const r = {}
  for (const q of detect.requests(detect.plan())) r[q.k] = q.a === 's' ? 'Manual' : q.a === 'x' ? ({ 'x|doh': 'off', 'x|rss': 'default' }[q.k] || 'on') : null
  if (wifi) for (const k of ['x|eee', 'x|intmod', 'x|offload', 'x|rss']) r[k] = 'NA'
  return r
}
function facts(state, dns) {
  const wifi = state === 'wifi-weak'
  const f = { adapter: { name: wifi ? 'Wi-Fi' : 'Ethernet', desc: wifi ? 'Intel(R) Wi-Fi 6 AX201 160MHz' : 'Realtek PCIe 2.5GbE Family Controller', wifi, speed: wifi ? 144e6 : 2.5e9, ifIndex: 4, driver: '10.62' }, gateway: '192.168.1.1', dns: [{ name: wifi ? 'Wi-Fi' : 'Ethernet', ifIndex: 4, ...dns }] }
  if (wifi) f.wlan = ['    SSID                   : Kotiverkko', '    Radio type             : 802.11n', '    Channel                : 6', '    Signal                 : 52%', '    Receive rate (Mbps)    : 144.4']
  return f
}
function hopsFor(state, n) {
  const j = Math.random()
  if (state === 'wifi-weak') return [[1, '192.168.1.1', 3 + j * 38], [2, '100.64.0.1', 14 + j * 5], [3, '84.20.1.1', 16 + j * 4], [4, '62.115.1.1', 19 + j * 3], [5, '1.1.1.1', 22 + j * 5]]
  if (state === 'lossy') { const lose = n % 5 === 0; return [[1, '192.168.1.1', 0.9 + j * 0.4], [2, lose ? null : '100.64.0.1', lose ? null : 8 + j], [3, lose ? null : '84.20.1.1', lose ? null : 9 + j], [4, lose ? null : '62.115.1.1', lose ? null : 12 + j * 2], [5, lose ? null : '1.1.1.1', lose ? null : 14 + j * 3]] }
  return [[1, '192.168.1.1', 0.8 + j * 0.5], [2, '100.64.0.1', 8 + j], [3, '84.20.1.1', 9 + j], [4, '62.115.1.1', 11 + j], [5, '1.1.1.1', 12 + j * 1.5]]
}
const SERVERS = { 'dns-cloudflare': ['1.1.1.1', '1.0.0.1'], 'dns-google': ['8.8.8.8', '8.8.4.4'], 'dns-quad9': ['9.9.9.9', '149.112.112.112'], 'dns-adguard': ['94.140.14.14', '94.140.15.15'] }

const insts = new Map()
function svc(sender, ctx) {
  const state = ctx.nt || 'ethernet'
  const key = sender.id + ':' + state
  let o = insts.get(key)
  if (o) return o
  const now = Date.now()
  const reg = readings(state), settings = { isPremium: true }, journal = []
  const w = { dns: state === 'lossy' ? { servers: ['193.210.18.18', '193.210.19.190'], isStatic: false } : { servers: ['192.168.1.1'], isStatic: false } }
  const store = { v: null }
  const send = (ch, p) => { try { if (!sender.isDestroyed()) sender.send('mock-event', EVT[ch], p) } catch { /* window closed */ } }
  const set = (id, ap) => {
    if (id === 'disable-wpad') reg[WPAD] = ap ? 'Disabled' : 'Manual'
    if (id === 'nic-interrupt-mod') reg['x|intmod'] = ap ? 'off' : 'on'
    if (id === 'nic-energy-efficient') reg['x|eee'] = ap ? 'off' : 'on'
    if (id === 'disable-netbios') reg['x|netbios'] = ap ? 'off' : 'on'
    if (id === 'dns-doh') { reg['x|doh'] = ap ? 'on' : 'off'; if (ap) w.dns = { servers: SERVERS['dns-cloudflare'], isStatic: true } }
    if (SERVERS[id]) w.dns = ap ? { servers: SERVERS[id], isStatic: true } : { servers: ['192.168.1.1'], isStatic: false }
    if (id === 'dns-custom') w.dns = ap ? { servers: [settings.customDnsPrimary || '10.0.0.53'], isStatic: true } : { servers: ['192.168.1.1'], isStatic: false }
  }
  if (state === 'ethernet') { settings['tweak_disable-wpad'] = 'applied'; reg[WPAD] = 'Disabled'; journal.push({ id: 'e0', batchId: 'b-0', tweakId: 'disable-wpad', action: 'apply', via: 'manual', ts: now - 3 * 86400000, result: 'ok', fidelity: 'exact', changes: [{ kind: 'svc' }] }); journal.push({ id: 'e1', batchId: 'b-1', tweakId: 'flush-dns', action: 'apply', via: 'manual', ts: now - 5 * 3600000, result: 'ok', fidelity: 'exact', changes: [] }) }
  const deps = {
    runPS: async () => (state === 'first' ? { ok: false, out: '' } : { ok: true, out: 'JJNET:' + JSON.stringify({ r: reg, f: facts(state, w.dns) }) }),
    applyBatch: async req => {
      if (state === 'fail') return { ok: false, aborted: true, reason: 'restore-point-failed', guidance: 'Turn on System Protection for the system drive, then try again.', restorePoint: { ok: false } }
      const items = req.items.map(i => {
        set(i.tweakId, i.action === 'apply')
        settings['tweak_' + i.tweakId] = i.action === 'apply' ? 'applied' : 'restored'
        journal.unshift({ id: 'n' + Math.random().toString(36).slice(2, 7), batchId: 'nb' + journal.length, tweakId: i.tweakId, action: i.action, via: 'manual', ts: Date.now(), result: 'ok', fidelity: 'exact', changes: [{ kind: 'x' }] })
        return { id: i.tweakId, action: i.action, status: 'ok', journalId: 'j-' + i.tweakId, fidelity: 'exact' }
      })
      await sleep(700)
      return { ok: true, batchId: 'nb' + journal.length, items, restorePoint: { ok: true } }
    },
    journalList: () => journal,
    undo: async t => { for (const e of journal.filter(x => x.batchId === t.batchId || x.id === t.entryId)) { set(e.tweakId, false); settings['tweak_' + e.tweakId] = 'restored'; e.undoneBy = 'u' } return { ok: true } },
    tweakMeta: ids => ids.filter(id => TIER[id]).map(id => ({ id, safetyTier: RETIRED[id] ? 1 : TIER[id], gamerImpact: 'low', retired: RETIRED[id] || null, risk: RISK[id] || null, fidelity: 'exact' })),
    applicability: () => (state === 'wifi-weak'
      ? { 'nic-offloads': { show: false }, 'nic-interrupt-mod': { show: false }, 'nic-energy-efficient': { show: false }, 'nic-rss-affinity': { show: false }, 'wifi-gaming-tune': { show: true, state: 'recommended' } }
      : { 'wifi-gaming-tune': { show: false }, 'nic-interrupt-mod': { show: true, state: 'recommended' }, 'nic-energy-efficient': { show: true, state: 'recommended' }, 'nic-offloads': { show: true, state: 'available' }, 'nic-rss-affinity': { show: true, state: 'available' } }),
    settings: () => settings,
    saveSettings: p => { Object.assign(settings, p); return true },
    state: { read: () => store.v, write: v => { store.v = v } }, bootMs: () => now - 3 * 3600000, now: () => Date.now(),
    benchDns: async list => { await sleep(900); return list.map(p => ({ name: p.name, server: p.server, fail: false, median: p.name === 'current' ? (state === 'lossy' ? 46 : 3) : p.name === 'cloudflare' ? 9 : p.name === 'google' ? 13 : p.name === 'quad9' ? 18 : 22 })) },
    speedHistory: () => (state === 'lossy' ? [{ t: Date.now() - 2 * 3600000, downMbps: 94, upMbps: 11, latencyMs: 18, jitterMs: 2, loadedLatencyMs: 310, colo: 'HEL' }] : []),
    lookup4: async h => (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(h) ? '93.184.216.34' : null),
    emit: send,
    spawn: () => {
      const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter() })
      let n = 0, dead = false
      const tick = () => { if (dead) return; n++; child.stdout.emit('data', 'JJROUTE:' + JSON.stringify({ d: 5, h: hopsFor(state, n) }) + '\n'); setTimeout(tick, 280) }
      child.kill = () => { dead = true }
      setTimeout(tick, 120)
      return child
    },
  }
  o = { svc: Network.create(deps), state }
  insts.set(key, o)
  return o
}

const GAMES = [['Cloudflare DNS', 'DNS', 11, 1], ['Google DNS', 'DNS', 14, 1.5], ['Riot Games (EU)', 'Valorant/LoL', 28, 2], ['Steam Content', 'Steam', 19, 3], ['EA / Origin', 'EA/Apex', 42, 4], ['Activision', 'Warzone/CoD', 88, 11], ['Epic Games', 'Fortnite', 36, 2], ['Rockstar Games', 'GTA/FiveM', 51, 14], ['FiveM CFX', 'FiveM', 33, 2]]

async function handle(name, args, sender, ctx) {
  const o = svc(sender, ctx)
  const a = args[0] || {}
  switch (name) {
    case 'net2Scan': return o.svc.scan()
    case 'net2Cached': return o.svc.cached() || { ok: false }
    case 'net2Run': return o.svc.run({ ids: a.ids || [], action: a.action })
    case 'net2DnsSet': return o.svc.dnsSet({ preset: a.preset, custom: a.custom })
    case 'net2Checkup': return o.svc.checkup()
    case 'net2RouteStart': return o.svc.routeStart(a.host)
    case 'net2RouteStop': return o.svc.routeStop()
    case 'net2RouteSnapshot': return o.svc.routeSnapshot()
    case 'net2History': return o.svc.history()
    case 'net2Undo': return o.svc.undo(a.target || {}, { force: !!a.force })
    case 'netTopology': return { ok: true, gateway: { ip: '192.168.1.1', latencyMs: 1 }, identity: { manufacturer: 'ASUSTeK', model: 'RT-AX86U', friendlyName: 'ASUS RT-AX86U', source: 'upnp' }, adapters: [] }
    case 'getSpeedHistory': return o.state === 'lossy' ? [{ t: Date.now() - 2 * 3600000, downMbps: 94, upMbps: 11, latencyMs: 18, jitterMs: 2, loadedLatencyMs: 310, colo: 'HEL' }, { t: Date.now() - 30 * 3600000, downMbps: 99, upMbps: 12, latencyMs: 17, jitterMs: 2, loadedLatencyMs: 280, colo: 'HEL' }] : []
    case 'benchmarkDns': return { ok: true, results: [{ name: 'Cloudflare', server: '1.1.1.1', tweak: 'dns-cloudflare', fail: false, median: 9 }, { name: 'Google', server: '8.8.8.8', tweak: 'dns-google', fail: false, median: 13 }, { name: 'Quad9', server: '9.9.9.9', tweak: 'dns-quad9', fail: false, median: 18 }, { name: 'AdGuard', server: '94.140.14.14', tweak: 'dns-adguard', fail: true, median: 9999 }] }
    case 'runSpeedTest': { await sleep(600); return { ok: true, colo: 'HEL', downMbps: 487, upMbps: 41, latency: { ms: 14, jitterMs: 1.8 }, loadedLatency: { ms: 58 }, startedAt: Date.now(), bytes: 380e6 } }
    case 'runPingTestsV2': {
      for (const [n, c, avg, jit] of GAMES) { await sleep(120); try { sender.send('mock-event', 'onPingResultV2', { name: n, host: n, category: c, avg, min: avg - 2, max: avg + 9, p95: avg + 6, jitter: jit, packetLoss: n === 'Rockstar Games' ? 2 : 0, samples: [] }) } catch { /* closed */ } }
      return { ok: true, results: [], mode: 'quick' }
    }
    default: return undefined
  }
}

module.exports = { handle }
