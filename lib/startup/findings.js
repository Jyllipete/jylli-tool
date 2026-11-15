'use strict'
// Startup tab "Ignition": the ONLY list of what the tab may say about this PC, with every threshold named. Pure.
// finding: { kind, tone: 'warn'|'info', ids: [entry id], vars, act }
const T = { MANY_WORTH: 4, SLOW_BOOT_MS: 60000 }

function compute(m, ctx) {
  ctx = ctx || {}
  const out = []
  const by = f => m.entries.filter(f)
  const add = (kind, tone, list, act, vars) => { if (list.length) out.push({ kind, tone, ids: list.map(e => e.id), vars: { n: list.length, name: list[0].name, ...(vars || {}) }, act }) }
  if (m.legacy && m.legacy.length) out.push({ kind: 'legacy', tone: 'warn', ids: [], vars: { n: m.legacy.length }, act: 'migrate' })
  add('cameBack', 'warn', by(e => e.cameBack), 'open')
  add('broken', 'warn', by(e => e.broken && e.enabled), 'open')
  add('new', 'info', by(e => e.isNew), 'open')
  add('heavy', 'warn', by(e => e.enabled && e.impact.basis === 'measured' && e.impact.level === 'high'), 'open')
  if (m.read && m.admin === false) out.push({ kind: 'noAdmin', tone: 'info', ids: [], vars: { n: by(e => e.needsAdmin).length }, act: null })
  if (ctx.boot && ctx.boot.status === 'denied') out.push({ kind: 'bootDenied', tone: 'info', ids: [], vars: {}, act: null })
  return out
}

/** The one sentence at the top: { kind: 'unread'|'empty'|'worth'|'lean', vars }. */
function verdict(m, boot) {
  if (!m.read) return { kind: 'unread', vars: {} }
  const c = m.counts
  if (!c.total) return { kind: 'empty', vars: {} }
  // Only what can really be switched off counts (a Store app in the worth lane is shown, but Windows Settings owns its switch).
  const worth = m.rec.length
  const vars = { on: c.on + c.delayed, total: c.total, worth, mb: m.totals.mb, boot: boot && boot.last ? boot.last.ms : null }
  return { kind: worth > 0 ? 'worth' : 'lean', vars }
}

module.exports = { compute, verdict, T }
