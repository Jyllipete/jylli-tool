// Headless interaction test (jsdom; npm i --no-save jsdom@24): clicks every sidebar section and tab, toggles Advanced mode, switches language,
// collapses the sidebar and opens the drawer. Usage: node tools/ui-preview/dom-interact.js [lang] [premium|free]
// Note: content of slow pages (several mock API calls at 400 ms each) can still be empty when sampled; re-run if only those fail.
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
    w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (t, p) => (p === 'canvas' ? {} : () => ({ addColorStop() {}, width: 0 })), set: () => true })
    w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} }
    w.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} }
    w.scrollTo = () => {}; w.Element.prototype.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {}
  },
})
const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  const w = dom.window
  for (let i = 0; i < 60; i++) { if (w.document.getElementById('app') && !w.document.getElementById('app').classList.contains('hidden') && typeof w.showPage === 'function') break; await sleep(250) }
  await sleep(1500)
  const d = w.document, q = s => d.querySelector(s), bad = []
  const check = (c, m) => { if (!c) bad.push(m) }
  const R = w.JylliRoutes
  const tabBtn = id => [...d.querySelectorAll('#j-head .j-tab')].find(x => x.getAttribute('onclick') === "Shell.tab('" + id + "')")
  for (const s of R.SECTIONS) {
    errors.length = 0
    q('.j-nav-item[data-section="' + s.id + '"]').click(); await sleep(500)
    check(q('.j-nav-active')?.dataset.section === s.id, 'nav active ' + s.id)
    check(q('#j-head .j-section-title'), 'title ' + s.id)
    for (const t of s.tabs) {
      errors.length = 0
      if (s.tabs.length > 1) {
        const b = tabBtn(t.id)
        if (!b) { bad.push('tab button hidden (advanced?) ' + s.id + '/' + t.id); w.Shell.tab(t.id) } else b.click()
      }
      await sleep(500)
      check(s.tabs.length === 1 || tabBtn(t.id)?.classList.contains('j-tab-active'), 'active tab ' + s.id + '/' + t.id)
      check(d.getElementById('page-content').children.length > 0, 'content empty ' + s.id + '/' + t.id)
      if (errors.length) bad.push('errors ' + s.id + '/' + t.id + ': ' + errors.join(' | '))
    }
  }
  w.settings.advancedMode = false; w.Shell.go('system'); await sleep(300)
  const off = d.querySelectorAll('#j-head .j-tab').length
  w.toggleAdvancedMode(); await sleep(300)
  const on = d.querySelectorAll('#j-head .j-tab').length
  console.log('system tabs advanced off/on:', off, on); check(on > off, 'advanced should add tabs')
  await w.setLanguage('fi'); await sleep(900)
  console.log('fi nav:', [...d.querySelectorAll('.j-nav-item[data-section] > span:first-of-type')].map(x => x.textContent).join(','))
  check(q('.j-nav-item[data-section=optimize] > span').textContent === 'Optimoi', 'nav fi')
  w.toggleSidebar(); check(q('#j-sidebar').classList.contains('j-collapsed'), 'collapse')
  w.toggleLogPane(); check(q('#log-pane').classList.contains('j-open'), 'drawer open')
  w.appendLog('hello', 'ok'); check(d.getElementById('log-output').textContent.includes('hello'), 'log append')
  console.log(bad.length ? 'PROBLEMS:\n  ' + bad.join('\n  ') : 'ALL INTERACTIONS OK')
  process.exit(0)
})()
