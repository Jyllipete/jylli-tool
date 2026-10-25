const test = require('node:test')
const assert = require('node:assert')
const crypto = require('node:crypto')
const { verifyEntitlement, ENTITLEMENT_PUBLIC_KEY } = require('../lib/entitlement')

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
const pub = publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
const b64u = b => Buffer.from(b).toString('base64url')

// identical to makeEntitlement() in jylli-bot/server.js
function mint(payload, key = privateKey) {
  const p = b64u(JSON.stringify(payload))
  return `${p}.${b64u(crypto.sign(null, Buffer.from(p), key))}`
}
const now = Date.now()
const good = { sub: '1234567890123', premium: true, iat: now - 1000, exp: now + 3600000 }

test('accepts a genuine, unexpired entitlement', () => {
  const p = verifyEntitlement(mint(good), { publicKey: pub })
  assert.strictEqual(p.premium, true)
  assert.strictEqual(p.sub, good.sub)
})

test('rejects tampering, wrong key, expiry, future iat, wrong subject, garbage', () => {
  const t = mint(good)
  // flip premium false -> true style edit: re-encode payload but keep the old signature
  const forged = b64u(JSON.stringify({ ...good, premium: true, exp: now + 9e9 })) + '.' + t.split('.')[1]
  assert.strictEqual(verifyEntitlement(forged, { publicKey: pub }), null)
  const other = crypto.generateKeyPairSync('ed25519')
  assert.strictEqual(verifyEntitlement(mint(good, other.privateKey), { publicKey: pub }), null)
  assert.strictEqual(verifyEntitlement(mint({ ...good, exp: now - 1 }), { publicKey: pub }), null)
  assert.strictEqual(verifyEntitlement(mint({ ...good, iat: now + 3600000 }), { publicKey: pub }), null)
  assert.strictEqual(verifyEntitlement(t, { publicKey: pub, expectSub: 'someone-else' }), null)
  for (const junk of [null, undefined, '', 'a.b.c', 'x'.repeat(5000), 42, {}, '.', 'abc.']) assert.strictEqual(verifyEntitlement(junk, { publicKey: pub }), null)
})

test('the embedded production public key is a valid Ed25519 SPKI key', () => {
  const k = crypto.createPublicKey({ key: Buffer.from(ENTITLEMENT_PUBLIC_KEY, 'base64'), format: 'der', type: 'spki' })
  assert.strictEqual(k.asymmetricKeyType, 'ed25519')
})
