const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs'), path = require('path')
const catalog = require('../lib/network/catalog')
const detect = require('../lib/network/detect')
const model = require('../lib/network/model')
const Path = require('../lib/network/path')
const Findings = require('../lib/network/findings')
const Verdict = require('../lib/fivem/route-verdict')
const { validateDns } = require('../lib/network')
const { entries } = require('../tools/list-tweaks')

const root = path.join(__dirname, '..')
const mainSrc = fs.readFileSync(path.join(root, 'main.js'), 'utf8')
const retiredInMain = new Set([...mainSrc.slice(mainSrc.indexOf('const RETIRED_TWEAKS = {'), mainSrc.indexOf('function retireFivemTweaks')).matchAll(/^  '([a-z0-9-]+)':/gm)].map(m => m[1]))

test('catalog: every id is a real tweak, ids are unique, every lane exists', () => {
  const tweaks = new Set(entries.map(e => e.id))
  const seen = new Set()
  for (const i of catalog.ITEMS) {
    assert.ok(tweaks.has(i.id), 'not in TWEAKS: ' + i.id)
    assert.ok(!seen.has(i.id), 'duplicate ' + i.id); seen.add(i.id)
    assert.ok(catalog.LANES.some(l => l.id === i.lane), 'lane of ' + i.id)
  }
})

test('catalog: the retired lane is exactly the retired tweaks, and nothing retired is probed', () => {
  for (const i of catalog.ITEMS) {
    assert.strictEqual(i.lane === 'retired', retiredInMain.has(i.id), i.id)
    if (i.lane === 'retired') assert.ok(!i.probe, i.id)
  }
})

test('catalog: nothing in it is recommended by itself (only lib/tweak-applicability recommends), presets match the dns tweaks', () => {
  for (const i of catalog.ITEMS) assert.ok(!i.rec, i.id)
  for (const p of catalog.PRESETS) { assert.ok(catalog.byId[p.tweak], p.tweak); assert.strictEqual(catalog.byId[p.tweak].preset, p.id); assert.ok(p.servers.length === 2) }
  assert.strictEqual(catalog.byId['dns-custom'].preset, 'custom')
})

test('catalog: it does not take over switches the Windows tab owns', () => {
  const win = require('../lib/windows/catalog')
  for (const i of catalog.ITEMS) assert.ok(!win.isKnown(i.id), 'also on the Windows tab: ' + i.id)
})

test('detect: the script only reads', () => {
  const s = detect.buildScript()
  const stripped = s.replace(/Get-[A-Za-z]+/g, '')
  assert.ok(!/\b(Set|Add|Remove|New|Enable|Disable|Start|Stop|Restart|Clear)-[A-Za-z]+/.test(stripped), 'a write cmdlet')
  assert.ok(!/netsh\s+(int|winsock|dns\s+(add|set|delete))/i.test(s))
  assert.ok(/netsh wlan show interfaces/.test(s))
  assert.ok(s.includes('JJNET:'))
})

test('detect: parse survives noise, a bad line and one-element arrays', () => {
  assert.strictEqual(detect.parse(''), null)
  assert.strictEqual(detect.parse('hello'), null)
  assert.strictEqual(detect.parse('JJNET:{not json'), null)
  const out = 'warning\nJJNET:' + JSON.stringify({ r: { 'x|eee': 'on' }, f: { adapter: { name: 'Eth', desc: 'Intel', wifi: false, speed: 1000000000, ifIndex: 4 }, gateway: '192.168.1.1', dns: { name: 'Eth', ifIndex: 4, servers: '1.1.1.1', isStatic: true } } }) + '\n'
  const p = detect.parse(out)
  assert.strictEqual(p.r['x|eee'], 'on')
  assert.strictEqual(p.f.adapter.speedMbps, 1000)
  assert.deepStrictEqual(p.f.dns[0].servers, ['1.1.1.1'])
  assert.strictEqual(p.f.gateway, '192.168.1.1')
  assert.strictEqual(p.f.wlan, null)
  assert.strictEqual(detect.normFacts(null).adapter, null)
})

test('detect: Wi-Fi lines are read by their value, so a localized netsh still parses', () => {
  const w = detect.parseWlan(['    Nimi : Wi-Fi', '    SSID                   : Koti', '    Radiotyyppi            : 802.11ax', '    Kanava                 : 36', '    Signaali               : 78%', '    Vastaanottonopeus (Mbps) : 866.7', '    BSSID                  : aa:bb:cc:dd:ee:ff'])
  assert.deepStrictEqual(w, { ssid: 'Koti', signalPct: 78, rssi: -61, channel: 36, band: 5, radio: '802.11ax' })
  assert.strictEqual(detect.parseWlan(['SSID : x', 'Channel : 6']).band, 2.4)
  assert.strictEqual(detect.parseWlan([]).rssi, null)
})

test('detect: check and evaluate per probe kind; a driver that does not expose a property is "na", never "off"', () => {
  const r = { 'x|eee': 'NA', 'x|intmod': 'off', 'x|offload': 'on', 'x|rss': null, 's|WinHttpAutoProxySvc': 'MISSING', 'r|HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip6\\Parameters|DisabledComponents': null }
  const ev = detect.evaluate(r)
  assert.strictEqual(ev['nic-energy-efficient'].state, 'na')
  assert.strictEqual(ev['nic-interrupt-mod'].state, 'all')
  assert.strictEqual(ev['nic-offloads'].state, 'none')
  assert.strictEqual(ev['nic-rss-affinity'].state, 'unread')
  assert.strictEqual(ev['disable-wpad'].state, 'na')
  assert.strictEqual(ev['disable-ipv6'].state, 'none', 'a registry value that is not there is the Windows default')
  assert.strictEqual(detect.evaluate(null)['dns-doh'].state, 'unread')
})

function facts(over = {}) {
  return { adapter: { name: 'Ethernet', desc: 'Intel', wifi: false, speedMbps: 1000, ifIndex: 4, driver: '1' }, gateway: '192.168.1.1', wlan: null,
    dns: [{ name: 'Ethernet', ifIndex: 4, servers: ['192.168.1.1'], isStatic: false }], ...over }
}
const allOff = () => detect.evaluate({ 'x|doh': 'off', 'x|intmod': 'on', 'x|eee': 'on', 'x|offload': 'on', 'x|rss': 'default', 'x|netbios': 'on', 's|WinHttpAutoProxySvc': 'Manual', 'r|HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings|AutoDetect': null, 'r|HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip6\\Parameters|DisabledComponents': null })

test('resolver: the addresses an adapter really uses decide the preset, not what Jylli remembers', () => {
  const r = f => model.resolverOf(f, { customDnsPrimary: '10.9.9.9' })
  assert.strictEqual(r(facts()).current, 'auto')
  assert.strictEqual(r(facts({ dns: [{ name: 'E', ifIndex: 4, servers: ['1.1.1.1', '1.0.0.1'], isStatic: true }] })).current, 'cloudflare')
  assert.strictEqual(r(facts({ dns: [{ name: 'E', ifIndex: 4, servers: ['9.9.9.9'], isStatic: true }] })).current, 'quad9')
  assert.strictEqual(r(facts({ dns: [{ name: 'E', ifIndex: 4, servers: ['10.9.9.9'], isStatic: true }] })).current, 'custom')
  assert.strictEqual(r(facts({ dns: [{ name: 'E', ifIndex: 4, servers: ['4.4.4.4'], isStatic: true }] })).current, 'other')
  assert.strictEqual(r(facts({ dns: [{ name: 'E', ifIndex: 4, servers: ['8.8.8.8'], isStatic: false }] })).current, 'auto', 'DHCP that hands out 8.8.8.8 is still automatic')
  const two = r(facts({ dns: [{ name: 'E', ifIndex: 4, servers: ['1.1.1.1'], isStatic: true }, { name: 'VPN', ifIndex: 9, servers: ['10.0.0.1'], isStatic: true }] }))
  assert.deepStrictEqual(two.differs, ['VPN'])
  assert.strictEqual(r(null).known, false)
})

test('model: status words, recommended rule, unavailable options, resolver items are not rows', () => {
  const live = detect.evaluate({ 'x|doh': 'off', 'x|intmod': 'on', 'x|eee': 'NA', 'x|offload': 'on', 'x|rss': 'default', 'x|netbios': 'off', 's|WinHttpAutoProxySvc': 'Manual', 'r|HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings|AutoDetect': '0', 'r|HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip6\\Parameters|DisabledComponents': null })
  const m = model.buildModel({ live, facts: facts(), remembered: { 'disable-autoproxy': 'applied', 'nic-offloads': 'applied' }, meta: { 'nic-interrupt-mod': { safetyTier: 2 }, 'nic-offloads': { safetyTier: 2 } }, applic: { 'nic-interrupt-mod': { show: true, state: 'recommended' }, 'nic-rss-affinity': { show: false } }, when: 5 })
  const st = id => m.items.find(i => i.id === id).status
  assert.strictEqual(st('disable-autoproxy'), 'on')
  assert.strictEqual(st('disable-netbios'), 'native')
  assert.strictEqual(st('nic-offloads'), 'drifted')
  assert.strictEqual(st('flush-dns'), 'once')
  assert.deepStrictEqual(m.unavailable, ['nic-energy-efficient'])
  assert.ok(!m.items.some(i => i.id === 'nic-rss-affinity'), 'hidden by applicability')
  assert.ok(!m.items.some(i => i.preset), 'presets are the resolver card, not rows')
  assert.deepStrictEqual(m.recommendedIds, ['nic-interrupt-mod'])
  assert.deepStrictEqual(m.drifted, ['nic-offloads'])
  assert.strictEqual(m.verdict.kind, 'attention')
  assert.ok(m.items.find(i => i.id === 'nic-interrupt-mod').rec)
  assert.ok(!m.items.some(i => i.id === 'tcp-stack'), 'retired and never applied: not offered')
})

test('model: a caution, a restart or a tier 3 never makes a switch "recommended"', () => {
  const live = allOff()
  const mk = (ap, meta) => model.buildModel({ live, facts: facts(), remembered: {}, meta: { 'disable-ipv6': meta || {} }, applic: { 'disable-ipv6': ap }, when: 1 }).items.find(i => i.id === 'disable-ipv6').rec
  assert.strictEqual(mk({ show: true, state: 'recommended' }), false, 'needs a restart')
  assert.strictEqual(model.buildModel({ live, facts: facts(), remembered: {}, meta: {}, applic: { 'nic-offloads': { show: true, state: 'caution', why: 'x' } } }).items.find(i => i.id === 'nic-offloads').rec, false)
})

test('model: retired and applied earlier = restore only; unread live state = unread verdict', () => {
  const m = model.buildModel({ live: allOff(), facts: facts(), remembered: { 'tcp-stack': 'applied' }, meta: { 'tcp-stack': { retired: 'no benefit' } } })
  const it = m.items.find(i => i.id === 'tcp-stack')
  assert.ok(it.retired && it.lane === 'retired' && !it.rec)
  assert.strictEqual(model.buildModel({ live: null, remembered: {} }).verdict.kind, 'unread')
})

test('model: DoH counts as on only when 1.1.1.1 is the resolver in use (Windows lists the servers by default)', () => {
  const live = detect.evaluate({ 'x|doh': 'on' })
  const on = model.buildModel({ live, facts: facts({ dns: [{ name: 'E', ifIndex: 4, servers: ['1.1.1.1'], isStatic: true }] }), remembered: {} }).items.find(i => i.id === 'dns-doh')
  assert.ok(['native', 'on'].includes(on.status))
  const off = model.buildModel({ live, facts: facts(), remembered: {} }).items.find(i => i.id === 'dns-doh')
  assert.strictEqual(off.status, 'off')
})

// ── route + path ──
function trace(rounds, hopsFn, d = 6) {
  const st = Verdict.create()
  for (let i = 0; i < rounds; i++) Verdict.ingest(st, { d, h: hopsFn(i) })
  return Verdict.analyze(st)
}
const clean = i => [[1, '192.168.1.1', 1.2], [2, '100.64.0.1', 9], [3, '84.1.1.1', 11], [4, '84.1.2.2', 12], [5, '62.1.1.1', 13], [6, '1.1.1.1', 14]]

test('path: a clean trace gives five nodes, all ok, verdict clean', () => {
  const p = Path.pathOf(trace(12, clean), facts())
  assert.deepStrictEqual(p.nodes.map(n => n.id), ['pc', 'link', 'router', 'isp', 'internet'])
  assert.strictEqual(p.verdict.id, 'clean')
  assert.ok(p.nodes.every(n => n.tone === 'ok'), JSON.stringify(p.nodes.map(n => n.tone)))
  assert.strictEqual(p.nodes[2].ms, 1.2)
  assert.strictEqual(p.nodes[4].ms, 14)
  assert.strictEqual(p.rounds, 12)
})

test('path: loss that starts at the ISP hop and carries on marks the ISP node, not the router', () => {
  const lossy = i => clean(i).map(([t, ip, ms]) => (t >= 3 && i % 4 === 0 ? [t, null, null] : [t, ip, ms]))
  const p = Path.pathOf(trace(20, lossy), facts())
  assert.strictEqual(p.verdict.id, 'loss-isp')
  assert.strictEqual(p.verdict.node, 'isp')
  assert.strictEqual(p.nodes.find(n => n.id === 'isp').tone, 'bad')
  assert.strictEqual(p.nodes.find(n => n.id === 'router').tone, 'ok')
})

test('path: private hops beyond the router are drawn on the ISP node, and loss there is not blamed on the router', () => {
  const deep = i => [[1, '192.168.1.1', 1.2], [2, '10.1.1.1', 9], [3, '10.1.2.2', 10], [4, '84.1.1.1', 11], [5, '1.1.1.1', 12]].map(([t, ip, ms]) => (t >= 3 && i % 4 === 0 ? [t, null, null] : [t, ip, ms]))
  const p = Path.pathOf(trace(20, deep, 5), facts())
  assert.strictEqual(p.verdict.id, 'loss-home')
  assert.strictEqual(p.verdict.node, 'isp')
  assert.strictEqual(p.nodes.find(n => n.id === 'router').tone, 'ok')
  assert.strictEqual(p.nodes.find(n => n.id === 'router').ms, 1.2, 'the router node is hop 1, not the last private hop')
})

test('path: a router that rate-limits its own replies is not reported as loss; a hop that never answers is hidden, not red', () => {
  const rl = i => clean(i).map(([t, ip, ms]) => (t === 3 && i % 2 ? [t, null, null] : [t, ip, ms]))
  assert.strictEqual(Path.pathOf(trace(20, rl), facts()).verdict.id, 'clean')
})

test('path: jitter on the first hop of a Wi-Fi PC is a Wi-Fi verdict', () => {
  const jit = i => clean(i).map(([t, ip, ms]) => (t === 1 ? [t, ip, 1 + (i % 2) * 30] : [t, ip, ms]))
  const w = facts({ adapter: { name: 'Wi-Fi', desc: 'x', wifi: true, speedMbps: 300, ifIndex: 4 }, wlan: { ssid: 'a', signalPct: 90, rssi: -55, channel: 36, band: 5, radio: '802.11ax' } })
  const p = Path.pathOf(trace(20, jit), w)
  assert.strictEqual(p.verdict.id, 'jitter-home')
  assert.strictEqual(p.verdict.wifi, true)
  assert.strictEqual(p.nodes[2].tone, 'warn')
})

test('path: before any trace the stage still shows the PC and the link, the rest idle', () => {
  const p = Path.pathOf(null, facts())
  assert.strictEqual(p.verdict.id, 'idle')
  assert.deepStrictEqual(p.nodes.map(n => n.tone), ['ok', 'ok', 'idle', 'idle', 'idle'])
  assert.strictEqual(p.nodes[2].ip, '192.168.1.1')
  assert.ok(Path.pathOf(null, null).nodes.every(n => n.tone === 'idle'))
})

test('path: link tone follows the Wi-Fi signal and the cable speed', () => {
  const wf = (rssi, band) => Path.linkOf({ adapter: { wifi: true, speedMbps: 300 }, wlan: { rssi, band } })
  assert.strictEqual(wf(-55, 5).tone, 'ok'); assert.strictEqual(wf(-70, 5).tone, 'warn'); assert.strictEqual(wf(-80, 5).tone, 'bad'); assert.strictEqual(wf(-50, 2.4).tone, 'warn')
  assert.strictEqual(Path.linkOf({ adapter: { wifi: false, speedMbps: 100 } }).tone, 'warn')
  assert.strictEqual(Path.linkOf({ adapter: { wifi: false, speedMbps: 2500 } }).tone, 'ok')
})

// ── findings ──
const ok = { verdict: { id: 'clean', node: null, ev: {}, wifi: false } }
const mdl = (over = {}) => ({ ...model.buildModel({ live: allOff(), facts: facts(), remembered: {} }), ...over })
const bench = (cur, rows) => ({ results: rows || [{ name: 'cloudflare', preset: 'cloudflare', tweak: 'dns-cloudflare', median: 8, fail: false }, { name: 'google', preset: 'google', tweak: 'dns-google', median: 14, fail: false }], current: cur })

test('findings: nothing measured = no verdict claims; a clean path with nothing to fix is healthy', () => {
  const none = Findings.run({ model: mdl(), path: Path.pathOf(null, facts()), bench: null, speed: null })
  assert.strictEqual(none.measured, false)
  assert.strictEqual(none.healthy, false)
  assert.ok(!none.findings.some(f => f.id.startsWith('path-')))
  const good = Findings.run({ model: mdl(), path: ok, bench: bench({ server: '192.168.1.1', fail: false, median: 6 }), speed: null })
  assert.strictEqual(good.healthy, true)
  assert.deepStrictEqual(good.findings, [])
})

test('findings: a slow resolver names the faster one and carries the switch action', () => {
  const r = Findings.run({ model: mdl(), path: ok, bench: bench({ server: '193.1.1.1', fail: false, median: 40 }) })
  const f = r.findings.find(x => x.id === 'dns-slow')
  assert.ok(f)
  assert.deepStrictEqual(f.action, { kind: 'dns', preset: 'cloudflare', tweak: 'dns-cloudflare' })
  assert.strictEqual(f.ev.bestMs, 8)
  assert.strictEqual(r.healthy, false)
})

test('findings: a resolver that is only slightly slower, or already the best, produces nothing; a dead one is "down"', () => {
  assert.ok(!Findings.run({ model: mdl(), path: ok, bench: bench({ server: '193.1.1.1', fail: false, median: 14 }) }).findings.some(f => f.id === 'dns-slow'))
  const onCf = mdl({ resolver: { known: true, current: 'cloudflare', servers: ['1.1.1.1'] } })
  assert.ok(!Findings.run({ model: onCf, path: ok, bench: bench({ server: '1.1.1.1', fail: false, median: 40 }) }).findings.some(f => f.id.startsWith('dns-')))
  const down = Findings.run({ model: mdl(), path: ok, bench: bench({ server: '193.1.1.1', fail: true, median: null }) })
  assert.strictEqual(down.findings[0].id, 'dns-down'); assert.strictEqual(down.findings[0].tone, 'bad')
})

test('findings: bufferbloat only from a fresh speed test, graded by the extra latency', () => {
  const now = Date.now()
  const f = s => Findings.run({ model: mdl(), path: ok, bench: null, speed: s, now }).findings.find(x => x.id === 'bufferbloat')
  assert.strictEqual(f({ t: now, latencyMs: 20, loadedLatencyMs: 60 }), undefined)
  assert.strictEqual(f({ t: now, latencyMs: 20, loadedLatencyMs: 140 }).tone, 'warn')
  assert.strictEqual(f({ t: now, latencyMs: 20, loadedLatencyMs: 400 }).tone, 'bad')
  assert.strictEqual(f({ t: now - 30 * 86400000, latencyMs: 20, loadedLatencyMs: 400 }), undefined, 'too old to say anything about now')
  assert.strictEqual(f({ t: now, latencyMs: null, loadedLatencyMs: 400 }), undefined)
})

test('findings: Wi-Fi findings come from the link, the Wi-Fi verdict replaces the generic home verdict', () => {
  const w = facts({ adapter: { name: 'W', desc: 'x', wifi: true, speedMbps: 300, ifIndex: 4 }, wlan: { ssid: 'a', signalPct: 40, rssi: -80, channel: 6, band: 2.4, radio: '802.11n' } })
  const m = mdl({ facts: w })
  const r = Findings.run({ model: m, path: { verdict: { id: 'jitter-home', node: 'router', ev: { jitter: 22 }, wifi: true } }, bench: null })
  const ids = r.findings.map(f => f.id)
  assert.ok(ids.includes('wifi-path') && ids.includes('wifi-weak') && ids.includes('wifi-band'))
  assert.ok(!ids.includes('path-jitter-home'))
  assert.strictEqual(r.findings.find(f => f.id === 'wifi-weak').tone, 'bad')
  assert.deepStrictEqual(ids.slice(0, 2).sort(), ['wifi-path', 'wifi-weak'], 'bad before warn before info')
  assert.strictEqual(ids[ids.length - 1], 'wifi-band')
})

test('findings: ranking is bad, warn, info; drifted and recommended carry tweak actions', () => {
  const m = mdl({ drifted: ['disable-wpad'], recommendedIds: ['nic-interrupt-mod'], pendingRestart: ['disable-ipv6'] })
  const r = Findings.run({ model: m, path: { verdict: { id: 'loss-isp', node: 'isp', ev: { ip: '84.1.1.1', ttl: 3, loss: 6 }, wifi: false } }, bench: null })
  assert.deepStrictEqual(r.findings.map(f => f.id), ['path-loss-isp', 'drifted', 'tune', 'restart'])
  assert.deepStrictEqual(r.findings.find(f => f.id === 'drifted').action, { kind: 'tweak', ids: ['disable-wpad'], act: 'apply' })
  assert.deepStrictEqual(r.findings.find(f => f.id === 'tune').action.ids, ['nic-interrupt-mod'])
})

test('findings: a slow link is flagged only on a cable', () => {
  assert.ok(Findings.run({ model: mdl({ facts: facts({ adapter: { name: 'E', desc: '', wifi: false, speedMbps: 100, ifIndex: 4 } }) }), path: ok }).findings.some(f => f.id === 'link-slow'))
  assert.ok(!Findings.run({ model: mdl(), path: ok }).findings.some(f => f.id === 'link-slow'))
})

test('validateDns: IPv4 only, primary required, no loopback, no duplicates', () => {
  assert.deepStrictEqual(validateDns(' 1.1.1.1 ', '1.0.0.1'), { ok: true, primary: '1.1.1.1', secondary: '1.0.0.1' })
  assert.strictEqual(validateDns('9.9.9.9', '').ok, true)
  for (const [p, s, e] of [['', '', 'primary-missing'], ['1.1.1', '', 'primary-invalid'], ['300.1.1.1', '', 'primary-invalid'], ['127.0.0.1', '', 'primary-invalid'], ['0.0.0.0', '', 'primary-invalid'], ['1.1.1.1', 'abc', 'secondary-invalid'], ['1.1.1.1', '1.1.1.1', 'same'], ['1.1.1.1; calc', '', 'primary-invalid'], ['::1', '', 'primary-invalid']]) {
    assert.deepStrictEqual(validateDns(p, s), { ok: false, error: e }, p + '|' + s)
  }
})
