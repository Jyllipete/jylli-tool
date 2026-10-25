// HTML escaping helpers — loaded first by EVERY window (main app and secondary windows).
// Everything that did not originate in our own source (process / app / device / profile / server names, registry data,
// file names, API responses, error messages) MUST go through one of these before it reaches innerHTML.
const _ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }
/** Escapes text for HTML element content AND quoted attribute values. */
function escHtml(s) { return String(s ?? '').replace(/[&<>"'`]/g, c => _ESC_MAP[c]) }
const escAttr = escHtml
/** Safe JS argument for an inline handler: onclick="fn(${jsArg(value)})" — a JSON literal, attribute-escaped. */
function jsArg(v) { return escHtml(JSON.stringify(v === undefined ? null : v)) }
/** Short stable id for any string (safe in id attributes and selectors). btoa() throws on non-Latin1 paths such as "Käyttäjä". */
function domId(s) { let x = 5381; for (const ch of String(s)) x = ((x << 5) + x + ch.codePointAt(0)) | 0; return (x >>> 0).toString(36) }
