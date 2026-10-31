'use strict'
// Owns the live data sources and the push to the renderer:
//   - one long-lived PowerShell process (lib/os-poller.ps1) for CPU/RAM/disk/network/GPU-engine load: no process spawn per tick
//   - one long-lived `nvidia-smi -lms 1000` when an NVIDIA GPU is present
//   - the hardware sensor bridge (JylliSensor), mapped to stable keys; its 0 means "no sensor" and is dropped
// Everything lands in the hub (lib/telemetry-hub.js). The renderer gets `twin-telemetry` at <= 4 Hz, only while the window is
// visible and something is subscribed.
const smi = require('./nvidia-smi')

/** os-poller.ps1 JSON line -> hub samples. */
function osSamples(o) {
  const s = {}
  if (o.cpuLoad != null) s['cpu.load'] = o.cpuLoad
  if (o.ramTotalGB != null) { s['ram.total'] = o.ramTotalGB; s['ram.used'] = o.ramUsedGB; s['ram.load'] = o.ramTotalGB ? Math.round((o.ramUsedGB / o.ramTotalGB) * 100) : null }
  if (o.uptimeSec != null) s['sys.uptime'] = o.uptimeSec
  if (o.processes != null) s['sys.processes'] = o.processes
  if (o.diskTotalGB != null) { s['disk.c.total'] = o.diskTotalGB; s['disk.c.used'] = o.diskUsedGB; s['disk.c.pct'] = o.diskTotalGB ? Math.round((o.diskUsedGB / o.diskTotalGB) * 100) : null }
  if (o.gpuLoad != null) s['gpu0.load'] = o.gpuLoad
  let rx = 0, tx = 0
  for (const [name, v] of Object.entries(o.net || {})) {
    s[`net.${name}.rx`] = v[0]; s[`net.${name}.tx`] = v[1]
    rx += v[0]; tx += v[1]
  }
  if (o.net) { s['net.rx'] = rx; s['net.tx'] = tx }
  return s
}

/** Old JylliSensor bridge ids -> stable keys. In that protocol 0 means "no sensor", so zeros become missing. */
const SENSOR_MAP = {
  cpu_package_temp: 'cpu.temp.package', cpu_core_max: 'cpu.temp.coremax', cpu_power: 'cpu.power',
  gpu_core_temp: 'gpu0.temp.core', gpu_hotspot_temp: 'gpu0.temp.hotspot', gpu_power: 'gpu0.power',
  gpu_usage: 'gpu0.load', cpu_usage: 'cpu.load', gpu_mem_usage: 'gpu0.vram.pct',
  gpu_fan_rpm: 'gpu0.fan.rpm', gpu_fan_pct: 'gpu0.fan.pct', gpu_mem_temp: 'gpu0.temp.mem',
  mb_fan1: 'mb.fan1.rpm', mb_fan2: 'mb.fan2.rpm', mb_fan3: 'mb.fan3.rpm', mb_fan4: 'mb.fan4.rpm', cooler_pump_rpm: 'cooler.pump.rpm',
}
function sensorSamples(values) {
  const s = {}
  for (const [id, key] of Object.entries(SENSOR_MAP)) {
    if (!(id in values)) continue
    const v = values[id]
    s[key] = typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
  }
  return s
}

function createTelemetryService({ hub, spawn, exists, emit, isVisible = () => true, scriptPath, nvidiaExe = smi.exePath(),
  getSensorValues = () => null, sensorRunning = () => false, setTimer = setInterval, clearTimer = clearInterval, log = () => {}, pushMs = 250 }) {
  let osProc = null, nvProc = null, pushTimer = null, sensorTimer = null, subscribers = 0, osLastLine = 0, nvBuf = '', osBuf = ''
  let started = false

  function startOs() {
    try {
      osProc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { windowsHide: true })
    } catch (e) { log(`os poller failed: ${e.message}`); return }
    osProc.stdout.on('data', d => {
      osBuf += d.toString('utf8')
      let i
      while ((i = osBuf.indexOf('\n')) >= 0) {
        const line = osBuf.slice(0, i).trim(); osBuf = osBuf.slice(i + 1)
        if (!line) continue
        try { hub.ingest('os', osSamples(JSON.parse(line)), { rateHz: 1, detail: 'Windows performance counters' }); osLastLine = Date.now() } catch {}
      }
    })
    osProc.on('exit', () => { osProc = null })
    osProc.on('error', e => log(`os poller error: ${e.message}`))
  }

  function startNvidia() {
    if (!exists(nvidiaExe)) { hub.setContext({ nvidiaPresent: false }); return }
    try {
      nvProc = spawn(nvidiaExe, ['--query-gpu=' + smi.FIELDS.join(','), '--format=csv,noheader,nounits', '-lms', '1000'], { windowsHide: true })
    } catch (e) { log(`nvidia-smi failed: ${e.message}`); hub.setContext({ nvidiaPresent: false }); return }
    hub.setContext({ nvidiaPresent: true })
    nvProc.stdout.on('data', d => {
      nvBuf += d.toString('utf8')
      let i
      while ((i = nvBuf.indexOf('\n')) >= 0) {
        const line = nvBuf.slice(0, i); nvBuf = nvBuf.slice(i + 1)
        const gpus = smi.parseQuery(line)
        if (gpus.length) hub.ingest('nvidia', smi.toSamples(gpus), { rateHz: 1, detail: 'nvidia-smi' })
      }
    })
    nvProc.on('exit', () => { nvProc = null })
    nvProc.on('error', () => { nvProc = null; hub.setContext({ nvidiaPresent: false }) })
  }

  function pumpSensor() {
    const v = getSensorValues()
    hub.setContext({ sensorRunning: !!sensorRunning() })
    if (v && sensorRunning()) {
      const s = sensorSamples(v)
      hub.ingest('sensor', s, { rateHz: 4, detail: 'LibreHardwareMonitor via JylliSensor' })
      // The bridge runs but reports no CPU temperature: the hardware driver (or admin rights) is what is missing.
      hub.setContext({ sensorHasDriver: s['cpu.temp.package'] != null })
    }
  }

  function push() {
    if (subscribers <= 0 || !isVisible()) return
    emit('twin-telemetry', hub.snapshot())
  }

  return {
    start() {
      if (started) return
      started = true
      startOs(); startNvidia()
      sensorTimer = setTimer(pumpSensor, 500)
      pushTimer = setTimer(push, pushMs)
    },
    stop() {
      started = false
      for (const p of [osProc, nvProc]) { try { p?.kill() } catch {} }
      osProc = nvProc = null
      if (pushTimer) clearTimer(pushTimer); if (sensorTimer) clearTimer(sensorTimer)
      pushTimer = sensorTimer = null
    },
    subscribe() { subscribers++ },
    unsubscribe() { subscribers = Math.max(0, subscribers - 1) },
    /** True when the PowerShell poller has produced data recently (otherwise main falls back to the per-call collector). */
    osHealthy() { return osLastLine > 0 && Date.now() - osLastLine < 6000 },
    isStarted: () => started,
    push,
  }
}

module.exports = { createTelemetryService, osSamples, sensorSamples, SENSOR_MAP }
