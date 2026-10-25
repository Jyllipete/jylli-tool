// Static checks that never launch the app: syntax of main/preload/js/lib and every inline <script> in the HTML files.
// Usage: node tools/check.js
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.join(__dirname, '..')
let failures = 0
const fail = (m) => { failures++; console.error('✖ ' + m) }

function checkJs(file) {
  try { new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }) } catch (e) { fail(`${path.relative(root, file)}: ${e.message}`) }
}

function walk(dir, exts, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (f.name === 'node_modules' || f.name === 'dist' || f.name.startsWith('.')) continue
    const p = path.join(dir, f.name)
    if (f.isDirectory()) walk(p, exts, out)
    else if (exts.includes(path.extname(f.name))) out.push(p)
  }
  return out
}

for (const f of ['main.js', 'preload.js']) if (fs.existsSync(path.join(root, f))) checkJs(path.join(root, f))
for (const d of ['js', 'lib']) if (fs.existsSync(path.join(root, d))) for (const f of walk(path.join(root, d), ['.js'])) checkJs(f)
for (const f of walk(path.join(root, 'test'), ['.js'])) checkJs(f)

let scripts = 0
for (const f of fs.readdirSync(root).filter(n => n.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(root, f), 'utf8')
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi
  let m, i = 0
  while ((m = re.exec(html))) {
    i++; scripts++
    try { new vm.Script(m[1], { filename: `${f}#script${i}` }) } catch (e) { fail(`${f} inline script #${i}: ${e.message}`) }
  }
}

console.log(failures ? `\n${failures} failure(s)` : `✔ syntax ok (${scripts} inline scripts)`)
process.exit(failures ? 1 : 0)
