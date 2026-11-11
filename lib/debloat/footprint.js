'use strict'
// Debloat footprint: what Windows' extras cost on this PC. Pure and dependency-free (the page uses it too).
//   totals    per layer: how many removable items, RAM now, disk, wake-ups in the next 24 h
//   chatter   the tick list behind the 24-hour band: a tick for every real scheduled run of a still-enabled task
//   arcs      the layer arcs of the Core (shares of what is removable, none thinner than MIN_SHARE)
// Only measured values are used: a task with no NextRunTime has no ticks, a service in a shared svchost has no RAM.
;(function (root) {
  const LAYERS = ['apps', 'services', 'tasks', 'ads', 'features']
  const HOUR = 3600000, DAY = 24 * HOUR
  const MIN_SHARE = 0.06
  const MAX_TICKS = 96   // per task: a task that runs every minute is shown as the band filling up, not as 1,440 marks

  /** Ticks for one task item inside [now, now + windowMs]. */
  function taskTicks(it, now, windowMs = DAY) {
    if (!it || it.kind !== 'task' || !it.next) return []
    const end = now + windowMs, out = []
    let t = it.next
    if (t < now) {   // a stale NextRunTime: step forward by the repetition, otherwise there is no honest tick
      if (!(it.repMs > 0)) return []
      t += Math.ceil((now - t) / it.repMs) * it.repMs
    }
    while (t <= end && out.length < MAX_TICKS) { out.push(t); if (!(it.repMs > 0)) break; t += it.repMs }
    return out
  }

  /** items: model items; verdicts: classify() result. Only items that are present and not kept count. */
  const removable = (items, verdicts) => (items || []).filter(i => { const v = verdicts && verdicts[i.id]; return v && v.present && v.lane !== 'kept' })

  function sum(list, now) {
    let ram = 0, disk = 0, wakes = 0
    for (const i of list) { ram += i.ram || 0; disk += i.disk || 0; wakes += taskTicks(i, now).length }
    return { count: list.length, ram, disk, wakes }
  }

  /** totals(items, verdicts, now, selection?) -> { all, layers: { apps: {count,ram,disk,wakes}, ... }, selected } */
  function totals(items, verdicts, now = Date.now(), selection) {
    const list = removable(items, verdicts)
    const layers = {}
    for (const l of LAYERS) layers[l] = sum(list.filter(i => i.layer === l), now)
    const sel = selection ? sum(list.filter(i => selection.has(i.id)), now) : null
    return { all: sum(list, now), layers, selected: sel }
  }

  /** Ticks for the 24-hour band: [{ id, group, t, off }], oldest first. `off` is true for tasks that are not removable (kept) or already silenced. */
  function chatter(items, verdicts, now = Date.now(), windowMs = DAY) {
    const out = []
    for (const i of items || []) {
      if (i.kind !== 'task' || i.state !== 'on') continue
      const v = verdicts && verdicts[i.id]
      for (const t of taskTicks(i, now, windowMs)) out.push({ id: i.id, group: i.group, t, kept: !!(v && v.lane === 'kept') })
    }
    return out.sort((a, b) => a.t - b.t)
  }

  /** layerValues: { apps: n, ... } -> [{ id, start, len }] in % of the ring, in LAYERS order. Zero layers get no arc. */
  function arcs(layerValues) {
    const list = LAYERS.map(id => ({ id, v: Math.max(0, +(layerValues && layerValues[id]) || 0) })).filter(g => g.v > 0)
    const total = list.reduce((a, g) => a + g.v, 0)
    if (!total) return LAYERS.map(id => ({ id, start: 0, len: 0 }))
    const gap = list.length > 1 ? 1.4 : 0, usable = 100 - gap * list.length
    let shares = list.map(g => Math.max(MIN_SHARE, g.v / total))
    const s = shares.reduce((a, b) => a + b, 0)
    shares = shares.map(x => x / s)
    let pos = 0
    const placed = {}
    list.forEach((g, i) => { const len = shares[i] * usable; placed[g.id] = { id: g.id, start: pos, len }; pos += len + gap })
    return LAYERS.map(id => placed[id] || { id, start: 0, len: 0 })
  }

  const api = { LAYERS, HOUR, DAY, taskTicks, removable, totals, chatter, arcs }
  root.JylliDebloatFootprint = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
