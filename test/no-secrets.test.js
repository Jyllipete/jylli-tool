// Guard: no credential-shaped string may be committed, and local secret files must stay ignored.
const test = require('node:test')
const assert = require('node:assert')
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const PATTERNS = {
  'Discord webhook URL': /discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{20,}/,
  'Discord bot token': /[MNO][A-Za-z0-9_-]{23,27}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}/,
  'private key block': /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  'GitHub token': /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/,
}
const SKIP = /(^|\/)(package-lock\.json|node_modules\/|.*\.(png|jpg|woff2?|ico|gz|exe))$/

function tracked() {
  try { return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean) } catch { return null }
}

test('no credential-shaped strings in tracked files', t => {
  const files = tracked()
  if (!files) return t.skip('not a git checkout')
  const hits = []
  for (const f of files) {
    if (SKIP.test(f) || f === 'test/no-secrets.test.js') continue
    let text; try { text = fs.readFileSync(path.join(root, f), 'utf8') } catch { continue }
    for (const [name, re] of Object.entries(PATTERNS)) if (re.test(text)) hits.push(`${f}: ${name}`)
  }
  assert.deepStrictEqual(hits, [])   // names the file and kind only, never the value
})

test('local secret files are gitignored', t => {
  if (!tracked()) return t.skip('not a git checkout')
  for (const f of ['.env', '.env.local', '.idea/workspace.xml']) {
    let ignored = true
    try { execFileSync('git', ['check-ignore', '-q', f], { cwd: root }) } catch { ignored = false }
    assert.ok(ignored, `${f} must be gitignored`)
  }
})
