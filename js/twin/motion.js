'use strict'
// Camera spring, low-end detection and quality stepping: pure math and policy, unit-tested.
;(function (root) {
  /**
   * Critically damped spring (zeta = 1) toward `target`, per axis. state = { x, v } (arrays). Interruptible: change `target` any
   * time and the velocity carries over. Exact integration step, stable for any dt.
   */
  function springStep(state, target, dt, omega = 9) {
    const e = Math.exp(-omega * dt)
    for (let i = 0; i < state.x.length; i++) {
      const d = state.x[i] - target[i]
      const c2 = state.v[i] + omega * d
      state.x[i] = target[i] + (d + c2 * dt) * e
      state.v[i] = (state.v[i] - omega * c2 * dt) * e
    }
    return state
  }
  const settled = (state, target, eps = 1e-3) => state.x.every((x, i) => Math.abs(x - target[i]) < eps && Math.abs(state.v[i]) < eps)

  // Renderer strings of software or basic renderers: 3D stays off there.
  const SOFTWARE_RX = /swiftshader|llvmpipe|basic render|microsoft basic|software|softpipe|warp\b/i
  function isSoftwareRenderer(name) { return SOFTWARE_RX.test(String(name || '')) }

  const LEVELS = ['full', 'reduced', 'static']
  /** setting: auto|full|reduced|off. Returns the quality to start at. */
  function startQuality(setting, { software = false, stored = null } = {}) {
    if (setting === 'off') return 'static'
    if (software) return 'static'
    if (setting === 'full' || setting === 'reduced') return setting
    return stored && LEVELS.includes(stored) ? stored : 'full'
  }
  /** Probe result: p90 frame time in ms at the current level. Steps down one level when above 20 ms. */
  function nextQuality(current, p90ms) {
    if (!(p90ms > 20)) return current
    const i = LEVELS.indexOf(current)
    return LEVELS[Math.min(LEVELS.length - 1, i + 1)]
  }
  function percentile(values, p) {
    if (!values.length) return 0
    const a = values.slice().sort((x, y) => x - y)
    return a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))]
  }

  /** Frame-rate policy: 60 interacting, 30 idle, 15 after 20 s without input, 0 hidden / minimised / game in the foreground. */
  function targetFps({ visible, gameForeground, msSinceInput, interacting }) {
    if (!visible || gameForeground) return 0
    if (interacting) return 60
    return msSinceInput > 20000 ? 15 : 30
  }

  const api = { springStep, settled, isSoftwareRenderer, startQuality, nextQuality, percentile, targetFps, LEVELS }
  root.JylliTwinMotion = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
