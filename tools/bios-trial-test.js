'use strict'
// Hardware test for the boot trial (HP). Run from an ADMINISTRATOR terminal:  node tools/bios-trial-test.js "<setting>"
// Changes the setting to its other value, arms a trial, registers/removes the real startup task, then runs the REAL startup script
// with a forced crash count so the revert fires. The restart the script schedules is cancelled with `shutdown /a` (pass --reboot to keep it).
const { execFileSync, spawnSync } = require('child_process')
const fs = require('fs'), os = require('os'), path = require('path')
process.env.JYLLI_BIOS_UNLOCK = 'hp-wmi'
const hp = require('../lib/bios/hp-wmi'), model = require('../lib/bios/model'), tx = require('../lib/bios/transaction'), snaps = require('../lib/bios/snapshots'), policy = require('../lib/bios/policy'), bt = require('../lib/bios/boot-trial')

const ps = script => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { encoding: 'utf8', timeout: 90000 })
const engine = {
  id: 'hp-wmi',
  async read() { const r = hp.parseRead(ps(hp.READ_SCRIPT)); if (!r.ok) throw new Error('read failed: ' + r.error); return model.fromHp(r.rows) },
  async write(ch) { return hp.parseWrite(ps(hp.writeScript(ch)), ch.length) },
}
const out = []
const say = m => { console.log(m); out.push(m) }
const cur = async name => (await engine.read()).find(s => s.name === name)

;(async () => {
  const name = process.argv[2]
  const keepReboot = process.argv.includes('--reboot')
  const s0 = await cur(name)
  if (!s0 || s0.tier === 'readonly' || s0.kind !== 'option') throw new Error('not a plain option: ' + name)
  const original = s0.current, other = s0.options.map(o => o.value).find(v => v !== original)
  say(`setting "${name}" starts as ${original}`)

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jbios-trialhw-'))
  const ctx = { typed: false, onBattery: false, store: snaps.create(path.join(dir, 'snaps')), allowed: e => policy.writesAllowed(e), reason: 'trial test' }
  const r = await tx.run(engine, [{ id: s0.id, value: other }], ctx)
  say(`1) change to ${other}: ${r.ok ? 'ok' : JSON.stringify(r)}`)
  if (!r.ok) process.exit(2)

  const a = bt.arm(dir, { engine: 'hp-wmi', snapshotId: r.snapshotId, restore: r.restore })
  say(`2) arm: ${a.ok}; restore list: ${JSON.stringify(a.state.restore)}`)

  const created = spawnSync('schtasks.exe', bt.createArgs(dir), { encoding: 'utf8' })
  const queried = spawnSync('schtasks.exe', ['/Query', '/TN', bt.TASK], { encoding: 'utf8' })
  spawnSync('schtasks.exe', bt.deleteArgs(), { encoding: 'utf8' })
  const gone = spawnSync('schtasks.exe', ['/Query', '/TN', bt.TASK], { encoding: 'utf8' })
  say(`3) task: create exit ${created.status}, visible ${queried.status === 0}, removed ${gone.status !== 0}`)

  say('4) running the real startup script with a forced crash count of 2')
  const run = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', bt.paths(dir).script, '-StateDir', dir, '-CrashOverride', '2'], { encoding: 'utf8', timeout: 120000 })
  say(`   script exit ${run.status} ${(run.stderr || '').trim()}`)
  const st = bt.read(dir) || { status: "unreadable" }
  say(`   state now: ${st.status}`)
  say(`   log: ${fs.readFileSync(path.join(dir, 'trial.log'), 'utf8').trim().split('\n').pop()}`)
  const after = await cur(name)
  say(`5) "${name}" is now ${after.current} (expected ${original})`)
  if (!keepReboot) { const c = spawnSync('shutdown.exe', ['/a'], { encoding: 'utf8' }); say(`6) scheduled restart cancelled: ${c.status === 0 ? 'yes (one was pending)' : 'none was pending: ' + (c.stderr || c.stdout || '').trim()}`) }
  say(st.status === 'reverted' && after.current === original ? '\nPASS' : '\nFAIL')
})().catch(e => say('ERROR: ' + e.message)).finally(() => { try { fs.writeFileSync(process.env.BIOS_TEST_LOG || path.join(os.tmpdir(), 'bios-trial-test.log'), out.join('\n')) } catch {} })
