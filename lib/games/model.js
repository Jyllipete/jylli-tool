'use strict'
// Model: catalog + live readings + what Jylli remembers + the PC's facts -> the rows of one game and the library summary. Pure.
// Row status (exactly one): on | native (set, Jylli did not set it) | off | partial | drifted (Jylli applied it, Windows reads default)
//   | elsewhere (another value from another tab or tool: never overwritten) | unknown (cannot be read) | noexe (no trusted executable yet)
// "rec" (recommended) is decided here and nowhere else.
const catalog = require('./catalog')
const detect = require('./detect')
const exes = require('./exes')
const { statusOf } = require('../windows/model')

const SET = new Set(['on', 'native'])

function recFor(row, facts) {
  if (row.rec === 'all') return true
  if (row.rec === 'hybrid') return !!(facts && (facts.hybrid === true || facts.laptop === true))
  if (row.rec === 'win11') return !!(facts && Number(facts.build) >= (row.minBuild || 0))
  return false
}
function appliesOn(row, facts) { return !row.minBuild || !facts || !facts.build || Number(facts.build) >= row.minBuild }

/**
 * o: { game, exeList: exes.locate() result, parsed: detect.parse() | null, remembered: { <rowId>: 'applied'|'restored' }, facts: { hybrid, laptop, build }, premium }
 */
function buildGame(o) {
  const list = exes.trusted(o.exeList), remembered = o.remembered || {}, facts = o.facts || {}
  const rows = []
  for (const r of catalog.ROWS) {
    if (!appliesOn(r, facts) && remembered[r.id] !== 'applied') continue
    let status, values = []
    if (!list.length) status = 'noexe'
    else {
      const states = list.map(e => detect.evaluate(o.parsed, e.path)[r.id])
      const kinds = new Set(states.map(s => s.state))
      values = states.map(s => s.value).filter(v => v != null)
      let live
      if (kinds.has('unread') && !o.parsed) live = { state: 'unread' }
      else if (kinds.has('unread')) live = { state: 'unread' }
      else if (kinds.size === 1 && kinds.has('all')) live = { state: 'all' }
      else if (kinds.size === 1 && kinds.has('none')) live = { state: 'none' }
      else if (kinds.has('other') && !kinds.has('all')) live = { state: 'other' }
      else live = { state: 'some' }
      status = live.state === 'other' ? 'elsewhere' : statusOf(remembered[r.id] || 'default', live, false)
    }
    const rec = !r.minBuild || appliesOn(r, facts) ? recFor(r, facts) : false
    rows.push({ id: r.id, icon: r.icon, status, remembered: remembered[r.id] || 'default', rec: rec && (status === 'off' || status === 'drifted'), wanted: rec, locked: !o.premium, values })
  }
  const wanted = rows.filter(r => r.wanted)
  const setCount = wanted.filter(r => SET.has(r.status)).length
  let summary
  if (!list.length) summary = 'noexe'
  else if (rows.some(r => r.status === 'drifted')) summary = 'drift'
  else if (rows.some(r => r.status === 'unknown')) summary = 'unknown'
  else if (wanted.length && setCount === wanted.length) summary = 'tuned'
  else if (setCount > 0 || rows.some(r => SET.has(r.status))) summary = 'partial'
  else summary = 'open'
  return { rows, summary, exes: o.exeList, trusted: list.length, recIds: rows.filter(r => r.rec).map(r => r.id) }
}

/** Library totals for the stage: how many games, how many tuned, how many have something recommended left. */
function totals(models) {
  const ids = Object.keys(models)
  const count = k => ids.filter(i => models[i].summary === k).length
  return { games: ids.length, tuned: count('tuned'), partial: count('partial'), open: count('open'), drift: count('drift'), noexe: count('noexe'), todo: ids.filter(i => models[i].recIds.length).length }
}

module.exports = { buildGame, totals, recFor, SET }
