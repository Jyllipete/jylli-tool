'use strict'
// Easy mode advisor: facts + settings -> suggestions and presets. Synthetic PCs only.
const test = require('node:test')
const assert = require('node:assert/strict')
const { advise } = require('../lib/bios/advisor')
const model = require('../lib/bios/model')

const opt = (name, cur, list, extra = {}) => model.decorate({ engine: 'scewin', id: name, name, kind: 'option', policyKind: 'option', current: cur, path: [], options: list.map(v => ({ value: v, label: v })), ...extra })
const num = name => model.decorate({ engine: 'scewin', id: name, name, kind: 'number', policyKind: 'number', current: '0', path: [], options: [] })
const amd = { name: 'AMD Ryzen 7 5800X', vendor: 'amd', family: 'zen3', mobile: false }
const rtx = { name: 'NVIDIA GeForce RTX 4070', vendor: 'nvidia', arch: 'rtx40', discrete: true }
const base = (o = {}) => ({ caps: { form: 'desktop', cpu: amd, gpu: rtx, anyDiscrete: true, rebar: true, bios: { date: '2025-05-01' }, ...o.caps }, ram: { xmp: 'on', type: 'DDR4', xmpConfiguredMT: 3200, xmpRatedMT: 3200, ...o.ram }, info: { board: 'ASUSTeK ROG STRIX B550-F', uefi: true, ...o.info }, settings: o.settings === undefined ? null : o.settings, writable: o.writable !== false, now: Date.parse('2026-11-04') })
const ids = r => r.suggestions.map(s => `${s.id}:${s.status}`)
const preset = (r, id) => r.presets.find(p => p.id === id)

test('unknown facts produce no suggestions', () => {
  const r = advise({ caps: {}, ram: {}, info: {}, settings: null, writable: false })
  assert.deepEqual(r.suggestions, [])
  assert.ok(r.presets.every(p => p.state === 'none'))
})

test('RAM below rated speed: do this, manual steps without settings, and a branded location', () => {
  const r = advise(base({ ram: { xmp: 'off', xmpConfiguredMT: 2133, xmpRatedMT: 3200 } }))
  const s = r.suggestions[0]
  assert.equal(s.id, 'memory-profile'); assert.equal(s.status, 'do'); assert.deepEqual(s.changes, [])
  assert.equal(s.manual.steps, 'memory-profile'); assert.equal(s.vars.where, 'Ai Tweaker')
  assert.equal(preset(r, 'best').state, 'unknown')
})

test('RAM below rated speed with the setting readable: one change, applies through the engine', () => {
  const r = advise(base({ ram: { xmp: 'off', xmpConfiguredMT: 2133, xmpRatedMT: 3200 }, settings: [opt('XMP Profile', 'Disabled', ['Disabled', 'Profile 1', 'Profile 2'])] }))
  const c = r.suggestions[0].changes
  assert.equal(c.length, 1); assert.equal(c[0].toLabel, 'Profile 1')
  assert.equal(preset(r, 'best').state, 'available'); assert.equal(preset(r, 'best').count, 1)
  assert.equal(advise({ ...base({ ram: { xmp: 'off', xmpConfiguredMT: 2133, xmpRatedMT: 3200 }, settings: [opt('XMP Profile', 'Disabled', ['Disabled', 'Profile 1'])] }), writable: false }).presets[0].state, 'manual')
})

test('profile already set but RAM still slow: check, never "do"', () => {
  const r = advise(base({ ram: { xmp: 'off', xmpConfiguredMT: 2133, xmpRatedMT: 3200 }, settings: [opt('XMP Profile', 'Profile 1', ['Disabled', 'Profile 1'])] }))
  assert.equal(r.suggestions[0].id, 'memory-profile'); assert.equal(r.suggestions[0].status, 'check'); assert.equal(r.suggestions[0].reason, 'set-not-effective')
})

test('early AM5 BIOS: update first, no EXPO change offered', () => {
  const r = advise(base({ caps: { cpu: { name: 'AMD Ryzen 7 7800X3D', vendor: 'amd', family: 'zen4', mobile: false }, bios: { date: '2023-02-10' } }, ram: { xmp: 'off', type: 'DDR5', xmpConfiguredMT: 4800, xmpRatedMT: 6000 }, settings: [opt('EXPO', 'Disabled', ['Disabled', 'EXPO I'])] }))
  assert.equal(r.suggestions[0].id, 'memory-profile'); assert.equal(r.suggestions[0].status, 'check')
  assert.equal(r.suggestions[0].reason, 'early-am5'); assert.deepEqual(r.suggestions[0].changes, [])
})

test('ReBAR off on RTX 40: CSM, Above 4G and ReBAR as one linked change', () => {
  const settings = [opt('CSM Support', 'Enabled', ['Disabled', 'Enabled']), opt('Above 4G Decoding', 'Disabled', ['Disabled', 'Enabled']), opt('Resizable BAR', 'Disabled', ['Disabled', 'Enabled'])]
  const r = advise(base({ caps: { rebar: false }, settings }))
  const s = r.suggestions.find(x => x.id === 'rebar')
  assert.equal(s.status, 'do'); assert.deepEqual(s.changes.map(c => c.name), ['CSM Support', 'Above 4G Decoding', 'Resizable BAR'])
  assert.deepEqual(s.changes.map(c => c.toLabel), ['Disabled', 'Enabled', 'Enabled'])
})

test('ReBAR chain incomplete or boot mode wrong: manual or check, never a partial change', () => {
  const half = advise(base({ caps: { rebar: false }, settings: [opt('Resizable BAR', 'Disabled', ['Disabled', 'Enabled'])] }))
  assert.deepEqual(half.suggestions.find(x => x.id === 'rebar').changes, [])
  assert.equal(half.suggestions.find(x => x.id === 'rebar').manual.steps, 'rebar')
  const legacy = advise(base({ caps: { rebar: false }, info: { uefi: false } }))
  assert.equal(legacy.suggestions.find(x => x.id === 'rebar').status, 'check')
  assert.equal(advise(base({ caps: { rebar: true } })).suggestions.find(x => x.id === 'rebar').status, 'good')
})

test('older GPUs and unknown ReBAR state get no ReBAR suggestion', () => {
  assert.ok(!advise(base({ caps: { rebar: false, gpu: { name: 'GTX 1660', vendor: 'nvidia', arch: 'gtx16', discrete: true } } })).suggestions.some(s => s.id === 'rebar'))
  assert.ok(!advise(base({ caps: { rebar: null } })).suggestions.some(s => s.id === 'rebar'))
})

test('C-states are never suggested off; disabled ones get a put-back, outside every preset', () => {
  assert.ok(!advise(base({ settings: [opt('Global C-state Control', 'Auto', ['Disabled', 'Enabled', 'Auto'])] })).suggestions.some(s => s.id === 'cstates'))
  const r = advise(base({ settings: [opt('Global C-state Control', 'Disabled', ['Disabled', 'Enabled', 'Auto'])] }))
  const s = r.suggestions.find(x => x.id === 'cstates')
  assert.equal(s.status, 'leave'); assert.equal(s.changes[0].toLabel, 'Auto')
  assert.ok(r.presets.every(p => p.count === 0))
})

test('boost off is a suggestion; hyper-threading off is offered but never inside a preset', () => {
  const r = advise(base({ settings: [opt('Core Performance Boost', 'Disabled', ['Disabled', 'Auto']), opt('SMT Control', 'Disabled', ['Disabled', 'Auto'])] }))
  assert.ok(ids(r).includes('boost:do')); assert.ok(ids(r).includes('smt:do'))
  assert.deepEqual(preset(r, 'best').changes.map(c => c.name), ['Core Performance Boost'])
})

test('ambiguous names or options never produce a change', () => {
  const two = advise(base({ settings: [opt('Turbo Boost', 'Disabled', ['Disabled', 'Enabled']), opt('Turbo Mode', 'Disabled', ['Disabled', 'Enabled'])] }))
  assert.ok(!two.suggestions.some(s => s.changes.length))
  const vague = advise(base({ settings: [opt('Turbo Boost', 'Disabled', ['Disabled', 'Fast', 'Faster'])] }))
  assert.deepEqual(vague.suggestions.find(s => s.id === 'boost').changes, [])
})

test('Raptor Lake on old microcode: check; new microcode: nothing', () => {
  const cpu = { name: 'Intel Core i9-13900K', vendor: 'intel', raptorLakeDesktop: true, microcode: 0x125 }
  assert.ok(ids(advise(base({ caps: { cpu } }))).includes('raptor:check'))
  assert.ok(!ids(advise(base({ caps: { cpu: { ...cpu, microcode: 0x12F } } }))).includes('raptor:check'))
})

test('laptop: quiet preset from fan setting; switchable graphics only in gaming', () => {
  const settings = [opt('Fan Always On', 'Enable', ['Enable', 'Disable']), opt('Graphics Mode', 'Hybrid', ['Hybrid', 'Discrete'])]
  const r = advise(base({ caps: { form: 'laptop', hybridGraphics: true }, settings }))
  assert.deepEqual(preset(r, 'quiet').changes.map(c => c.name), ['Fan Always On'])
  assert.deepEqual(preset(r, 'gaming').changes.map(c => c.name), ['Graphics Mode'])
  assert.deepEqual(preset(r, 'best').changes, [])
})

test('SAFETY: no preset or suggestion ever changes a critical or read-only setting', () => {
  const nasty = ['CPU Core Voltage', 'Overclock Mode', 'DRAM Frequency', 'tCL Timing', 'Supervisor Password', 'Secure Boot Key Management', 'XMP Profile Voltage', 'Turbo Ratio Limit', 'Fan Always On Voltage'].map(n => opt(n, 'Disabled', ['Disabled', 'Enabled', 'Auto']))
  const settings = [...nasty, num('Turbo Boost'), opt('Core Performance Boost', 'Disabled', ['Disabled', 'Auto'])]
  const r = advise(base({ caps: { form: 'laptop' }, ram: { xmp: 'off', xmpConfiguredMT: 2133, xmpRatedMT: 3200 }, settings }))
  for (const s of r.suggestions) for (const c of s.changes) assert.ok(['normal', 'moderate'].includes(c.tier), c.name)
  for (const p of r.presets) for (const c of p.changes) assert.ok(['normal', 'moderate'].includes(c.tier), c.name)
  assert.ok(!r.presets.flatMap(p => p.changes).some(c => /voltage|frequency|timing|ratio|password|key/i.test(c.name)))
})

test('old BIOS and unprotected anti-cheat are things only the user can fix', () => {
  const r = advise(base({ caps: { bios: { date: '2019-01-01' }, sec: { secureBoot: false }, host: { antiCheat: ['Vanguard'] } } }))
  assert.ok(ids(r).includes('biosage:check')); assert.ok(ids(r).includes('secureboot:check'))
  assert.ok(r.suggestions.filter(s => s.status === 'check').every(s => s.changes.length === 0))
})

// ── Settings that matter (cards) and the firmware checks ──
const cardOf = (r, id) => r.cards.find(c => c.id === id)

test('cards: a grouped family reads Mixed, is read-only, and never recommends Off', () => {
  const r = advise(base({ settings: [opt('Native ASPM', 'Enabled', ['Disabled', 'Enabled']), opt('DMI ASPM', 'Disabled', ['Disabled', 'Enabled']), opt('PEG0 ASPM', 'Enabled', ['Disabled', 'Enabled'])] }))
  const c = cardOf(r, 'aspm')
  assert.equal(c.state, 'mixed'); assert.equal(c.count, 3); assert.equal(c.offCount, 1)
  assert.equal(c.group, true); assert.deepEqual(c.options, []); assert.equal(c.rec, null); assert.equal(c.differs, false)
})

test('cards: no idle-power or spread-spectrum card ever carries a recommendation', () => {
  const r = advise(base({ settings: [opt('Intel C-State', 'Enabled', ['Disabled', 'Enabled']), opt('C1E Support', 'Enabled', ['Disabled', 'Enabled']), opt('EIST', 'Enabled', ['Disabled', 'Enabled']), opt('FIVR Spread Spectrum', 'Enabled', ['Disabled', 'Enabled']), opt('LTR Mechanism Enable', 'Enabled', ['Disabled', 'Enabled'])] }))
  for (const id of ['cstates', 'c1e', 'eist', 'spread', 'ltr']) { const c = cardOf(r, id); assert.ok(c, id); assert.equal(c.rec, null, id); assert.equal(c.differs, false, id) }
})

test('cards: Secure Boot and TPM are shown but never get controls', () => {
  const r = advise(base({ settings: [opt('Secure Boot', 'Enabled', ['Disabled', 'Enabled']), opt('Security Device Support', 'Enabled', ['Disabled', 'Enabled']), opt('TPM State', 'Enabled', ['Disabled', 'Enabled'])] }))
  assert.equal(cardOf(r, 'secureboot').readonly, true); assert.deepEqual(cardOf(r, 'secureboot').options, [])
  assert.equal(cardOf(r, 'tpm').readonly, true); assert.deepEqual(cardOf(r, 'tpm').options, [])
  assert.equal(r.cards.filter(c => c.id === 'tpm').length, 1)   // "TPM State" is not a second card
})

test('cards: a single toggle gets a ready change, and differs only where evidence backs a recommendation', () => {
  const r = advise(base({ settings: [opt('Resizable BAR', 'Disabled', ['Disabled', 'Enabled']), opt('Hyper-Threading', 'Disabled', ['Disabled', 'Enabled'])] }))
  const rb = cardOf(r, 'rebar')
  assert.equal(rb.state, 'off'); assert.equal(rb.rec, 'on'); assert.equal(rb.differs, true); assert.equal(rb.writable, true)
  assert.equal(rb.options.find(o => o.label === 'Enabled').change.toLabel, 'Enabled')
  assert.equal(cardOf(r, 'smt').differs, false)      // no recommendation, so never "differs"
})

test('cards: nothing without readable settings, and read-only/critical settings get no controls', () => {
  assert.deepEqual(advise(base()).cards, [])
  const r = advise(base({ settings: [opt('DRAM Voltage', 'Auto', ['Auto', '1.35'])] }))
  assert.equal(r.cards.length, 0)
})

test('virtualization off while WSL/Hyper-V is installed: a check, never in a preset', () => {
  const r = advise(base({ caps: { sec: { wsl: true } }, info: { virtFw: false } }))
  const s = r.suggestions.find(x => x.id === 'virt-needed')
  assert.equal(s.status, 'check'); assert.equal(s.vars.names, 'WSL'); assert.deepEqual(s.presets, []); assert.equal(s.manual.steps, 'virt-needed')
  assert.equal(advise(base({ caps: { sec: { wsl: false } }, info: { virtFw: false } })).suggestions.some(x => x.id === 'virt-needed'), false)
  assert.equal(advise(base({ caps: { sec: { wsl: true } }, info: { virtFw: true } })).suggestions.some(x => x.id === 'virt-needed'), false)
})

test('TPM missing with anti-cheat on Windows 11: a check; unknown TPM says nothing', () => {
  const caps = { os: { win11: true }, host: { antiCheat: ['Vanguard'] } }
  assert.equal(advise(base({ caps, info: { tpm: { present: false, ready: false } } })).suggestions.find(x => x.id === 'tpm-anticheat').status, 'check')
  assert.equal(advise(base({ caps, info: { tpm: null } })).suggestions.some(x => x.id === 'tpm-anticheat'), false)
  assert.equal(advise(base({ caps, info: { tpm: { present: true, ready: true } } })).suggestions.some(x => x.id === 'tpm-anticheat'), false)
})

test('firmware block only reports what Windows told us', () => {
  assert.deepEqual(Object.values(advise({ caps: {}, ram: {}, info: {}, settings: null, writable: false }).firmware).filter(v => v != null), [])
  const f = advise(base({ caps: { sec: { secureBoot: true, hypervisorPresent: false } }, info: { virtFw: true, tpm: { present: true, ready: true } } })).firmware
  assert.equal(f.uefi, true); assert.equal(f.secureBoot, true); assert.equal(f.tpm, 'ready'); assert.equal(f.virt, true); assert.equal(f.rebar, true); assert.equal(f.hypervisor, false)
})
