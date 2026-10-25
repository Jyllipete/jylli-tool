// Auth/premium state for the main process. No shared secret: Discord OAuth via the bot's v2 API, an opaque
// session token (stored with OS-level encryption through Electron safeStorage) and a signed entitlement.
const fs = require('fs')
const path = require('path')
const https = require('https')
const { verifyEntitlement } = require('./entitlement')

const SESSION_MAX_AGE_MS = 30 * 86400000

function createAuth({ BOT_URL, userDataDir, safeStorage, userAgent = 'jylli-tool/1.6', publicKey }) {
  const file = path.join(userDataDir, 'auth.json')
  let st = { session: null, entitlement: null, discordUserId: null, sessionAt: 0 }

  // ── persistence (encrypted at rest when the OS supports it; otherwise memory-only) ──
  function load() {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (!raw?.enc || !safeStorage?.isEncryptionAvailable()) return
      const data = JSON.parse(safeStorage.decryptString(Buffer.from(raw.enc, 'base64')))
      if (data && typeof data.session === 'string') st = { session: data.session, entitlement: data.entitlement || null, discordUserId: data.discordUserId || null, sessionAt: data.sessionAt || 0 }
      if (Date.now() - st.sessionAt > SESSION_MAX_AGE_MS) clear()
    } catch { /* missing or unreadable: signed out */ }
  }
  function persist() {
    try {
      if (!safeStorage?.isEncryptionAvailable()) return
      const enc = safeStorage.encryptString(JSON.stringify(st)).toString('base64')
      const tmp = file + '.tmp'
      fs.writeFileSync(tmp, JSON.stringify({ v: 1, enc }), 'utf8')
      fs.renameSync(tmp, file)
    } catch { /* non-fatal */ }
  }
  function clear() {
    st = { session: null, entitlement: null, discordUserId: null, sessionAt: 0 }
    try { fs.unlinkSync(file) } catch {}
  }

  // ── http ──
  function request(method, urlPath, { bearer, body } = {}) {
    return new Promise((resolve, reject) => {
      const controller = new AbortController()
      const timer = setTimeout(() => { controller.abort(); reject(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })) }, 7000)
      const url = new URL(BOT_URL + urlPath)
      const payload = body ? JSON.stringify(body) : null
      const req = https.request({
        hostname: url.hostname, path: url.pathname + url.search, method, signal: controller.signal,
        headers: { 'User-Agent': userAgent, ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}) },
      }, res => {
        let data = ''
        res.on('data', d => { if (data.length < 64 * 1024) data += d })
        res.on('end', () => { clearTimeout(timer); try { resolve({ status: res.statusCode, json: JSON.parse(data) }) } catch { reject(Object.assign(new Error('parse fail'), { code: 'EPARSE' })) } })
      })
      req.on('error', e => { clearTimeout(timer); reject(e) })
      if (payload) req.write(payload)
      req.end()
    })
  }

  // ── state ──
  const entitlement = () => st.session && st.entitlement ? verifyEntitlement(st.entitlement, { publicKey, expectSub: st.discordUserId }) : null
  /** Authoritative premium check used by every gated IPC handler. */
  const isPremium = () => entitlement()?.premium === true
  const hasSession = () => !!st.session && Date.now() - st.sessionAt <= SESSION_MAX_AGE_MS
  const userId = () => st.discordUserId

  function adopt({ session, entitlement: ent, discordUserId }) {
    const p = verifyEntitlement(ent, { publicKey, expectSub: discordUserId })
    if (!p) return false
    st = { session, entitlement: ent, discordUserId, sessionAt: st.session === session ? st.sessionAt : Date.now() }
    persist()
    return true
  }

  async function start() {
    const { status, json } = await request('POST', '/v2/auth/start')
    if (status !== 200 || !json.state || !json.url) return null
    return json
  }

  async function poll(state) {
    const { json } = await request('GET', `/v2/auth/poll?state=${encodeURIComponent(state)}`)
    if (json.status === 'ok') {
      if (!adopt(json)) return { status: 'denied', reason: 'bad_entitlement' }
      return { status: 'ok', isPremium: isPremium(), discordUserId: st.discordUserId }
    }
    return { status: json.status || 'pending', reason: json.reason }
  }

  /**
   * Asks the bot for a fresh entitlement. Network trouble is NOT a failure: a valid session keeps the app usable
   * (free tier), and premium continues only while the last signed entitlement is unexpired.
   */
  async function refresh() {
    if (!hasSession()) return { ok: false, reason: 'no_token' }
    try {
      const { status, json } = await request('POST', '/v2/auth/refresh', { bearer: st.session })
      if (status === 200 && json.ok) {
        if (!adopt({ session: st.session, entitlement: json.entitlement, discordUserId: st.discordUserId })) return { ok: false, reason: 'bad_entitlement' }
        return { ok: true, reason: 'ok', isPremium: isPremium() }
      }
      if (status === 401 || status === 403) { clear(); return { ok: false, reason: json.reason || 'invalid_token' } }
    } catch { /* offline / timeout / 5xx: fall through */ }
    return { ok: true, reason: 'offline', isPremium: isPremium() }
  }

  function logout() { clear() }

  load()
  return { start, poll, refresh, logout, isPremium, hasSession, userId, request }
}

module.exports = { createAuth }
