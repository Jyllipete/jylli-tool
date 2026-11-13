// Collects Finnish stills of the real pages for the release video: node tools/promo/shoot.js [--only a,b]
// Uses the preview harness (fixture data only: no registry, services or network). Raw output: shots/raw/<run>/fi-premium-1920x1100/*.png
// shots/manifest.json (written by --manifest, see PICKS) maps a shot id -> file; the timeline only knows ids.
const { spawnSync } = require('child_process')
const fs = require('fs'), path = require('path')
const ROOT = path.join(__dirname, '..', '..')
const RAW = path.join(__dirname, 'shots', 'raw')
const electron = require('electron')
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d }
const only = arg('only', '') ? arg('only').split(',') : null

const RUNS = {
  home:     ['--home', '--hm-state', 'attention'],
  boot:     ['--boot', '--bt-state', 'first'],
  arrival:  ['--arrival', '--pages', 'dashboard'],
  tours:    ['--tours', '--pages', 'dashboard'],
  ao:       ['--auto-opti'],
  aomax:    ['--auto-opti', '--ao-max', '--ao-profile', 'max-desktop'],
  gpu:      ['--gpu', '--gp-state', 'nvidia'],
  cpumem:   ['--cpumem', '--cm-state', 'x3d'],
  power:    ['--power', '--pw-state', 'desktop'],
  net:      ['--net2', '--nt-state', 'ethernet'],
  diag:     ['--diagnostics'],
  pulse:    ['--pulse'],
  fivem:    ['--fivem'],
  debloat:  ['--debloat'],
  win:      ['--win2'],
  pages:    ['--pages', 'bios-tuner,gaming,changelog,settings,restore-points,privacy-cleanup,scheduler,latency-monitor,fixes'],
  liquid:   ['--pages', 'dashboard,settings', '--theme', 'liquid'],
  light:    ['--pages', 'dashboard', '--theme', 'liquid', '--scheme', 'light'],
  extra:    ['--pages', 'replay,game-opti,cleanup,app-optimizer,windows-opti,startup-manager'],
  palette:  ['--pages', 'dashboard', '--overlay', '@' + path.join(__dirname, 'overlays', 'palette.js')],
  shortcuts:['--pages', 'dashboard', '--overlay', '@' + path.join(__dirname, 'overlays', 'shortcuts.js')],
  toast:    ['--pages', 'dashboard', '--overlay', '@' + path.join(__dirname, 'overlays', 'toast.js')],
  gl:       ['--home', '--hm-state', 'attention', '--gl'],
}
const PALETTE = "(() => { try { const e = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }); document.dispatchEvent(e); window.dispatchEvent(e) } catch {} })()"

if (require.main === module && !process.argv.includes('--manifest')) {
  for (const [name, flags] of Object.entries(RUNS)) {
    if (only && !only.includes(name)) continue
    const out = path.join(RAW, name)
    fs.rmSync(out, { recursive: true, force: true })
    const args = [path.join(ROOT, 'tools', 'ui-preview', 'preview-main.js'), '--out', out, '--tag', 'r', '--lang', 'fi', '--size', '1920x1100', '--zoom', '1.0909', ...flags]
    const t0 = Date.now()
    const r = spawnSync(electron, args, { cwd: ROOT, encoding: 'utf8', timeout: 240000 })
    const n = fs.existsSync(out) ? fs.readdirSync(out, { recursive: true }).filter(f => /\.png$/.test(f)).length : 0
    console.log(`${name.padEnd(8)} ${n} png  ${((Date.now() - t0) / 1000).toFixed(0)}s  exit ${r.status}${r.status ? '\n' + (r.stderr || '').slice(-300) : ''}`)
  }
}

// shot id -> raw still (run/file). The timeline only knows ids; swap a file here to change a picture.
const PICKS = {
  home: 'home/dashboard', 'boot-scan': 'boot/boot-3-4600ms', 'boot-done': 'boot/boot-4-6600ms', arrival: 'arrival/dashboard', tour: 'tours/dashboard',
  'ao-plan': 'ao/ao-3-plan', 'ao-diag': 'ao/ao-2-diagnosis', 'ao-result': 'ao/ao-5-result', 'ao-max': 'aomax/aomax-3-plan-max', 'ao-expert': 'aomax/aomax-4-expert',
  gpu: 'gpu/gp-2-overview', 'gpu-rails': 'gpu/gp-3-cards', 'gpu-display': 'gpu/gp-9-display', cpumem: 'cpumem/cm-2-overview', 'cpumem-lab': 'cpumem/cm-9-lab',
  power: 'power/pw-2-overview', 'power-plans': 'power/pw-3-plans', 'power-energy': 'power/pw-8-energy-session',
  net: 'net/net-2-ready', 'net-checkup': 'net/net-4-findings', 'net-measure': 'net/net-12-measure', 'net-history': 'net/net-14-history',
  diag: 'diag/dx-3-result', 'diag-timeline': 'diag/dx-5-timeline', debloat: 'debloat/debloat-2-ready', 'debloat-receipt': 'debloat/debloat-7-receipt', cleanup: 'extra/cleanup',
  pulse: 'pulse/pu-2-live', 'pulse-hud': 'pulse/pu-hud', 'pulse-cockpit': 'pulse/pu-cockpit', 'pulse-debrief': 'pulse/pu-8-debrief', games: 'extra/game-opti', apps: 'extra/app-optimizer',
  fivem: 'fivem/fv-2-uplink', windows: 'win/win-2-ready', qol: 'win/win-9-qol', journal: 'pages/changelog', restore: 'pages/restore-points', latency: 'pages/latency-monitor', scheduler: 'pages/scheduler', fixes: 'pages/fixes',
  'pulse-receipt': 'pulse/pu-4-receipt', palette: 'palette/overlay-palette', shortcuts: 'shortcuts/overlay-shortcuts', toast: 'toast/overlay-toast', glass: 'liquid/dashboard', light: 'light/dashboard',
}
function manifest() {
  const out = {}, dir = path.join(__dirname, 'shots')
  for (const [id, rel] of Object.entries(PICKS)) {
    const [run, name] = rel.split('/')
    const base = path.join(RAW, run)
    const hit = fs.existsSync(base) && fs.readdirSync(base, { recursive: true }).find(f => path.basename(f) === name + '.png' && !/(^|[\/])dashboard-/.test(f))
    // liquid/light share file names (dashboard.png) with other runs, so the run folder decides
    if (!hit) { console.warn('missing still for', id, rel); continue }
    fs.copyFileSync(path.join(base, hit), path.join(dir, id + '.png')); out[id] = 'shots/' + id + '.png'
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(out, null, 1)); console.log(Object.keys(out).length + ' shots in manifest')
}
if (process.argv.includes('--manifest')) manifest()
module.exports = { RUNS, PALETTE, PICKS }
