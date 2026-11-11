// Minimal bridge for the always-on-top overlay windows (FPS HUD, FiveM HUD, FPS HUD settings).
// These windows render live numbers and a few display options — they must never get the full admin API surface
// that preload.js exposes to the main window.
const { contextBridge, ipcRenderer } = require('electron')

const on = (channel, cb) => {
  const handler = (_, d) => cb(d)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('api', {
  // read-only data the overlays display
  getMetrics:             ()   => ipcRenderer.invoke('get-metrics'),
  getFpsHudConfig:        ()   => ipcRenderer.invoke('get-fps-hud-config'),
  onAriaFpsTick:          cb   => on('aria-fps-tick', cb),
  onFpsHudColorChanged:   cb   => on('fps-hud-color-changed', cb),
  onFpsHudCornerChanged:  cb   => on('fps-hud-corner-changed', cb),
  onLivePingTick:         cb   => on('live-ping-tick', cb),

  // Pulse HUD (lib/pulse): live frames and display prefs, nothing that changes the PC
  pulse2Subscribe:        ()   => ipcRenderer.invoke('pulse2-subscribe'),
  pulse2Unsubscribe:      ()   => ipcRenderer.invoke('pulse2-unsubscribe'),
  onPulse2Live:           cb   => on('pulse2-live', cb),
  onPulse2Event:          cb   => on('pulse2-event', cb),

  // FPS HUD settings window only
  loadSettings:           ()   => ipcRenderer.invoke('get-fps-hud-config'),
  setFpsHudColor:         hex  => ipcRenderer.invoke('set-fps-hud-color', hex),
  setFpsHudCorner:        c    => ipcRenderer.invoke('set-fps-hud-corner', c),
  setFpsHudSize:          s    => ipcRenderer.invoke('set-fps-hud-size', s),
  closeFpsHudSettings:    ()   => ipcRenderer.invoke('close-fps-hud-settings'),
})
