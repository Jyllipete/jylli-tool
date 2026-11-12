'use strict'
// Core plans for one game: which logical processors a process may run on. Pure, from lib/cpumem/topology.js. A plan is only offered where it
// applies to this CPU, and never leaves fewer than MIN_LOGICAL processors or reaches past one processor group (64 logical processors).
//   pcores   hybrid CPUs: the performance cores (highest efficiency class) and their SMT threads; the efficiency cores are left to Windows
//   vcache   dual-CCD CPUs with one V-Cache die: only the V-Cache CCD (what the AMD driver does automatically when it is installed)
//   skip0    every logical processor except both threads of the first core, which services most interrupts
const MIN_LOGICAL = 4
const MAX_LOGICAL = 64
const KINDS = ['pcores', 'vcache', 'skip0']

function threadsOf(topo, coreIdxs) {
  const set = new Set(coreIdxs)
  return topo.cores.filter(c => set.has(c.index)).flatMap(c => c.threads).sort((a, b) => a - b)
}

function maskOf(list) {
  let m = 0n
  for (const n of list) m |= 1n << BigInt(n)
  return m.toString()   // decimal string: JSON-safe, parsed back with BigInt()
}

/** The CPU ids a plan keeps, or null when the plan does not apply. */
function cpusFor(topo, kind) {
  if (!topo || !topo.ok || topo.logical > MAX_LOGICAL || topo.logical < MIN_LOGICAL * 2) return null
  let list = null
  if (kind === 'pcores' && topo.hybrid) { const g = topo.groups.find(x => x.kind === 'p'); list = g ? threadsOf(topo, g.cores) : null }
  else if (kind === 'vcache' && topo.dualCcdVcache) { const g = topo.groups.find(x => x.vcache); list = g ? threadsOf(topo, g.cores) : null }
  else if (kind === 'skip0') { const first = topo.cores[0]; list = topo.cpus.map(c => c.n).filter(n => !first.threads.includes(n)) }
  if (!list || list.length < MIN_LOGICAL || list.length > MAX_LOGICAL || list.length >= topo.logical) return null
  return list
}

/** Every plan that applies: [{ kind, cpus:[n], mask, count, total }] */
function plans(topo) {
  const out = []
  for (const kind of KINDS) {
    const cpus = cpusFor(topo, kind)
    if (cpus) out.push({ kind, cpus, mask: maskOf(cpus), count: cpus.length, total: topo.logical })
  }
  return out
}

function planFor(topo, kind) { return plans(topo).find(p => p.kind === kind) || null }

/** A program name (not a path) that may be pinned: letters, digits, dot, dash, underscore, space; ends in .exe; never a system process. */
const PROTECTED = new Set(['system', 'idle', 'registry', 'smss.exe', 'csrss.exe', 'wininit.exe', 'winlogon.exe', 'services.exe', 'lsass.exe', 'svchost.exe', 'dwm.exe', 'explorer.exe', 'msmpeng.exe', 'memory compression', 'audiodg.exe', 'fontdrvhost.exe', 'sihost.exe'])
function validExe(name) {
  const s = String(name || '').trim()
  return /^[A-Za-z0-9_. \-]{1,80}\.exe$/i.test(s) && !PROTECTED.has(s.toLowerCase())
}

module.exports = { MIN_LOGICAL, MAX_LOGICAL, KINDS, cpusFor, plans, planFor, maskOf, validExe, PROTECTED }
