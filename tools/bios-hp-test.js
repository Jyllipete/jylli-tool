'use strict'
// Hardware test for the HP BIOS write path, using the real lib/bios code. Run from an ADMINISTRATOR terminal:
//   node tools/bios-hp-test.js                      read everything, list safe candidates (changes nothing)
//   node tools/bios-hp-test.js flip "<setting>"     write the other value, read back, then write the original back and read back
// Add --keep to flip to skip the revert (then restart and run again with "check" to see whether it stuck).
//   node tools/bios-hp-test.js check "<setting>"    print the current value of one setting
const { execFileSync } = require('child_process')
const fs = require('fs'), os = require('os'), path = require('path')
process.env.JYLLI_BIOS_UNLOCK = 'hp-wmi'
const hp = require('../lib/bios/hp-wmi'), model = require('../lib/bios/model'), tx = require('../lib/bios/transaction'), snaps = require('../lib/bios/snapshots'), policy = require('../lib/bios/policy')

const ps = script => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { encoding: 'utf8', timeout: 90000 })
const engine = {
  id: 'hp-wmi',
  async read() { const r = hp.parseRead(ps(hp.READ_SCRIPT)); if (!r.ok) throw new Error('read failed: ' + r.error + (r.detail ? ' (' + r.detail + ')' : '')); return model.fromHp(r.rows) },
  async write(ch) { return hp.parseWrite(ps(hp.writeScript(ch)), ch.length) },
}
const out = []
const say = m => { console.log(m); out.push(m) }

;(async () => {
  const [mode = 'read', name] = process.argv.slice(2).filter(a => !a.startsWith('--'))
  const keep = process.argv.includes('--keep')
  const all = await engine.read()
  say(`settings read: ${all.length}; tiers: ` + ['normal', 'moderate', 'critical', 'readonly'].map(t => `${t}=${all.filter(s => s.tier === t).length}`).join(' '))
  if (mode === 'read') {
    const cand = all.filter(s => s.tier === 'normal' && s.kind === 'option' && s.options.length === 2)
    say(`\nsafe two-value candidates (${cand.length}):`)
    for (const s of cand.slice(0, 25)) say(`  ${s.name}  =  ${s.current}   [${s.options.map(o => o.value).join(' | ')}]`)
  } else {
    const s = all.find(x => x.name === name)
    if (!s) { say('no such setting: ' + name); process.exit(1) }
    if (mode === 'check') { say(`${s.name} = ${s.current} (tier ${s.tier})`); return }
    if (mode === 'flip') {
      if (s.tier === 'readonly' || s.kind !== 'option') { say('refusing: not a plain option'); process.exit(1) }
      const other = s.options.map(o => o.value).find(v => v !== s.current)
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jbios-hwtest-'))
      const ctx = { typed: false, onBattery: false, store: snaps.create(dir), allowed: e => policy.writesAllowed(e), reason: 'hardware test' }
      say(`\n1) ${s.name}: ${s.current} -> ${other}`)
      const r = await tx.run(engine, [{ id: s.id, value: other }], ctx)
      say('   result: ' + JSON.stringify(r))
      if (!r.ok) process.exit(2)
      if (keep) { say('\n--keep: left changed. Restart, then run:  node tools/bios-hp-test.js check "' + s.name + '"  (expected ' + other + ')'); return }
      say(`2) revert: ${other} -> ${s.current}`)
      const b = await tx.run(engine, [{ id: s.id, value: s.current }], ctx)
      say('   result: ' + JSON.stringify(b))
      if (!b.ok) { say('REVERT FAILED. Set ' + s.name + ' back to ' + s.current + ' in the BIOS setup screen.'); process.exit(3) }
      say('\nround trip OK: written, read back, reverted, read back.')
    }
  }
})().catch(e => { say('ERROR: ' + e.message); process.exit(1) }).finally(() => { try { fs.writeFileSync(process.env.BIOS_TEST_LOG || path.join(os.tmpdir(), 'bios-hp-test.log'), out.join('\n')) } catch {} })
