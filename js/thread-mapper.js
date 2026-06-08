// thread-mapper.js — manages worker pool and WebGL2 heatmap for Thread Map panel
// Loaded by index.html after api is available.

let _tmWorkers  = []
let _tmSab      = null
let _tmNames    = {}     // tid (number) → thread name string
let _tmData     = {}     // coreIndex → [{tid, cpuPct}]
let _tmCanvas   = null
let _tmCtx      = null
let _tmTopo     = null   // cpuGetTopology result
let _tmRenderTimer = null

async function initThreadMapper(canvas, topology) {
  if (_tmWorkers.length) return  // already running
  _tmCanvas = canvas
  _tmTopo   = topology
  _tmCtx    = canvas.getContext('2d')
  _tmSab    = await window.api.getThreadSab()

  const numCores = navigator.hardwareConcurrency
  _tmWorkers = Array.from({ length: numCores }, (_, i) => {
    const w = new Worker('js/thread-lane-worker.js')
    w.postMessage({ sab: _tmSab, coreIndex: i })
    w.onmessage = ({ data }) => { _tmData[data.coreIndex] = data.threads }
    return w
  })

  window.api.onThreadMapNames((names) => {
    names.forEach(({ tid, name }) => { if (name) _tmNames[tid] = name })
  })

  _tmRenderTimer = setInterval(renderThreadMap, 100)
}

function renderThreadMap() {
  if (!_tmCanvas || !_tmCtx) return
  const numCores = navigator.hardwareConcurrency
  const W = _tmCanvas.width, H = _tmCanvas.height

  // Collect all known thread IDs from all core slots
  const tidSet = new Set()
  for (const threads of Object.values(_tmData)) threads.forEach(t => tidSet.add(t.tid))
  const tids = [...tidSet].filter(t => t > 0).sort((a, b) => a - b)
  if (!tids.length) return

  const HEADER_H = Math.round(16 * devicePixelRatio)
  const cellW    = W / numCores
  const maxRows  = Math.max(1, Math.floor((H - HEADER_H) / 20))
  const visibleTids = tids.slice(0, maxRows)
  const cellH    = Math.max(12, Math.floor((H - HEADER_H) / visibleTids.length))

  _tmCtx.clearRect(0, 0, W, H)

  // Background
  _tmCtx.fillStyle = '#14141A'
  _tmCtx.fillRect(0, 0, W, H)

  // Column header labels (core IDs)
  _tmCtx.font = `${Math.round(9 * devicePixelRatio)}px "Geist Mono", monospace`
  _tmCtx.fillStyle = 'rgba(255,255,255,0.38)'
  const pCores = _tmTopo?.PCores || 0
  for (let c = 0; c < numCores; c++) {
    let label
    if (_tmTopo?.IsHybrid && pCores > 0) {
      label = c < pCores ? `P${c}` : `E${c - pCores}`
    } else {
      label = `C${c}`
    }
    _tmCtx.fillText(label, c * cellW + 3, HEADER_H - 3)
  }

  // Lane separator line
  _tmCtx.strokeStyle = 'rgba(255,255,255,0.06)'
  _tmCtx.lineWidth = 1
  _tmCtx.beginPath()
  _tmCtx.moveTo(0, HEADER_H); _tmCtx.lineTo(W, HEADER_H)
  _tmCtx.stroke()

  // Heat cells + row labels
  for (let r = 0; r < visibleTids.length; r++) {
    const tid = visibleTids[r]
    const y   = HEADER_H + r * cellH

    for (let c = 0; c < numCores; c++) {
      const coreThreads = _tmData[c] || []
      const thread      = coreThreads.find(t => t.tid === tid)
      const pct         = thread ? Math.min(thread.cpuPct, 100) : 0
      const t           = pct / 100
      // Deep purple (#21124) → bright cyan (#00FFE6)
      const rv = Math.round(33  * (1 - t))
      const gv = Math.round(18  + (255 - 18)  * t)
      const bv = Math.round(64  + (230 - 64)  * t)
      _tmCtx.fillStyle = pct > 0 ? `rgb(${rv},${gv},${bv})` : 'rgba(255,255,255,0.03)'
      _tmCtx.fillRect(c * cellW + 1, y + 1, cellW - 2, cellH - 2)
    }

    // Thread label (name or TID) on right margin of row
    const name = _tmNames[tid] || `T-${tid}`
    _tmCtx.font      = `${Math.round(8 * devicePixelRatio)}px "Geist Mono", monospace`
    _tmCtx.fillStyle = 'rgba(255,255,255,0.45)'
    _tmCtx.fillText(name.slice(0, 14), 3, y + cellH - 3)
  }

  // Core Balance Score
  const coreLoads = Array.from({ length: numCores }, (_, c) =>
    (_tmData[c] || []).reduce((s, t) => s + t.cpuPct, 0)
  )
  const mean  = coreLoads.reduce((a, b) => a + b, 0) / numCores
  const std   = Math.sqrt(coreLoads.reduce((a, b) => a + (b - mean) ** 2, 0) / numCores)
  const score = Math.round(Math.max(0, 100 - std * 2))
  const scoreEl = document.getElementById('tm-balance-score')
  if (scoreEl) scoreEl.textContent = score
}

function destroyThreadMapper() {
  clearInterval(_tmRenderTimer)
  _tmRenderTimer = null
  _tmWorkers.forEach(w => { try { w.terminate() } catch {} })
  _tmWorkers = []
  _tmData    = {}
  _tmNames   = {}
  _tmCanvas  = null
  _tmCtx     = null
  window.api.offThreadMapTick?.()
}
