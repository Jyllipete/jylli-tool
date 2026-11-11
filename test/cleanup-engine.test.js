'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const cleanup = require('../lib/cleanup')
const { targets, walk, receipt, insights, special } = cleanup

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-clean-'))
  for (const [rel, size, ageH] of files) {
    const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, Buffer.alloc(size, 1))
    if (ageH != null) { const t = new Date(Date.now() - ageH * 3600000); fs.utimesSync(p, t, t) }
  }
  return root
}
const fake = (roots, extra = {}) => ({ id: 'x', group: 'system', lane: 'safe', rebuild: 'none', minAgeHours: 0, processes: [], roots: () => roots, ...extra })

test('catalog: every target is well formed and permanent items never sit in the safe lane', () => {
  const seen = new Set()
  for (const t of targets.TARGETS) {
    assert.ok(!seen.has(t.id), 'duplicate ' + t.id); seen.add(t.id)
    assert.ok(targets.GROUPS.includes(t.group), t.id + ' group')
    assert.ok(targets.LANES.includes(t.lane), t.id + ' lane')
    assert.ok(targets.REBUILD.includes(t.rebuild), t.id + ' rebuild')
    assert.strictEqual(typeof t.roots, 'function')
    if (t.group === 'permanent') assert.strictEqual(t.lane, 'permanent')
    if (t.lane === 'permanent') assert.strictEqual(t.group, 'permanent')
    if (t.rebuild === 'shaderRecompile') assert.notStrictEqual(t.lane, 'safe', t.id + ' shader caches are never one-click')
  }
  for (const id of ['clean-recycle', 'clean-old-windows', 'clean-browser-history']) assert.strictEqual(targets.get(id).lane, 'permanent')
  assert.strictEqual(targets.get('clean-eventlogs').lane, 'review')
})

test('catalog: never touches the global nuget package store or Firefox profile data', () => {
  const env = { LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local', APPDATA: 'C:\\Users\\a\\AppData\\Roaming', TEMP: 'C:\\Users\\a\\AppData\\Local\\Temp' }
  const all = targets.TARGETS.flatMap(t => targets.resolveRoots(t, env, fs))
  assert.ok(!all.some(p => /\.nuget\\packages/i.test(p)))
  assert.ok(!all.some(p => /places\.sqlite/i.test(p)))
  assert.ok(!targets.resolveRoots(targets.get('clean-browser-history'), env, fs).some(p => /firefox/i.test(p)))
})

test('classify: personal files and too-new files are kept', () => {
  const t = { protectPersonal: true, minAgeHours: 24 }, now = Date.now()
  assert.strictEqual(walk.classify(t, 'report.docx', now - 99 * 3600000, now), 'personal')
  assert.strictEqual(walk.classify(t, 'a.tmp', now - 1 * 3600000, now), 'too-new')
  assert.strictEqual(walk.classify(t, 'a.tmp', now - 48 * 3600000, now), 'delete')
  assert.strictEqual(walk.classify({ minAgeHours: 0 }, 'a.docx', now, now), 'delete')
})

test('scan and clean agree to the byte; root and kept files survive', async () => {
  const root = tree([['a/x.tmp', 1000, 100], ['a/b/y.tmp', 500, 100], ['new.tmp', 700, 1], ['mine.docx', 300, 100], ['z.tmp', 200, 100]])
  const t = fake([root], { minAgeHours: 24, protectPersonal: true })
  const s = await walk.scanTarget(t, {})
  assert.strictEqual(s.bytes, 1700); assert.strictEqual(s.files, 3); assert.strictEqual(s.personalFiles, 1); assert.strictEqual(s.recentBytes, 700)
  const r = await walk.cleanTarget(t, {})
  assert.strictEqual(r.freed, s.bytes)
  assert.strictEqual(r.skipped.tooNew, 1); assert.strictEqual(r.skipped.personal, 1)
  assert.ok(fs.existsSync(root)); assert.ok(fs.existsSync(path.join(root, 'new.tmp'))); assert.ok(fs.existsSync(path.join(root, 'mine.docx')))
  assert.ok(!fs.existsSync(path.join(root, 'a')), 'emptied folders are removed')
  fs.rmSync(root, { recursive: true, force: true })
})

test('symlinks are not followed', async t => {
  const outside = tree([['keep.dat', 4000, 100]]), root = tree([['f.tmp', 10, 100]])
  try { fs.symlinkSync(outside, path.join(root, 'link'), 'junction') } catch { return t.skip('cannot create junction here') }
  const tg = fake([root])
  assert.strictEqual((await walk.scanTarget(tg, {})).bytes, 10)
  await walk.cleanTarget(tg, {})
  assert.ok(fs.existsSync(path.join(outside, 'keep.dat')), 'files behind a junction are untouched')
  fs.rmSync(outside, { recursive: true, force: true }); fs.rmSync(root, { recursive: true, force: true })
})

test('abort stops a run early', async () => {
  const a = tree([['1.tmp', 10, 100]]), b = tree([['2.tmp', 10, 100]])
  const ctl = { aborted: true }
  const r = await walk.cleanTarget(fake([a, b]), {}, { ctl }).catch(() => null)
  assert.ok(r === null || r.freed === 0)
  assert.ok(fs.existsSync(path.join(a, '1.tmp')))
  fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(b, { recursive: true, force: true })
})

test('service: permanent targets need confirmation; receipt reports real freed bytes', async () => {
  const root = tree([['a.tmp', 2048, 100]])
  const orig = targets.TARGETS.find(t => t.id === 'clean-discord'), saved = orig.roots
  orig.roots = () => [root]
  let disk = 1000
  const svc = cleanup.create({ env: {}, runPS: async () => ({ out: '' }), running: async () => new Set(), has: async () => ({}), diskFree: async () => (disk += 2048) })
  const events = []
  const out = await svc.run({ ids: ['clean-discord', 'clean-recycle'], onProgress: e => events.push(e.phase + ':' + e.id) })
  orig.roots = saved
  assert.ok(out.ok)
  assert.deepStrictEqual(out.receipt.rows.map(r => r.id), ['clean-discord'], 'recycle bin was refused without confirmation')
  assert.strictEqual(out.receipt.total, 2048); assert.strictEqual(out.receipt.delta, 2048)
  assert.ok(events.includes('start:clean-discord') && events.includes('done:clean-discord'))
  fs.rmSync(root, { recursive: true, force: true })
})

test('model: lanes, totals, requirements and locked apps', () => {
  const scans = { 'clean-discord': { present: true, bytes: 100, files: 3 }, 'clean-nvidia': { present: true, bytes: 50 }, 'clean-recycle': { present: true, bytes: 900 }, 'clean-steam': { present: false, bytes: 0 } }
  const m = receipt.buildModel(scans, { running: new Set(['discord.exe']), has: { nvidia: false } })
  assert.deepStrictEqual(m.items.map(i => i.id).sort(), ['clean-discord', 'clean-recycle'])
  assert.strictEqual(m.totals.safe, 100); assert.strictEqual(m.totals.permanent, 900); assert.strictEqual(m.totals.all, 1000)
  assert.strictEqual(m.locked, 1)
  const withGpu = receipt.buildModel(scans, { has: { nvidia: true } })
  assert.strictEqual(withGpu.totals.review, 50)
})

test('receipt: totals, retry list, history entry', () => {
  const rec = receipt.buildReceipt([
    { id: 'a', freed: 100, files: 2, skipped: { inUse: 1, access: 0, tooNew: 0, personal: 0 }, skippedBytes: 5 },
    { id: 'b', freed: 0, error: 'x' }, { id: 'c', freed: 50 }], { startedAt: 10, endedAt: 1010, disk: { before: 1000, after: 1150 } })
  assert.strictEqual(rec.total, 150); assert.strictEqual(rec.delta, 150); assert.strictEqual(rec.ms, 1000); assert.deepStrictEqual(rec.retry, ['a', 'b'])
  const h = receipt.historyEntry(rec)
  assert.strictEqual(h.freedBytes, 150); assert.strictEqual(h.itemCount, 2); assert.deepStrictEqual(h.per, { a: 100, c: 50 })
})

test('insights: regrowth, projection, autopilot', () => {
  const D = 86400000, t0 = 1e12
  const hist = [{ ts: t0, per: { 'clean-discord': 500 } }]
  const snaps = [{ ts: t0 + 5 * D, sizes: { 'clean-discord': 100 * 1048576 } }]
  const g = insights.regrowth(snaps, hist)
  assert.strictEqual(g['clean-discord'].perDay, Math.round(100 * 1048576 / 5))
  assert.strictEqual(insights.refillDays(20 * 1048576, 100 * 1048576), 5)
  assert.strictEqual(insights.refillDays(0, 100), null)
  const pts = [0, 10, 20].map(i => ({ ts: t0 + i * D, free: 100e9 - i * 1e9 }))
  assert.strictEqual(insights.projectFull(pts, 80e9).days, 80)
  assert.strictEqual(insights.projectFull([{ ts: t0, free: 5 }, { ts: t0 + 1 * D, free: 4 }], 4), null, 'under 7 days: no projection')
  assert.ok(insights.autopilotDue({ mode: 'weekly' }, { lastRunTs: 0, now: t0 }))
  assert.ok(!insights.autopilotDue({ mode: 'weekly' }, { lastRunTs: t0 - D, now: t0 }))
  assert.ok(insights.autopilotDue({ mode: 'threshold', thresholdBytes: 100 }, { lastRunTs: t0 - 2 * D, safeBytes: 200, now: t0 }))
  assert.ok(!insights.autopilotDue({ mode: 'off' }, { lastRunTs: 0, safeBytes: 1e12 }))
})

test('special: DISM parsing never invents a size', () => {
  assert.strictEqual(special.parseDism('Cache and Temporary Data : 1.50 GB\nComponent Store Cleanup Recommended : Yes').bytes, Math.round(1.5 * 1073741824))
  assert.strictEqual(special.parseDism('Komponenttivaraston puhdistus suositeltu : Kyllä').bytes, null)
  assert.deepStrictEqual(special.parseSizeCount('SIZE=1234;COUNT=7'), { bytes: 1234, files: 7 })
  assert.ok(/Clear-RecycleBin/.test(special.RECYCLE_CLEAN))
})

test('explore: space map sizes folders, large-file finder honours age, trash guard stays in the user profile', async () => {
  const ex = require('../lib/cleanup/explore')
  const root = tree([['a/1.bin', 3000, 1], ['a/b/2.bin', 1000, 1], ['c/3.bin', 500, 1], ['loose.bin', 50, 1]])
  const m = await ex.spaceMap(root)
  assert.deepStrictEqual(m.nodes.map(n => [n.name, n.bytes]), [['a', 4000], ['c', 500], ['', 50]])
  assert.strictEqual(m.total, 4550)
  assert.strictEqual(ex.kindOf('C:\\Program Files (x86)\\Steam\\steamapps'), 'games')
  assert.strictEqual(ex.kindOf('C:\\Windows\\System32'), 'system')
  const up = tree([['Downloads/old.iso', 2048, 24 * 100], ['Downloads/new.iso', 2048, 24], ['Videos/clip.mp4', 4096, 24 * 200]])
  const lf = await ex.largeFiles({ USERPROFILE: up }, { bigBytes: 4000, oldDays: 90 })
  assert.deepStrictEqual(lf.files.map(f => f.name), ['clip.mp4'])
  const env = { USERPROFILE: 'C:\\Users\\a' }
  assert.ok(ex.trashAllowed('C:\\Users\\a\\Downloads\\x.iso', env))
  assert.ok(!ex.trashAllowed('C:\\Users\\a', env)); assert.ok(!ex.trashAllowed('C:\\Windows\\System32', env))
  assert.ok(!ex.trashAllowed('C:\\Users\\a\\AppData\\Roaming\\x', env)); assert.ok(!ex.trashAllowed('C:\\Users\\a\\..\\b\\x', env))
  for (const r of [root, up]) fs.rmSync(r, { recursive: true, force: true })
})
