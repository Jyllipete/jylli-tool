'use strict'
// READ-ONLY: runs the real advisor on this HP's real BIOS settings and prints what it would suggest. Writes nothing.
//   node tools/bios-advisor-dry.js            (administrator terminal; HP only)
// Facts about CPU/GPU/RAM are not available here (they come from the app's profile), so only setting-backed rules fire.
const { execFileSync } = require('child_process')
const fs = require('fs'), os = require('os'), path = require('path')
const hp = require('../lib/bios/hp-wmi'), model = require('../lib/bios/model'), advisor = require('../lib/bios/advisor'), K = require('../lib/bios/knowledge')

const ps = s => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(s, 'utf16le').toString('base64')], { encoding: 'utf8', timeout: 90000 })
const out = []; const say = m => { console.log(m); out.push(m) }

;(async () => {
  const r = hp.parseRead(ps(hp.READ_SCRIPT))
  if (!r.ok) throw new Error('read failed: ' + r.error + (r.detail ? ' (' + r.detail + ')' : ''))
  const settings = model.fromHp(r.rows)
  const bios = JSON.parse(ps('Get-CimInstance Win32_BIOS | Select-Object SMBIOSBIOSVersion,@{n="d";e={$_.ReleaseDate.ToString("yyyyMMdd")}} | ConvertTo-Json -Compress'))
  const info = { vendor: 'HP', board: 'HP', biosDate: bios.d, uefi: true }
  say(`settings read: ${settings.length}; BIOS ${bios.SMBIOSBIOSVersion} (${bios.d})`)

  say('\n== Knowledge entries: which real setting each one matched ==')
  for (const card of K.CARDS) {
    const list = K.findAll(settings, card)
    say(`${list.length ? 'MATCH ' : 'none  '} ${card.id}${list.length ? '  <- ' + list.slice(0, 3).map(s => `${s.name}=${s.current}`).join('; ') : ''}`)
  }

  say('\n== Cards ==')
  for (const c of advisor.buildCards(settings, true)) say(`${c.id}: state=${c.state} count=${c.count} rec=${c.rec} differs=${c.differs} options=${c.options.length}`)

  const a = advisor.advise({ caps: {}, ram: {}, info, settings, writable: true })
  say('\n== Suggestions ==')
  for (const s of a.suggestions || []) say(`[${s.status}] ${s.id}  changes=${(s.changes || []).map(c => `${c.name}: ${c.fromLabel} -> ${c.toLabel} (${c.tier})`).join(' | ') || 'none'}`)
  say('\n== Presets ==')
  for (const [k, v] of Object.entries(a.presets || {})) say(`${k}: ${JSON.stringify(v).slice(0, 400)}`)

  const bad = (a.suggestions || []).flatMap(s => s.changes || []).filter(c => !['normal', 'moderate'].includes(c.tier))
  say('\nsafety: changes outside Normal/Moderate: ' + bad.length)
})().catch(e => { say('ERROR: ' + e.message); process.exitCode = 1 }).finally(() => { try { fs.writeFileSync(path.join(os.tmpdir(), 'bios-advisor-dry.log'), out.join('\n')) } catch {} })
