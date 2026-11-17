// Release banner: npm run banner -- <version> [--noshots]
// Reads tools/release-banner/releases/<version>.json, shoots each tab with the ui-preview CLI (EN + FI), composes banner.html
// in an offscreen 1920x960 window and writes tools/release-banner/out/jylli-tool-<version>-banner-{en,fi}.png.
const { app, BrowserWindow } = require('electron')
const { spawnSync } = require('child_process')
const http = require('http'), fs = require('fs'), path = require('path')
const ROOT = path.join(__dirname, '..', '..')
const version = process.argv.slice(2).find(a => /^\d+\.\d+\.\d+$/.test(a))
if (!version) { console.error('usage: npm run banner -- <version>'); process.exit(1) }
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'releases', version + '.json'), 'utf8'))
const W = 1920, H = 960, ZOOM = 1.25, SIZE = `${Math.round(1280 * ZOOM)}x${Math.round(820 * ZOOM)}`
const tag = 'banner-' + version
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' }

if (!process.argv.includes('--noshots')) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'ui-preview', 'preview-main.js'), '--out', path.join(ROOT, 'preview-out'), '--tag', tag,
    '--pages', cfg.shots.map(s => s.page).join(','), '--lang', 'en,fi', '--tier', 'premium', '--size', SIZE, '--zoom', String(ZOOM)], { stdio: 'inherit', env: (() => { const e = { ...process.env }; delete e.ELECTRON_RUN_AS_NODE; return e })() })
  if (r.status) { console.error('preview failed'); process.exit(1) }
}

const server = http.createServer((req, res) => {
  const file = path.normalize(path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)))
  if (!file.startsWith(ROOT) || /node_modules|\.git[\\/]/.test(file)) { res.writeHead(403).end(); return }
  fs.readFile(file, (e, b) => { if (e) res.writeHead(404).end(); else res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }).end(b) })
})

async function main() {
  await app.whenReady()
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const outDir = path.join(__dirname, 'banners'); fs.mkdirSync(outDir, { recursive: true })
  for (const lang of ['en', 'fi']) {
    const shots = cfg.shots.map(s => `/preview-out/${tag}/${lang}-premium-${SIZE}/${s.page}.png`)
    const d = encodeURIComponent(JSON.stringify({ version, headline: cfg[lang].headline, chips: cfg[lang].chips, shots }))
    const win = new BrowserWindow({ width: W, height: H, show: false, frame: false, useContentSize: true, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, zoomFactor: 1 } })
    await win.loadURL(`http://127.0.0.1:${port}/tools/release-banner/banner.html?d=${d}`)
    for (let i = 0; i < 100 && !(await win.webContents.executeJavaScript('!!window.__ready')); i++) await new Promise(r => setTimeout(r, 100))
    await new Promise(r => setTimeout(r, 400))
    const img = await win.webContents.capturePage()
    const s = img.getSize(), out = path.join(outDir, `jylli-tool-${version}-banner-${lang}.png`)
    fs.writeFileSync(out, (s.width === W && s.height === H ? img : img.resize({ width: W, height: H })).toPNG())
    console.log('wrote', out); win.destroy()
  }
  app.exit(0)
}
app.on('window-all-closed', e => e.preventDefault())
main().catch(e => { console.error(e); app.exit(1) })
