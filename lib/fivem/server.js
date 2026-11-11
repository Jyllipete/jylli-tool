'use strict'
// Server targets: parse what the user typed, resolve a cfx.re join code, read the server's own endpoints and measure the TCP
// connect to its HTTP port. Everything networked takes its transport through `deps` so tests never touch the network.
// Inputs are validated before they reach any socket; a field the server does not report stays null, never 0.
const V = require('../validate')

const DEFAULT_PORT = 30120
const MAX_BODY = 1024 * 1024
const clean = s => (typeof s === 'string' ? s.replace(/\^\d/g, '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 80) : null)
const int = v => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n) : null }

/** text -> { kind:'join', code } | { kind:'host', host, port } | null */
function parseTarget(input) {
  const t = String(input || '').trim()
  if (!t || t.length > 300) return null
  const j = t.match(/^(?:https?:\/\/)?(?:www\.)?cfx\.re\/join\/([a-z0-9]{3,12})\/?$/i)
  if (j) return { kind: 'join', code: j[1].toLowerCase() }
  const h = t.match(/^(?:https?:\/\/)?(\[[0-9a-f:]+\]|[A-Za-z0-9.-]{1,253})(?::(\d{1,5}))?\/?$/i)
  if (!h) return null
  const host = h[1], port = h[2] ? Number(h[2]) : DEFAULT_PORT
  if (host.startsWith('[') || !V.isHostname(host) || !V.isPort(port)) return null
  return { kind: 'host', host: host.toLowerCase(), port }
}

/** The servers-frontend response -> { host, port, name, players, max, mapName } | null. */
function fromCfxApi(json) {
  const d = json && json.Data
  const ep = d && Array.isArray(d.connectEndPoints) ? d.connectEndPoints[0] : null
  if (typeof ep !== 'string') return null
  let host, port
  if (/^https?:\/\//i.test(ep)) { try { const u = new URL(ep); host = u.hostname; port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : DEFAULT_PORT) } catch { return null } }
  else { const i = ep.lastIndexOf(':'); if (i < 1) return null; host = ep.slice(0, i); port = Number(ep.slice(i + 1)) }
  if (!V.isHostname(host) || !V.isPort(port)) return null
  return { host: host.toLowerCase(), port, name: clean((d.vars && d.vars.sv_projectName) || d.hostname), players: int(d.clients), max: int(d.svMaxclients != null ? d.svMaxclients : d.sv_maxclients), mapName: clean((d.vars && d.vars.mapname) || d.mapname) }
}

/** deps.getJson(url, { timeoutMs, insecure }) -> { ok, data, ms } */
async function resolveJoin(deps, code) {
  if (!/^[a-z0-9]{3,12}$/i.test(code)) return { ok: false, error: 'bad-code' }
  const r = await deps.getJson('https://servers-frontend.fivem.net/api/servers/single/' + encodeURIComponent(code), { timeoutMs: 6000 })
  if (!r || !r.ok) return { ok: false, error: 'network' }
  const s = fromCfxApi(r.data)
  return s ? { ok: true, ...s, code } : { ok: false, error: 'unresolved' }
}

/** The server's own view: dynamic.json (cheap) and info.json, over http, then https for TLS-proxied servers. */
async function readServer(deps, host, port) {
  const get = async path => {
    let r = await deps.getJson(`http://${host}:${port}${path}`, { timeoutMs: 4000 })
    if (!r || !r.ok) r = await deps.getJson(`https://${host}:${port}${path}`, { timeoutMs: 4000, insecure: true })
    return r && r.ok ? r : null
  }
  const [dyn, info] = await Promise.all([get('/dynamic.json'), get('/info.json')])
  if (!dyn && !info) return { ok: false, error: 'no-answer' }
  const d = (dyn && dyn.data) || {}, i = (info && info.data) || {}
  return {
    ok: true,
    name: clean((i.vars && i.vars.sv_projectName) || d.hostname || i.hostname),
    players: int(d.clients), max: int(d.sv_maxclients != null ? d.sv_maxclients : i.vars && i.vars.sv_maxClients),
    mapName: clean(d.mapname || (i.vars && i.vars.mapname)), gametype: clean(d.gametype || (i.vars && i.vars.gametype)),
    httpMs: dyn ? dyn.ms : info.ms,
  }
}

/** input -> { ok, host, port, name, players, max, mapName, code? } resolving a join code first. */
async function describe(deps, input) {
  const t = parseTarget(input)
  if (!t) return { ok: false, error: 'bad-input' }
  let host, port, code = null, seed = {}
  if (t.kind === 'join') {
    const j = await resolveJoin(deps, t.code)
    if (!j.ok) return j
    host = j.host; port = j.port; code = j.code; seed = j
  } else { host = t.host; port = t.port }
  const live = await readServer(deps, host, port)
  return { ok: true, host, port, code, name: (live.ok && live.name) || seed.name || null, players: live.ok && live.players != null ? live.players : (seed.players != null ? seed.players : null),
    max: live.ok && live.max != null ? live.max : (seed.max != null ? seed.max : null), mapName: (live.ok && live.mapName) || seed.mapName || null, reachable: live.ok, httpMs: live.ok ? live.httpMs : null }
}

/** Real transports (kept out of the pure part so the tests can replace them). */
function nodeTransport() {
  const http = require('http'), https = require('https'), net = require('net'), dns = require('dns')
  const getJson = (url, o = {}) => new Promise(resolve => {
    let u; try { u = new URL(url) } catch { return resolve({ ok: false }) }
    if (!V.isHostname(u.hostname)) return resolve({ ok: false })
    const mod = u.protocol === 'https:' ? https : http
    const t0 = Date.now()
    const req = mod.get({ hostname: u.hostname, port: u.port || undefined, path: u.pathname + u.search, timeout: o.timeoutMs || 4000, headers: { 'User-Agent': 'JylliTool' }, ...(o.insecure ? { rejectUnauthorized: false } : {}) }, res => {
      if (res.statusCode !== 200) { res.resume(); return resolve({ ok: false }) }
      let raw = '', done = false
      res.on('data', d => { raw += d; if (raw.length > MAX_BODY && !done) { done = true; req.destroy(); resolve({ ok: false }) } })
      res.on('end', () => { if (done) return; try { resolve({ ok: true, data: JSON.parse(raw), ms: Date.now() - t0 }) } catch { resolve({ ok: false }) } })
    })
    req.on('error', () => resolve({ ok: false }))
    req.on('timeout', () => { req.destroy(); resolve({ ok: false }) })
  })
  const tcp = (host, port, ms) => new Promise(resolve => {
    if (!V.isHostname(host) || !V.isPort(port)) return resolve(null)
    const t0 = process.hrtime.bigint()
    const s = new net.Socket()
    s.setTimeout(ms || 2000)
    s.connect(port, host, () => { const d = Number(process.hrtime.bigint() - t0) / 1e6; s.destroy(); resolve(Math.round(d * 10) / 10) })
    s.on('error', () => { s.destroy(); resolve(null) })
    s.on('timeout', () => { s.destroy(); resolve(null) })
  })
  const lookup4 = host => new Promise(resolve => { if (net.isIPv4(host)) return resolve(host); dns.lookup(host, { family: 4 }, (e, addr) => resolve(e ? null : addr)) })
  return { getJson, tcp, lookup4 }
}

module.exports = { DEFAULT_PORT, parseTarget, fromCfxApi, resolveJoin, readServer, describe, nodeTransport, clean }
