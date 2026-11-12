'use strict'
// Memory strata and module map from one live frame and the scanned modules. Pure. All sizes are MB.
// Windows counts a page as one of: active (in use by a process), modified (waiting to be written to disk), standby (cached, reusable at once), free.
// Available = standby + free, so in use = total - available, and modified is part of in use. Compressed memory is part of active.
;(function (root) {
  const MB = 1

  function strata(m) {
    if (!m || !(m.totalMB > 0)) return null
    const total = m.totalMB
    const avail = clamp(m.availMB, 0, total)
    const inUse = total - avail
    const modified = clamp(m.modifiedMB || 0, 0, inUse)
    const active = inUse - modified
    const standby = clamp(m.standbyMB || 0, 0, avail)
    const free = Math.max(0, avail - standby)
    const compressed = clamp(m.compressedMB || 0, 0, active)
    const limit = m.commitLimitMB > 0 ? m.commitLimitMB : 0
    const committed = m.committedMB > 0 ? m.committedMB : 0
    return {
      totalMB: total, activeMB: active, modifiedMB: modified, standbyMB: standby, freeMB: free, compressedMB: compressed,
      loadPct: Math.round(inUse / total * 100),
      committedMB: committed, commitLimitMB: limit, commitPct: limit ? Math.round(committed / limit * 100) : null,
      pagedPoolMB: m.pagedPoolMB || 0, nonPagedPoolMB: m.nonPagedPoolMB || 0, pageReads: m.pageReads || 0,
      parts: [['active', active], ['modified', modified], ['standby', standby], ['free', free]].map(([id, v]) => ({ id, mb: v, pct: v / total * 100 })),
    }
  }

  /** Module map: channel/slot from the BankLabel ("Controller0ChannelADimm0") when it says so, else by order. DDR type from SMBIOS code. */
  const DDR = { 20: 'DDR', 21: 'DDR2', 24: 'DDR3', 26: 'DDR4', 34: 'DDR5', 35: 'LPDDR3', 36: 'LPDDR4', 37: 'LPDDR5' }
  function modules(sticks, slotsTotal) {
    const list = (sticks || []).map((s, i) => {
      const bank = String(s.bank || ''), ch = /Channel\s*([A-Z0-9])/i.exec(bank), dimm = /Dimm\s*(\d+)/i.exec(bank)
      const rated = Number(s.ratedMT) || 0, run = Number(s.runMT) || 0
      return { slot: String(s.slot || ''), channel: ch ? ch[1].toUpperCase() : null, dimm: dimm ? Number(dimm[1]) : i, capGB: Number(s.capGB) || 0, type: DDR[s.type] || null, ratedMT: rated, runMT: run, part: String(s.part || ''),
        below: !!(rated && run && run < rated * 0.95) }
    })
    const channels = new Set(list.map(m => m.channel).filter(Boolean)).size
    const total = Math.max(Number(slotsTotal) || 0, list.length)
    const empty = total > list.length ? total - list.length : 0
    return { list, empty, slots: total, channels: channels || (list.length ? 1 : 0), singleChannel: list.length === 1 && total >= 2 && !/^LP/.test((list[0] && list[0].type) || '') }
  }

  function clamp(v, lo, hi) { v = Number(v); if (!Number.isFinite(v)) return lo; return Math.min(hi, Math.max(lo, v)) }

  const exported = { MB, strata, modules, DDR }
  if (typeof module !== 'undefined' && module.exports) module.exports = exported
  if (typeof window !== 'undefined') window.JylliCpuMemMemory = exported
})(typeof window !== 'undefined' ? window : globalThis)
