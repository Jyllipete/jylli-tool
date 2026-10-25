// Safe editing helpers for game config files (CitizenFX.ini, gta5_settings.xml, Arma .conf).
// Values that come from the renderer are validated here so they can never add lines/tags or smuggle regex/replace syntax.

const KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/
/** Value that is safe on a single config line / XML attribute: no control chars, quotes, angle brackets. */
const VALUE_RE = /^[A-Za-z0-9_.\-: /\\+,()]{0,256}$/

const isSafeKey = k => typeof k === 'string' && KEY_RE.test(k)
const isSafeValue = v => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'boolean') || (typeof v === 'string' && VALUE_RE.test(v))
const normalizeValue = v => typeof v === 'boolean' ? (v ? '1' : '0') : String(v)

const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Sets key=value lines in an INI document. Only keys in `allowedKeys` (a Set) are touched; the match is anchored to the
 * start of a line so a key can never match inside another key or a value. Unsafe keys/values are skipped.
 * @returns {{ content: string, applied: string[], skipped: string[] }}
 */
function applyIniChanges(content, changes, allowedKeys) {
  let c = content || ''
  const applied = [], skipped = []
  for (const [key, raw] of Object.entries(changes || {})) {
    if (!isSafeKey(key) || (allowedKeys && !allowedKeys.has(key)) || !isSafeValue(raw)) { skipped.push(key); continue }
    const val = normalizeValue(raw)
    const rex = new RegExp('^([ \\t]*' + escapeRegExp(key) + '[ \\t]*=)[^\\r\\n]*', 'im')
    if (rex.test(c)) c = c.replace(rex, (_, head) => head + val)
    else c = c.trimEnd() + '\n' + key + '=' + val + '\n'
    applied.push(key)
  }
  return { content: c, applied, skipped }
}

/** XML attribute values for gta5_settings.xml: plain tokens/numbers only. */
const XML_VALUE_RE = /^[A-Za-z0-9_.\-]{1,32}$/
const isSafeXmlValue = v => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && XML_VALUE_RE.test(v))

module.exports = { isSafeKey, isSafeValue, normalizeValue, applyIniChanges, isSafeXmlValue, escapeRegExp }
