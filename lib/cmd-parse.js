'use strict'
// Parses the mutating cmd lines tweaks run (reg, sc, bcdedit, powercfg) into change descriptors, and builds the matching
// read-back and restore commands. Pure string work: the caller runs the commands. Anything mutating that we cannot model
// comes back as { kind: 'unresolved' } so the journal can mark the entry "partial" instead of pretending it is exact.

const SC_START = { 0: 'boot', 1: 'system', 2: 'auto', 3: 'demand', 4: 'disabled' }

function tokenize(s) {
  const out = []
  let cur = '', q = false, has = false
  for (const ch of String(s)) {
    if (ch === '"') { q = !q; has = true; continue }
    if (/\s/.test(ch) && !q) { if (has || cur) out.push(cur); cur = ''; has = false; continue }
    cur += ch
  }
  if (has || cur) out.push(cur)
  return out
}

function splitChain(cmd) {
  const parts = []
  let cur = '', q = false
  const s = String(cmd)
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '"') q = !q
    if (!q && ch === '&') { parts.push(cur); cur = ''; if (s[i + 1] === '&') i++; continue }
    cur += ch
  }
  parts.push(cur)
  return parts.map(p => p.trim()).filter(Boolean)
}

const lc = x => String(x || '').toLowerCase()
function flagValue(tok, flag) {
  const i = tok.findIndex(t => lc(t) === flag)
  return i >= 0 ? tok[i + 1] : undefined
}

const MUTATING = {
  reg: t => ['add', 'delete', 'import', 'copy', 'save', 'restore'].includes(lc(t[1])),
  sc: t => ['config', 'create', 'delete', 'failure'].includes(lc(t[1])),
  bcdedit: t => /^[/-](set|deletevalue|timeout|bootsequence|default|displayorder|create|delete|copy)/i.test(t[1] || ''),
  powercfg: t => !/^[/-](l|list|q|query|a|aliases|getactivescheme|requests|energy|batteryreport|devicequery|lastwake|h|hibernate)\b/i.test(t[1] || '') || /^[/-](h|hibernate)$/i.test(t[1] || '') && t.length > 2,
  netsh: t => t.some(x => /^(set|add|delete|reset)$/i.test(x)),
  schtasks: t => /^[/-](change|create|delete)/i.test(t[1] || ''),
  net: t => /^(stop|start|accounts)$/i.test(t[1] || '') && lc(t[1]) !== 'accounts',
  wmic: t => t.some(x => /^(set|call|delete)$/i.test(x)),
}

function parseSegment(seg) {
  const t = tokenize(seg)
  if (!t.length) return []
  const exe = lc(t[0]).replace(/\.exe$/, '').split(/[\\/]/).pop()
  if (exe === 'reg') {
    const op = lc(t[1])
    if (op === 'add' || op === 'delete') {
      const key = t[2]
      if (!key) return [{ kind: 'unresolved', cmd: seg }]
      const ve = t.some(x => lc(x) === '/ve')
      const name = ve ? '' : flagValue(t, '/v')
      if (op === 'delete' && name === undefined) return [{ kind: 'unresolved', cmd: seg }]
      if (name === undefined) return [{ kind: 'unresolved', cmd: seg }]
      const d = { kind: 'reg', op: op === 'add' ? 'set' : 'delete', key, name }
      if (op === 'add') { d.type = flagValue(t, '/t') || 'REG_SZ'; d.data = flagValue(t, '/d') ?? '' }
      return [d]
    }
    return MUTATING.reg(t) ? [{ kind: 'unresolved', cmd: seg }] : []
  }
  if (exe === 'sc') {
    if (lc(t[1]) === 'config') {
      const svc = t[2]
      const m = seg.match(/start=\s*([a-z-]+)/i)   // both `start= disabled` and `start=disabled`
      if (svc && m) return [{ kind: 'service', name: svc, startType: lc(m[1]) }]
    }
    return MUTATING.sc(t) ? [{ kind: 'unresolved', cmd: seg }] : []
  }
  if (exe === 'bcdedit') {
    const op = lc(t[1]).replace(/^-/, '/')
    if (op === '/set' || op === '/deletevalue') {
      const rest = t.slice(2)
      const id = rest[0] && rest[0].startsWith('{') ? rest.shift() : '{current}'
      const name = rest.shift()
      if (name) return [{ kind: 'bcd', op: op === '/set' ? 'set' : 'delete', id, name, value: rest.join(' ') }]
    }
    return MUTATING.bcdedit(t) ? [{ kind: 'unresolved', cmd: seg }] : []
  }
  if (exe === 'powercfg') {
    const op = lc(t[1]).replace(/^-/, '/')
    if ((op === '/setacvalueindex' || op === '/setdcvalueindex') && t.length >= 6) {
      return [{ kind: 'powercfg', ac: op === '/setacvalueindex', scheme: t[2], sub: t[3], setting: t[4], value: t[5] }]
    }
    if (op === '/setactive' || op === '/s') return t[2] ? [{ kind: 'powercfg-active', scheme: t[2] }] : []
    return MUTATING.powercfg(t) ? [{ kind: 'unresolved', cmd: seg }] : []
  }
  if (MUTATING[exe] && MUTATING[exe](t)) return [{ kind: 'unresolved', cmd: seg }]
  return []
}

function parseCmd(cmd) {
  const out = []
  for (const seg of splitChain(cmd)) out.push(...parseSegment(seg))
  return out
}

const q = s => '"' + String(s).replace(/"/g, '') + '"'

/** Command that reads the current state of a descriptor, or null when it cannot be read. */
function readBackCmd(d) {
  if (d.kind === 'reg') return d.name === '' ? `reg query ${q(d.key)} /ve` : `reg query ${q(d.key)} /v ${q(d.name)}`
  if (d.kind === 'service') return `sc qc ${q(d.name)}`
  if (d.kind === 'bcd') return `bcdedit /enum ${d.id}`
  if (d.kind === 'powercfg') return `powercfg /query ${d.scheme} ${d.sub} ${d.setting}`
  if (d.kind === 'powercfg-active') return 'powercfg /getactivescheme'
  return null
}

/** Turns the output of readBackCmd into a state object. { exists:false } when the thing is absent. */
function parseReadBack(d, out, code) {
  const text = String(out || '')
  if (d.kind === 'reg') {
    const line = text.split(/\r?\n/).find(l => /\bREG_[A-Z_]+\b/.test(l))
    if (!line) return { exists: false }
    const m = line.match(/^\s*(.*?)\s{2,}(REG_[A-Z_]+)\s*(.*)$/)
    if (!m) return { exists: true, type: 'REG_SZ', value: '' }
    const type = m[2]
    let value = (m[3] || '').trim()
    if (type === 'REG_DWORD' || type === 'REG_QWORD') value = String(parseInt(value, 16))
    return { exists: true, type, value }
  }
  if (d.kind === 'service') {
    const m = text.match(/START_TYPE\s*:\s*(\d)/)
    return m ? { exists: true, value: (m[1] === '2' && /DELAYED/i.test(text) ? 'delayed-auto' : (SC_START[m[1]] || m[1])) } : { exists: false }
  }
  if (d.kind === 'bcd') {
    const re = new RegExp('^' + d.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+(.+)$', 'im')
    const m = text.match(re)
    return m ? { exists: true, value: m[1].trim() } : { exists: false }
  }
  if (d.kind === 'powercfg') {
    const m = text.match(new RegExp('Current ' + (d.ac ? 'AC' : 'DC') + ' Power Setting Index:\\s*(0x[0-9a-f]+)', 'i'))
    return m ? { exists: true, value: String(parseInt(m[1], 16)) } : { exists: false }
  }
  if (d.kind === 'powercfg-active') {
    const m = text.match(/GUID:\s*([0-9a-f-]{36})/i)
    return m ? { exists: true, value: m[1] } : { exists: false }
  }
  return { exists: false }
}

/** Command that puts a descriptor back to `before`, or null when that is not possible. */
function restoreCmd(d, before) {
  if (!before || before.unknown) return null
  if (d.kind === 'reg') {
    if (!before.exists) return `reg delete ${q(d.key)} ${d.name === '' ? '/ve' : '/v ' + q(d.name)} /f`
    return `reg add ${q(d.key)} ${d.name === '' ? '/ve' : '/v ' + q(d.name)} /t ${before.type} /d ${q(before.value)} /f`
  }
  if (d.kind === 'service') return before.exists ? `sc config ${q(d.name)} start= ${before.value}` : null
  if (d.kind === 'bcd') return before.exists ? `bcdedit /set ${d.id} ${d.name} ${before.value}` : `bcdedit /deletevalue ${d.id} ${d.name}`
  if (d.kind === 'powercfg') return before.exists ? `powercfg ${d.ac ? '/setacvalueindex' : '/setdcvalueindex'} ${d.scheme} ${d.sub} ${d.setting} ${before.value}` : null
  if (d.kind === 'powercfg-active') return before.exists ? `powercfg /setactive ${before.value}` : null
  return null
}

module.exports = { tokenize, splitChain, parseCmd, readBackCmd, parseReadBack, restoreCmd, SC_START }
