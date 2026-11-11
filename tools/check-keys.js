'use strict'
// Fails when a literal tUI('key') in the rebuilt pages (js/pages/*.js) has no entry in js/lang/en.js or fi.js.
// (index.html and other scripts are only reported: they predate this check.)
const fs = require('fs'), path = require('path')
const root = path.join(__dirname, '..')
const read = f => fs.readFileSync(path.join(root, f), 'utf8')
const en = read('js/lang/en.js'), fi = read('js/lang/fi.js')
const has = (src, k) => new RegExp('(?:^|[\\s,{])' + k.replace(/[$]/g, '\\$') + '\\s*:').test(src)
const keysIn = src => [...src.matchAll(/\btUI\('([A-Za-z0-9_]+)'\)/g)].map(m => m[1])
let bad = 0
for (const f of fs.readdirSync(path.join(root, 'js', 'pages')).filter(x => x.endsWith('.js'))) {
  for (const k of new Set(keysIn(read('js/pages/' + f)))) {
    if (!has(en, k) || !has(fi, k)) { bad++; console.log(`✗ js/pages/${f}: tUI('${k}') missing in ${!has(en, k) ? 'en' : ''}${!has(en, k) && !has(fi, k) ? ' and ' : ''}${!has(fi, k) ? 'fi' : ''}`) }
  }
}
const legacy = new Set()
for (const f of ['index.html', 'js/ui-helpers.js', 'js/boot-logic.js', 'js/shell.js']) for (const k of keysIn(read(f))) if (!has(en, k)) legacy.add(k)
if (process.argv.includes('--list')) for (const f of ['index.html', 'js/ui-helpers.js', 'js/boot-logic.js', 'js/shell.js']) read(f).split('\n').forEach((l, i) => { for (const m of l.matchAll(/\btUI\('([A-Za-z0-9_]+)'\)/g)) if (legacy.has(m[1])) { console.log(`${f}:${i + 1} ${m[1]} :: ${l.trim().slice(0, 140)}`); legacy.delete(m[1]); legacy.add('~' + m[1]) } })
if (legacy.size) console.log(`note: ${legacy.size} tUI keys used by older code are missing in en (e.g. ${[...legacy].slice(0, 5).join(', ')})`)
if (bad) { console.error(`\nkeys: ${bad} missing in rebuilt pages`); process.exit(1) }
console.log('✔ translation keys ok (rebuilt pages)')
