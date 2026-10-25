// Per-tweak "before" snapshots: values that existed before a tweak changed them, so Restore can put back exactly what the
// user had instead of guessing Windows defaults. Small JSON files, written atomically.
const fs = require('fs')
const path = require('path')

const NAME_RE = /^[A-Za-z0-9_\-]{1,64}$/

function createSnapshotStore(dir) {
  const file = name => {
    if (!NAME_RE.test(name)) throw new Error('invalid snapshot name')
    return path.join(dir, name + '.json')
  }
  function load(name) {
    const f = file(name)   // an invalid name is a programming error and must throw, not read as "no snapshot"
    try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null }
  }
  function save(name, data) {
    fs.mkdirSync(dir, { recursive: true })
    const f = file(name), tmp = f + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(data), 'utf8')
    fs.renameSync(tmp, f)
  }
  function remove(name) { try { fs.unlinkSync(file(name)) } catch {} }
  /**
   * Adds entries { key: previousValue } WITHOUT overwriting keys that already have a snapshot — the first recorded value is the
   * user's real original; re-applying a tweak must never replace it with a value the tweak itself wrote.
   */
  function merge(name, entries) {
    const cur = load(name) || {}
    let changed = false
    for (const [k, v] of Object.entries(entries || {})) if (!(k in cur)) { cur[k] = v; changed = true }
    if (changed) save(name, cur)
    return cur
  }
  return { load, save, remove, merge }
}

module.exports = { createSnapshotStore }
