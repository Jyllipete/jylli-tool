const test = require('node:test')
const assert = require('node:assert')
const { createRecorder } = require('../lib/journal-runner')

function fakeSystem() {
  const reg = { 'HKLM\\S\\K|V': { type: 'REG_DWORD', value: '0' } }
  const runCmd = async (c) => {
    let m = c.match(/^reg query "(.+?)" \/v "(.+?)"$/)
    if (m) { const e = reg[m[1] + '|' + m[2]]; return { ok: !!e, out: e ? `    ${m[2]}    ${e.type}    0x${Number(e.value).toString(16)}` : '', code: e ? 0 : 1 } }
    m = c.match(/^reg add "(.+?)" \/v "(.+?)" \/t (\S+) \/d "(.+?)" \/f$/)
    if (m) { reg[m[1] + '|' + m[2]] = { type: m[3], value: m[4] }; return { ok: true, out: '' } }
    return { ok: true, out: '' }
  }
  return { reg, runCmd }
}

test('cmd wrapper records real before/after and drops no-ops', async () => {
  const { runCmd } = fakeSystem()
  const rec = createRecorder({ runPS: async () => ({ ok: true, out: '' }), runCmd })
  await rec.regAdd('HKLM', 'S\\K', 'V', 'REG_DWORD', '1')
  await rec.regAdd('HKLM', 'S\\K', 'V', 'REG_DWORD', '1')   // second write changes nothing
  await rec.regAdd('HKLM', 'S\\K', 'New', 'REG_DWORD', '5')
  const { changes, noops } = rec.finish()
  assert.strictEqual(noops, 1)
  assert.strictEqual(changes.length, 2)
  assert.deepStrictEqual(changes[0].before, { exists: true, type: 'REG_DWORD', value: '0' })
  assert.deepStrictEqual(changes[0].after.value, '1')
  assert.strictEqual(changes[1].before.exists, false)
})

test('ps wrapper strips ##JJ lines, keeps output, notes unfollowable commands', async () => {
  const runPS = async (script) => ({ ok: true, err: '', out: 'visible\n##JJ{"k":"reg","p":"HKCU:\\\\X","n":"A","b":{"e":false},"a":{"e":true,"t":"DWord","v":1}}\n' })
  const rec = createRecorder({ runPS, runCmd: async () => ({ ok: true, out: '' }) })
  const r = await rec.ps('Set-ItemProperty -Path x -Name A -Value 1\nnetsh int tcp set global rss=enabled')
  assert.strictEqual(r.out.trim(), 'visible')
  const { changes } = rec.finish()
  assert.deepStrictEqual(changes.map(c => c.kind), ['reg', 'unresolved'])
})

test('ps wrapper falls back when a proxy cannot bind parameters', async () => {
  let calls = 0
  const runPS = async (script) => { calls++; return calls === 1 ? { ok: false, out: '', err: 'A parameter cannot be found that matches parameter name' } : { ok: true, out: 'done', err: '' } }
  const rec = createRecorder({ runPS, runCmd: async () => ({ ok: true, out: '' }) })
  const r = await rec.ps('Set-ItemProperty -Foo')
  assert.strictEqual(r.out, 'done')
  assert.ok(rec.finish().changes.some(c => c.kind === 'unresolved'))
})
