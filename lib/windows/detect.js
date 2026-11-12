'use strict'
// Live state: ONE read-only PowerShell script that reads what each catalog probe names, and the pure compare that turns the readings into a state.
// buildScript() / parse() / evaluate() are pure (unit-tested); index.js runs the script through deps.runPS.
// The script only reads (Get-ItemPropertyValue, Get-Service, Get-ScheduledTask, Test-Path, Get-MMAgent). It never writes anything.
const catalog = require('./catalog')

const MARK = 'JJWIN:'
const psq = s => String(s).replace(/'/g, "''")

/** The probe input for the given ids: { id: [probe, ...] } (ids without a probe are left out). */
function plan(ids) {
  const out = {}
  for (const id of ids || catalog.ids()) {
    const it = catalog.byId[id]
    if (it && it.probe && it.probe.length) out[id] = it.probe
  }
  return out
}

/** Flatten every probe to one reading request {k, ...}: de-duplicated so a key shared by several tweaks is read once. */
function requests(p) {
  const seen = new Map()
  for (const list of Object.values(p)) for (const c of list) seen.set(keyOf(c), readReq(c))
  return [...seen.values()]
}
function keyOf(c) {
  if (c.r) return 'r|' + c.r + '|' + c.n
  if (c.s) return 's|' + c.s
  if (c.t) return 't|' + c.t + '|' + c.n
  if (c.nofile) return 'f|' + c.nofile
  return 'x|' + c.x
}
function readReq(c) {
  const k = keyOf(c)
  if (c.r) return { k, a: 'r', p: c.r, n: c.n }
  if (c.s) return { k, a: 's', p: c.s }
  if (c.t) return { k, a: 't', p: c.t, n: c.n }
  if (c.nofile) return { k, a: 'f', p: c.nofile }
  return { k, a: 'x', p: c.x }
}

function buildScript(p = plan()) {
  const json = psq(JSON.stringify(requests(p)))
  return `$ErrorActionPreference='SilentlyContinue'
$q = '${json}' | ConvertFrom-Json
$o = [ordered]@{}
foreach ($i in $q) {
  $v = $null
  switch ($i.a) {
    'r' { try { $v = [string](Get-ItemPropertyValue -LiteralPath $i.p -Name $i.n -ErrorAction Stop) } catch { $v = $null } }
    's' { $s = Get-Service -Name $i.p -ErrorAction SilentlyContinue; $v = if ($s) { [string]$s.StartType } else { 'MISSING' } }
    't' { $t = Get-ScheduledTask -TaskPath $i.p -TaskName $i.n -ErrorAction SilentlyContinue; $v = if ($t) { [string]$t.State } else { 'MISSING' } }
    'f' { $v = [string](Test-Path -LiteralPath $i.p) }
    'x' { if ($i.p -eq 'memcomp') { $m = Get-MMAgent -ErrorAction SilentlyContinue; $v = if ($m) { [string]$m.MemoryCompression } else { $null } } }
  }
  $o[$i.k] = $v
}
'${MARK}' + ($o | ConvertTo-Json -Compress)
`
}

/** stdout -> { key: string|null } (null = could not read), or null when the script printed nothing usable. */
function parse(out) {
  const line = String(out || '').split(/\r?\n/).reverse().find(l => l.startsWith(MARK))
  if (!line) return null
  try { const o = JSON.parse(line.slice(MARK.length)); return o && typeof o === 'object' ? o : null } catch { return null }
}

// One probe against one reading -> 'match' | 'miss' | 'na' (service/task missing: nothing to switch) | 'unread'
function check(c, readings) {
  const now = readings[keyOf(c)]
  if (now === undefined) return 'unread'
  if (c.s || c.t) {
    if (now === 'MISSING') return 'na'
    if (now === null) return 'unread'
    return String(now).toLowerCase() === String(c.eq).toLowerCase() ? 'match' : 'miss'
  }
  if (c.nofile) return now === null ? 'unread' : now === 'False' || now === 'false' ? 'match' : 'miss'
  if (c.x === 'memcomp') return now === null ? 'unread' : now === 'False' || now === 'false' ? 'match' : 'miss'
  if (now === null) return 'miss'   // a registry value that is not there is the Windows default
  if (c.eq && typeof c.eq === 'object') {
    const n = Number(now)
    if (!Number.isFinite(n)) return 'miss'
    if ('ge' in c.eq) return n >= c.eq.ge ? 'match' : 'miss'
    if ('le' in c.eq) return n <= c.eq.le ? 'match' : 'miss'
  }
  return String(now) === String(c.eq) ? 'match' : 'miss'
}

/** readings -> { id: { state: 'all'|'some'|'none'|'unread', values:[{what, want, now, ok}] } } for every id that has a probe. */
function evaluate(readings, p = plan()) {
  const res = {}
  for (const [id, list] of Object.entries(p)) {
    let match = 0, miss = 0, unread = 0
    const values = []
    for (const c of list) {
      const r = readings ? check(c, readings) : 'unread'
      if (r === 'match') match++; else if (r === 'miss') miss++; else if (r === 'unread') unread++
      values.push({ what: label(c), want: wantText(c), now: readings && readings[keyOf(c)] !== undefined ? readings[keyOf(c)] : null, ok: r === 'match' ? true : r === 'miss' ? false : null })
    }
    res[id] = { state: unread && !match && !miss ? 'unread' : !match && !miss ? 'na' : miss === 0 ? 'all' : match === 0 ? 'none' : 'some', values }
  }
  return res
}

function label(c) {
  if (c.r) return c.r.replace(/^HK(LM|CU):\\/, 'HK$1\\') + '\\' + c.n
  if (c.s) return 'service ' + c.s
  if (c.t) return 'task ' + c.t + c.n
  if (c.nofile) return c.nofile
  return c.x === 'memcomp' ? 'memory compression' : c.x
}
function wantText(c) {
  if (c.s || c.t) return String(c.eq)
  if (c.nofile) return 'absent'
  if (c.x === 'memcomp') return 'off'
  if (c.eq && typeof c.eq === 'object') return ('ge' in c.eq ? '>= ' + c.eq.ge : '<= ' + c.eq.le)
  return String(c.eq)
}

module.exports = { MARK, plan, requests, keyOf, buildScript, parse, check, evaluate }
