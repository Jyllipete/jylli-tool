'use strict'
// Processor topology from the facts the read-only probe collects (GetLogicalProcessorInformationEx lines). Pure.
//   C|efficiencyClass|group|mask   one physical core: its logical processors are the set bits of `mask` (SMT siblings share one line)
//   L|3|sizeKB|group|mask          one last-level cache and the logical processors that share it
// Result: { ok, logical, physical, hybrid, ccdCount, groups:[{id,kind,label,l3MB,vcache,cores:[coreIndex]}], cores:[{index,eff,group,threads:[n]}], cpus:[{n,g,i,core}] }
//   `n` is the logical processor number used everywhere else (affinity masks, live frames): processor group * 64 + bit.
const U64 = v => BigInt.asUintN(64, BigInt(v))

function bits(mask) {
  const out = []
  let m = U64(mask), i = 0
  while (m > 0n) { if (m & 1n) out.push(i); m >>= 1n; i++ }
  return out
}

function parseLines(lines) {
  const cores = [], caches = []
  for (const raw of lines || []) {
    const p = String(raw).trim().split('|')
    try {
      if (p[0] === 'C' && p.length >= 4) cores.push({ eff: Number(p[1]) || 0, group: Number(p[2]) || 0, bits: bits(p[3]) })
      else if (p[0] === 'L' && p[1] === '3' && p.length >= 5) caches.push({ kb: Number(p[2]) || 0, group: Number(p[3]) || 0, bits: bits(p[4]) })
    } catch { /* one bad line is skipped, never fatal */ }
  }
  return { cores, caches }
}

/**
 * facts: the `f` object of detect.parse (topo lines). hint: { x3d: bool } from the CPU name (lib/cpu-arch), used only to label a single-CCD V-Cache part.
 */
function build(facts, hint = {}) {
  const { cores: rawCores, caches } = parseLines(facts && facts.topo)
  if (!rawCores.length) return { ok: false, logical: 0, physical: 0, hybrid: false, ccdCount: 0, groups: [], cores: [], cpus: [] }
  rawCores.sort((a, b) => a.group - b.group || (a.bits[0] || 0) - (b.bits[0] || 0))
  const cores = [], cpus = []
  rawCores.forEach((rc, index) => {
    const threads = rc.bits.map(b => rc.group * 64 + b)
    cores.push({ index, eff: rc.eff, group: rc.group, threads })
    threads.forEach(n => cpus.push({ n, g: rc.group, i: n % 64, core: index }))
  })
  cpus.sort((a, b) => a.n - b.n)
  const coreOf = new Map(cpus.map(c => [c.n, c.core]))
  const effs = [...new Set(cores.map(c => c.eff))].sort((a, b) => b - a)
  const hybrid = effs.length > 1
  const groups = []
  const l3 = caches.map(c => ({ mb: Math.round(c.kb / 1024), cores: [...new Set(c.bits.map(b => coreOf.get(c.group * 64 + b)).filter(x => x !== undefined))].sort((a, b) => a - b) })).filter(c => c.cores.length)
  if (hybrid) {
    // Intel hybrid: one shared L3, so the groups are the efficiency classes. The highest class is the performance cores.
    effs.forEach((e, k) => {
      const list = cores.filter(c => c.eff === e).map(c => c.index)
      groups.push({ id: 'g' + k, kind: k === 0 ? 'p' : 'e', label: k === 0 ? 'P' : effs.length > 2 && k === 1 ? 'LP-E' : 'E', l3MB: null, vcache: false, cores: list })
    })
  } else if (l3.length > 1) {
    const max = Math.max(...l3.map(c => c.mb)), min = Math.min(...l3.map(c => c.mb))
    const asym = max >= min * 1.5
    l3.forEach((c, k) => groups.push({ id: 'g' + k, kind: 'ccd', label: 'CCD ' + k, l3MB: c.mb, vcache: asym && c.mb === max, cores: c.cores }))
  } else {
    const c = l3[0]
    groups.push({ id: 'g0', kind: 'all', label: l3.length > 1 ? 'CCD 0' : 'Cores', l3MB: c ? c.mb : null, vcache: !!hint.x3d && !!c, cores: cores.map(x => x.index) })
  }
  return { ok: true, logical: cpus.length, physical: cores.length, hybrid, ccdCount: groups.filter(g => g.kind === 'ccd').length, dualCcdVcache: groups.some(g => g.vcache) && groups.length > 1, groups, cores, cpus }
}

/** Perf-counter instance "0,5" (group,index) -> logical number, or -1 for _Total and anything else. */
function logicalOf(instance) {
  const m = /^(\d+),(\d+)$/.exec(String(instance || ''))
  return m ? Number(m[1]) * 64 + Number(m[2]) : -1
}

module.exports = { build, parseLines, bits, logicalOf }
