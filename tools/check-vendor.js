// The committed three bundle must match the pinned version in package-lock.json and carry its banner.
const fs = require('fs'), path = require('path')
const root = path.join(__dirname, '..')
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'))
const want = lock.packages?.['node_modules/three']?.version
const file = path.join(root, 'js/vendor/three.bundle.js')
if (!want) { console.error('✖ three is not in package-lock.json'); process.exit(1) }
if (!fs.existsSync(file)) { console.error('✖ js/vendor/three.bundle.js is missing: run node tools/build-three.js'); process.exit(1) }
const head = fs.readFileSync(file, 'utf8').slice(0, 400)
const m = head.match(/^\/\* three\.js r\d+ \(([\d.]+)\)/)
if (!m || m[1] !== want) { console.error(`✖ three bundle is ${m ? m[1] : 'unlabelled'} but package-lock pins ${want}: run node tools/build-three.js`); process.exit(1) }
console.log(`✔ three bundle matches the pinned version (${want})`)
