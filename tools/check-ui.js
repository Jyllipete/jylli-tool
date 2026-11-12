// UI guard for the UI rework. Never launches the app.
//  1. js/ui.js and js/pages/** must not contain hex colours or colour-bearing inline styles (use tokens / j- classes).
//  2. LANG keys must exist in both en and fi.
// Usage: node tools/check-ui.js [--strict]   (non-strict only reports LANG gaps that existed before the rework, see LANG_BASELINE)
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.join(__dirname, '..')
const strict = process.argv.includes('--strict')
let failures = 0
const fail = m => { failures++; console.error('✖ ' + m) }

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name)
    if (f.isDirectory()) walk(p, out)
    else if (f.name.endsWith('.js')) out.push(p)
  }
  return out
}

// ── 1. no hex / colour literals in the new component code ──
const NEW_FILES = ['tour', 'tours', 'concierge', 'arrival', 'auto-opti', 'auto-opti/reactor', 'bios/category', 'bios/workstation', 'bios/easy', 'ui/filter', 'ui/tab-kit'].map(n => path.join(root, 'js', n + '.js'))
const files = [path.join(root, 'js', 'ui.js'), ...NEW_FILES, ...walk(path.join(root, 'js', 'pages')), ...walk(path.join(root, 'js', 'cleanup')), ...walk(path.join(root, 'js', 'diagnostics')), ...walk(path.join(root, 'js', 'fivem')), ...walk(path.join(root, 'js', 'windows')), ...walk(path.join(root, 'js', 'network')), ...walk(path.join(root, 'js', 'pulse'))].filter(f => fs.existsSync(f))
const COLOR_STYLE = /style\s*=\s*["'`][^"'`]*(color|background|border|box-shadow|fill|stroke)\s*:/i
for (const f of files) {
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    const code = line.replace(/^\s*\/\/.*$/, '')
    if (/#[0-9a-f]{3,8}\b/i.test(code.replace(/&#\d+;/g, '')) ) fail(`${path.relative(root, f)}:${i + 1} hex colour literal`)
    if (COLOR_STYLE.test(code)) fail(`${path.relative(root, f)}:${i + 1} colour in inline style`)
  })
}

// ── 1b. line-clamp safety: never changed on :hover/:focus, always paired with overflow:hidden ──
// (a hover rule with overflow:visible plus a clamp kept by a higher-specificity rule painted hidden lines over the card's risk box)
{
  const cssDir = path.join(root, 'css')
  const hov = /:(hover|focus|focus-within)\b/
  for (const f of fs.readdirSync(cssDir).filter(n => n.endsWith('.css'))) {
    const src = fs.readFileSync(path.join(cssDir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...src.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(r => [r[1].trim(), r[2]])
    for (const [sel, body] of rules) {
      if (hov.test(sel) && /-webkit-line-clamp\s*:/.test(body)) fail(`css/${f}: "${sel.slice(0, 60)}" changes line-clamp on hover/focus (use a state class like .tc-open)`)
      if (hov.test(sel) && /(^|[;\s])overflow(-y)?\s*:\s*visible/.test(body) && /desc|clamp/.test(sel)) fail(`css/${f}: "${sel.slice(0, 60)}" sets overflow:visible on hover for text that may be clamped`)
      if (/-webkit-line-clamp\s*:\s*[1-9]/.test(body) && !rules.some(([s2, b2]) => s2 === sel && /overflow(-y)?\s*:\s*hidden/.test(b2))) fail(`css/${f}: "${sel.slice(0, 60)}" sets -webkit-line-clamp without overflow:hidden`)
    }
  }
}

// ── 2. LANG parity ──
function loadLang() {
  const split = [path.join(root, 'js', 'lang', 'en.js'), path.join(root, 'js', 'lang', 'fi.js')]
  const ctx = {}
  vm.createContext(ctx)
  if (split.every(fs.existsSync)) {
    for (const f of split) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f })
    vm.runInContext('this.LANG = LANG', ctx)   // top-level const is not a context property
    return ctx.LANG
  }
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  const start = html.indexOf('\nconst LANG = {')
  const end = html.indexOf('\n}\n', start)
  if (start < 0 || end < 0) { fail('LANG object not found'); return null }
  vm.runInContext(html.slice(start, end + 3) + '\nthis.LANG = LANG', ctx)
  return ctx.LANG
}
const LANG = loadLang()
if (!LANG) fail('LANG did not load')
else {
  const flat = o => Object.entries(o || {}).flatMap(([g, v]) => v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).map(k => g + '.' + k) : [g])
  const en = flat(LANG.en), fi = new Set(flat(LANG.fi))
  const enSet = new Set(en)
  const missingFi = en.filter(k => !fi.has(k)), missingEn = [...fi].filter(k => !enSet.has(k))
  console.log(`LANG: en ${en.length} keys, fi ${fi.size} keys, missing in fi ${missingFi.length}, missing in en ${missingEn.length}`)
  if (strict) {
    missingFi.forEach(k => fail(`LANG.fi missing "${k}"`)); missingEn.forEach(k => fail(`LANG.en missing "${k}"`))
  } else {
    // Gaps that predate the rework are tolerated; new keys must be paired. The baseline is the count recorded below.
    const LANG_BASELINE = { missingFi: null, missingEn: null }
    const b = path.join(__dirname, 'lang-baseline.json')
    const base = fs.existsSync(b) ? JSON.parse(fs.readFileSync(b, 'utf8')) : LANG_BASELINE
    const known = new Set([...(base.missingFi || []), ...(base.missingEn || [])])
    missingFi.concat(missingEn).filter(k => !known.has(k)).forEach(k => fail(`LANG key "${k}" exists in only one language`))
    if (process.argv.includes('--write-baseline')) {
      fs.writeFileSync(b, JSON.stringify({ missingFi, missingEn }, null, 1))
      console.log('baseline written')
    }
  }
}

// 2b. Tours (js/tours.js): every stop has en + fi copy, and every target exists. A [data-tour="x"] target must be defined as
// data-tour="x" in a builder (or via the tour's own `tag` map, whose #id / .class tokens must exist in the sources); plain #id selectors must exist too.
{
  const tp = path.join(root, 'js', 'tours.js')
  if (fs.existsSync(tp)) {
    const srcFiles = [path.join(root, 'index.html'), path.join(root, 'js', 'shell.js'), path.join(root, 'js', 'premium.js'), path.join(root, 'js', 'bios', 'workstation.js'), ...walk(path.join(root, 'js', 'pages')), ...walk(path.join(root, 'js', 'cleanup')), ...walk(path.join(root, 'js', 'windows')), ...walk(path.join(root, 'js', 'network')), ...walk(path.join(root, 'js', 'debloat')), ...walk(path.join(root, 'js', 'diagnostics')), ...walk(path.join(root, 'js', 'fivem')), ...walk(path.join(root, 'js', 'pulse')), ...walk(path.join(root, 'js', 'home'))].filter(f => fs.existsSync(f))
    const src = srcFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n')
    const ctx = { window: null }; ctx.window = ctx; vm.createContext(ctx)
    vm.runInContext(fs.readFileSync(tp, 'utf8'), ctx, { filename: tp })
    let n = 0
    for (const [key, def] of Object.entries(ctx.JylliTours || {})) {
      for (const [name, css] of Object.entries(def.tag || {})) {
        for (const tok of css.match(/[#.][A-Za-z][\w-]*/g) || []) if (!src.includes(tok.slice(1))) fail(`tours.js ${key}: tag ${name} uses "${tok}" which no builder defines`)
      }
      for (const s of def.stops) {
        n++
        for (const l of ['en', 'fi']) if (!s[l] || !s[l].t || !s[l].b) fail(`tours.js ${key}: stop ${s.sel} lacks ${l} copy`)
        const m = /^\[data-tour="([^"]+)"\]$/.exec(s.sel)
        if (m) {
          const name = m[1], tpl = name.startsWith('settings-') && src.includes('data-tour="settings-${id}"')
          if (!(def.tag && def.tag[name]) && !src.includes(`data-tour="${name}"`) && !src.includes(`dataset.tour = '${name}'`) && !tpl) fail(`tours.js ${key}: [data-tour="${name}"] has no builder`)
        } else if (/^#[\w-]+$/.test(s.sel) && !src.includes(`id="${s.sel.slice(1)}"`)) fail(`tours.js ${key}: ${s.sel} not found`)
      }
    }
    console.log(`tours: ${Object.keys(ctx.JylliTours || {}).length} tours, ${n} stops checked`)
  }
}

// 3. No hardware vendor/model literals in pages or the twin: every hardware name on screen comes from detection.
// Lines that only strip a brand prefix from a detected string (.replace) are fine.
{
  const rx = /\b(RTX|GTX|Ryzen|Radeon|GeForce|Humax|I225|Realtek|Core i[3579]|Threadripper|Xeon)\b/
  for (const d of ['js/twin', 'js/pages']) {
    const dir = path.join(__dirname, '..', d)
    if (!fs.existsSync(dir)) continue
    for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.js'))) {
      fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/).forEach((line, i) => {
        if (rx.test(line) && !/\.replace\(/.test(line)) fail(`${d}/${f}:${i + 1} hardware name literal: ${line.trim().slice(0, 80)}`)
      })
    }
  }
}

console.log(failures ? `\n${failures} failure(s)` : '✔ ui checks ok')
process.exit(failures ? 1 : 0)
