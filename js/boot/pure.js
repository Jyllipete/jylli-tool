'use strict'
// Boot scan, pure part: what each row says, how far along the scan is, what kind of rig this is, and the one true line
// the screen ends on. No DOM, no IPC — unit-tested (test/boot-pure.test.js). `t(key, vars)` is the `boot` LANG group.
;(function (root) {
  // Order = the order rows appear. w = share of the progress bar (storage/OS info are the slow reads), core = needed before "Continue now".
  const STEPS = [
    { id: 'cpu', w: 1, core: true }, { id: 'ram', w: 1, core: true }, { id: 'gpu', w: 1, core: true },
    { id: 'vram', w: 0.5 }, { id: 'storage', w: 1.6 }, { id: 'display', w: 0.5 }, { id: 'board', w: 0.7 }, { id: 'os', w: 0.7 },
  ]
  const TOTAL_W = STEPS.reduce((a, s) => a + s.w, 0)

  /** 0..1: finished steps count fully, the step being read counts a third, so the bar moves the moment a step starts. */
  function progress(done, active) {
    const d = new Set(done || [])
    let sum = 0
    for (const s of STEPS) sum += d.has(s.id) ? s.w : (s.id === active ? s.w / 3 : 0)
    return Math.min(1, sum / TOTAL_W)
  }
  const coreDone = done => { const d = done instanceof Set ? done : new Set(done || []); return STEPS.filter(s => s.core).every(s => d.has(s.id)) }

  const ok = v => v != null && v !== '' && v !== 'Detecting…' && v !== 'Unknown' && v !== 0
  const gb = mb => (mb >= 1024 ? Math.round(mb / 1024) + ' GB' : mb + ' MB')

  /** {main, sub} for a row from a sysInfo-shaped object, or null when that read is missing (shown as "unavailable", never faked). */
  function rowText(id, i, t) {
    i = i || {}; t = t || ((k) => k)
    const join = (...a) => a.filter(Boolean).join(' · ')
    switch (id) {
      case 'cpu': {
        const th = i.cpuThreads || i.cpuCores
        return ok(i.cpu) ? { main: i.cpu, sub: join(th ? t('threads', { n: th }) : '', i.cpuSpeed ? (i.cpuSpeed / 1000).toFixed(1) + ' GHz' : '') } : null
      }
      case 'ram': return ok(i.ramGB) ? { main: i.ramGB + ' GB', sub: join(i.ramSpec || i.ramType, !i.ramSpec && i.ramSpeed ? i.ramSpeed + ' MHz' : '') } : null
      case 'gpu': return ok(i.gpu) ? { main: i.gpu, sub: i.gpuDriver ? t('driver', { v: i.gpuDriver }) : '' } : null
      case 'vram': return i.vramMB >= 512 ? { main: gb(i.vramMB) + ' VRAM', sub: '' } : null
      case 'storage': {
        const known = (ok(i.diskType) && i.diskType !== 'SSD/HDD') || ok(i.diskModel)
        return known ? { main: i.diskModel || i.diskType, sub: join(i.diskModel ? i.diskType : '', i.diskTotalGB ? i.diskUsedGB + '/' + i.diskTotalGB + ' GB' : '') } : null
      }
      case 'display': return ok(i.displayRes) ? { main: i.displayRes.replace('x', ' × '), sub: i.displayRefresh ? i.displayRefresh + ' Hz' : '' } : null
      case 'board': return ok(i.board) ? { main: i.board, sub: i.biosVersion ? 'BIOS ' + i.biosVersion : '' } : null
      case 'os': return ok(i.osCaption || i.os) ? { main: i.osCaption || i.os, sub: join(i.osBuild ? t('build', { n: i.osBuild }) : '', i.isAdmin === true ? t('admin') : i.isAdmin === false ? t('standard') : '') } : null
      default: return null
    }
  }

  /** Honest class of the machine from what was read; null when too little is known to say anything. */
  function rigClass(i) {
    i = i || {}
    if (!ok(i.cpu) && !ok(i.gpu)) return null
    const threads = i.cpuThreads || i.cpuCores || 0
    const tier = threads >= 16 && i.ramGB >= 32 && i.vramMB >= 8192 ? 'high' : threads >= 8 && i.ramGB >= 16 ? 'mid' : 'entry'
    return { tier, form: i.isLaptop ? 'laptop' : 'desktop' }
  }

  const ARROW = ' → '
  /** One human line per real change ("RAM 16 → 32 GB"). */
  function formatChange(c) {
    const unit = { ramGB: ' GB', ramSpeed: ' MHz' }[c.key] || ''
    if (c.key === 'vramMB') return `${c.label} ${gb(+c.before)}${ARROW}${gb(+c.after)}`
    return `${c.label} ${c.before}${ARROW}${c.after}${unit}`
  }

  const DAY = 86400000
  /** The closing promise: only facts we hold. Returns [{key, vars}] — empty means "say nothing" (the card then shows its first-launch line). */
  function promiseParts({ changes, applied, lastRunAt, now } = {}) {
    const out = []
    if (changes && changes.length) out.push({ key: 'pChanged', vars: { list: changes.slice(0, 2).map(formatChange).join(', ') + (changes.length > 2 ? ' +' + (changes.length - 2) : '') } })
    if (applied > 0) out.push({ key: 'pApplied', vars: { n: applied } })
    if (lastRunAt && now >= lastRunAt) {
      const d = Math.floor((now - lastRunAt) / DAY)
      out.push({ key: d === 0 ? 'pOptToday' : 'pOptDays', vars: { n: d } })
    }
    return out
  }

  /** The rig signature as a small mark: 8 spokes whose lengths come from the signature's hex digits, joined by a ring (40x40 box). Same PC, same mark. */
  function glyph(sig) {
    const hex = String(sig || '').replace(/^JT-/, '').replace(/[^0-9A-F]/gi, '').padEnd(8, '0').slice(0, 8)
    const pts = [...hex].map((ch, k) => {
      const a = (k * 45 - 90) * Math.PI / 180, r = 8 + parseInt(ch, 16) * 0.75
      return [20 + Math.cos(a) * r, 20 + Math.sin(a) * r].map(v => Math.round(v * 10) / 10)
    })
    return { ring: 'M' + pts.map(p => p.join(' ')).join('L') + 'Z', spokes: pts.map(p => 'M20 20L' + p.join(' ')).join('') }
  }

  const api = { STEPS, progress, coreDone, rowText, rigClass, formatChange, promiseParts, glyph }
  root.JylliBootPure = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
