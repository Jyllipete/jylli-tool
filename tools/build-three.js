// Bundles three@<pinned> plus a fixed list of addons into ONE classic script, js/vendor/three.bundle.js (window.THREE, window.THREE.Addons).
// The app's renderer scripts are classic scripts (not ES modules), so the bundle is an IIFE. Output is committed; re-run only to upgrade three.
// Usage: node tools/build-three.js
const fs = require('fs'), path = require('path'), crypto = require('crypto')
const esbuild = require('esbuild')
const root = path.join(__dirname, '..')
const threeVersion = require(path.join(root, 'node_modules/three/package.json')).version
const ADDONS = {
  EffectComposer: 'three/addons/postprocessing/EffectComposer.js',
  RenderPass: 'three/addons/postprocessing/RenderPass.js',
  UnrealBloomPass: 'three/addons/postprocessing/UnrealBloomPass.js',
  OutputPass: 'three/addons/postprocessing/OutputPass.js',
  ShaderPass: 'three/addons/postprocessing/ShaderPass.js',
  SMAAPass: 'three/addons/postprocessing/SMAAPass.js',
  RoundedBoxGeometry: 'three/addons/geometries/RoundedBoxGeometry.js',
  RoomEnvironment: 'three/addons/environments/RoomEnvironment.js',
  mergeGeometries: 'three/addons/utils/BufferGeometryUtils.js',
}
const entry = `import * as THREE from 'three'
${Object.entries(ADDONS).map(([n, p]) => `import { ${n} } from '${p}'`).join('\n')}
const T = Object.assign({}, THREE)
T.Addons = { ${Object.keys(ADDONS).join(', ')} }
window.THREE = T
`
;(async () => {
  const hash = crypto.createHash('sha256').update(entry + threeVersion).digest('hex').slice(0, 16)
  const banner = `/* three.js r${threeVersion.split('.')[1]} (${threeVersion}) + addons: ${Object.keys(ADDONS).join(', ')} | build-three input ${hash} | MIT license, https://threejs.org */`
  const res = await esbuild.build({
    stdin: { contents: entry, resolveDir: path.join(root, 'node_modules/three'), loader: 'js' },
    alias: { three: path.join(root, 'node_modules/three/build/three.module.js'), 'three/addons': path.join(root, 'node_modules/three/examples/jsm') },
    bundle: true, minify: true, format: 'iife', target: 'chrome120', write: false, legalComments: 'none', banner: { js: banner },
  })
  const out = path.join(root, 'js/vendor/three.bundle.js')
  fs.writeFileSync(out, res.outputFiles[0].text)
  console.log('wrote', path.relative(root, out), (res.outputFiles[0].text.length / 1024).toFixed(0) + ' KB', 'three', threeVersion, 'hash', hash)
})().catch(e => { console.error(e); process.exit(1) })
