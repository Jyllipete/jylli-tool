// Premium entitlements are Ed25519-signed by the Jylli bot. The app only holds the PUBLIC key, so a local
// file edit cannot mint or extend premium. (An open-source client can always be patched: this stops casual
// tampering and file forgery, it is not DRM.)
const crypto = require('crypto')

// SPKI DER, base64. Matches ENTITLEMENT_PRIVATE_KEY on the bot (see jylli-bot/RAILWAY_ENV.md).
const ENTITLEMENT_PUBLIC_KEY = 'MCowBQYDK2VwAyEAgLeBxpTCkQJUEr5XFQ1/AJ8B0V9eJGEPVnRHA1QWvH0='

const _keyCache = new Map()
function _publicKey(b64) {
  let k = _keyCache.get(b64)
  if (!k) { k = crypto.createPublicKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'spki' }); _keyCache.set(b64, k) }
  return k
}

/** Returns the payload {sub, premium, iat, exp} if the token is authentic and unexpired, else null. */
function verifyEntitlement(token, { publicKey = ENTITLEMENT_PUBLIC_KEY, now = Date.now(), expectSub } = {}) {
  try {
    if (typeof token !== 'string' || token.length > 1024) return null
    const dot = token.indexOf('.')
    if (dot < 1 || token.indexOf('.', dot + 1) !== -1) return null
    const payloadB64 = token.slice(0, dot)
    const sig = Buffer.from(token.slice(dot + 1), 'base64url')
    if (!crypto.verify(null, Buffer.from(payloadB64), _publicKey(publicKey), sig)) return null
    const p = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
    if (typeof p.sub !== 'string' || typeof p.premium !== 'boolean' || typeof p.exp !== 'number' || typeof p.iat !== 'number') return null
    if (p.exp <= now || p.iat > now + 5 * 60000) return null        // expired, or issued in the future (clock tamper)
    if (expectSub && p.sub !== expectSub) return null
    return p
  } catch { return null }
}

module.exports = { verifyEntitlement, ENTITLEMENT_PUBLIC_KEY }
