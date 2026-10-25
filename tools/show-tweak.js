// Prints the source of one or more TWEAKS entries: node tools/show-tweak.js id [id...]
const fs = require('fs')
const path = require('path')
const { entries } = require('./list-tweaks.js')
const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8').split('\n')
for (const id of process.argv.slice(2)) {
  const e = entries.find(x => x.id === id)
  if (!e) { console.log(`## ${id}: not found`); continue }
  console.log(`## ${id} (main.js:${e.line})`)
  console.log(src.slice(e.line - 1, e.line - 1 + e.body.length + 1).join('\n'))
}
