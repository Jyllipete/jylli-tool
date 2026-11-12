'use strict'
// Identity of a machine: which fields make up "the same PC", a stable signature, and a human diff between two scans.
// Pure (no Electron, no fs). Volatile fields (usage, battery, Wi-Fi, internet, admin) never count as a change.
;(function (root) {
  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

  /** The stable part of a scan. */
  function normalize(i) {
    i = i || {}
    return {
      cpu: clean(i.cpu), threads: num(i.cpuThreads || i.cpuCores),
      ramGB: num(i.ramGB), ramSpec: clean(i.ramSpec || i.ramType), ramSpeed: num(i.ramSpeed),
      gpu: clean(i.gpu), vramMB: num(i.vramMB), gpuDriver: clean(i.gpuDriver),
      disk: clean(i.diskModel || i.diskType), diskSizeGB: num(i.diskSizeGB || i.diskTotalGB),
      board: clean(i.board), osBuild: clean(i.osBuild || i.osCaption),
      display: clean(i.displayRes) + (num(i.displayRefresh) ? '@' + num(i.displayRefresh) : ''),
    }
  }

  // FNV-1a over the identity fields that define the *hardware* (drivers and builds are excluded: they update without changing the PC).
  function hash32(s, seed) {
    let h = seed >>> 0
    for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619) >>> 0 }
    return h >>> 0
  }
  /** 'JT-XXXX-XXXX' — same hardware, same signature. Null when there is nothing to identify yet. */
  function signature(i) {
    const n = normalize(i)
    const key = [n.cpu, n.threads, n.ramGB, n.gpu, n.board, n.diskSizeGB].join('|').toLowerCase()
    if (!n.cpu && !n.gpu) return null
    const a = hash32(key, 2166136261), b = hash32(key, 0x9e3779b1)
    const hex = v => v.toString(16).toUpperCase().padStart(8, '0')
    return `JT-${hex(a).slice(0, 4)}-${hex(b).slice(0, 4)}`
  }

  const LABELS = { cpu: 'CPU', ramGB: 'RAM', ramSpeed: 'RAM speed', gpu: 'GPU', vramMB: 'VRAM', gpuDriver: 'GPU driver', disk: 'Storage', diskSizeGB: 'Storage', board: 'Board', osBuild: 'Windows', display: 'Display', threads: 'CPU' }
  /** Changes between two scans: [{key,label,before,after}] — only fields known on both sides, so a failed read is never "a change". */
  function diff(prev, next) {
    if (!prev || !next) return []
    const a = normalize(prev), b = normalize(next), out = []
    for (const k of Object.keys(a)) {
      const x = a[k], y = b[k]
      if (!x || !y || x === y) continue
      if (k === 'threads') continue   // reported through cpu
      if (k === 'diskSizeGB' && a.disk !== b.disk) continue   // a new drive already says it
      out.push({ key: k, label: LABELS[k] || k, before: x, after: y })
    }
    return out
  }

  const api = { normalize, signature, diff }
  root.JylliSysFingerprint = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
