// Regression guard: every function an inline onclick="name(" handler calls, and every function the page builders start
// (startPfHogRail ...), must be defined somewhere in the app's scripts. A refactor once deleted the CPU hog rail from
// index.html while the Processes tab still called it, and the tab showed "startPfHogRail is not defined".
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs'), path = require('path')
const root = path.join(__dirname, '..')
const files = ['index.html', ...fs.readdirSync(path.join(root, 'js'), { recursive: true }).filter(f => f.endsWith('.js') && !/vendor|lang/.test(f)).map(f => path.join('js', f))]
const src = files.map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n')
const esc = s => s.replace(/[$]/g, '\\$')
const defined = n => new RegExp(`(function\\s+${esc(n)}\\b|\\b(let|const|var)\\s+${esc(n)}\\b|\\b${esc(n)}\\s*[:=]\\s*(async\\s*)?(function\\b|\\())|window\\.${esc(n)}\\s*=`).test(src)

test('every inline onclick handler calls a function that exists', () => {
  const skip = new Set(['if', 'event', 'this', 'return', 'confirm', 'alert', 'setTimeout', 'document', 'window'])
  const used = new Set([...src.matchAll(/onclick="\s*([A-Za-z_$][\w$]*)\(/g)].map(m => m[1]).filter(n => !skip.has(n)))
  const missing = [...used].filter(n => !defined(n))
  assert.deepStrictEqual(missing, [], 'undefined inline handlers: ' + missing.join(', '))
})

test('the Processes tab hog rail is fully defined', () => {
  for (const n of ['startPfHogRail', 'stopPfHogRail', '_pfUpdateHogRail', 'pfToggleFreeze', 'pfShowSessionReport', 'pfHogCardHtml', '_pfFrozenLocal', 'doKillProcess']) assert.ok(defined(n), n + ' is not defined')
})
