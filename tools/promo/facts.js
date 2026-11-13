// Proof numbers for the video interludes. Only numbers that can be counted here or are listed in the 1.6.0 release notes.
// node tools/promo/facts.js [--no-tests]   -> tools/promo/facts.json  { id: { value, source } }
const { spawnSync } = require('child_process')
const fs = require('fs'), path = require('path')
const ROOT = path.join(__dirname, '..', '..')
const facts = {}
// from the 1.6.0 release notes (pasted by the project owner): "New tabs and pages" lists 14 items, "Hero headers" names 12 tabs
facts.views = { value: 14, source: 'release notes 1.6.0: "New tabs and pages" (14 entries)' }
facts.heroTabs = { value: 12, source: 'release notes 1.6.0: "Per-tab changes / Hero headers" (12 tabs)' }
// counted from the repo
const lang = fs.readdirSync(path.join(ROOT, 'js', 'lang')).filter(f => /-fi\.js$|^fi\.js$/.test(f)).length
const langEn = fs.readdirSync(path.join(ROOT, 'js', 'lang')).filter(f => /-en\.js$|^en\.js$/.test(f)).length
facts.languages = { value: lang && langEn ? 2 : 0, source: `js/lang has ${langEn} en and ${lang} fi string files (the app ships English + Finnish)` }
const pkg = require(path.join(ROOT, 'package.json'))
facts.version = { value: pkg.version, source: 'package.json version' }
if (!process.argv.includes('--no-tests')) {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...fs.readdirSync(path.join(ROOT, 'test')).filter(f => f.endsWith('.test.js')).map(f => path.join('test', f))], { cwd: ROOT, encoding: 'utf8', timeout: 600000 })
  const out = (r.stdout || '') + (r.stderr || '')
  const pass = +(out.match(/# pass (\d+)/) || [])[1], fail = +(out.match(/# fail (\d+)/) || [])[1]
  if (pass && !fail) facts.tests = { value: pass, source: `node --test test/*.test.js: ${pass} pass, ${fail} fail (${new Date().toISOString().slice(0, 10)})` }
  else console.warn('tests not clean, "tests" fact dropped', { pass, fail })
}
fs.writeFileSync(path.join(__dirname, 'facts.json'), JSON.stringify(facts, null, 1))
console.log(Object.entries(facts).map(([k, v]) => `${k}=${v.value}`).join('  '))
