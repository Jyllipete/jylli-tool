'use strict'
// Premium explorers: folder sizes for the Space Map and large / forgotten files. Read-only. Time-boxed so a whole-drive scan never hangs:
// when the budget runs out the result says `partial: true` instead of pretending it finished.
const path = require('path')
const realFs = require('fs')
const DAY = 86400000

const KIND_RX = [
  ['games', /\\(steamapps|steam|epic games|riot games|xboxgames|gog galaxy|battle\.net|origin games|ea games|ubisoft|fivem)(\\|$)/i],
  ['media', /\\(videos|pictures|music|onedrive|dropbox)(\\|$)/i],
  ['system', /^[a-z]:\\(windows|\$recycle\.bin|system volume information|recovery|boot|programdata\\microsoft)(\\|$)/i],
  ['apps', /^[a-z]:\\(program files|program files \(x86\)|users\\[^\\]+\\appdata)(\\|$)/i],
]
/** Folder path -> 'games' | 'media' | 'system' | 'apps' | 'files'. Pure. */
function kindOf(p) { for (const [k, rx] of KIND_RX) if (rx.test(p)) return k; return 'files' }

/** Total size of a folder, never following links; stops at the deadline. */
async function sizeOf(dir, fsp, deadline, ctl) {
  let bytes = 0, partial = false
  async function go(p) {
    if (Date.now() > deadline || (ctl && ctl.aborted)) { partial = true; return }
    let ents; try { ents = await fsp.readdir(p, { withFileTypes: true }) } catch { return }
    await Promise.all(ents.map(async d => {
      if (d.isSymbolicLink()) return
      const full = path.win32.join(p, d.name)
      if (d.isDirectory()) return go(full)
      if (d.isFile()) { try { bytes += (await fsp.lstat(full)).size } catch {} }
    }))
  }
  await go(dir)
  return { bytes, partial }
}

/** One level of the Space Map: the children of `dir` with sizes, biggest first. Files are grouped so the list stays short. */
async function spaceMap(dir, opts = {}) {
  const fsp = (opts.fs || realFs).promises, budget = opts.budgetMs || 25000, deadline = Date.now() + budget
  let ents; try { ents = await fsp.readdir(dir, { withFileTypes: true }) } catch { return { ok: false, error: 'unreadable' } }
  const nodes = []; let looseBytes = 0, loose = 0, partial = false
  const dirs = ents.filter(d => d.isDirectory() && !d.isSymbolicLink()), files = ents.filter(d => d.isFile())
  await Promise.all(files.map(async d => { try { looseBytes += (await fsp.lstat(path.win32.join(dir, d.name))).size; loose++ } catch {} }))
  for (let i = 0; i < dirs.length; i += 6) {
    await Promise.all(dirs.slice(i, i + 6).map(async d => {
      const full = path.win32.join(dir, d.name)
      const s = await sizeOf(full, fsp, deadline, opts.ctl)
      if (s.partial) partial = true
      nodes.push({ name: d.name, path: full, bytes: s.bytes, kind: kindOf(full), dir: true, partial: s.partial })
    }))
  }
  if (loose) nodes.push({ name: '', path: dir, bytes: looseBytes, kind: 'files', dir: false, files: loose })
  nodes.sort((a, b) => b.bytes - a.bytes)
  return { ok: true, path: dir, total: nodes.reduce((a, n) => a + n.bytes, 0), nodes: nodes.slice(0, 60), partial }
}

const INSTALLER_EXT = new Set(['.exe', '.msi', '.iso', '.zip', '.7z', '.rar', '.msix', '.appx'])
/** Big files nobody has touched, and old installers in Downloads. Never lists system or app folders. */
async function largeFiles(env, opts = {}) {
  const fsp = (opts.fs || realFs).promises, now = opts.now || Date.now(), deadline = now + (opts.budgetMs || 40000)
  const up = env.USERPROFILE || ''
  const roots = ['Downloads', 'Desktop', 'Documents', 'Videos', 'Pictures', 'Music'].map(n => path.win32.join(up, n))
  const BIG = opts.bigBytes || 500 * 1048576, OLD = opts.oldDays || 90, out = []
  let partial = false
  async function go(p, isDownloads, depth) {
    if (Date.now() > deadline || (opts.ctl && opts.ctl.aborted)) { partial = true; return }
    let ents; try { ents = await fsp.readdir(p, { withFileTypes: true }) } catch { return }
    for (const d of ents) {
      if (d.isSymbolicLink()) continue
      const full = path.win32.join(p, d.name)
      if (d.isDirectory()) { if (depth < 6) await go(full, isDownloads, depth + 1); continue }
      if (!d.isFile()) continue
      let st; try { st = await fsp.lstat(full) } catch { continue }
      const ageDays = (now - st.mtimeMs) / DAY
      const ext = path.win32.extname(d.name).toLowerCase()
      if (st.size >= BIG && ageDays >= OLD) out.push({ path: full, name: d.name, bytes: st.size, ageDays: Math.round(ageDays), reason: 'large-old' })
      else if (isDownloads && INSTALLER_EXT.has(ext) && st.size >= 50 * 1048576 && ageDays >= 30) out.push({ path: full, name: d.name, bytes: st.size, ageDays: Math.round(ageDays), reason: 'installer' })
    }
  }
  for (const r of roots) await go(r, /downloads$/i.test(r), 0)
  out.sort((a, b) => b.bytes - a.bytes)
  return { ok: true, files: out.slice(0, 200), total: out.reduce((a, f) => a + f.bytes, 0), partial }
}

/** A path the app may send to the Recycle Bin from the explorers: inside the user profile, not a drive root or a profile root. */
function trashAllowed(p, env) {
  const { isStrictSubpath } = require('../paths')
  if (typeof p !== 'string' || !p || p.length > 520 || /[*?<>|"\0]/.test(p)) return false
  const up = env.USERPROFILE
  if (!up || !isStrictSubpath(up, p)) return false
  const rel = path.win32.relative(up.toLowerCase(), path.win32.resolve(p).toLowerCase())
  return rel.split('\\').length >= 2 && !/^appdata(\\|$)/.test(rel)
}

module.exports = { kindOf, sizeOf, spaceMap, largeFiles, trashAllowed }
