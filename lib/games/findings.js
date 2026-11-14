'use strict'
// The ONLY list of what the Games tab may say about the library, in order of importance. Every threshold is a named constant.
const NOEXE_MIN = 1          // games without a trusted executable before the tab mentions it
const UNREAD_MIN = 1         // games whose rows could not be read

const RANK = { bad: 0, warn: 1, info: 2 }

/**
 * o: { totals, models: { id: model }, names: { id: name }, legacy: [libraryId], running: id|null, watcher: bool, premium: bool }
 * -> [{ id, tone, vars, act? }]  most important first
 */
function compute(o) {
  const out = [], models = o.models || {}, names = o.names || {}
  const add = (id, tone, vars, act) => out.push({ id, tone, vars: vars || {}, act: act || null })
  const ids = Object.keys(models)
  const drifted = ids.filter(i => models[i].summary === 'drift')
  if (drifted.length) add('drift', 'warn', { n: drifted.length, name: names[drifted[0]] || '' }, { kind: 'game', id: drifted[0] })
  if ((o.legacy || []).length) add('legacy', 'warn', { n: o.legacy.length, name: names[o.legacy[0]] || '' }, { kind: 'migrate' })
  const noexe = ids.filter(i => models[i].summary === 'noexe')
  if (noexe.length >= NOEXE_MIN && o.premium) add('noexe', 'info', { n: noexe.length, name: names[noexe[0]] || '' }, { kind: 'game', id: noexe[0] })
  const unread = ids.filter(i => models[i].summary === 'unknown')
  if (unread.length >= UNREAD_MIN) add('unread', 'info', { n: unread.length })
  if (o.running) add('running', 'info', { name: names[o.running] || '' }, { kind: 'game', id: o.running })
  return out.sort((a, b) => RANK[a.tone] - RANK[b.tone])
}

/** Verdict for the stage: one finding when there is one that needs a decision, else the library state. */
function verdict(o) {
  const t = o.totals || { games: 0, tuned: 0, todo: 0 }
  if (!t.games) return { kind: 'empty', tone: 'idle', vars: {} }
  const f = (o.findings || []).find(x => x.tone !== 'info')
  if (f) return { kind: 'finding', tone: f.tone, id: f.id, vars: f.vars, act: f.act }
  if (o.running) return { kind: 'running', tone: 'accent', vars: { name: (o.names || {})[o.running] || '' } }
  if (!o.premium) return { kind: 'free', tone: 'idle', vars: { n: t.games } }
  if (t.todo) return { kind: 'todo', tone: 'accent', vars: { n: t.todo, tuned: t.tuned, games: t.games } }
  return { kind: 'done', tone: 'ok', vars: { n: t.tuned, games: t.games } }
}

module.exports = { compute, verdict, NOEXE_MIN, UNREAD_MIN }
