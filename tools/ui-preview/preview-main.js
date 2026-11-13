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
const OVERLAY_SRC = arg('overlay', null) ? (String(arg('overlay')).startsWith('@') ? fs.readFileSync(String(arg('overlay')).slice(1), 'utf8') : String(arg('overlay'))) : null   // '@file.js' reads the JS (as one overlay named by the file) from disk
const OVERLAYS = !OVERLAY_SRC ? [] : String(arg('overlay')).startsWith('@') ? [[path.basename(String(arg('overlay')), '.js'), OVERLAY_SRC]]
  : OVERLAY_SRC.split(';').map(x => { const i = x.indexOf('='); return [x.slice(0, i), x.slice(i + 1)] })
const ACCENT = arg('accent', null)
const SCHEME = String(arg('scheme', 'dark'))   // dark | light | system
const THEME = arg('theme', null)   // --theme <preset key>, e.g. liquid
const SCALE = Number(arg('scale', 1)) || 1        // <1 shrinks screenshots (cheaper to view)
const LINT = !!arg('lint', false)                 // run tools/ui-preview/lint-page.js on every page and put the text report in report.txt
const NOSHOT = !!arg('noshot', false)             // skip PNGs (use with --lint)
const AUTO_OPTI = !!arg('auto-opti', false)   // --auto-opti: shoot every Auto-Optimize scene (--ao-profile <fixture>)
const DIAG = !!arg('diagnostics', false)   // --diagnostics: shoot every Diagnostics scene (--dx-state clean|first|fail)
const DEBLOAT = !!arg('debloat', false)   // --debloat: shoot every Debloat scene (--db-state drift|empty|fail for the other states)
const PULSE = !!arg('pulse', false)   // --pulse: shoot every Pulse scene: the tab, the Cockpit and the HUD (--pu-state live|idle|hitchy|debrief|fail)
const FIVEM = !!arg('fivem', false)   // --fivem: shoot every FiveM scene (--fv-state clean|lossy|noinstall|first|fail)
const HOME = !!arg('home', false)   // --home: shoot Home on the real lib/home service (--hm-state attention|healthy|first|fail)
const WIN2 = !!arg('win2', false)   // --win2: shoot every Windows tab scene on the real lib/windows service (--wn-state open|applied|first|fail)
const NET2 = !!arg('net2', false)   // --net2: shoot every Network tab scene on the real lib/network service (--nt-state ethernet|wifi-weak|lossy|first|fail)
const CPUMEM = !!arg('cpumem', false)   // --cpumem: shoot every CPU & Memory tab scene on the real lib/cpumem service (--cm-state x3d|hybrid|pressure|first|fail)
const GPUP = !!arg('gpu', false)   // --gpu: shoot every GPU tab scene on the real lib/gpu service (--gp-state nvidia|hybrid|hot|amd|first|fail)
const POWERP = !!arg('power', false)   // --power: shoot every Power tab scene on the real lib/power service (--pw-state desktop|laptop|clutter|blocked|first|fail)
const BOOT = !!arg('boot', false)   // --boot: shoot the boot scan while it runs (--bt-state first|returning|changed|slow|fail)
const GALLERY = !!arg('gallery', false)   // shoot tools/ui-preview/gallery.html (every component) instead of the app

const PAGES = ['dashboard', 'preflight', 'fixes', 'restore-points', 'performance', 'gaming', 'network', 'privacy-cleanup', 'startup-manager', 'process-manager',
  'latency-monitor', 'bios-tuner', 'pulse', 'fivem', 'scheduler', 'changelog', 'settings']
const SECONDARY = ['pulse.html', 'pulse-hud.html', 'arma-settings.html', 'fps-hud.html', 'fivem-hud.html', 'fps-hud-settings.html']

// the mock needs the list of API methods: read it from the real preload so it can never drift
const preloadSrc = fs.readFileSync(path.join(ROOT, 'preload.js'), 'utf8')
const overlaySrc = fs.readFileSync(path.join(ROOT, 'preload-overlay.js'), 'utf8')
const apiKeys = [...new Set([...preloadSrc.matchAll(/^\s{2}([A-Za-z0-9_]+):\s/gm), ...overlaySrc.matchAll(/^\s{2}([A-Za-z0-9_]+):\s/gm)].map(m => m[1]))]
ipcMain.on('mock-keys', e => { e.returnValue = apiKeys })

const ctxByContents = new Map()
const unknownCalls = new Map()
const AO = require('./auto-opti-preview')
ipcMain.handle('mock', async (e, name, args) => {
  const ctx = ctxByContents.get(e.sender.id) || { lang: 'en', premium: true }
  if (/^ao[A-Z]/.test(name)) { const r = await AO.handle(name, args, e.sender, ctx); if (r !== undefined) return r }
  if (/^(pulse2|pulseGetPresets|pulseGetCoreLoads|pulseThermalAudit)/.test(name)) { const r = await require('./pulse-fixture').handle(name, args, e.sender, ctx); if (r !== undefined) return r }
  if (name === 'getSystemInfo' && ctx.bt) { const r = await require('./boot-fixture').handle(name, args, e.sender, ctx); if (r !== undefined) return r }
  if (/^(home2|journalList$|getMetricsHistory$|listSessions$|aiGet|telemetrySubscribe$|telemetrySeries$)/.test(name)) { const r = await require('./home-fixture').handle(name, args, e.sender, ctx); if (r !== undefined) return r }
  if (/^(cpumem2|getProcesses$|latencyBudget(Start|Stop)$|biosRamStress$|cpuzReadTimings$)/.test(name)) { const r = await require('./cpumem-fixture').handle(name, args, e.sender, ctx); if (r !== undefined) return r }
  if (/^power2/.test(name)) { const r = await require('./power-fixture').handle(name, args, e.sender, ctx); if (r !== undefined) return r }
  if (/^(gpu2|gpuPowerLimit)/.test(name)) { const r = await require('./gpu-fixture').handle(name, args, e.sender, ctx); if (r !== undefined) return r }
  if (/^win2/.test(name)) { const r = await require('./windows-fixture').handle(name, args, e.sender, ctx); if (r !== undefined) return r }
  if (/^(net2|netTopology$|getSpeedHistory$|benchmarkDns$|runSpeedTest$|runPingTestsV2$)/.test(name)) { const r = await require('./network-fixture').handle(name, args, e.sender, ctx); if (r !== undefined) return r }
  if (/^fivem2/.test(name)) { const r = await require('./fivem-fixture').handle(name, args, e.sender, ctx); if (r !== undefined) return r }
  const r = respond(name, args, ctx)
  if (r === undefined) { unknownCalls.set(name, (unknownCalls.get(name) || 0) + 1); return { ok: false, mock: 'no-fixture' } }
  return r
})


// Diagnostics: idle/cached state, the scan, the result, every view.
async function diagShots(win, dir, logs, report) {
  const js = c => win.webContents.executeJavaScript(c)
  const until = async (cond, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await js(cond).catch(() => false)) return true; await sleep(150) } report.push('timeout: ' + cond); return false }
  await js("showPage('preflight')").catch(e => logs.push('[showPage] ' + e.message))
  await sleep(900)
  await shot(win, path.join(dir, 'dx-1-start.png'))
  await js("document.querySelector('.dx [data-act=scan]')?.click()"); await sleep(700)
  await shot(win, path.join(dir, 'dx-2-scanning.png'))
  await until("document.querySelector('.dx-verdict')?.dataset.tone !== 'idle' || !!document.querySelector('.dx-f')"); await sleep(1400)
  await shot(win, path.join(dir, 'dx-3-result.png'))
  await js("document.querySelector('.dx-f [data-ev]')?.click()"); await js("document.querySelector('.dx-findings')?.scrollIntoView({ block: 'start' })"); await sleep(400)
  await shot(win, path.join(dir, 'dx-4-findings.png'))
  for (const [i, v] of ['timeline', 'drivers', 'bench', 'report'].entries()) { await js("document.querySelector('.dx .j-seg-item[data-id=\"" + v + "\"]')?.click()"); await sleep(700); await shot(win, path.join(dir, 'dx-' + (5 + i) + '-' + v + '.png')) }
  if (LINT) { const r = await js(require('./lint-page')).catch(e => 'lint failed: ' + e.message); report.push('LINT diagnostics: ' + r) }
}

// CPU & Memory tab: the stage with live frames, Tune (rows, filter, preview, run + receipt), the Lab (plan preview on the die map), History.
async function cpumemShots(win, dir, logs, report, ctx) {
  const js = c => win.webContents.executeJavaScript(c)
  const until = async (cond, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await js(cond).catch(() => false)) return true; await sleep(150) } report.push('timeout: ' + cond); return false }
  await js("showPage('hardware','cpumem')").catch(e => logs.push('[showPage] ' + e.message))
  await sleep(250)
  await shot(win, path.join(dir, 'cm-1-scanning.png'))
  await until("document.querySelector('.cm-stage')?.dataset.state === 'ready' && document.querySelector('.cm-core[data-tone]')"); await sleep(2600)
  await shot(win, path.join(dir, 'cm-2-overview.png'))
  await js("document.querySelector('[data-act=\\\"consumers\\\"]')?.click()"); await sleep(1200)
  await js("document.querySelector('.cm-cons')?.scrollIntoView({ block: 'center' })"); await sleep(400)
  await shot(win, path.join(dir, 'cm-3-consumers.png'))
  await js("document.querySelector('[data-free]')?.click()"); await sleep(1600)
  await js("document.querySelector('.cm-mem')?.scrollIntoView({ block: 'center' })"); await sleep(300)
  await shot(win, path.join(dir, 'cm-4-freed.png'))
  await js("window.scrollTo(0, 0); document.querySelector('.nt-bar [data-id=\\\"tune\\\"]')?.click()"); await sleep(700)
  await shot(win, path.join(dir, 'cm-5-tune.png'))
  await js("document.querySelector('.nt-row .nt-head')?.click()"); await sleep(400)
  await shot(win, path.join(dir, 'cm-6-row-open.png'))
  await js("document.querySelector('.nt-stage')?.scrollIntoView({ block: 'start' }); document.querySelector('[data-act=\\\"recommended\\\"]')?.click()"); await sleep(700)
  await shot(win, path.join(dir, 'cm-7-preview.png'))
  await js("document.querySelector('[data-go]')?.click()"); await sleep(300)
  await until("!!document.querySelector('.nt-receipt')"); await sleep(600)
  await shot(win, path.join(dir, 'cm-8-receipt.png'))
  await js("document.querySelector('.nt-bar [data-id=\\\"lab\\\"]')?.click()"); await sleep(900)
  await js("document.querySelector('[data-lab=\\\"plan\\\"]')?.click(); (document.querySelector('[data-lab=\\\"plan\\\"]')||{}).dispatchEvent?.(new Event('change', { bubbles: true }))"); await sleep(500)
  await js("const i = document.querySelector('[data-lab=\\\"exe\\\"]'); if (i) { i.value = 'game.exe'; i.dispatchEvent(new Event('change', { bubbles: true })) }"); await sleep(400)
  await js("document.querySelector('.cm-lab, .cm-lab-pitch')?.scrollIntoView({ block: 'start' })"); await sleep(400)
  await shot(win, path.join(dir, 'cm-9-lab.png'))
  await js("document.querySelector('.nt-bar [data-id=\\\"history\\\"]')?.click()"); await sleep(900)
  await shot(win, path.join(dir, 'cm-10-history.png'))
  if (LINT) { const r = await js(require('./lint-page')).catch(e => 'lint failed: ' + e.message); report.push('LINT cpumem: ' + r) }
  logs.forEach(l => report.push('   ' + l))
}

// Power tab: the stage (flow, live), Overview, Plans (compare, tidy sheet), Sleep & wake, Energy (a session), Tune (a switch), History (undo).
async function powerShots(win, dir, logs, report, ctx) {
  const js = c => win.webContents.executeJavaScript(c)
  const until = async (cond, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await js(cond).catch(() => false)) return true; await sleep(150) } report.push('timeout: ' + cond); return false }
  const view = async id => { await js("window.scrollTo(0, 0); document.querySelector('.nt-bar [data-id=\"" + id + "\"]')?.click()"); await sleep(700) }
  await js("showPage('hardware','power')").catch(e => logs.push('[showPage] ' + e.message))
  await sleep(250)
  await shot(win, path.join(dir, 'pw-1-scanning.png'))
  await until("document.querySelector('.pw-stage')?.dataset.state === 'ready'"); await sleep(3200)
  await shot(win, path.join(dir, 'pw-2-overview.png'))
  await view('plans'); await shot(win, path.join(dir, 'pw-3-plans.png'))
  await js("document.querySelector('[data-act=\"plan-compare\"]')?.click()"); await sleep(500)
  await shot(win, path.join(dir, 'pw-4-compare.png'))
  await js("document.querySelector('[data-act=\"tidy\"]')?.click()"); await sleep(700)
  await shot(win, path.join(dir, 'pw-5-tidy.png'))
  await js("document.querySelector('.nt-sheet [data-go]')?.click()"); await sleep(2800)
  await shot(win, path.join(dir, 'pw-6-tidied.png'))
  await view('sleep'); await shot(win, path.join(dir, 'pw-7-sleep.png'))
  await view('energy'); await sleep(1800)
  await js("document.querySelector('[data-act=\"session-start\"]')?.click()"); await sleep(4500)
  await shot(win, path.join(dir, 'pw-8-energy-session.png'))
  await js("document.querySelector('[data-act=\"session-stop\"]')?.click()"); await sleep(800)
  await view('tune'); await shot(win, path.join(dir, 'pw-9-tune.png'))
  await js("document.querySelector('[data-id=\"trim-enable\"][data-act=\"flip\"], [data-id=\"fast-startup-off\"][data-act=\"flip\"]')?.click()"); await sleep(1800)
  await shot(win, path.join(dir, 'pw-10-flipped.png'))
  await view('history'); await sleep(500); await shot(win, path.join(dir, 'pw-11-history.png'))
  if (LINT) { const r = await js(require('./lint-page')).catch(e => 'lint failed: ' + e.message); report.push('LINT power: ' + r) }
  logs.forEach(l => report.push('   ' + l))
}

// GPU tab: the stage with live rails, the overview cards, the Headroom test, Tune (rows, preview, run + receipt), Display (keep / revert), History.
async function gpuShots(win, dir, logs, report, ctx) {
  const js = c => win.webContents.executeJavaScript(c)
  const until = async (cond, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await js(cond).catch(() => false)) return true; await sleep(150) } report.push('timeout: ' + cond); return false }
  await js("showPage('hardware','gpu')").catch(e => logs.push('[showPage] ' + e.message))
  await sleep(250)
  await shot(win, path.join(dir, 'gp-1-scanning.png'))
  await until("document.querySelector('.gp-stage')?.dataset.state === 'ready'"); await sleep(4200)
  await shot(win, path.join(dir, 'gp-2-overview.png'))
  await js("document.querySelector('.gp-testcard')?.scrollIntoView({ block: 'center' })"); await sleep(400)
  await shot(win, path.join(dir, 'gp-3-cards.png'))
  await js("document.querySelector('[data-t=\"start\"]')?.click()"); await sleep(3500)
  await shot(win, path.join(dir, 'gp-4-test-running.png'))
  if (arg('gp-full', false)) { await until("!!document.querySelector('.gp-rep') || !!document.querySelector('.gp-test-abort')", 40000); await sleep(500); await shot(win, path.join(dir, 'gp-5-test-report.png')) }
  else { await js("document.querySelector('[data-t=\"stop\"]')?.click()"); await sleep(900); await shot(win, path.join(dir, 'gp-5-test-stopped.png')) }
  await js("window.scrollTo(0, 0); document.querySelector('.nt-bar [data-id=\"tune\"]')?.click()"); await sleep(800)
  await shot(win, path.join(dir, 'gp-6-tune.png'))
  await js("document.querySelector('.nt-row .nt-head')?.click()"); await sleep(400)
  await shot(win, path.join(dir, 'gp-7-row-open.png'))
  await js("document.querySelector('[data-id=\"tdr-delay\"][data-act=\"flip\"]')?.click()"); await sleep(1800)
  await shot(win, path.join(dir, 'gp-8-flipped.png'))
  await js("window.scrollTo(0, 0); document.querySelector('.nt-bar [data-id=\"display\"]')?.click()"); await sleep(800)
  await shot(win, path.join(dir, 'gp-9-display.png'))
  await js("document.querySelector('.gp-mon-note [data-hz]')?.click()"); await sleep(1800)
  await shot(win, path.join(dir, 'gp-10-confirm.png'))
  await js("document.querySelector('[data-keep]')?.click()"); await sleep(1600)
  await shot(win, path.join(dir, 'gp-11-kept.png'))
  await js("document.querySelector('.nt-bar [data-id=\"history\"]')?.click()"); await sleep(900)
  await shot(win, path.join(dir, 'gp-12-history.png'))
  if (LINT) { const r = await js(require('./lint-page')).catch(e => 'lint failed: ' + e.message); report.push('LINT gpu: ' + r) }
  logs.forEach(l => report.push('   ' + l))
}

// Windows tab: the stage, rows opened, filters, the preview sheet, a run + receipt, history, and the Quality of life tab.
async function windowsShots(win, dir, logs, report) {
  const js = c => win.webContents.executeJavaScript(c)
  const until = async (cond, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await js(cond).catch(() => false)) return true; await sleep(150) } report.push('timeout: ' + cond); return false }
  await js("showPage('windows-opti','windows')").catch(e => logs.push('[showPage] ' + e.message))
  await sleep(250)
  await shot(win, path.join(dir, 'win-1-scanning.png'))
  await until("document.querySelector('.wn-stage')?.dataset.state === 'ready'"); await sleep(900)
  await shot(win, path.join(dir, 'win-2-ready.png'))
  await js("document.querySelector('.wn-lane [data-act=\\\"open\\\"]')?.click(); document.querySelector('.wn-tools')?.scrollIntoView({ block: 'start' })"); await sleep(500)
  await shot(win, path.join(dir, 'win-3-row-open.png'))
  await js("document.querySelector('[data-chip=\\\"rec\\\"]')?.click()"); await sleep(400)
  await shot(win, path.join(dir, 'win-4-filter-recommended.png'))
  await js("document.querySelector('[data-chip=\\\"rec\\\"]')?.click(); document.querySelector('.wn-stage')?.scrollIntoView({ block: 'start' }); document.querySelector('.wn-verdict [data-act=\\\"recommended\\\"],.wn-verdict [data-act=\\\"putback\\\"]')?.click()"); await sleep(600)
  await shot(win, path.join(dir, 'win-5-preview.png'))
  await js("document.querySelector('[data-go]')?.click()"); await sleep(250)
  await shot(win, path.join(dir, 'win-6-running.png'))
  await until("!!document.querySelector('.wn-receipt')"); await sleep(600)
  await shot(win, path.join(dir, 'win-7-receipt.png'))
  await js("document.querySelector('.wn-bar [data-id=\\\"history\\\"]')?.click()"); await sleep(900)
  await shot(win, path.join(dir, 'win-8-history.png'))
  await js("showPage('windows-opti','qol')"); await sleep(2200)
  await shot(win, path.join(dir, 'win-9-qol.png'))
  if (LINT) { const r = await js(require('./lint-page')).catch(e => 'lint failed: ' + e.message); report.push('LINT windows: ' + r) }
  logs.forEach(l => report.push('   ' + l))
}

// Network tab: the stage before anything is traced, a checkup (running, then the findings), Tune with the resolver card and a row open,
// the custom-DNS sheet, a batch preview + run + receipt, Measure, and History.
async function networkShots(win, dir, logs, report) {
  const js = c => win.webContents.executeJavaScript(c)
  const until = async (cond, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await js(cond).catch(() => false)) return true; await sleep(150) } report.push('timeout: ' + cond); return false }
  const seg = id => js("document.querySelector('.nt-bar .j-seg-item[data-id=\\\"" + id + "\\\"]')?.click()")
  await js("showPage('network')").catch(e => logs.push('[showPage] ' + e.message))
  await sleep(250)
  await shot(win, path.join(dir, 'net-1-scanning.png'))
  await until("document.querySelector('.nt-stage')?.dataset.state === 'ready'"); await sleep(900)
  await shot(win, path.join(dir, 'net-2-ready.png'))
  await js("document.querySelector('[data-act=checkup]')?.click()"); await sleep(1600)
  await shot(win, path.join(dir, 'net-3-checkup-running.png'))
  await until("!!document.querySelector('.nt-find, .nt-healthy, .nt-warnbox')"); await sleep(900)
  await shot(win, path.join(dir, 'net-4-findings.png'))
  await seg('tune'); await sleep(600)
  await shot(win, path.join(dir, 'net-5-tune.png'))
  await js("document.querySelector('.nt-lane [data-act=open]')?.click(); document.querySelector('.nt-tools')?.scrollIntoView({ block: 'start' })"); await sleep(500)
  await shot(win, path.join(dir, 'net-6-row-open.png'))
  await js("document.querySelector('.nt-preset[data-preset=custom]')?.click()"); await sleep(500)
  await js("const i = document.querySelector('.nt-sheet [data-f=primary]'); if (i) { i.value = '9.9'; i.dispatchEvent(new Event('input', { bubbles: true })) }"); await sleep(300)
  await shot(win, path.join(dir, 'net-7-dns-sheet.png'))
  await js("document.querySelector('.nt-sheet [data-close]')?.click()"); await sleep(400)
  await js("document.querySelector('.nt-stage')?.scrollIntoView({ block: 'start' }); document.querySelector('.nt-verdict [data-act=recommended], .nt-verdict [data-act=putback]')?.click()"); await sleep(600)
  await shot(win, path.join(dir, 'net-8-preview.png'))
  await js("document.querySelector('[data-go]')?.click()"); await sleep(250)
  await shot(win, path.join(dir, 'net-9-running.png'))
  await until("!!document.querySelector('.nt-receipt')"); await sleep(600)
  await shot(win, path.join(dir, 'net-10-receipt.png'))
  await js("document.querySelector('.nt-preset[data-preset=cloudflare]')?.click()"); await sleep(1500)
  await js("document.querySelector('.nt-resolver')?.scrollIntoView({ block: 'center' })"); await sleep(300)
  await shot(win, path.join(dir, 'net-11-resolver-set.png'))
  await seg('measure'); await sleep(600)
  await js("document.querySelector('[data-m=games]')?.click(); document.querySelector('[data-m=live]')?.click()"); await sleep(3200)
  await shot(win, path.join(dir, 'net-12-measure.png'))
  await js("document.querySelector('.nt-stage')?.scrollIntoView({ block: 'start' })"); await sleep(300)
  await shot(win, path.join(dir, 'net-13-live-stage.png'))
  await seg('history'); await sleep(900)
  await shot(win, path.join(dir, 'net-14-history.png'))
  if (LINT) { const r = await js(require('./lint-page')).catch(e => 'lint failed: ' + e.message); report.push('LINT network: ' + r) }
  logs.forEach(l => report.push('   ' + l))
}

// Debloat: every view of the tab, plus the run and the receipt (the mock run answers instantly; the real timing is only visible in the app).
async function debloatShots(win, dir, logs, report) {
  const js = c => win.webContents.executeJavaScript(c)
  const until = async (cond, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await js(cond).catch(() => false)) return true; await sleep(150) } report.push('timeout: ' + cond); return false }
  await js("showPage('debloater')").catch(e => logs.push('[showPage] ' + e.message))
  await sleep(400)
  await shot(win, path.join(dir, 'debloat-1-scanning.png'))
  await until("document.querySelector('.db-stage .db-verdict')?.dataset.tone !== 'idle'"); await sleep(1300)
  await shot(win, path.join(dir, 'debloat-2-ready.png'))
  for (const [k, sel] of [['a-intents', '.db-intents'], ['b-lanes', '.db-tools'], ['c-lanes2', '.db-lane[data-lane=\"review\"]'], ['d-guard', '.db-guard']]) { await js("document.querySelector('" + sel + "')?.scrollIntoView({ block: 'start' })"); await sleep(350); await shot(win, path.join(dir, 'debloat-2' + k + '.png')) }
  await js("document.querySelector('.db-stage')?.scrollIntoView({ block: 'start' })")
  await js("document.querySelector('.db-card[data-id=\"app:Microsoft.YourPhone\"] .db-exp')?.click(); document.querySelector('.db-lane[data-lane=\"kept\"] [data-act=\"kept-toggle\"]')?.click()"); await sleep(500)
  await shot(win, path.join(dir, 'debloat-3-details-kept.png'))
  await js("document.querySelector('[data-intent=\"laptop\"]')?.click()"); await sleep(700)
  await shot(win, path.join(dir, 'debloat-4-laptop-intent.png'))
  await js("document.querySelector('[data-intent=\"laptop\"]')?.click()"); await sleep(400)
  for (const v of ['admap', 'programs', 'extras', 'history']) {
    await js("document.querySelector('.db-bar [data-id=\"" + v + "\"]')?.click()"); await sleep(1400)
    await shot(win, path.join(dir, 'debloat-5-' + v + '.png'))
  }
  await js("document.querySelector('.db-bar [data-id=\"lean\"]')?.click()"); await sleep(500)
  await js('window.JylliWorld && (JylliWorld.holdToApply = () => false), 0'); await js("(document.querySelector('.db-verdict [data-act=\"clean\"]'))?.click()"); await sleep(600)
  await shot(win, path.join(dir, 'debloat-6-confirm.png'))
  await js("document.getElementById('confirm-modal-ok')?.click()").catch(() => {}); await sleep(1500)
  await shot(win, path.join(dir, 'debloat-7-receipt.png'))
  logs.forEach(l => report.push('   ' + l))
}

// Pulse: the tab as the river fills, a boost, every segment and a debrief; then the Cockpit and the HUD (own windows, same engine).
async function pulseShots(win, dir, logs, report, ctx, size) {
  const js = c => win.webContents.executeJavaScript(c)
  await js("showPage('pulse')").catch(e => logs.push('[showPage] ' + e.message))
  await sleep(700)
  await shot(win, path.join(dir, 'pu-1-start.png'))
  await sleep(3800)
  await shot(win, path.join(dir, 'pu-2-live.png'))
  if (LINT) { const r = await js(require('./lint-page')).catch(e => 'lint failed: ' + e.message); report.push('LINT pulse live: ' + r) }
  await js("document.querySelector('.pu-game[data-id=\"valorant\"]')?.click()"); await sleep(300)
  await js("document.getElementById('pulse-cta')?.click()"); await sleep(1700)
  await shot(win, path.join(dir, 'pu-3-boosted.png'))
  await js("document.querySelector('.pu-pick')?.scrollIntoView({ block: 'center' })"); await sleep(400)
  await shot(win, path.join(dir, 'pu-4-receipt.png'))
  for (const [i, v] of ['sessions', 'rules', 'preflight'].entries()) {
    await js("window.scrollTo(0, 0); document.getElementById('page-content')?.scrollTo(0, 0); document.querySelector('.pu .j-seg-item[data-id=\"" + v + "\"]')?.click()"); await sleep(1500)
    await shot(win, path.join(dir, 'pu-' + (5 + i) + '-' + v + '.png'))
    if (LINT) { const r = await js(require('./lint-page')).catch(e => 'lint failed: ' + e.message); report.push('LINT pulse ' + v + ': ' + r) }
  }
  await js("document.querySelector('.pu .j-seg-item[data-id=\"sessions\"]')?.click()"); await sleep(600)
  await js("document.querySelector('.pu-sess-row')?.click()"); await sleep(1400)
  await js("document.getElementById('page-content')?.scrollTo(0, 0)")
  await shot(win, path.join(dir, 'pu-8-debrief.png'))
  if (LINT) { const r = await js(require('./lint-page')).catch(e => 'lint failed: ' + e.message); report.push('LINT pulse debrief: ' + r) }
  await js("document.querySelector('.pu-cols2')?.scrollIntoView({ block: 'start' })"); await sleep(500)
  await shot(win, path.join(dir, 'pu-9-debrief-detail.png'))
  logs.forEach(l => report.push('   ' + l))
  for (const [f, sz, tag] of [['pulse.html', [1000, 740], 'cockpit'], ['pulse.html', [620, 760], 'cockpit-narrow'], ['pulse-hud.html', [304, 212], 'hud']]) {
    const w = await makeWindow(f, ctx, sz)
    await sleep(f.includes('hud') ? 2600 : 4200)
    if (tag === 'cockpit') { await w.win.webContents.executeJavaScript("document.getElementById('ck-audit')?.click()").catch(() => {}); await sleep(1200) }
    await shot(w.win, path.join(dir, 'pu-' + tag + '.png'))
    if (LINT && tag !== 'hud') { const r = await w.win.webContents.executeJavaScript(require('./lint-page')).catch(e => 'lint failed: ' + e.message); report.push('LINT pulse ' + tag + ': ' + r) }
    w.logs.forEach(l => report.push('   ' + tag + ' ' + l))
    w.win.destroy()
  }
}

// FiveM: the Uplink view as it fills, then every other view (the mock route answers with synthetic rounds).
async function fivemShots(win, dir, logs, report) {
  const js = c => win.webContents.executeJavaScript(c)
  await js("showPage('fivem')").catch(e => logs.push('[showPage] ' + e.message))
  await sleep(500)
  await shot(win, path.join(dir, 'fv-1-start.png'))
  await sleep(4200)
  await shot(win, path.join(dir, 'fv-2-uplink.png'))
  await js("document.querySelector('.fv-hops')?.setAttribute('open', '')"); await js("document.querySelector('.fv-hops')?.scrollIntoView({ block: 'center' })"); await sleep(600)
  await shot(win, path.join(dir, 'fv-3-hops.png'))
  await js("document.querySelector('.fv-findings')?.scrollIntoView({ block: 'start' })"); await sleep(400)
  await shot(win, path.join(dir, 'fv-4-preflight.png'))
  for (const [i, v] of ['sessions', 'graphics', 'client', 'crash'].entries()) {
    await js("window.scrollTo(0, 0); document.getElementById('page-content')?.scrollTo(0, 0); document.querySelector('.fv .j-seg-item[data-id=\"" + v + "\"]')?.click()"); await sleep(1300)
    await shot(win, path.join(dir, 'fv-' + (5 + i) + '-' + v + '.png'))
  }
  await js("document.querySelector('.fv .j-seg-item[data-id=\"graphics\"]')?.click()"); await sleep(400)
  await js("document.querySelector('.fv [data-preset=\"performance\"]')?.click()"); await sleep(900)
  await shot(win, path.join(dir, 'fv-9-graphics-preset.png'))
  if (LINT) { const r = await js(require('./lint-page')).catch(e => 'lint failed: ' + e.message); report.push('LINT fivem: ' + r) }
  logs.forEach(l => report.push('   ' + l))
}

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
  await win.loadFile(path.join(ROOT, file), { query: { lang: ctx.lang, scheme: SCHEME } })
  return { win, logs }
}

async function shot(win, file) {
  if (NOSHOT) return
  fs.mkdirSync(path.dirname(file), { recursive: true })
  let img = await win.webContents.capturePage()
  if (SCALE !== 1) { const sz = img.getSize(); img = img.resize({ width: Math.round(sz.width * SCALE), quality: 'good' }) }
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

// Boot scan: shoot the loading screen at fixed moments of the scene, then the handoff to Home.
async function bootShots(win, dir, logs, report, ctx) {
  const js = c => win.webContents.executeJavaScript(c).catch(() => null)
  if (SCHEME !== 'dark') await js(`JylliTheme.applyScheme(${JSON.stringify(SCHEME)})`)
  const marks = ctx.bt === 'slow' ? [1200, 3200, 9000, 16000] : ctx.bt === 'returning' || ctx.bt === 'changed' ? [500, 1300, 2600, 3600] : [900, 2400, 4600, 6600]
  let at = 0
  for (const [i, m] of marks.entries()) {
    await sleep(Math.max(0, m - at)); at = m
    await shot(win, path.join(dir, 'boot-' + (i + 1) + '-' + m + 'ms.png'))
    if (LINT) report.push('rows@' + m + ': ' + await js("[...document.querySelectorAll('#loading .boot-row')].map(r => r.id.slice(6) + ':' + r.dataset.state).join(' ')"))
  }
  if (ctx.bt === 'slow') { await js("document.getElementById('boot-continue')?.click()") }
  await sleep(1200)
  report.push(`boot ${ctx.bt}: ${(await js("document.getElementById('bt-line')?.textContent")) || '(no card)'} | ${await js("document.getElementById('bt-sig')?.textContent")}`)
  await sleep(1800)
  await shot(win, path.join(dir, 'boot-5-home.png'))
}

async function autoOptiShots(win, dir, logs, report) {
  const js = c => win.webContents.executeJavaScript(c).catch(e => { logs.push('[ao] ' + e.message) })
  const scene = () => js("document.getElementById('auto-opti').dataset.scene")
  const until = async (fn, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await js(fn)) return true; await sleep(150) } report.push('TIMEOUT waiting for ' + fn); return false }
  const click = sel => js("(function(){const b=document.querySelector(" + JSON.stringify(sel) + ");if(b){b.click();return true}return false})()")
  await js("settings.onboardingDone = true; void 0")
  await js('runAutoOpti(); void 0')
  await sleep(1500); await shot(win, path.join(dir, 'ao-1-scan.png'))
  await until("document.getElementById('auto-opti').dataset.scene === 'diagnosis'")
  await sleep(1400); await shot(win, path.join(dir, 'ao-2-diagnosis.png'))
  await js("document.getElementById('ao-right').scrollTop = 600; void 0"); await sleep(500); await shot(win, path.join(dir, 'ao-2b-diagnosis-scrolled.png'))
  await click('#ao-next'); await until("document.getElementById('auto-opti').dataset.scene === 'plan'"); await sleep(1400)
  await js("(document.querySelector('[data-toggle-open=startup]')||{click(){}}).click(); void 0"); await sleep(500)
  await shot(win, path.join(dir, 'ao-3-plan.png'))
  await click('#ao-go'); await until("!!document.querySelector('.ao-sheet')"); await sleep(900)
  await shot(win, path.join(dir, 'ao-4-run-confirm.png'))
  await click('#ao-cf-yes'); await sleep(2800); await shot(win, path.join(dir, 'ao-4b-run-mid.png'))
  await until("document.getElementById('auto-opti').dataset.scene === 'result'", 60000); await sleep(1500)
  await shot(win, path.join(dir, 'ao-5-result.png'))
  await js("document.getElementById('ao-right').scrollTop = 700; void 0"); await sleep(400); await shot(win, path.join(dir, 'ao-5b-result-scrolled.png'))
  await js('JylliAutoOpti.close(true); void 0'); await sleep(600)
  await js("settings.aom_pending_verify = { runAt: 1 }; void 0")
  await js('JylliAutoOpti.welcomeBack(); void 0'); await sleep(1800); await shot(win, path.join(dir, 'ao-6-welcome.png'))
}

// --ao-max: the Maximum-mode scenes (diagnosis hint in Safe, the plan with the mode switch, moderate rows with risk blocks, the expert section).
async function autoOptiMaxShots(win, dir, logs, report) {
  const js = c => win.webContents.executeJavaScript(c).catch(e => { logs.push('[ao] ' + e.message) })
  const until = async (fn, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await js(fn)) return true; await sleep(150) } report.push('TIMEOUT waiting for ' + fn); return false }
  const click = sel => js("(function(){const b=document.querySelector(" + JSON.stringify(sel) + ");if(b){b.click();return true}return false})()")
  await js("settings.onboardingDone = true; settings.aom_intensity = 'safe'; void 0")
  await js('runAutoOpti(); void 0')
  await until("document.getElementById('auto-opti').dataset.scene === 'diagnosis'"); await sleep(1400)
  await js("document.getElementById('ao-right').scrollTop = 99999; void 0"); await sleep(500); await shot(win, path.join(dir, 'aomax-1-diagnosis-hint.png'))
  await click('#ao-next'); await until("document.getElementById('auto-opti').dataset.scene === 'plan'"); await sleep(1200)
  await shot(win, path.join(dir, 'aomax-2-plan-safe.png'))
  await click('[data-intensity=max]'); await sleep(1800)
  for (const m of ['gpu', 'power', 'network', 'windows']) { await js("(document.querySelector('[data-toggle-open=" + m + "]')||{click(){}}).click(); void 0"); await sleep(250) }
  await shot(win, path.join(dir, 'aomax-3-plan-max.png'))
  await js("document.getElementById('ao-right').scrollTop = 99999; void 0"); await sleep(500); await shot(win, path.join(dir, 'aomax-4-expert.png'))
  await js('JylliAutoOpti.close(true); void 0'); await sleep(300)
}

async function main() {
  await app.whenReady()
  fs.mkdirSync(OUT, { recursive: true })
  const report = []
  if (GALLERY) {
    const { win, logs } = await makeWindow('tools/ui-preview/gallery.html', { lang: 'en', premium: true }, SIZES[0])
    await sleep(800)
    const h = await win.webContents.executeJavaScript('document.documentElement.scrollHeight')
    win.setContentSize(SIZES[0][0], Math.min(h, 4000)); await sleep(400)
    await shot(win, path.join(OUT, TAG, 'gallery.png'))
    logs.forEach(l => report.push(l)); console.log(report.join('\n') || 'gallery ok'); win.destroy(); app.exit(0); return
  }
  for (const lang of LANGS) for (const tier of TIERS) for (const size of SIZES) {
    const name = `${TAG}/${lang}-${tier}-${size.join('x')}`
    const ctx = { hm: HOME || arg('hm-state', null) ? String(arg('hm-state', 'attention')) : null, lang, premium: tier === 'premium', accent: ACCENT && ACCENT !== true ? ACCENT : null, arrival: !!arg('arrival', false), tours: !!arg('tours', false), debloat: arg('db-state', null), nt: NET2 || arg('nt-state', null) ? String(arg('nt-state', 'ethernet')) : null, cm: CPUMEM || arg('cm-state', null) ? String(arg('cm-state', 'x3d')) : null, gp: GPUP || arg('gp-state', null) ? String(arg('gp-state', 'nvidia')) : null, pw: POWERP || arg('pw-state', null) ? String(arg('pw-state', 'desktop')) : null, wn: WIN2 || arg('wn-state', null) ? String(arg('wn-state', 'open')) : null, dx: arg('dx-state', null), pu: arg('pu-state', null), fv: arg('fv-state', null), bt: BOOT ? String(arg('bt-state', 'first')) : null }   // --arrival: first-launch flow; --tours: guided tours on (off by default so shots stay clean)
    const { win, logs } = await makeWindow('index.html', ctx, size)
    if (BOOT) { await bootShots(win, path.join(OUT, name), logs, report, ctx); win.destroy(); continue }
    const ready = await appReady(win)
    if (!ready) { report.push(`${name}: APP NEVER BECAME READY`); logs.forEach(l => report.push('   ' + l)); win.destroy(); continue }
    await sleep(1800)   // boot animation + first metrics
    if (SCHEME !== 'dark') await win.webContents.executeJavaScript(`JylliTheme.applyScheme(${JSON.stringify(SCHEME)})`).catch(() => {})
    if (THEME && THEME !== true) await win.webContents.executeJavaScript(`settings.theme=${JSON.stringify(THEME)}; applyTheme(${JSON.stringify(THEME)}); try { JylliWorld.apply() } catch {}`).catch(() => {})
    if (DIAG) { await diagShots(win, path.join(OUT, name), logs, report); win.destroy(); continue }
    if (PULSE) { await pulseShots(win, path.join(OUT, name), logs, report, ctx, size); win.destroy(); continue }
    if (FIVEM) { await fivemShots(win, path.join(OUT, name), logs, report); win.destroy(); continue }
    if (POWERP) { await powerShots(win, path.join(OUT, name), logs, report, ctx); win.destroy(); continue }
    if (GPUP) { await gpuShots(win, path.join(OUT, name), logs, report, ctx); win.destroy(); continue }
    if (CPUMEM) { await cpumemShots(win, path.join(OUT, name), logs, report, ctx); win.destroy(); continue }
    if (NET2) { await networkShots(win, path.join(OUT, name), logs, report); win.destroy(); continue }
    if (WIN2) { await windowsShots(win, path.join(OUT, name), logs, report); win.destroy(); continue }
    if (DEBLOAT) { await debloatShots(win, path.join(OUT, name), logs, report); win.destroy(); continue }
    if (AUTO_OPTI) { await (arg('ao-max', false) ? autoOptiMaxShots : autoOptiShots)(win, path.join(OUT, name), logs, report); win.destroy(); continue }
    for (const page of (ONLY_PAGES || (HOME ? ['dashboard'] : PAGES))) {
      logs.length = 0
      await win.webContents.executeJavaScript(`showPage(${JSON.stringify(page)})`).catch(e => logs.push('[showPage] ' + e.message))
      await sleep(1100)
      await shot(win, path.join(OUT, name, `${page}.png`))
      if (LINT) { const r = await win.webContents.executeJavaScript(require('./lint-page')).catch(e => 'lint failed: ' + e.message); report.push(`LINT ${name}/${page}: ${r}`) }
      if (logs.length) { report.push(`${name}/${page}:`); logs.forEach(l => report.push('   ' + l)) }
    }
    for (const [oname, js] of OVERLAYS) {
      logs.length = 0
      const out = await win.webContents.executeJavaScript(js).catch(e => { logs.push('[overlay] ' + e.message) })
      if (typeof out === 'string' || typeof out === 'number') report.push(`${name}/overlay-${oname} => ${out}`)
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
  fs.mkdirSync(path.join(OUT, TAG), { recursive: true })
  fs.writeFileSync(path.join(OUT, TAG, 'report.txt'), lines.join('\n'))
  console.log(lines.join('\n'))
  app.exit(0)
}

app.on('window-all-closed', e => e.preventDefault())
main().catch(e => { console.error(e); app.exit(1) })
