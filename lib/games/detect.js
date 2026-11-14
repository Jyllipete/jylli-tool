'use strict'
// One read-only PowerShell probe for the games' executables: IFEO priority (by exe name), DirectX per-app string, compatibility layers
// and `powercfg /powerthrottling list` (needs elevation: an unelevated read says so and stays "unread", never "none").
const catalog = require('./catalog')
const exes = require('./exes')

const MAX_PATHS = 120

function buildScript(paths) {
  const list = (paths || []).filter(exes.SAFE).slice(0, MAX_PATHS)
  return [
    "$ErrorActionPreference = 'SilentlyContinue'",
    '$paths = @(' + list.map(catalog.q).join(', ') + ')',
    '$res = @()',
    'foreach ($p in $paths) {',
    '  $n = [IO.Path]::GetFileName($p)',
    `  $i = (Get-ItemProperty ('${catalog.IFEO_BASE}\\' + $n + '\\PerfOptions') -Name CpuPriorityClass -EA SilentlyContinue).CpuPriorityClass`,
    `  $d = (Get-ItemProperty '${catalog.DX_KEY}' -EA SilentlyContinue).PSObject.Properties[$p].Value`,
    `  $f = (Get-ItemProperty '${catalog.LAYERS_KEY}' -EA SilentlyContinue).PSObject.Properties[$p].Value`,
    '  $res += [pscustomobject]@{ p = $p; ifeo = $i; dx = $d; fso = $f }',
    '}',
    "$t = (powercfg /powerthrottling list 2>&1) -join \"`n\"",
    'ConvertTo-Json -Compress -Depth 4 @{ rows = @($res); thr = $t }',
  ].join('\n')
}

/** -> { byPath: { <lowercase path>: { ifeo, dx, fso } }, throttle: { read:boolean, paths:Set-like [lowercase] } } | null */
function parse(out) {
  let j; try { j = JSON.parse(String(out || '').trim()) } catch { return null }
  if (!j || !Array.isArray(j.rows)) return null
  const byPath = {}
  for (const r of j.rows) if (r && r.p) byPath[String(r.p).toLowerCase()] = { ifeo: r.ifeo == null ? null : Number(r.ifeo), dx: r.dx == null ? null : String(r.dx), fso: r.fso == null ? null : String(r.fso) }
  const thr = String(j.thr || '')
  const read = thr.length > 0 && !/administrator|elevated|denied|access/i.test(thr) && !/not recogni[sz]ed|invalid/i.test(thr)
  return { byPath, throttle: { read, text: read ? thr.toLowerCase() : '' } }
}

/** Live reading of every row for one exe path: { state: 'all'|'none'|'unread'|'other', value? } (shape lib/windows/model.statusOf understands). */
function evaluate(parsed, exePath) {
  const key = String(exePath).toLowerCase()
  const r = parsed && parsed.byPath[key]
  if (!r) return Object.fromEntries(catalog.ids().map(id => [id, { state: 'unread' }]))
  const out = {}
  out.priority = r.ifeo == null ? { state: 'none' } : r.ifeo === 3 ? { state: 'all' } : { state: 'other', value: r.ifeo }
  out.windowed = { state: catalog.dxHas(r.dx) ? 'all' : 'none' }
  out.fso = { state: catalog.fsoHas(r.fso) ? 'all' : 'none' }
  out.throttle = !parsed.throttle.read ? { state: 'unread' } : { state: parsed.throttle.text.includes(key) ? 'all' : 'none' }
  return out
}

module.exports = { buildScript, parse, evaluate, MAX_PATHS }
