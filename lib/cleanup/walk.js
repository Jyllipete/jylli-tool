'use strict'
// File walker shared by measuring and cleaning, so both apply the SAME rules to the SAME files.
// Never follows symlinks or junctions, never leaves the root, never deletes the root itself, counts bytes that were actually removed.
const path = require('path')
const realFs = require('fs')
const { isStrictSubpath } = require('../paths')
const targets = require('./targets')

// Files that look like the user's own work. Found in a temp folder they are kept and reported, not deleted.
const PERSONAL_EXT = new Set(['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.pdf', '.txt', '.odt', '.jpg', '.jpeg', '.png', '.gif', '.heic', '.psd', '.raw',
  '.mp4', '.mov', '.mkv', '.avi', '.mp3', '.wav', '.flac', '.zip', '.7z', '.rar', '.iso', '.blend', '.kdbx', '.pem', '.key', '.pfx'])
const HOUR = 3600000
const CHUNK = 24

/** One file's fate under a target's rules: 'delete' | 'too-new' | 'personal'. Pure. */
function classify(target, name, mtimeMs, now) {
  if (target.protectPersonal && PERSONAL_EXT.has(path.win32.extname(name).toLowerCase())) return 'personal'
  const age = target.minAgeHours || 0
  if (age > 0 && now - mtimeMs < age * HOUR) return 'too-new'
  return 'delete'
}

/** Walk `root` depth-first. visitFile(fullPath, stat) -> Promise; after(dirPath) runs once a folder's children are done (bottom-up). */
async function walk(root, fsp, visitFile, after, ctl) {
  async function dir(p) {
    if (ctl && ctl.aborted) return
    let entries
    try { entries = await fsp.readdir(p, { withFileTypes: true }) } catch { return }
    for (let i = 0; i < entries.length; i += CHUNK) {
      if (ctl && ctl.aborted) return
      await Promise.all(entries.slice(i, i + CHUNK).map(async d => {
        const full = path.win32.join(p, d.name)
        if (d.isSymbolicLink()) return                    // junctions report as links too
        if (d.isDirectory()) { if (isStrictSubpath(root, full)) await dir(full); return }
        if (!d.isFile()) return
        let st
        try { st = await fsp.lstat(full) } catch { return }
        await visitFile(full, st)
      }))
    }
    if (after && p !== root) await after(p)
  }
  await dir(root)
}

function emptyScan(id) {
  return { id, present: false, bytes: 0, files: 0, oldBytes: 0, recentBytes: 0, personalFiles: 0, personalBytes: 0, newest: 0, roots: [] }
}
function addFile(acc, target, name, st, now) {
  const c = classify(target, name, st.mtimeMs, now)
  if (c === 'personal') { acc.personalFiles++; acc.personalBytes += st.size; return c }
  if (c === 'too-new') { acc.recentBytes += st.size; return c }
  acc.bytes += st.size; acc.files++; acc.oldBytes += st.size
  if (st.mtimeMs > acc.newest) acc.newest = st.mtimeMs
  return c
}

/** Measure what cleaning `target` would remove right now. Special targets (recycle, dism, ...) are measured in special.js. */
async function scanTarget(target, env, opts = {}) {
  const fs = opts.fs || realFs, fsp = (opts.fs || realFs).promises, now = opts.now || Date.now(), ctl = opts.ctl
  const acc = emptyScan(target.id)
  const roots = targets.resolveRoots(target, env, fs)
  for (const root of roots) {
    let present = true
    try { await fsp.access(root) } catch { present = false }
    if (!present) continue
    acc.present = true
    const before = acc.bytes
    const st = await fsp.lstat(root).catch(() => null)
    if (st && st.isFile()) { addFile(acc, target, path.win32.basename(root), st, now) }
    else if (st && st.isDirectory() && !st.isSymbolicLink()) await walk(root, fsp, (full, s) => { addFile(acc, target, path.win32.basename(full), s, now) }, null, ctl)
    if (acc.bytes > before) acc.roots.push({ path: root, bytes: acc.bytes - before })
  }
  for (const f of targets.resolveFiles(target, env, fs)) {
    const st = await fsp.lstat(f).catch(() => null)
    if (st && st.isFile()) { acc.present = true; const before = acc.bytes; addFile(acc, target, path.win32.basename(f), st, now); if (acc.bytes > before) acc.roots.push({ path: f, bytes: st.size }) }
  }
  return acc
}

/** Delete what scanTarget measured. Returns what really went: freed bytes, files, and per-reason skips. */
async function cleanTarget(target, env, opts = {}) {
  const fs = opts.fs || realFs, fsp = (opts.fs || realFs).promises, now = opts.now || Date.now(), ctl = opts.ctl, onProgress = opts.onProgress
  const res = { id: target.id, freed: 0, files: 0, skipped: { inUse: 0, access: 0, tooNew: 0, personal: 0 }, skippedBytes: 0, present: false }
  async function remove(full, st) {
    const c = classify(target, path.win32.basename(full), st.mtimeMs, now)
    if (c === 'personal') { res.skipped.personal++; res.skippedBytes += st.size; return }
    if (c === 'too-new') { res.skipped.tooNew++; res.skippedBytes += st.size; return }
    try { await fsp.unlink(full); res.freed += st.size; res.files++; if (onProgress) onProgress(res.freed) }
    catch (e) {
      res.skippedBytes += st.size
      if (e && (e.code === 'EBUSY' || e.code === 'EPERM' || e.code === 'ETXTBSY')) res.skipped.inUse++
      else if (e && e.code !== 'ENOENT') res.skipped.access++
    }
  }
  for (const root of targets.resolveRoots(target, env, fs)) {
    if (ctl && ctl.aborted) break
    const st = await fsp.lstat(root).catch(() => null)
    if (!st) continue
    res.present = true
    if (st.isSymbolicLink()) continue
    if (st.isFile()) { await remove(root, st); continue }
    if (!st.isDirectory()) continue
    await walk(root, fsp, remove, async p => { try { await fsp.rmdir(p) } catch {} }, ctl)   // empty folders go; non-empty ones refuse
  }
  for (const f of targets.resolveFiles(target, env, fs)) {
    if (ctl && ctl.aborted) break
    const st = await fsp.lstat(f).catch(() => null)
    if (st && st.isFile()) { res.present = true; await remove(f, st) }
  }
  return res
}

/** Which of a target's processes are running, given a lower-cased set of running exe names. */
function lockedBy(target, running) {
  return (target.processes || []).filter(p => running.has(p.toLowerCase()))
}

module.exports = { classify, walk, scanTarget, cleanTarget, lockedBy, PERSONAL_EXT }
