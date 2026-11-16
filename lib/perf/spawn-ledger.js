'use strict'
// Counts the child processes Jylli Tool starts, by executable, so "background work" is a number and not a feeling.
// Only installed with --perf-log (main.js), before anything destructures child_process. Without the flag nothing here runs.
// Each call is counted once at launch; the count is a spawn rate, not a CPU cost (the CPU of the children is sampled separately by tools/perf).

const path = require('path')

/** Short name of what is being launched: "powershell", "tasklist", "nvidia-smi"... (exe name without folder or extension). */
function exeName(file) {
  const first = String(file || '').trim().replace(/^"([^"]+)".*$/, '$1').split(/\s+/)[0] || '?'
  return path.win32.basename(first).replace(/\.(exe|cmd|bat)$/i, '').toLowerCase() || '?'
}

/** What was run, in about 80 characters: "powershell: <start of the script>" (the argument after -Command), "tasklist: /FO CSV ...". Lets a spawn rate be traced to a feature. */
function cmdLabel(file, args) {
  const exe = exeName(file)
  let body = ''
  if (Array.isArray(args)) {
    const i = args.findIndex(a => /^-command$/i.test(String(a)))
    body = i >= 0 && args[i + 1] != null ? String(args[i + 1]) : args.filter(a => !/^-/.test(String(a))).join(' ')
  } else {
    body = String(file || '').replace(/^"[^"]*"\s*/, '').replace(/^\S+\s*/, '')   // exec(): the command line minus the program
  }
  body = body.replace(/\s+/g, ' ').trim().slice(0, 80)
  return body ? exe + ': ' + body : exe
}

const MAX_LABELS = 100   // per window, so the log cannot grow without bound

function createLedger() {
  let counts = {}
  let cmds = {}
  let total = 0
  return {
    note(file, args) {
      const n = exeName(file); counts[n] = (counts[n] || 0) + 1; total++
      const l = cmdLabel(file, args)
      if (l in cmds || Object.keys(cmds).length < MAX_LABELS) cmds[l] = (cmds[l] || 0) + 1
    },
    /** Returns the counts since the last drain and starts a new window. `by` = per program, `cmds` = per program and start of the command. */
    drain() { const out = { total, by: counts, cmds }; counts = {}; cmds = {}; total = 0; return out },
  }
}

/** Wraps spawn / execFile / exec / spawnSync-free paths of a child_process module object. Returns the ledger. */
function install(cp) {
  const ledger = createLedger()
  for (const fn of ['spawn', 'execFile', 'fork']) {
    const orig = cp[fn]
    if (typeof orig !== 'function') continue
    cp[fn] = function (file, ...rest) { try { ledger.note(file, Array.isArray(rest[0]) ? rest[0] : null) } catch { /* counting must never break a launch */ } return orig.call(this, file, ...rest) }
  }
  // exec(commandLine): the shell is "cmd" but the real program is the first word of the command line
  const origExec = cp.exec
  if (typeof origExec === 'function') cp.exec = function (cmd, ...rest) { try { ledger.note(cmd) } catch { /* ignore */ } return origExec.call(this, cmd, ...rest) }
  return ledger
}

module.exports = { install, createLedger, exeName, cmdLabel }
