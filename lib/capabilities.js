'use strict'
// SystemProfile (probe slices) -> `caps`: the one typed description of this PC that tweak applicability and Auto-Optimize read.
// Pure. A fact that no probe established is null, never a default; the applicability engine treats null as "unknown, do not recommend".
const { classifyCpu } = require('./cpu-arch')
const { classifyGpu } = require('./gpu-arch')

const tri = x => (x === true || x === false ? x : null)
const dayMs = 24 * 3600 * 1000

function formFactor(p) {
  if (p.formFactor === 'laptop') return 'laptop'
  if (p.formFactor === 'desktop' || p.formFactor === 'tower') return 'desktop'
  // The chassis table was unhelpful ('unknown'): fall back to the firmware's PCSystemType (2 = mobile, 1/3/4/5 = desktop/workstation/server).
  const t = p.sys && p.sys.pcSystemType
  if (t === 2) return 'laptop'
  if (t === 1 || t === 3 || t === 4 || t === 5) return 'desktop'
  return null
}

function deriveCpu(p) {
  const base = p.cpu || null
  if (!base) return null
  const c = classifyCpu(base.name, base.vendor)
  const x = p.cpuX || {}
  const vendor = c.vendor || base.vendor || null
  // Real layout beats the name: one last-level cache group per CCD on Zen, EfficiencyClass groups on Intel hybrid parts.
  let dualCcd = null
  if (c.x3d === true) dualCcd = x.llcGroups != null ? x.llcGroups >= 2 : c.dualCcdX3d
  else if (c.x3d === false) dualCcd = false
  return {
    name: base.name, vendor, family: c.family, gen: c.gen, mobile: c.mobile, cores: base.cores || null, threads: base.threads || null,
    x3d: c.x3d, dualCcdX3d: dualCcd === true, dualCcdKnown: dualCcd !== null, ccdCount: x.llcGroups != null && vendor === 'amd' ? x.llcGroups : null,
    hybrid: tri(x.hybrid), pCores: x.pCores ?? null, eCores: x.eCores ?? null,
    microcode: x.microcode ?? null, l3MB: x.l3MB ?? null,
    raptorLakeDesktop: c.raptorLakeDesktop, hvciCostly: c.hvciCostly, mitigationCost: c.mitigationCost,
  }
}

function deriveGpus(p, now) {
  const list = p.gpuList || (p.gpus || []).map(g => ({ name: g.name, vendor: g.vendor, integrated: g.discrete === false }))
  const drivers = p.gpuDrivers || []
  const vram = (p.gpuX && p.gpuX.vram) || []
  const irq = (p.gpuX && p.gpuX.interrupts) || []
  const same = (a, b) => a && b && (a.toLowerCase() === b.toLowerCase() || a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase()))
  return list.map(g => {
    const c = classifyGpu(g.name, g.vendor)
    const d = drivers.find(x => same(x.name, g.name))
    const v = vram.find(x => same(x.name, g.name))
    const i = irq.find(x => same(x.name, g.name))
    const t = d && d.date ? Date.parse(d.date) : NaN
    return {
      name: g.name, vendor: c.vendor !== 'other' ? c.vendor : g.vendor, arch: c.arch,
      discrete: c.discrete !== null ? c.discrete : (g.integrated === true ? false : null),
      hags: c.hags, dlssFrameGen: c.dlssFrameGen, fsrFrameGen: c.fsrFrameGen,
      vramGB: v && v.gb ? v.gb : null, driverVersion: d ? d.ver : null, driverAgeDays: Number.isFinite(t) ? Math.floor((now - t) / dayMs) : null,
      interruptMode: i ? i.mode : null,
    }
  })
}

/** @param {object} p SystemProfile  @param {number} [now] */
function deriveCaps(p, now = Date.now()) {
  p = p || {}
  const gpus = deriveGpus(p, now)
  const discrete = gpus.filter(g => g.discrete === true)
  const integrated = gpus.filter(g => g.discrete === false)
  const primary = discrete[0] || gpus[0] || null
  const sys = p.sys || {}
  const os = p.os || {}
  const build = os.build ?? sys.build ?? null
  const disks = p.storageX || {}
  const st = p.storage || {}
  const rdp = p.remoteSession === true
  const displays = Array.isArray(p.displays) ? p.displays : null

  return {
    form: formFactor(p),
    cpu: deriveCpu(p),
    gpus, gpu: primary,
    hybridGraphics: gpus.length ? (integrated.length > 0 && discrete.length > 0) : null,
    anyDiscrete: gpus.length ? discrete.length > 0 : null,
    rebar: p.gpuX && p.gpuX.rebar !== undefined ? p.gpuX.rebar : null,
    pcie: (p.gpuX && p.gpuX.pcie) || null,
    ram: p.ram ? { totalGB: p.ram.totalGB ?? null, type: p.ram.type || null, dimms: p.ram.dimms ?? null, slots: p.ram.slotsTotal ?? null, xmp: p.ram.xmp || null } : null,
    storage: {
      systemBus: disks.systemBus || null,
      systemKind: disks.systemKind || (st.ssd === true ? 'ssd' : st.ssd === false ? 'hdd' : null),
      ssd: disks.systemKind ? disks.systemKind !== 'hdd' : tri(st.ssd),
      libraries: disks.libraries || [],
      trimOn: tri(st.trimOn),
    },
    os: {
      build, win11: build != null ? build >= 22000 : null, displayVersion: sys.displayVersion || null, edition: os.edition || sys.edition || null,
      win10Eol: build != null ? build < 22000 : null,
      v24h2: build != null ? build >= 26100 : null,
    },
    sec: {
      vbsRunning: tri(sys.vbsRunning), hvciRunning: tri(sys.hvciRunning), hypervisorPresent: tri(sys.hypervisorPresent), credentialGuard: tri(sys.credentialGuardRunning),
      wsl: sys.services ? tri(sys.services.wsl) : null, vmp: sys.services ? tri(sys.services.vmp) : null, hyperV: sys.services ? tri(sys.services.hyperV) : null, docker: sys.services ? tri(sys.services.docker) : null,
      secureBoot: tri(sys.secureBoot), defenderRtp: p.security ? tri(p.security.defenderRtp) : null, thirdPartyAv: p.security ? (p.security.thirdPartyAv || []).length > 0 : null,
    },
    net: p.net ? { primary: p.net.primary || null, vendor: (p.netX && p.netX.vendor) || null, props: (p.netX && p.netX.props) || [], eee: p.net.eee || null } : null,
    display: displays ? { count: displays.length, multi: displays.length > 1, maxHz: Math.max(0, ...displays.map(d => (d.cur && d.cur.hz) || 0)) || null, remote: rdp } : null,
    power: p.power ? { kind: p.power.kind || null, onAC: tri(p.power.onAC) } : null,
    gfx: { hagsMode: p.hags ?? null, gameMode: p.gaming ? tri(p.gaming.gameMode) : null, bgCapture: p.gaming ? tri(p.gaming.bgCapture) : null, dxGlobal: p.dxGlobal ?? null },
    timer: (p.cpuX && p.cpuX.timer) || null,
    bios: { date: sys.biosDate || null, version: sys.biosVersion || null },
    tools: { amd3dSvc: tri(sys.amd3dSvc), intelDtt: tri(sys.intelDtt) },
  }
}

module.exports = { deriveCaps, formFactor }
