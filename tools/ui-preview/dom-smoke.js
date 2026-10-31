// Headless DOM smoke test (jsdom, no Electron, no GPU): loads index.html with the preview fixtures as window.api,
// opens every legacy page id and reports console errors + header text. Needs jsdom, which is not a project dependency: npm i --no-save jsdom@24 (CPU-only, never opens a window).
// Usage: node tools/ui-preview/dom-smoke.js [lang] [premium|free]
const { JSDOM, VirtualConsole } = require('jsdom')
const fs = require('fs'), path = require('path')
const ROOT = path.join(__dirname, '..', '..') + path.sep
const { respond } = require(ROOT + 'tools/ui-preview/fixtures.js')
const lang = process.argv[2] || 'en', premium = (process.argv[3] || 'premium') === 'premium'
const ctx = { lang, premium }
const preload = fs.readFileSync(ROOT + 'preload.js', 'utf8') + fs.readFileSync(ROOT + 'preload-overlay.js', 'utf8')
const keys = [...new Set([...preload.matchAll(/^\s{2}([A-Za-z0-9_]+):\s/gm)].map(m => m[1]))]
const errors = []
const vc = new VirtualConsole()
vc.on('jsdomError', e => { console.log('JSDOM:', (e.detail?.message || e.message).slice(0,300)); errors.push('[jsdomError] ' + (e.detail?.message || e.message).slice(0, 200)) })
vc.on('error', (...a) => errors.push('[console.error] ' + a.join(' ').slice(0, 200)))

const dom = new JSDOM(fs.readFileSync(ROOT + 'index.html', 'utf8'), {
  url: require('url').pathToFileURL(ROOT + 'index.html').href + '?lang=' + lang, runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) {
    const api = {}
    for (const k of keys) {
      if (/^on[A-Z]/.test(k)) api[k] = () => () => {}
      else if (/^off[A-Z]/.test(k)) api[k] = () => {}
      else api[k] = async (...a) => { await new Promise(r => setTimeout(r, 400)); const r = respond(k, a, ctx); return r === undefined ? { ok: false, mock: 'no-fixture' } : r }
    }
    const mem = {}; const ls = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v) }, removeItem: k => { delete mem[k] }, clear: () => {} }
    Object.defineProperty(w, 'localStorage', { value: ls }); Object.defineProperty(w, 'sessionStorage', { value: ls })
    w.api = api
    w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }))
    w.HTMLCanvasElement.prototype.getContext = (kind) => /webgl/i.test(String(kind)) ? null : new Proxy({}, { get: (t, p) => (p === 'canvas' ? {} : () => ({ addColorStop() {}, width: 0 })), set: () => true })
    w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} }
    w.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} }
    w.scrollTo = () => {}; w.Element.prototype.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {}
  },
})
const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  const w = dom.window
  for (let i = 0; i < 60; i++) { if (w.document.getElementById('app') && !w.document.getElementById('app').classList.contains('hidden') && typeof w.showPage === 'function') break; await sleep(250) }
  console.log('app ready:', !!w.document.getElementById('app') && !w.document.getElementById('app').classList.contains('hidden'))
  await sleep(1500)
  const pages = ['dashboard', 'preflight', 'fixes', 'restore-points', 'performance', 'gaming', 'network', 'privacy-cleanup', 'startup-manager', 'process-manager', 'latency-monitor', 'bios-tuner', 'pulse', 'fivem', 'scheduler', 'changelog', 'settings', 'windows-opti', 'hardware', 'debloater', 'cleanup', 'game-opti', 'app-optimizer']
  for (const p of pages) {
    errors.length = 0
    try { w.showPage(p) } catch (e) { errors.push('[throw] ' + e.message) }
    await sleep(700)
    const head = w.document.querySelector('#j-head .j-section-title')?.textContent
    const tab = w.document.querySelector('#j-head .j-tab-active')?.textContent
    const len = w.document.getElementById('page-content').innerHTML.length
    const active = w.document.querySelector('.j-nav-active')?.dataset.section
    console.log(`${p.padEnd(16)} -> ${String(head).padEnd(10)} tab=${String(tab).padEnd(14)} nav=${String(active).padEnd(9)} content=${len}${errors.length ? '\n    ' + errors.join('\n    ') : ''}`)
  }
  process.exit(0)
})()
