'use strict'
// Bring-your-own SCEWIN: the user points at a folder that holds their own copy. We never ship or download AMI binaries.
// The copy goes to an admin-only folder (this app runs elevated and must not execute from a user-writable path), its SHA-256 is
// recorded, and verify() re-checks it before every run.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const REQUIRED = ['SCEWIN_64.exe', 'amifldrv64.sys', 'amigendrv64.sys']
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

/** Case-insensitive lookup of the required files inside a folder. Returns { ok, files:{name:path}, missing:[] }. */
function inspect(dir) {
  let names = []
  try { names = fs.readdirSync(dir) } catch { return { ok: false, files: {}, missing: REQUIRED.slice() } }
  const files = {}, missing = []
  for (const r of REQUIRED) {
    const hit = names.find(n => n.toLowerCase() === r.toLowerCase())
    if (hit) files[r] = path.join(dir, hit); else missing.push(r)
  }
  return { ok: missing.length === 0, files, missing }
}

/** Copies the required files into `dest`, writes manifest.json and returns it. `lock(dest)` hardens the folder ACL. */
async function install(srcDir, dest, { lock, signer } = {}) {
  const found = inspect(srcDir)
  if (!found.ok) return { ok: false, error: 'files_missing', missing: found.missing }
  fs.mkdirSync(dest, { recursive: true })
  if (lock) await lock(dest)
  const manifest = { ts: Date.now(), signer: signer || null, files: {} }
  for (const r of REQUIRED) {
    const to = path.join(dest, r)
    fs.copyFileSync(found.files[r], to)
    manifest.files[r] = sha256(to)
  }
  fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2))
  return { ok: true, manifest }
}

/** state: 'missing' (nothing imported) | 'ok' | 'tampered' (a file changed or vanished since import) */
function verify(dest) {
  let manifest
  try { manifest = JSON.parse(fs.readFileSync(path.join(dest, 'manifest.json'), 'utf8')) } catch { return { state: 'missing' } }
  for (const r of REQUIRED) {
    const p = path.join(dest, r)
    try { if (sha256(p) !== manifest.files?.[r]) return { state: 'tampered', file: r } } catch { return { state: 'tampered', file: r } }
  }
  return { state: 'ok', exe: path.join(dest, 'SCEWIN_64.exe'), manifest }
}

module.exports = { REQUIRED, inspect, install, verify, sha256 }
