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

const PREFLIGHT_FAIL = /(parameter cannot be found|ParameterBindingException|A positional parameter cannot be found|AmbiguousParameterSet)/i

function createRecorder({ runPS, runCmd }) {
  const changes = []
  const unresolved = new Set()

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
      return r
    }
    const x = prelude.extract(r.out)
    changes.push(...x.changes)
    if (x.bad) unresolved.add('malformed-journal-line')
    pushDescChanges(scan.native, befores, await readStates(scan.native))
    return { ...r, out: x.clean }
  }

  async function cmd(command, timeoutMs) {
    const descs = cp.parseCmd(command)
    const known = descs.filter(d => d.kind !== 'unresolved')
    descs.filter(d => d.kind === 'unresolved').forEach(d => unresolved.add(d.cmd))
    const befores = await readStates(known)
    const r = await runCmd(command, timeoutMs)
    pushDescChanges(known, befores, await readStates(known))
    return r
  }

  return {
    ps, cmd,
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
