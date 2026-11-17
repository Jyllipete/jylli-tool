'use strict'
// Runs the real Restore points probe (lib/restore/detect.js) on THIS PC and prints what Windows said next to what the parser made of it.
// Read-only. Run it from an ELEVATED terminal: `node tools/restore-probe.js`. Without admin Windows will not list restore points (pointsRead:false).
// Use it to check the two unverified facts in docs/RESTORE_EVIDENCE.md: the -LastStatus wording and whether RPSessionInterval agrees with the real shadow storage.
const { spawnSync } = require('child_process')
const fs = require('fs'), os = require('os'), path = require('path')
const detect = require('../lib/restore/detect')

const f = path.join(os.tmpdir(), 'jt-restore-probe.ps1')
fs.writeFileSync(f, detect.buildScript())
const r = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', f], { encoding: 'utf8', timeout: 120000 })
try { fs.unlinkSync(f) } catch { /* temp file */ }
const out = String(r.stdout || '')
const i = out.lastIndexOf('JJRP:')
if (i < 0) { console.log('The probe printed no JJRP: line.\n' + out.slice(0, 400) + String(r.stderr || '').slice(0, 400)); process.exit(1) }
const raw = JSON.parse(out.slice(i + 5).trim().split(/\r?\n/)[0])
const p = detect.parse(out)
console.log('admin:', p.admin, '| pointsRead:', p.pointsRead, '| points:', p.points.length)
console.log('RPSessionInterval (raw):', raw.interval, '| shadow storage present:', raw.storage && raw.storage.has, '| parsed protection:', p.protection)
console.log('-LastStatus raw text:', JSON.stringify(raw.lastStatus), '-> parsed:', p.lastStatus)
console.log('point types seen:', [...new Set(p.points.map(x => x.type))].join(', ') || '(none)')
for (const x of p.points.slice(0, 12)) console.log(`  #${x.seq}  type ${x.type}  ${x.at ? new Date(x.at).toLocaleString() : '?'}  ${x.desc}`)
console.log('VSS start:', raw.vssStart, '| policy DisableSR:', raw.disableSR, '| last boot:', raw.bootAt)
if (!p.pointsRead) console.log('\nNot elevated (or Windows refused): restore points could not be read. Re-run from an administrator terminal.')
