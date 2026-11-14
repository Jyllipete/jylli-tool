const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs'), os = require('os'), path = require('path')
const F = require('../lib/gameconfig/formats')
const Cat = require('../lib/gameconfig/catalog')
const GC = require('../lib/gameconfig')

const CS2 = '"video.cfg"\r\n{\r\n\t"Version"\t\t"16"\r\n\t"setting.fullscreen"\t\t"1"\r\n\t"setting.mat_vsync"\t\t"1"\r\n\t"setting.msaa_samples"\t\t"4"\r\n}\r\n'
const FN = '﻿[/Script/FortniteGame.FortGameUserSettings]\nbUseVSync=True\nFrameRateLimit=240.000000\nsg.ShadowQuality=3\n; keep\n[Other]\nbUseVSync=False\n'
const MC = 'version:3465\nfullscreen:false\nenableVsync:true\nmaxFps:120\nkey_key.attack:key.mouse.left\n'

test('formats: parse reads values, an untouched patch returns the file byte for byte', () => {
  for (const [fmt, txt] of [['kv', CS2], ['ini', FN], ['options', MC]]) {
    assert.strictEqual(F.patch(fmt, txt, {}).text, txt)
  }
  assert.strictEqual(F.parse('kv', CS2).values['setting.mat_vsync'], '1')
  assert.strictEqual(F.parse('options', MC).values.maxFps, '120')
})

test('formats: a patch changes the value text only and keeps endings, BOM and comments', () => {
  const kv = F.patch('kv', CS2, { 'setting.mat_vsync': '0' })
  assert.strictEqual(kv.text, CS2.replace('"setting.mat_vsync"\t\t"1"', '"setting.mat_vsync"\t\t"0"'))
  assert.deepStrictEqual(kv.changed, [{ key: 'setting.mat_vsync', from: '1', to: '0' }])
  const ini = F.patch('ini', FN, { '/Script/FortniteGame.FortGameUserSettings|bUseVSync': 'False' })
  assert.ok(ini.text.startsWith('﻿[/Script'))
  assert.strictEqual(ini.text, FN.replace('bUseVSync=True', 'bUseVSync=False'))   // [Other] section's bUseVSync is untouched
  const mc = F.patch('options', MC, { enableVsync: 'false' })
  assert.strictEqual(mc.text, MC.replace('enableVsync:true', 'enableVsync:false'))
})

test('formats: a key that is not in the file is reported, never added', () => {
  const r = F.patch('kv', CS2, { 'setting.nope': '1' })
  assert.deepStrictEqual(r.missing, ['setting.nope'])
  assert.strictEqual(r.text, CS2)
  assert.deepStrictEqual(F.patch('kv', CS2, { 'setting.fullscreen': '1' }).unchanged, ['setting.fullscreen'])
  assert.deepStrictEqual(F.patch('kv', CS2, { 'setting.fullscreen': 'a"b' }).missing, ['setting.fullscreen'])
})

test('catalog: every game has a format, every key is unique and typed, choices carry values, recs are valid', () => {
  for (const id of Cat.IDS) {
    const g = Cat.get(id)
    assert.ok(F.FORMATS[g.format], id)
    const seen = new Set()
    for (const s of g.settings) {
      assert.ok(!seen.has(s.key), 'dup ' + s.key); seen.add(s.key)
      assert.ok(['display', 'graphics', 'performance'].includes(s.group), s.key)
      if (s.type === 'choice') assert.ok(s.values.length > 1, s.key)
      if (s.rec) assert.ok(Cat.validate(s, s.rec.value).ok, 'rec of ' + s.key)
    }
  }
})

test('catalog: validate normalises and rejects', () => {
  const g = Cat.get('fortnite')
  const fps = Cat.setting(g, '/Script/FortniteGame.FortGameUserSettings|FrameRateLimit')
  assert.deepStrictEqual(Cat.validate(fps, '144'), { ok: true, value: '144.000000' })
  assert.strictEqual(Cat.validate(fps, '99999').ok, false)
  assert.strictEqual(Cat.validate(fps, 'abc').ok, false)
  assert.strictEqual(Cat.validate(null, '1').ok, false)
  assert.strictEqual(Cat.validate(Cat.setting(Cat.get('cs2'), 'setting.mat_vsync'), '2').ok, false)
})

function rig(files, { running = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jtgc-'))
  const env = { USERPROFILE: path.join(dir, 'home'), LOCALAPPDATA: path.join(dir, 'local'), APPDATA: path.join(dir, 'roaming') }
  const put = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t) }
  const steam = path.join(dir, 'steam')
  put(path.join(steam, 'userdata', '111', '730', 'local', 'cfg', 'cs2_video.txt'), CS2)
  put(path.join(env.APPDATA, '.minecraft', 'options.txt'), MC)
  const notes = [], opened = []
  const svc = GC.create({
    fs, path, env, steamRoot: () => steam, backupDir: path.join(dir, 'bak'),
    isRunning: async () => running,
    runRecorded: async (control, kind, meta, fn) => { await fn(null, null, n => notes.push({ control, ...n })) },
    undoControl: async () => ({ ok: true }),
    open: async u => { opened.push(u) },
  })
  return { svc, dir, steam, notes, opened, cs2: path.join(steam, 'userdata', '111', '730', 'local', 'cfg', 'cs2_video.txt') }
}

test('service: list finds the games that have a file, read shows only rows whose key exists', async () => {
  const { svc } = rig()
  const l = await svc.list()
  assert.deepStrictEqual(l.games.filter(g => g.found).map(g => g.id).sort(), ['cs2', 'minecraft'])
  const r = await svc.read('cs2')
  assert.deepStrictEqual(r.rows.map(x => x.key), ['setting.fullscreen', 'setting.mat_vsync', 'setting.msaa_samples'])
  const v = r.rows.find(x => x.key === 'setting.mat_vsync')
  assert.strictEqual(v.rec, '0'); assert.strictEqual(v.recOpen, true)
  assert.strictEqual((await svc.read('fortnite')).error, 'no-file')
})

test('service: apply writes the change, keeps a backup, journals it, and undo restores the bytes', async () => {
  const { svc, notes, cs2 } = rig()
  const r = await svc.apply('cs2', { 'setting.mat_vsync': '0' })
  assert.strictEqual(r.ok, true); assert.strictEqual(r.changed.length, 1)
  assert.strictEqual(fs.readFileSync(cs2, 'utf8'), CS2.replace('"setting.mat_vsync"\t\t"1"', '"setting.mat_vsync"\t\t"0"'))
  assert.strictEqual(notes.length, 1)
  assert.strictEqual(notes[0].kind, 'game-config-file'); assert.strictEqual(notes[0].control, 'gamecfg:cs2')
  assert.strictEqual(fs.readFileSync(notes[0].backup, 'utf8'), CS2)
  const h = svc.handlers()['game-config-file']
  assert.strictEqual((await h.read(notes[0])).exists, true)
  assert.strictEqual(await h.restore(notes[0]), true)
  assert.strictEqual(fs.readFileSync(cs2, 'utf8'), CS2)
})

test('service: nothing is written while the game runs, for a no-op, or for a bad value', async () => {
  const run = rig(null, { running: true })
  assert.strictEqual((await run.svc.apply('cs2', { 'setting.mat_vsync': '0' })).error, 'game-running')
  assert.strictEqual(fs.readFileSync(run.cs2, 'utf8'), CS2)
  const idle = rig()
  assert.deepStrictEqual((await idle.svc.apply('cs2', { 'setting.mat_vsync': '1' })).changed, [])
  assert.strictEqual(idle.notes.length, 0)
  assert.strictEqual((await idle.svc.apply('cs2', { 'setting.mat_vsync': '7' })).error, 'bad-value')
  assert.strictEqual((await idle.svc.apply('cs2', { 'evil.key': '1' })).error, 'unknown-key')
  assert.strictEqual((await idle.svc.apply('../x', {})).error, 'unknown')
})

test('service: launch builds only catalog URLs', async () => {
  const { svc, opened } = rig()
  assert.strictEqual(svc.launchUrl('cs2'), 'steam://rungameid/730')
  assert.strictEqual(svc.launchUrl('minecraft'), null)
  assert.strictEqual((await svc.launch('cs2')).ok, true)
  assert.deepStrictEqual(opened, ['steam://rungameid/730'])
  assert.strictEqual((await svc.launch('minecraft')).error, 'not-launchable')
})
