'use strict'
// The ONLY list of per-game changes the Games tab may make. Every row works on one game executable, is read back after it is written,
// and can be put back. What is deliberately not here (and why) is in docs/GAMES_EVIDENCE.md: Defender exclusions, launcher priority,
// I/O priority, and the global MMCSS / Game DVR writes (Windows tab owns those).
//   id      row id           kind   how it is written: 'ifeo' (CPU & Memory service owns IFEO), 'powercfg', 'reg'
//   rec     who the row is recommended for: 'all' | 'hybrid' (hybrid CPU or laptop) | 'win11' | 'never' (opt-in)
const IFEO_BASE = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options'
const DX_KEY = 'HKCU:\\Software\\Microsoft\\DirectX\\UserGpuPreferences'
const LAYERS_KEY = 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers'
const FSO_FLAG = '~ DISABLEDXMAXIMIZEDWINDOWEDMODE'
const DX_FLAG = 'SwapEffectUpgradeEnable'

const ROWS = [
  { id: 'priority', icon: 'gauge-high', kind: 'ifeo', rec: 'all', by: 'name' },
  { id: 'throttle', icon: 'bolt', kind: 'powercfg', rec: 'hybrid', by: 'path' },
  { id: 'windowed', icon: 'window-restore', kind: 'reg', rec: 'win11', by: 'path', minBuild: 22000 },
  { id: 'fso', icon: 'display', kind: 'reg', rec: 'never', by: 'path' },
]
const byId = Object.fromEntries(ROWS.map(r => [r.id, r]))
const ids = () => ROWS.map(r => r.id)

/** PowerShell single-quoted literal. Paths are validated (exes.SAFE) before they get here; this still doubles quotes. */
const q = s => "'" + String(s).replace(/'/g, "''") + "'"

/** Merge one flag into the DirectX per-app string, keeping GpuPreference and any other option in it. */
function dxMerge(existing, on) {
  const map = new Map()
  for (const part of String(existing || '').split(';')) { const i = part.indexOf('='); if (i > 0) map.set(part.slice(0, i).trim(), part.slice(i + 1).trim()) }
  if (on) map.set(DX_FLAG, '1'); else map.delete(DX_FLAG)
  return [...map].map(([k, v]) => `${k}=${v};`).join('')
}
const dxHas = s => /(^|;)\s*SwapEffectUpgradeEnable=1\s*(;|$)/.test(String(s || ''))

/** Lines the service runs through the journal for a registry row. `before` = what detect read for this exe (dx string). */
function regLines(rowId, exePath, on, before) {
  if (rowId === 'windowed') {
    const next = dxMerge(before && before.dx, on)
    if (!next) return [`Remove-ItemProperty -Path '${DX_KEY}' -Name ${q(exePath)} -EA SilentlyContinue`]
    return [`New-Item -Path '${DX_KEY}' -Force -EA SilentlyContinue | Out-Null`, `Set-ItemProperty -Path '${DX_KEY}' -Name ${q(exePath)} -Value ${q(next)} -Type String -Force`]
  }
  if (rowId === 'fso') {
    const toks = String((before && before.fso) || '').replace(/^\s*~/, '').split(/\s+/).filter(t => t && t.toUpperCase() !== 'DISABLEDXMAXIMIZEDWINDOWEDMODE')
    if (on) toks.push('DISABLEDXMAXIMIZEDWINDOWEDMODE')
    if (!toks.length) return [`Remove-ItemProperty -Path '${LAYERS_KEY}' -Name ${q(exePath)} -EA SilentlyContinue`]
    return [`New-Item -Path '${LAYERS_KEY}' -Force -EA SilentlyContinue | Out-Null`, `Set-ItemProperty -Path '${LAYERS_KEY}' -Name ${q(exePath)} -Value ${q('~ ' + toks.join(' '))} -Type String -Force`]
  }
  throw new Error('bad-row')
}
const fsoHas = s => /DISABLEDXMAXIMIZEDWINDOWEDMODE/i.test(String(s || ''))

const throttleCmd = (exePath, on) => `powercfg /powerthrottling ${on ? 'disable' : 'reset'} /path "${exePath}"`

module.exports = { ROWS, byId, ids, IFEO_BASE, DX_KEY, LAYERS_KEY, q, dxMerge, dxHas, fsoHas, regLines, throttleCmd }
