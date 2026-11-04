'use strict'
// Engine-side pieces of the BIOS workstation: normalised model, HP reader parsing, Doctor, bring-your-own SCEWIN import, categories.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const model = require('../lib/bios/model')
const hp = require('../lib/bios/hp-wmi')
const doctor = require('../lib/bios/doctor')
const inst = require('../lib/bios/scewin-install')
const fmt = require('../lib/bios/scewin-format')
const cat = require('../js/bios/category')

test('HP rows normalise, keep read-only flags and are classified', () => {
  const rows = [
    { cls: 'HP_BIOSEnumeration', Name: 'Turbo Boost', CurrentValue: 'Enable', PossibleValues: ['Enable', 'Disable'], Path: 'Advanced/System Options', IsReadOnly: false },
    { cls: 'HP_BIOSEnumeration', Name: 'Locked thing', CurrentValue: 'Enable', PossibleValues: ['Enable'], IsReadOnly: true },
    { cls: 'HP_BIOSInteger', Name: 'Mystery level', CurrentValue: 5, LowerBound: 0, UpperBound: 9 },
    { cls: 'HP_BIOSString', Name: 'Asset Tag', Value: 'abc' },
  ]
  const s = model.fromHp(rows)
  assert.equal(s.length, 4)
  assert.equal(s[0].key, 'hp-wmi:Turbo Boost'); assert.deepEqual(s[0].path, ['Advanced', 'System Options']); assert.equal(s[0].tier, 'moderate')
  assert.equal(s[1].tier, 'readonly')
  assert.equal(s[2].kind, 'number'); assert.equal(s[2].tier, 'critical'); assert.equal(s[2].current, '5')
  assert.equal(s[3].kind, 'string'); assert.equal(s[3].tier, 'readonly')
})

test('HP reader output: success, access denied, not HP, garbage', () => {
  assert.equal(hp.parseRead('{"ok":true,"rows":{"Name":"x"}}').rows.length, 1)
  assert.equal(hp.parseRead('{"ok":false,"error":"Access denied "}').error, 'access_denied')
  assert.equal(hp.parseRead('{"ok":false,"error":"Invalid namespace"}').error, 'not_hp')
  assert.equal(hp.parseRead('nonsense').ok, false)
})

test('SCEWIN settings keep raw ids and never claim to be writable when read-only', () => {
  const dump = fs.readFileSync(path.join(__dirname, 'fixtures', 'bios', 'amisce-basic.txt'), 'utf8')
  const s = model.fromScewin(fmt.parse(dump))
  const pw = s.find(x => x.name === 'Supervisor Password')
  assert.equal(pw.tier, 'readonly')
  assert.deepEqual(s.find(x => x.name === 'Hot-Plug Support').raw, { token: '702A', offset: '04', width: '01' })
})

test('Doctor names the right conditions', () => {
  const ids = f => f.map(x => x.id)
  assert.ok(ids(doctor.diagnose({ vendor: 'American Megatrends Inc.', elevated: true, uefi: true, scewin: { state: 'missing' } })).includes('scewin_missing'))
  assert.ok(ids(doctor.diagnose({ vendor: 'American Megatrends Inc.', elevated: true, uefi: true, hvci: true, scewin: { state: 'ok' } })).includes('driver_may_be_blocked'))
  assert.ok(ids(doctor.diagnose({ vendor: 'HP', elevated: false, uefi: true, hpWmi: 'denied' })).includes('not_elevated'))
  assert.ok(ids(doctor.diagnose({ vendor: 'Dell Inc.', elevated: true, uefi: true })).includes('vendor_unsupported'))
  assert.ok(ids(doctor.diagnose({ vendor: 'x', elevated: true, uefi: false })).includes('legacy_bios'))
  assert.equal(doctor.matchScewinError('LoadDeviceDriver returned false'), 'driver_load')
  assert.equal(doctor.matchScewinError('Error in writing variable to NVRAM'), 'write_protected')
  assert.equal(doctor.matchScewinError('WARNING: HII data does not have setup questions information'), 'hii_missing')
  assert.equal(doctor.matchScewinError('all fine'), null)
})

test('SCEWIN import: needs all three files, records hashes, detects tampering', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jbios-'))
  const src = path.join(tmp, 'src'), dest = path.join(tmp, 'dest')
  fs.mkdirSync(src)
  fs.writeFileSync(path.join(src, 'SCEWIN_64.exe'), 'exe')
  assert.deepEqual(inst.inspect(src).missing.sort(), ['amifldrv64.sys', 'amigendrv64.sys'])
  assert.equal((await inst.install(src, dest)).error, 'files_missing')
  assert.equal(inst.verify(dest).state, 'missing')
  fs.writeFileSync(path.join(src, 'AMIFLDRV64.SYS'), 'a')   // case-insensitive
  fs.writeFileSync(path.join(src, 'amigendrv64.sys'), 'b')
  const r = await inst.install(src, dest, { signer: 'CN=Test' })
  assert.equal(r.ok, true)
  assert.equal(inst.verify(dest).state, 'ok')
  fs.writeFileSync(path.join(dest, 'SCEWIN_64.exe'), 'evil')
  assert.deepEqual(inst.verify(dest), { state: 'tampered', file: 'SCEWIN_64.exe' })
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('categories: purpose grouping, security first', () => {
  const c = n => cat.categoryOf({ name: n, path: [] })
  assert.equal(c('Secure Boot'), 'security'); assert.equal(c('XMP Profile'), 'memory'); assert.equal(c('Above 4G Decoding'), 'pcie')
  assert.equal(c('Global C-state Control'), 'cpu'); assert.equal(c('SATA Mode'), 'storage'); assert.equal(c('Fast Boot'), 'boot'); assert.equal(c('Zzz'), 'other')
})
