'use strict'
// Per-game settings service. Reads a game's own config file, shows what would change, and writes it through the change journal
// (control `gamecfg:<id>`, change kind `game-config-file`). It never writes while the game runs (games rewrite the file on exit),
// always keeps a backup, verifies by reading the file back, and Undo puts the backed-up bytes back.
const crypto = require('crypto')
const Cat = require('./catalog')
const F = require('./formats')

const MAX_BACKUPS = 40

function create(deps) {
  const { fs, path, env } = deps
  const now = deps.now || Date.now
  const sha = f => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex')

  /** The config file of a game on this PC, or null. CS2 keeps one per Steam account, so the newest wins. */
  async function locate(id) {
    const home = env.USERPROFILE || '', local = env.LOCALAPPDATA || '', roaming = env.APPDATA || ''
    const ok = f => { try { return fs.statSync(f).isFile() } catch { return false } }
    if (id === 'cs2') {
      const root = await Promise.resolve(deps.steamRoot ? deps.steamRoot() : null)
      if (!root) return null
      const ud = path.join(root, 'userdata')
      let best = null
      try {
        for (const d of fs.readdirSync(ud)) {
          const f = path.join(ud, d, '730', 'local', 'cfg', 'cs2_video.txt')
          if (ok(f)) { const t = fs.statSync(f).mtimeMs; if (!best || t > best.t) best = { f, t } }
        }
      } catch { /* no userdata */ }
      return best ? best.f : null
    }
    const f = id === 'apex' ? path.join(home, 'Saved Games', 'Respawn', 'Apex', 'local', 'videoconfig.txt')
      : id === 'fortnite' ? path.join(local, 'FortniteGame', 'Saved', 'Config', 'WindowsClient', 'GameUserSettings.ini')
      : id === 'minecraft' ? path.join(roaming, '.minecraft', 'options.txt')
      : null
    return f && ok(f) ? f : null
  }

  async function list() {
    const games = []
    for (const id of Cat.IDS) {
      const g = Cat.get(id), file = await locate(id)
      games.push({ id, name: g.name, found: !!file, launchable: !!g.launcher })
    }
    return { ok: true, games }
  }

  async function read(id) {
    const g = Cat.get(id)
    if (!g) return { ok: false, error: 'unknown' }
    const file = await locate(id)
    if (!file) return { ok: false, error: 'no-file' }
    let text
    try { text = fs.readFileSync(file, 'utf8') } catch { return { ok: false, error: 'no-file' } }
    const { values } = F.parse(g.format, text)
    const rows = []
    for (const s of g.settings) {
      if (!Object.prototype.hasOwnProperty.call(values, s.key)) continue
      const cur = values[s.key]
      const row = { key: s.key, group: s.group, type: s.type, current: cur }
      if (s.values) row.values = s.values
      if (s.type === 'int') { row.min = s.min; row.max = s.max }
      if (Cat.BOOLS[s.type]) row.values = [{ value: Cat.BOOLS[s.type][0], label: 'off' }, { value: Cat.BOOLS[s.type][1], label: 'on' }]
      if (s.rec) { row.rec = s.rec.value; row.why = s.rec.why; row.recOpen = !Cat.same(s, cur, s.rec.value) }
      rows.push(row)
    }
    const running = await deps.isRunning(g.procs).catch(() => false)
    return { ok: true, id, name: g.name, file, rows, running, launchable: !!g.launcher }
  }

  /** Validates a request and shows the exact changes. Used by "Review changes" and by apply. */
  async function preview(id, changes) {
    const g = Cat.get(id)
    if (!g) return { ok: false, error: 'unknown' }
    const file = await locate(id)
    if (!file) return { ok: false, error: 'no-file' }
    const want = {}
    for (const key of Object.keys(changes || {}).slice(0, 40)) {
      const v = Cat.validate(Cat.setting(g, key), changes[key])
      if (!v.ok) return { ok: false, error: v.reason, key }
      want[key] = v.value
    }
    let text
    try { text = fs.readFileSync(file, 'utf8') } catch { return { ok: false, error: 'no-file' } }
    const cur = F.parse(g.format, text).values
    // A value that only differs in spelling (120 vs 120.000000, True vs true) is not a change.
    for (const key of Object.keys(want)) if (Object.prototype.hasOwnProperty.call(cur, key) && Cat.same(Cat.setting(g, key), cur[key], want[key])) delete want[key]
    const p = F.patch(g.format, text, want)
    return { ok: true, file, text, patched: p.text, changed: p.changed, missing: p.missing }
  }

  function backup(file, id) {
    fs.mkdirSync(deps.backupDir, { recursive: true })
    const dest = path.join(deps.backupDir, new Date(now()).toISOString().replace(/[:.]/g, '-') + '-' + id + '-' + crypto.randomBytes(2).toString('hex') + '-' + path.basename(file))
    fs.copyFileSync(file, dest)
    try {
      const all = fs.readdirSync(deps.backupDir).map(f => ({ f, t: fs.statSync(path.join(deps.backupDir, f)).mtimeMs })).sort((a, b) => b.t - a.t)
      for (const o of all.slice(MAX_BACKUPS)) fs.unlinkSync(path.join(deps.backupDir, o.f))
    } catch { /* keep */ }
    return dest
  }

  async function apply(id, changes) {
    const g = Cat.get(id)
    if (!g) return { ok: false, error: 'unknown' }
    if (await deps.isRunning(g.procs).catch(() => false)) return { ok: false, error: 'game-running' }
    const p = await preview(id, changes)
    if (!p.ok) return p
    if (!p.changed.length) return { ok: true, changed: [], missing: p.missing }
    let failure = null
    await deps.runRecorded('gamecfg:' + id, 'apply', { via: 'manual' }, async (ps, cmd, note) => {
      const bak = backup(p.file, id)
      const tmp = p.file + '.jt-tmp'
      try {
        fs.writeFileSync(tmp, p.patched, 'utf8')
        fs.renameSync(tmp, p.file)
        const back = F.parse(g.format, fs.readFileSync(p.file, 'utf8')).values
        const bad = p.changed.find(c => back[c.key] !== c.to)
        if (bad) { fs.copyFileSync(bak, p.file); failure = 'verify-failed'; return }
      } catch { try { fs.unlinkSync(tmp) } catch { /* none */ } try { fs.copyFileSync(bak, p.file) } catch { /* keep */ } failure = 'write-failed'; return }
      note({ kind: 'game-config-file', file: p.file, backup: bak, before: { exists: true, value: sha(bak) }, after: { exists: true, value: sha(p.file) } })
    })
    return failure ? { ok: false, error: failure } : { ok: true, changed: p.changed, missing: p.missing }
  }

  async function undo(id) {
    if (!Cat.get(id)) return { ok: false, error: 'unknown' }
    try { const r = await deps.undoControl('gamecfg:' + id); return { ok: !r || r.ok !== false, result: r || null } } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 160) } }
  }

  /** Only the two launcher URLs the catalog builds; the caller never supplies a URL. */
  function launchUrl(id) {
    const g = Cat.get(id)
    if (!g || !g.launcher) return null
    if (g.launcher === 'steam') return 'steam://rungameid/' + g.appId
    if (g.launcher === 'epic' && id === 'fortnite') return 'com.epicgames.launcher://apps/Fortnite?action=launch&silent=true'
    return null
  }
  async function launch(id) {
    const url = launchUrl(id)
    if (!url) return { ok: false, error: 'not-launchable' }
    try { await deps.open(url); return { ok: true } } catch { return { ok: false, error: 'launch-failed' } }
  }

  /** Journal undo handler: a patched file is compared by content hash and restored from its backup. */
  function handlers() {
    return {
      'game-config-file': {
        read: async c => { try { return { exists: true, value: sha(c.file) } } catch { return { exists: false } } },
        restore: async c => { try { fs.copyFileSync(c.backup, c.file); return true } catch { return false } },
      },
    }
  }

  return { list, read, preview, apply, undo, launch, launchUrl, handlers, locate }
}

module.exports = { create }
