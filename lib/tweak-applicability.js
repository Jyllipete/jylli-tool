'use strict'
// The one place that says which tweaks make sense on which PC. Pure: (tweak id, caps) -> { show, state, why }.
//   requires  every test must hold or the tweak is hidden. A test that returns null (not detected) never hides it, but it also stops the
//             tweak from being recommended: unknown is never a reason to push a change.
//   avoid     a test that holds hides the tweak ({ hide: true }) or marks it 'caution' with the reason.
//   recommend a test that holds (and nothing is unknown) marks it 'recommended'.
// `why` is a key in LANG.ui under `applic_<why>`. Auto-Optimize (findings.js) and the manual tabs both call this, so they cannot disagree.

const laptop = c => (c.form === 'laptop' ? true : c.form === 'desktop' ? false : null)
const desktop = c => (c.form === 'desktop' ? true : c.form === 'laptop' ? false : null)
const cpuVendor = v => c => (c.cpu && c.cpu.vendor ? c.cpu.vendor === v : null)
const gpuVendor = (...v) => c => (c.gpu && c.gpu.vendor ? v.includes(c.gpu.vendor) : null)
const win11 = c => c.os.win11
const ram = n => c => (c.ram && c.ram.totalGB != null ? c.ram.totalGB >= n : null)
const ethernet = c => (c.net && c.net.primary ? c.net.primary === 'ethernet' : null)
const wifi = c => (c.net && c.net.primary ? c.net.primary === 'wifi' : null)
const dualCcdX3d = c => (c.cpu ? (c.cpu.dualCcdKnown ? c.cpu.dualCcdX3d : null) : null)
const nicProps = c => (c.net && Array.isArray(c.net.props) && c.net.props.length ? c.net.props : null)
const nicPropOn = rx => c => { const p = nicProps(c); return p ? p.some(x => rx.test(x.name) && /^(enabled|on|adaptive|auto)/i.test(String(x.value))) : null }
const wifiTunable = c => { const p = nicProps(c); return p ? p.some(x => /roam|mimo.*power|power sav|u-?apsd|preferred band|bg scan|background scan/i.test(x.name)) : null }
const hagsCapable = c => (c.gpus.length ? (c.gpus.some(g => g.hags === true) ? true : c.gpus.every(g => g.hags === false) ? false : null) : null)

const RULES = {
  // ── desktop-only power changes ──
  'power-throttling': { requires: [{ test: desktop, why: 'desktopOnly' }] },
  'pcie-power': { requires: [{ test: desktop, why: 'desktopOnly' }] },
  'usb-suspend': { requires: [{ test: desktop, why: 'desktopOnly' }] },
  'cstates': { requires: [{ test: desktop, why: 'desktopOnly' }], avoid: [{ test: cpuVendor('amd'), hide: true, why: 'amdIdle' }] },   // zeroing idle settings stops Ryzen boosting single cores
  'cpu-parking': { requires: [{ test: desktop, why: 'desktopOnly' }], avoid: [{ test: dualCcdX3d, hide: true, why: 'x3dParking' }] },
  'intel-power-plan': { requires: [{ test: desktop, why: 'desktopOnly' }, { test: cpuVendor('intel'), why: 'intelOnly' }] },
  'amd-power-plan': { requires: [{ test: desktop, why: 'desktopOnly' }, { test: cpuVendor('amd'), why: 'amdOnly' }], avoid: [{ test: dualCcdX3d, hide: true, why: 'x3dParking' }] },
  'x3d-balanced': { requires: [{ test: dualCcdX3d, why: 'x3dOnly' }] },
  'laptop-power-mode': { requires: [{ test: laptop, why: 'laptopOnly' }, { test: win11, why: 'win11Only' }] },

  // ── graphics ──
  'gpu-hwsch': { requires: [{ test: hagsCapable, why: 'hagsUnsupported' }] },
  'gpu-hags-off': { requires: [{ test: hagsCapable, why: 'hagsUnsupported' }] },
  'vrr-borderless': { requires: [{ test: c => (c.os.build != null ? c.os.build >= 19041 : null), why: 'win10_2004' }] },
  'disable-mpo': {
    requires: [{ test: gpuVendor('nvidia', 'amd'), why: 'nvidiaAmdOnly' }, { test: win11, why: 'win11Only' }],
    recommend: c => (c.display && c.display.multi && c.gpu && c.gpu.vendor === 'nvidia' ? true : null),
  },
  'msi-mode': {
    requires: [{ test: c => c.anyDiscrete, why: 'discreteGpuOnly' }],
    avoid: [{ test: c => (c.gpu && c.gpu.interruptMode ? c.gpu.interruptMode === 'msi' : null), why: 'alreadyMsi' }],
    recommend: c => (c.gpu && c.gpu.interruptMode ? c.gpu.interruptMode === 'line' : null),
  },

  // ── network ──
  'nic-offloads': { requires: [{ test: ethernet, why: 'ethernetOnly' }] },
  'nic-interrupt-mod': { requires: [{ test: ethernet, why: 'ethernetOnly' }], recommend: nicPropOn(/interrupt moderation/i) },
  'nic-energy-efficient': { requires: [{ test: ethernet, why: 'ethernetOnly' }], recommend: c => (c.net && c.net.eee ? c.net.eee === 'on' : null) },
  'nic-rss-affinity': { requires: [{ test: ethernet, why: 'ethernetOnly' }] },
  'wifi-gaming-tune': { requires: [{ test: wifi, why: 'wifiOnly' }, { test: c => (c.net ? c.net.props.length > 0 : null), why: 'noNicProps' }], avoid: [{ test: laptop, why: 'batteryDrain' }], recommend: wifiTunable },

  // ── memory / storage ──
  'sysmain': { requires: [{ test: ram(16), why: 'ram16' }, { test: c => c.storage.ssd, why: 'ssdOnly' }] },
  'memory-compression': { requires: [{ test: ram(32), why: 'ram32' }] },
  'trim-enable': { requires: [{ test: c => c.storage.ssd, why: 'ssdOnly' }] },

  // ── security-for-speed trades: only worth it where the cost is real ──
  'spectre-meltdown': {
    requires: [{ test: c => (c.cpu ? c.cpu.mitigationCost !== null : null), why: 'cpuUnknown' }],
    avoid: [{ test: c => (c.cpu && c.cpu.mitigationCost ? c.cpu.mitigationCost === 'low' : null), why: 'modernCpu' }],
    recommend: c => (c.cpu && c.cpu.mitigationCost ? c.cpu.mitigationCost === 'high' : null),
  },
  'vbs-disable': {
    requires: [{ test: win11, why: 'win11Only' }],
    avoid: [{ test: c => (c.cpu && c.cpu.hvciCostly !== null ? c.cpu.hvciCostly === false : null), why: 'cheapOnThisCpu' }],
    recommend: c => (c.sec.vbsRunning === true && c.cpu && c.cpu.hvciCostly === true ? true : null),
  },
  'hvci-offload': {
    requires: [{ test: win11, why: 'win11Only' }],
    avoid: [{ test: c => (c.cpu && c.cpu.hvciCostly !== null ? c.cpu.hvciCostly === false : null), why: 'cheapOnThisCpu' }],
    recommend: c => (c.sec.hvciRunning === true && c.cpu && c.cpu.hvciCostly === true ? true : null),
  },

  // ── timer ──
  // ── added in the performance audit ──
  'gpu-per-app-preference': {
    requires: [{ test: c => c.hybridGraphics, why: 'hybridGraphicsOnly' }],
    recommend: c => (c.hybridGraphics === true ? true : null),
  },
  'hypervisor-off': {
    requires: [{ test: win11, why: 'win11Only' }, { test: c => c.sec.hypervisorPresent, why: 'noHypervisor' }],
    avoid: [{ test: c => (c.sec.wsl === true || c.sec.docker === true || c.sec.hyperV === true ? true : null), why: 'usesVirtualization' }],
  },
  'fth-reset': { requires: [{ test: c => (c.host && c.host.fthCount != null ? c.host.fthCount > 0 : null), why: 'nothingToReset' }], recommend: c => (c.host && c.host.fthCount > 0 ? true : null) },
  'disable-background-apps': { requires: [{ test: c => (c.host && c.host.bgAppsOff != null ? !c.host.bgAppsOff : null), why: 'alreadyOff' }], recommend: c => (c.host && c.host.bgAppsOff === false ? true : null) },
  'mouse-pointer-1to1': { requires: [] },

  'global-timer-resolution': { requires: [{ test: win11, why: 'win11Only' }], avoid: [{ test: laptop, why: 'batteryDrain' }] },
}

/** Ids that are not hardware-dependent and need no rule: actions, cleanups, DNS choices, FiveM-only, privacy and plain Windows settings. */
const ALWAYS = /^(clean-|fix-|dns-|fivem-|flush-dns|winsock-reset|reboot-now)/

const STATE_ORDER = ['hidden', 'caution', 'available', 'recommended']

function evalTest(t, caps) {
  try { const r = t.test(caps); return r === true ? true : r === false ? false : null } catch { return null }
}

/** @returns {{ show: boolean, state: 'hidden'|'caution'|'available'|'recommended', why: string|null, unknown: boolean }} */
function evaluate(id, caps) {
  const rule = RULES[id]
  const c = caps || {}
  if (!rule) return { show: true, state: 'available', why: null, unknown: false }
  let unknown = false
  for (const r of rule.requires || []) {
    const v = evalTest(r, c)
    if (v === false) return { show: false, state: 'hidden', why: r.why, unknown: false }
    if (v === null) unknown = true
  }
  let caution = null
  for (const a of rule.avoid || []) {
    if (evalTest(a, c) === true) {
      if (a.hide) return { show: false, state: 'hidden', why: a.why, unknown: false }
      caution = caution || a.why
    }
  }
  if (caution) return { show: true, state: 'caution', why: caution, unknown }
  if (!unknown && rule.recommend && rule.recommend(c) === true) return { show: true, state: 'recommended', why: null, unknown: false }
  return { show: true, state: 'available', why: null, unknown }
}

function evaluateAll(ids, caps) {
  const out = {}
  for (const id of ids) out[id] = evaluate(id, caps)
  return out
}

module.exports = { RULES, ALWAYS, STATE_ORDER, evaluate, evaluateAll }
