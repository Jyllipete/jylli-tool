'use strict'
// SCEWIN dump parser/patcher and safety policy. Fixtures are SYNTHETIC, written in the public dump shape; not yet checked against a real board.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const fmt = require('../lib/bios/scewin-format')
const policy = require('../lib/bios/policy')

const fx = n => fs.readFileSync(path.join(__dirname, 'fixtures', 'bios', n), 'utf8')
const CRLF = fx('amisce-basic.txt'), LF = fx('amisce-basic-lf.txt')
const byName = (p, n) => p.settings.find(s => s.name === n)

test('parses header, menu path and every record kind', () => {
  const p = fmt.parse(CRLF)
  assert.equal(p.header.crc, 'EBED1D4C')
  assert.equal(p.header.version, '5.03.1111')
  assert.equal(p.settings.length, 5)
  const a = byName(p, 'Above 4G Decoding')
  assert.equal(a.id, '7006:03:01'); assert.equal(a.kind, 'choice'); assert.equal(a.current, '0')
  assert.deepEqual(a.path, ['Advanced', 'PCI Subsystem'])
  assert.deepEqual(a.options.map(o => o.label), ['Enabled', 'Disabled'])
  const h = byName(p, 'Hot-Plug Support')
  assert.equal(h.kind, 'option'); assert.equal(h.current, '00')
  const c = byName(p, 'Global C-state Control')
  assert.equal(c.current, '0F'); assert.equal(c.options.length, 3)
  const v = byName(p, 'CPU Core Voltage Offset')
  assert.equal(v.kind, 'number'); assert.equal(v.current, '18')
})

test('CRLF and LF parse identically', () => {
  const strip = p => p.settings.map(s => [s.id, s.kind, s.current])
  assert.deepEqual(strip(fmt.parse(CRLF)), strip(fmt.parse(LF)))
})

test('patch changes only the record lines and keeps every other byte', () => {
  for (const src of [CRLF, LF]) {
    const out = fmt.patch(src, [{ id: '702A:04:01', value: '01' }, { id: '7006:03:01', value: '1' }])
    const a = src.split(/(?<=\n)/), b = out.split(/(?<=\n)/)
    assert.equal(a.length, b.length)
    const diff = a.map((l, i) => (l === b[i] ? null : i)).filter(i => i !== null)
    assert.equal(diff.length, 3)            // Value line + two option lines
    const p = fmt.parse(out)
    assert.equal(byName(p, 'Hot-Plug Support').current, '01')
    assert.equal(byName(p, 'Above 4G Decoding').current, '1')
    assert.equal(byName(p, 'Global C-state Control').current, '0F')
  }
})

test('patching to the current value is a byte-identical no-op; patch is reversible', () => {
  assert.equal(fmt.patch(CRLF, [{ id: '7010:10:01', value: '0F' }]), CRLF)
  const there = fmt.patch(CRLF, [{ id: '7010:10:01', value: '00' }])
  assert.notEqual(there, CRLF)
  assert.equal(fmt.patch(there, [{ id: '7010:10:01', value: '0F' }]), CRLF)
})

test('numeric angle style is preserved', () => {
  const out = fmt.patch(CRLF, [{ id: '7020:20:02', value: '1A' }])
  assert.match(out, /Value\t=<1A>/)
})

test('patch rejects unknown ids, invalid values and duplicates', () => {
  assert.throws(() => fmt.patch(CRLF, [{ id: 'nope', value: '1' }]), /unknown/)
  assert.throws(() => fmt.patch(CRLF, [{ id: '702A:04:01', value: '07' }]), /invalid/)
  assert.throws(() => fmt.patch(CRLF, [{ id: '7020:20:02', value: 'ZZ' }]), /invalid/)
  assert.throws(() => fmt.patch(CRLF, [{ id: '7006:03:01', value: '1' }, { id: '7006:03:01', value: '0' }]), /duplicate/)
})

test('duplicate ids are ambiguous and never writable', () => {
  const block = 'Setup Question\t= Above 4G Decoding\r\nToken\t=7006\r\nOffset\t=03\r\nWidth\t=01\r\nValue\t=0\t// Enabled = 1, Disabled = 0\r\n'
  const dup = CRLF + '\r\n' + block
  const p = fmt.parse(dup)
  const same = p.settings.filter(s => s.id === '7006:03:01')
  assert.equal(same.length, 2)
  assert.ok(same.every(s => s.ambiguous))
  assert.throws(() => fmt.patch(dup, [{ id: '7006:03:01', value: '1' }]), /invalid/)
})

test('records in an unknown shape are unsupported, not guessed', () => {
  const odd = 'Setup Question\t= Weird\r\nToken\t=1\r\nOffset\t=00\r\nWidth\t=01\r\nSomething\t=else\r\n'
  const s = fmt.parse(odd).settings[0]
  assert.equal(s.kind, 'unsupported')
  assert.equal(policy.classify(s).tier, 'readonly')
})

test('policy tiers', () => {
  const p = fmt.parse(CRLF)
  const t = n => policy.classify(byName(p, n)).tier
  assert.equal(t('Supervisor Password'), 'readonly')
  assert.equal(t('CPU Core Voltage Offset'), 'critical')
  assert.equal(t('Global C-state Control'), 'moderate')
  assert.equal(t('Hot-Plug Support'), 'normal')
  assert.equal(policy.classify({ name: 'Mystery 7', kind: 'number' }).tier, 'critical')
  assert.equal(policy.classify({ name: 'Mystery 7', kind: 'option' }).tier, 'moderate')
  assert.equal(policy.classify({ name: 'Secure Boot Key Management', kind: 'option' }).tier, 'readonly')
  assert.equal(policy.classify({ name: 'Boot Guard', kind: 'option' }).tier, 'readonly')
})

test('assess: read-only never writable; unverified engines are locked', () => {
  const p = fmt.parse(CRLF)
  assert.equal(policy.assess(byName(p, 'Supervisor Password'), '1').ok, false)
  const locked = policy.assess(byName(p, 'Hot-Plug Support'), '01', { engine: 'scewin' })
  assert.equal(locked.ok, false); assert.equal(locked.why, 'engine_locked')
  assert.equal(policy.assess(byName(p, 'CPU Core Voltage Offset'), '1A').confirm, 'typed')
  assert.equal(policy.writesAllowed('scewin', {}), false)
  assert.equal(policy.writesAllowed('scewin', { JYLLI_BIOS_UNLOCK: 'scewin' }), true)
})

test('only engines proven on real hardware are writable by default', () => {
  assert.equal(policy.writesAllowed('hp-wmi', {}), true)   // verified on an HP ProBook 440 G8
  for (const e of ['scewin', 'native', 'lenovo-wmi', 'dell-wmi']) assert.equal(policy.writesAllowed(e, {}), false)
})
