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
  // Electron's async safeStorage API (the sync one is deprecated); older builds and test fakes fall back to the sync calls.
  const encAvailable = async () => safeStorage ? (typeof safeStorage.isAsyncEncryptionAvailable === 'function' ? !!(await safeStorage.isAsyncEncryptionAvailable()) : !!safeStorage.isEncryptionAvailable()) : false
  const encrypt = async text => typeof safeStorage.encryptStringAsync === 'function' ? safeStorage.encryptStringAsync(text) : safeStorage.encryptString(text)
  const decrypt = async buf => {
    if (typeof safeStorage.decryptStringAsync === 'function') { const r = await safeStorage.decryptStringAsync(buf); return { text: r.result, reEncrypt: !!r.shouldReEncrypt } }
    return { text: safeStorage.decryptString(buf), reEncrypt: false }
  }
  let gen = 0                       // bumped by clear(): a queued write from before it must not bring the file back
  let writeChain = Promise.resolve()
  async function load() {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (!raw?.enc || !(await encAvailable())) return
      const { text, reEncrypt } = await decrypt(Buffer.from(raw.enc, 'base64'))
      const data = JSON.parse(text)
      if (data && typeof data.session === 'string') st = { session: data.session, entitlement: data.entitlement || null, discordUserId: data.discordUserId || null, sessionAt: data.sessionAt || 0 }
      if (Date.now() - st.sessionAt > SESSION_MAX_AGE_MS) clear()
      else if (reEncrypt) persist()
    } catch { /* missing or unreadable: signed out */ }
  }
  function persist() {
    const snapshot = JSON.stringify(st), myGen = gen
    writeChain = writeChain.then(async () => {
      try {
        if (myGen !== gen || !(await encAvailable())) return
        const enc = (await encrypt(snapshot)).toString('base64')
        if (myGen !== gen) return
        const tmp = file + '.tmp'
        fs.writeFileSync(tmp, JSON.stringify({ v: 1, enc }), 'utf8')
        fs.renameSync(tmp, file)
      } catch { /* non-fatal */ }
    })
    return writeChain
  }
  function clear() {
    gen++
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
    await ready
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

  // Resolves once the stored session has been read; main waits for it before the window opens.
  const ready = load()
  return { start, poll, refresh, logout, isPremium, hasSession, userId, request, ready }
}

module.exports = { createAuth }
