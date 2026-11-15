'use strict'
// Startup tab "Ignition": probe + boot timing + what Jylli remembers -> one entry per startup program. Pure.
// Lane (exactly one, decided HERE and nowhere else):
//   worth    a launcher, chat app, media player or vendor helper that is on (or an enabled entry whose file is gone): switching it off is safe
//   call     cloud sync and programs nobody classified: the user's decision
//   delayed  on, but started 30-120 s after sign-in by a Jylli task
//   keep     security, drivers, peripherals, updaters and Jylli itself: left alone (the switch still works after a confirm)
//   off      switched off in Windows' own Startup apps switch
const catalog = require('./catalog')
const impact = require('./impact')
const known = require('../apps/known')

const SAFE = catalog.classifier.SAFE
const KEEP_CATS = new Set(['security', 'driver', 'updater-security'])
const LANES = ['worth', 'call', 'delayed', 'keep', 'off']

/**
 * o: { probe, boot: {status, boots, slow, lastBoot}|null, boots: [merged boot list], slow: {stem: {...}}, state: {applied:{id:ts}, pinned:{id:ts}, delays:{id:{sec,task,at}},
 *      seen:[id], offByUs:{id:ts}}, premium, isLaptop, now }
 */
function build(o) {
  const probe = o.probe || null
  const st = o.state || {}
  const applied = st.applied || {}, pinned = st.pinned || {}, delays = st.delays || {}, offByUs = st.offByUs || {}
  const haveLog = !!(o.boots && o.boots.length)
  const procs = (o.live && o.live.procs) || (probe && probe.procs) || {}
  const taskNames = new Set(((probe && probe.delays) || []).map(d => d.name))
  const entries = []
  if (probe) {
    for (const it of probe.items) {
      const c = catalog.classify({ ...it, enabled: it.enabled })
      const cat = c.category
      const forcedKeep = catalog.KEEP_NAME.test(it.name + ' ' + it.cmd) || (!!o.isLaptop && catalog.LAPTOP_KEEP.test(it.name))
      const meta = catalog.SOURCES[it.src]
      const dl = delays[it.id] || null
      const delayTask = dl ? { sec: dl.sec, task: dl.task, ok: taskNames.has(dl.task) } : null
      const delayed = !!(delayTask && delayTask.ok && !it.enabled)
      const broken = it.exists === false && it.src !== 'appx'
      let lane
      if (!it.enabled && !delayed) lane = 'off'
      else if (delayed) lane = 'delayed'
      else if (KEEP_CATS.has(cat) || forcedKeep) lane = 'keep'
      else if (SAFE.has(cat) || broken) lane = 'worth'
      else lane = 'call'
      const why = lane === 'worth' && broken && !SAFE.has(cat) ? 'broken' : lane === 'keep' && forcedKeep && !KEEP_CATS.has(cat) ? 'protected' : cat
      const run = it.stem && procs[it.stem] && procs[it.stem].n > 0 ? { n: procs[it.stem].n, mb: procs[it.stem].mb } : null
      const app = known.APPS.find(a => known.startsApp(a, it.cmd) || known.startsApp(a, it.name)) || null
      const adminOk = probe.admin || meta.user
      const canToggle = meta.kind !== 'appx' && adminOk
      const eff = impact.impactOf(it.stem, cat, o.slow, haveLog)
      entries.push({
        id: it.id, src: it.src, kind: meta.kind, name: it.name, sub: it.sub || '', cmd: it.cmd, exe: it.exe, args: it.args || '', path: it.path || '', file: it.file || '', stem: it.stem,
        publisher: it.publisher, desc: it.desc, exists: it.exists, enabled: it.enabled, delayed, delay: delayTask, offAt: it.offAt || null, policy: !!it.policy,
        cat, lane, why, broken, impact: eff, running: run, appId: app ? app.id : null,
        isNew: !!(st.fresh || {})[it.id],
        cameBack: it.enabled && !!offByUs[it.id] && !delayed,
        pinned: !!pinned[it.id], ours: applied[it.id] || null,
        canToggle, needsAdmin: !adminOk && meta.kind !== 'appx', delayable: ['run-hkcu', 'folder-user'].includes(it.src) && !!it.exe && it.exists !== false && adminOk,
        canDelay: it.enabled && !delayed && ['run-hkcu', 'folder-user'].includes(it.src) && !!it.exe && it.exists !== false && adminOk,
        boot: !!it.boot,
      })
    }
  }
  const on = entries.filter(e => e.enabled || e.delayed)
  const counts = {
    total: entries.length, on: on.filter(e => !e.delayed).length, delayed: entries.filter(e => e.delayed).length, off: entries.filter(e => e.lane === 'off').length,
    worth: entries.filter(e => e.lane === 'worth').length, call: entries.filter(e => e.lane === 'call').length, keep: entries.filter(e => e.lane === 'keep').length,
    isNew: entries.filter(e => e.isNew).length, cameBack: entries.filter(e => e.cameBack).length, broken: entries.filter(e => e.broken && e.enabled).length,
    measured: entries.filter(e => e.enabled && e.impact.basis === 'measured').length,
    heavy: entries.filter(e => e.enabled && e.impact.basis === 'measured' && e.impact.level === 'high').length,
    running: entries.filter(e => e.running && (e.enabled || e.delayed)).length,
  }
  const totals = {
    mb: entries.filter(e => e.running && e.enabled).reduce((t, e) => t + e.running.mb, 0),
    slowMs: entries.filter(e => e.enabled && e.impact.basis === 'measured').reduce((t, e) => t + e.impact.ms, 0),
  }
  const rec = entries.filter(e => e.lane === 'worth' && e.enabled && e.canToggle).map(e => e.id)
  const legacy = probe ? [
    ...probe.legacy.disabled.map(d => ({ kind: 'disabled', id: 'disabled|' + d.src + '|' + d.name.toLowerCase(), src: d.src, name: d.name, cmd: d.cmd })),
    ...probe.legacy.tasks.map(t => ({ kind: 'task', id: 'task|' + t.name.toLowerCase(), name: t.name, path: t.path, cmd: ((t.exe || '') + ' ' + (t.args || '')).trim(), exe: t.exe, args: t.args })),
  ] : []
  return { entries, counts, totals, rec, legacy, read: !!probe, admin: probe ? probe.admin : null, switches: probe ? probe.switches : {} }
}

/** The owned switches' states: 'set' (value is what we want), 'open' (Windows has its own value), 'default' (nothing stored). */
function switchState(row, value, remembered) {
  if (value == null) return remembered ? 'drifted' : 'default'
  return value === row.value ? 'set' : 'open'
}

module.exports = { build, switchState, LANES, KEEP_CATS }
