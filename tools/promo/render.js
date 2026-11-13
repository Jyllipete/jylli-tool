// Frame-exact renderer: npm run promo:render -- [--fps 60] [--from 0] [--to 147.875] [--still 6.857] [--out file] [--motion full]
// Serves the repo on 127.0.0.1, opens tools/promo/promo.html?render=1 in a hidden offscreen 1920x1080 window, seeks every frame
// (window.__seek(t), pure function of t), pipes raw BGRA into ffmpeg and muxes the music. Needs no GPU: the stage is plain CSS.
const { app, BrowserWindow } = require('electron')
const { spawn } = require('child_process')
const http = require('http'), fs = require('fs'), path = require('path')
const ROOT = path.join(__dirname, '..', '..')
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d }
const FPS = +arg('fps', 60), W = 1920, H = 1080
const beats = require('./beats.json')
const FROM = +arg('from', 0), TO = Math.min(+arg('to', beats.duration), beats.duration)
const STILL = arg('still', null), SETTLE = +arg('settle', 0)
const OUT = path.resolve(arg('out', path.join(__dirname, 'out', STILL != null ? `still-${STILL}.png` : FROM || TO < beats.duration ? `proof-${FROM}-${TO}.mp4` : 'jylli-tool-1.6.0-fi.mp4')))
const AUDIO = path.resolve(arg('audio', path.join(__dirname, 'media', 'after-us.mp3')))
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.mp3': 'audio/mpeg' }

const server = http.createServer((req, res) => {
  const file = path.normalize(path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)))
  if (!file.startsWith(ROOT) || /node_modules|\.git[\\/]/.test(file)) { res.writeHead(403).end(); return }
  fs.readFile(file, (e, b) => { if (e) res.writeHead(404).end(); else res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }).end(b) })
})

async function main() {
  await app.whenReady()
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const win = new BrowserWindow({ width: W, height: H, show: false, frame: false, useContentSize: true, webPreferences: { offscreen: true, backgroundThrottling: false, sandbox: true, contextIsolation: true, zoomFactor: 1 } })
  win.webContents.setFrameRate(60)
  const q = `render=1${arg('motion', 'full') === 'reduce' ? '&motion=reduce' : '&motion=full'}`
  await win.loadURL(`http://127.0.0.1:${port}/tools/promo/promo.html?${q}`)
  const js = c => win.webContents.executeJavaScript(c)
  for (let i = 0; i < 200 && !(await js('!!window.__ready')); i++) await new Promise(r => setTimeout(r, 100))
  if (!(await js('!!window.__ready'))) throw new Error('stage never became ready')
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  const grab = async t => {
    const fresh = await js(`window.__seek(${t})`); if (fresh || SETTLE) await new Promise(r => setTimeout(r, Math.max(SETTLE, 90)))   // newly shown layers rasterise a beat late offscreen
    const img = await win.webContents.capturePage()
    const s = img.getSize(); return s.width === W && s.height === H ? img : img.resize({ width: W, height: H })
  }
  if (STILL != null) {   // --still 8.5  or  --still 6.8,7.0,7.3 (one png each, named still-<t>.png next to --out)
    const ts = String(STILL).split(',')
    for (const t of ts) { const f = ts.length > 1 ? path.join(path.dirname(OUT), 'still-' + t + '.png') : OUT; fs.writeFileSync(f, (await grab(+t)).toPNG()); console.log('wrote', f) }
    app.exit(0); return
  }

  const n = Math.round((TO - FROM) * FPS)
  const ff = spawn(require('ffmpeg-static'), ['-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
    '-ss', String(FROM), '-t', String(TO - FROM), '-i', AUDIO,
    '-c:v', 'libx264', '-preset', arg('preset', 'slow'), '-crf', arg('crf', '16'), '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart',
    '-af', `afade=t=out:st=${Math.max(0, TO - FROM - 1.2)}:d=1.2`, '-c:a', 'aac', '-b:a', '320k', '-shortest', OUT], { stdio: ['pipe', 'inherit', 'inherit'] })
  let dead = false; ff.on('close', c => { dead = true; if (c) { console.error('ffmpeg exit', c); app.exit(1) } })
  const t0 = Date.now()
  for (let i = 0; i < n && !dead; i++) {
    const img = await grab(FROM + i / FPS)
    const buf = img.toBitmap()
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r))
    if (i % (FPS * 5) === 0) console.log(`frame ${i}/${n}  t=${(FROM + i / FPS).toFixed(2)}s  ${((Date.now() - t0) / 1000).toFixed(0)}s elapsed`)
  }
  ff.stdin.end()
  await new Promise(r => ff.on('close', r))
  console.log('wrote', OUT, `${((Date.now() - t0) / 1000).toFixed(0)}s`)
  app.exit(0)
}
app.on('window-all-closed', e => e.preventDefault())
main().catch(e => { console.error(e); app.exit(1) })
