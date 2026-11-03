'use strict'
// profile -> findings. Pure. Every rule reads only detected fields; an unknown (null/undefined) field never produces a finding.
const display = require('./display')
const { CATALOG, IMPACT_RANK, POWER_DESKTOP_TWEAK } = require('./catalog')

const GB = 1024 ** 3
const MB = 1024 ** 2
const VENDOR_LINK = { nvidia: 'https://www.nvidia.com/Download/index.aspx', amd: 'https://www.amd.com/en/support/download/drivers.html', intel: 'https://www.intel.com/content/www/us/en/download-center/home.html' }
const CHIPSET_LINK = 'https://www.amd.com/en/support/download/drivers.html'

/** Does this CPU lack hardware support that makes Memory Integrity cheap (mode-based execution control)? Intel before 7th gen, Ryzen 1000/2000. */
function hvciCostly(cpuName) {
  const n = String(cpuName || '')
  const i = /i[3579]-(\d{4,5})/i.exec(n)
  if (i) { const v = i[1]; const gen = v.length === 5 ? +v.slice(0, 2) : +v.slice(0, 1); return gen <= 6 }
  const r = /ryzen\s+\d\s+(\d)\d{3}/i.exec(n)
  if (r) return +r[1] <= 2
  return false
}

function junkBytes(st) { return (st.tempBytes || 0) + (st.wuRebootPending ? 0 : (st.wuBytes || 0)) }

/**
 * ctx: { useCase, answers, premium, applied: Set<tweakId> }. Returns Finding[] sorted by impact (desc), then kind, then id.
 */
function findings(profile, ctx = {}) {
  const p = profile || {}
  const useCase = ctx.useCase || 'mix'
  const answers = ctx.answers || {}
  const applied = ctx.applied || new Set()
  const out = []
  const laptop = p.formFactor === 'laptop'
  const desktop = p.formFactor === 'desktop'

  function add(id, extra = {}) {
    const c = CATALOG[id]
    const steps = extra.steps || c.steps
    out.push({
      id, module: c.module, kind: c.kind, impact: extra.impact || c.impact, confidence: extra.confidence || 'measured',
      steps, titleKey: `fT_${id}`, whyKey: extra.whyKey || `fW_${id}`, vars: extra.vars || {},
      before: extra.before || null, expectedAfter: extra.expectedAfter || null, detail: extra.detail || null,
      reboot: !!c.reboot, premium: !!c.premium, undoable: c.undoable !== false, optIn: c.optIn || null,
      interactive: c.interactive || null, link: extra.link || null, estMs: c.estMs || 0,
      defaultOn: c.kind === 'fix' && (extra.defaultOn != null ? extra.defaultOn : c.defaultOn.includes(useCase)),
    })
  }
  const done = ids => ids.every(i => applied.has(i))

  // ── display ──
  if (Array.isArray(p.displays) && p.displays.length && !p.remoteSession && !(laptop && p.power && p.power.onAC === false)) {
    const targets = p.displays.map(d => ({ d, m: display.pickMode(d) })).filter(x => x.m)
    if (targets.length) {
      const first = targets[0]
      add('display-refresh', {
        vars: { monitor: first.d.monitor, cur: first.d.cur.hz, max: first.m.hz, count: targets.length },
        before: { v: first.d.cur.hz, unit: 'Hz' }, expectedAfter: { v: first.m.hz, unit: 'Hz' },
        detail: { targets: targets.map(x => ({ device: x.d.device, monitor: x.d.monitor, w: x.m.w, h: x.m.h, hz: x.m.hz, from: x.d.cur.hz })) },
        // A laptop panel may be held at 60 Hz on purpose (battery, dynamic refresh): offered, never default.
        defaultOn: laptop ? false : undefined,
      })
    }
    if (p.displays.length === 1) {
      const d = p.displays[0]
      if (d.edidMaxHz && d.edidMaxHz - d.maxHzAtCur >= 20 && !display.pickMode(d)) add('display-link-limited', { vars: { cur: d.maxHzAtCur, max: d.edidMaxHz, monitor: d.monitor }, before: { v: d.maxHzAtCur, unit: 'Hz' }, expectedAfter: { v: d.edidMaxHz, unit: 'Hz' } })
    }
  }

  // ── memory ──
  const ram = p.ram
  if (ram && !laptop) {
    if (ram.xmp === 'off') add('ram-xmp-off', { confidence: ram.xmpConfidence || 'likely', vars: { cur: ram.xmpConfiguredMT, rated: ram.xmpRatedMT, type: ram.type }, before: { v: ram.xmpConfiguredMT, unit: 'MT/s' }, expectedAfter: { v: ram.xmpRatedMT, unit: 'MT/s' } })
    else if (ram.xmpJedecOnly && desktop) add('ram-xmp-off', { confidence: 'likely', impact: 'medium', whyKey: 'fW_ram-xmp-jedec', vars: { cur: ram.xmpConfiguredMT, type: ram.type } })
    if (desktop && ram.dimms === 1 && ram.slotsTotal >= 2 && !/^LP/.test(ram.type || '')) add('ram-single-channel', { vars: { type: ram.type } })
  }

  // ── power ──
  const pw = p.power
  const x3d = p.cpu && p.cpu.x3d
  if (pw && pw.kind) {
    if (pw.kind === 'saver') add('power-saver', { before: { v: pw.name, unit: '' }, expectedAfter: { v: 'Balanced', unit: '' } })
    else if (laptop && pw.onAC === true && p.os && p.os.win11 && (pw.overlayKind === 'efficiency' || pw.overlayKind === 'balanced') && !done(['laptop-power-mode'])) add('power-laptop-ac')
    else if (desktop && x3d !== 'dual' && pw.kind === 'balanced' && p.cpu && POWER_DESKTOP_TWEAK[p.cpu.vendor]) {
      const id = POWER_DESKTOP_TWEAK[p.cpu.vendor]
      if (!done([id])) add('power-desktop', { steps: [{ type: 'tweak', id }], vars: { vendor: p.cpu.vendor } })
    }
    if (desktop && x3d === 'dual' && pw.kind !== 'balanced' && !done(['x3d-balanced'])) add('x3d-setup', { vars: { cpu: p.cpu.name } })
  }
  if (desktop && x3d === 'dual') add('x3d-driver', { vars: { cpu: p.cpu.name }, link: CHIPSET_LINK })

  // ── gpu / game settings ──
  const g = p.gaming
  if (g && g.gameMode === false) add('game-mode')
  if (g && g.bgCapture === true) add('bg-capture')
  const capable = (p.gpus || []).filter(x => x.hagsCapable)
  if (capable.length && p.os && p.os.build >= 19041 && p.hags !== 2 && p.hags !== undefined) add('hags', { vars: { gpu: capable[0].name } })
  if (p.os && p.os.build >= 19041 && p.dxGlobal != null && !(/VRROptimizeEnable=1/.test(p.dxGlobal) && /SwapEffectUpgradeEnable=1/.test(p.dxGlobal))) add('vrr-borderless')
  for (const gpu of (p.gpus || [])) {
    if (gpu.discrete && gpu.driverAgeDays != null && gpu.driverAgeDays > 180) { add('gpu-driver-old', { vars: { gpu: gpu.name, days: gpu.driverAgeDays, version: gpu.driverVersion }, link: VENDOR_LINK[gpu.vendor] || null }); break }
  }
  if (p.security && p.security.hvci === 'on' && p.cpu && hvciCostly(p.cpu.name)) add('hvci-cost', { vars: { cpu: p.cpu.name } })

  // ── input ──
  if (p.input && p.input.mouseAccel === true) add('mouse-accel')
  if (p.input && p.input.stickyHotkey === true) add('sticky-keys')
  if (desktop && !done(['usb-suspend'])) add('usb-suspend')
  if (useCase === 'stream' && !done(['power-throttling'])) add('power-throttling-stream')

  // ── windows / background ──
  if (p.os && !done(['visual-effects', 'explorer-perf'])) add('ui-snappy')
  const bg = p.background
  if (bg) {
    if (bg.diagTrackOn === true) add('telemetry')
    if (bg.telemetryTasksOn >= 1) add('telemetry-tasks', { vars: { count: bg.telemetryTasksOn } })
    if (bg.doPeerOn === true) add('delivery-opt')
    if (bg.nudgesOn === true) add('nudges')
    if (bg.bingSearchOn === true) add('search-web')
  }
  if (p.net && p.net.primary === 'ethernet' && p.net.eee === 'on') add('nic-eee', { vars: { adapter: p.net.name } })

  // ── startup ──
  const su = p.startup
  if (su && su.candidates.length) {
    const on = su.candidates.filter(i => i.defaultOn)
    add('startup-apps', {
      impact: on.length >= 5 ? 'high' : on.length >= 2 ? 'medium' : 'low', vars: { count: su.candidates.length, total: su.enabledCount },
      before: { v: su.enabledCount, unit: '' }, expectedAfter: { v: su.enabledCount - on.length, unit: '' },
      detail: { items: su.candidates.map(i => ({ name: i.name, category: i.category, defaultOn: !!i.defaultOn })) },
      defaultOn: on.length > 0,
    })
  }

  // ── storage ──
  const st = p.storage
  if (st) {
    if (st.pagefileDisabled === true) add('pagefile-off')
    if (st.ssd === true && st.trimOn === false) add('trim-off')
    if (st.pctFree != null && st.pctFree < 10) add('disk-low', { vars: { free: st.freeGB, pct: st.pctFree } })
    if (desktop && st.hiberBytes > 0 && answers.useHibernate !== true) add('hibernate', { vars: { gb: Math.round(st.hiberBytes / GB * 10) / 10 }, expectedAfter: { v: st.hiberBytes, unit: 'bytes' } })
    const junk = junkBytes(st)
    if (junk >= 500 * MB) add('junk', { impact: junk >= 2 * GB ? 'medium' : 'low', vars: { gb: Math.round(junk / GB * 10) / 10 }, expectedAfter: { v: junk, unit: 'bytes' } })
  }

  // ── security shield (information only; Auto-Optimize never changes these) ──
  const sec = p.security
  if (sec) {
    if (sec.firewallOn === false) add('shield-firewall')
    if (sec.defenderRtp === false && !(sec.thirdPartyAv || []).length) add('shield-defender')
    if (sec.uac === 'off') add('shield-uac')
    if (sec.windowsUpdate === 'disabled') add('shield-update')
  }

  // ── FiveM (Premium) ──
  if (p.context && p.context.apps && p.context.apps.fivem) add('fivem')

  return out.sort((a, b) => (IMPACT_RANK[b.impact] - IMPACT_RANK[a.impact]) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id))
}

/** Groups for the diagnosis scene. */
function group(list) {
  return { weFix: list.filter(f => f.kind === 'fix'), needsYou: list.filter(f => f.kind === 'manual'), info: list.filter(f => f.kind === 'info') }
}

module.exports = { findings, group, hvciCostly, junkBytes }
