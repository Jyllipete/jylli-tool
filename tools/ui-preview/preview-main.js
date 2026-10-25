// UI preview harness. Opens the REAL pages in hidden windows with a mock `window.api` and saves a PNG per page/state.
// It never launches the real backend: no main.js, no PowerShell, no registry, no network, no elevation.
//
//   npx electron tools/ui-preview/preview-main.js --out <dir> [--lang en,fi] [--tier free,premium] [--size 1280x820,1060x660]
//                                                  [--pages dashboard,settings] [--windows] [--tag baseline]
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const { respond } = require('./fixtures')

const ROOT = path.join(__dirname, '..', '..')
const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i >= 0 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true) : def }
const OUT = path.resolve(String(arg('out', path.join(ROOT, 'preview-out'))))
const LANGS = String(arg('lang', 'en')).split(',')
const TIERS = String(arg('tier', 'premium')).split(',')
const SIZES = String(arg('size', '1280x820')).split(',').map(s => s.split('x').map(Number))
const ONLY_PAGES = arg('pages', null) ? String(arg('pages')).split(',') : null
const WINDOWS = !!arg('windows', false)
const TAG = String(arg('tag', 'run'))
// --overlay name=js;name2=js2 : after boot, run JS (e.g. open a dialog) and shoot it as overlay-<name>.png
const OVERLAYS = arg('overlay', null) ? String(arg('overlay')).split(';').map(x => { const i = x.indexOf('='); return [x.slice(0, i), x.slice(i + 1)] }) : []
const ACCENT = arg('accent', null)

const PAGES = ['dashboard', 'preflight', 'fixes', 'restore-points', 'performance', 'gaming', 'network', 'privacy-cleanup', 'startup-manager', 'process-manager',
  'latency-monitor', 'bios-tuner', 'pulse', 'fivem', 'scheduler', 'changelog', 'settings']
const SECONDARY = ['pulse.html', 'fivem-settings.html', 'arma-settings.html', 'fps-hud.html', 'fivem-hud.html', 'fps-hud-settings.html']

// the mock needs the list of API methods: read it from the real preload so it can never drift
const preloadSrc = fs.readFileSync(path.join(ROOT, 'preload.js'), 'utf8')
const overlaySrc = fs.readFileSync(path.join(ROOT, 'preload-overlay.js'), 'utf8')
const apiKeys = [...new Set([...preloadSrc.matchAll(/^\s{2}([A-Za-z0-9_]+):\s/gm), ...overlaySrc.matchAll(/^\s{2}([A-Za-z0-9_]+):\s/gm)].map(m => m[1]))]
ipcMain.on('mock-keys', e => { e.returnValue = apiKeys })

const ctxByContents = new Map()
const unknownCalls = new Map()
ipcMain.handle('mock', (e, name, args) => {
  const ctx = ctxByContents.get(e.sender.id) || { lang: 'en', premium: true }
  const r = respond(name, args, ctx)
  if (r === undefined) { unknownCalls.set(name, (unknownCalls.get(name) || 0) + 1); return { ok: false, mock: 'no-fixture' } }
  return r
})

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function makeWindow(file, ctx, [w, h]) {
  const win = new BrowserWindow({
    width: w, height: h, show: false, frame: false, backgroundColor: '#0d0d0d',
    // offscreen: the page paints and runs timers/animations at full speed without ever appearing on the user's screen
    webPreferences: { preload: path.join(__dirname, 'preview-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, offscreen: true },
  })
  win.webContents.setFrameRate(30)
  ctxByContents.set(win.webContents.id, ctx)
  const logs = []
  win.webContents.on('console-message', (_e, level, message, line, source) => { if (level >= 2) logs.push(`[${level === 3 ? 'error' : 'warn'}] ${message} (${path.basename(source || '')}:${line})`) })
  win.webContents.on('render-process-gone', (_e, d) => logs.push(`[crash] ${d.reason}`))
  await win.loadFile(path.join(ROOT, file), { query: { lang: ctx.lang } })
  return { win, logs }
}

async function shot(win, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const img = await win.webContents.capturePage()
  fs.writeFileSync(file, img.toPNG())
}

async function appReady(win, timeoutMs = 20000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const ok = await win.webContents.executeJavaScript(`!!document.getElementById('app') && !document.getElementById('app').classList.contains('hidden') && typeof showPage === 'function'`).catch(() => false)
    if (ok) return true
    await sleep(250)
  }
  return false
}

async function main() {
  await app.whenReady()
  fs.mkdirSync(OUT, { recursive: true })
  const report = []
  for (const lang of LANGS) for (const tier of TIERS) for (const size of SIZES) {
    const name = `${TAG}/${lang}-${tier}-${size.join('x')}`
    const ctx = { lang, premium: tier === 'premium', accent: ACCENT && ACCENT !== true ? ACCENT : null }
    const { win, logs } = await makeWindow('index.html', ctx, size)
    const ready = await appReady(win)
    if (!ready) { report.push(`${name}: APP NEVER BECAME READY`); logs.forEach(l => report.push('   ' + l)); win.destroy(); continue }
    await sleep(1800)   // boot animation + first metrics
    for (const page of (ONLY_PAGES || PAGES)) {
      logs.length = 0
      await win.webContents.executeJavaScript(`showPage(${JSON.stringify(page)})`).catch(e => logs.push('[showPage] ' + e.message))
      await sleep(1100)
      await shot(win, path.join(OUT, name, `${page}.png`))
      if (logs.length) { report.push(`${name}/${page}:`); logs.forEach(l => report.push('   ' + l)) }
    }
    for (const [oname, js] of OVERLAYS) {
      logs.length = 0
      await win.webContents.executeJavaScript(js).catch(e => logs.push('[overlay] ' + e.message))
      await sleep(900)
      await shot(win, path.join(OUT, name, `overlay-${oname}.png`))
      if (logs.length) { report.push(`${name}/overlay-${oname}:`); logs.forEach(l => report.push('   ' + l)) }
    }
    win.destroy()
  }
  if (WINDOWS) {
    for (const lang of LANGS) {
      for (const f of SECONDARY) {
        const ctx = { lang, premium: true }
        const { win, logs } = await makeWindow(f, ctx, f.includes('hud') && !f.includes('settings') ? [320, 200] : [700, 780])
        await sleep(1500)
        await shot(win, path.join(OUT, TAG, `${lang}-window-${f.replace('.html', '')}.png`))
        if (logs.length) { report.push(`window ${f} (${lang}):`); logs.forEach(l => report.push('   ' + l)) }
        win.destroy()
      }
    }
  }
  const lines = [`# UI preview ${TAG}`, `output: ${OUT}`, '', ...report, '', 'API calls with no fixture (resolved to {ok:false}):',
    ...[...unknownCalls.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k} ×${v}`)]
  fs.writeFileSync(path.join(OUT, TAG, 'report.txt'), lines.join('\n'))
  console.log(lines.join('\n'))
  app.exit(0)
}

app.on('window-all-closed', e => e.preventDefault())
main().catch(e => { console.error(e); app.exit(1) })
