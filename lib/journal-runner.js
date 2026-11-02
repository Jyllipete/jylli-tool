'use strict'
// Gives a tweak journaling versions of ps / cmd / regAdd / regDelete. The tweak code itself is unchanged: it calls the same
// functions with the same arguments, and the recorder works out the real before/after values around each call.
const prelude = require('./journal-prelude')
const cp = require('./cmd-parse')

function descToChange(d, before, after) {
  switch (d.kind) {
    case 'reg': return { kind: 'reg', via: 'cmd', key: d.key, name: d.name, before, after }
    case 'service': return { kind: 'service', via: 'cmd', name: d.name, before, after }
    case 'bcd': return { kind: 'bcd', via: 'cmd', id: d.id, name: d.name, before, after }
    case 'powercfg': return { kind: 'powercfg', via: 'cmd', ac: d.ac, scheme: d.scheme, sub: d.sub, setting: d.setting, before, after }
    case 'powercfg-active': return { kind: 'powercfg-active', via: 'cmd', before, after }
    default: return { kind: 'unresolved', cmd: d.cmd }
  }
}

// A failed command only counts as a hard failure when the change cannot have happened: a rejected registry write, a denied
// or unelevated call, or a command that never ran. Anything else that exits non-zero (stopping a service that is not running,
// deleting a value that is not there, an optional service that does not exist) is kept as a warning so it can be shown without
// failing a tweak that did its job.
const DENIED = /(access is denied|requires elevation|unauthorized ?access|not have sufficient privileges|queue_timeout|SecurityException)/i
function classifyFailure(kind, command, r) {
  if (!r || r.ok) return null
  const err = String(r.err || r.out || '').trim().slice(0, 300)
  const hard = DENIED.test(err) || (kind === 'cmd' && /^\s*reg\s+add\b/i.test(command))
  return { hard, kind, command: String(command).replace(/\s+/g, ' ').slice(0, 160), err: err || `exit ${r.code ?? '?'}` }
}

const PREFLIGHT_FAIL = /(parameter cannot be found|ParameterBindingException|A positional parameter cannot be found|AmbiguousParameterSet)/i

function createRecorder({ runPS, runCmd }) {
  const changes = []
  const unresolved = new Set()
  const failures = []
  const warnings = []
  const noteResult = (kind, command, r) => { const f = classifyFailure(kind, command, r); if (f) (f.hard ? failures : warnings).push(f); return r }

  async function readStates(descs) {
    const out = []
    for (const d of descs) {
      const rc = cp.readBackCmd(d)
      if (!rc) { out.push({ unknown: true }); continue }
      const r = await runCmd(rc)
      out.push(cp.parseReadBack(d, r.out, r.code))
    }
    return out
  }

  function pushDescChanges(descs, befores, afters) {
    descs.forEach((d, i) => {
      const b = befores[i], a = afters[i]
      if (b?.unknown || a?.unknown) { unresolved.add(d.name || d.cmd || d.kind); return }
      changes.push(descToChange(d, b, a))
    })
  }

  async function ps(script, timeoutMs) {
    const scan = prelude.staticScan(script)
    scan.unresolved.forEach(u => unresolved.add(u))
    const befores = await readStates(scan.native)
    let r = await runPS(prelude.wrap(script), timeoutMs)
    if (!r.ok && PREFLIGHT_FAIL.test(`${r.err} ${r.out}`)) {
      // A proxy could not bind this call's parameters. Run the script untouched and say the journal could not follow it.
      unresolved.add('powershell-proxy-bypassed')
      r = await runPS(script, timeoutMs)
      return noteResult('ps', script, r)
    }
    const x = prelude.extract(r.out)
    changes.push(...x.changes)
    if (x.bad) unresolved.add('malformed-journal-line')
    pushDescChanges(scan.native, befores, await readStates(scan.native))
    noteResult('ps', script, r)
    return { ...r, out: x.clean }
  }

  async function cmd(command, timeoutMs) {
    const descs = cp.parseCmd(command)
    const known = descs.filter(d => d.kind !== 'unresolved')
    descs.filter(d => d.kind === 'unresolved').forEach(d => unresolved.add(d.cmd))
    const befores = await readStates(known)
    const r = await runCmd(command, timeoutMs)
    pushDescChanges(known, befores, await readStates(known))
    return noteResult('cmd', command, r)
  }

  return {
    ps, cmd,
    /** Records a change that is not a registry/service/bcd/powercfg write (e.g. DNS servers). Its kind needs an undo handler. */
    note(change) { if (change && change.kind && change.before && change.after) changes.push({ via: 'note', ...change }) },
    /** Commands that failed hard (write rejected, access denied) and ones that merely exited non-zero. */
    outcome() { return { failures: failures.slice(), warnings: warnings.slice() } },
    regAdd: (hive, p, name, type, value) => cmd(`reg add "${hive}\\${p}" /v "${name}" /t ${type} /d "${value}" /f`),
    regDelete: (hive, p, name) => cmd(`reg delete "${hive}\\${p}" /v "${name}" /f`),
    /** All changes seen so far, with no-ops (before equals after) dropped, plus the things we could not follow. */
    finish() {
      const real = changes.filter(c => !(c.before && c.after && !c.before.unknown &&
        !!c.before.exists === !!c.after.exists && (!c.before.exists || String(c.before.value) === String(c.after.value))))
      const un = [...unresolved].map(cmd => ({ kind: 'unresolved', cmd }))
      return { changes: [...real, ...un], noops: changes.length - real.length }
    },
  }
}

module.exports = { createRecorder, descToChange }
