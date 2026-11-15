const test = require('node:test')
const assert = require('node:assert')
const S = require('../lib/startup')
const { catalog, detect, boot, impact, model, findings, actions } = S

// ── a small fake PC: Run values + StartupApproved bytes + tasks + delay tasks, kept in memory ──────────────────────────────────────────
const NOW = Date.UTC(2026, 10, 14, 12, 0, 0)
const D = 86400000
const item = (src, name, cmd, o = {}) => ({ src, name, cmd, exe: o.exe === undefined ? (/^"([^"]+)"/.exec(cmd) || [, cmd.split(' ')[0]])[1] : o.exe, args: (/^"[^"]+"\s*(.*)$/.exec(cmd) || [, ''])[1], exists: o.exists === undefined ? true : o.exists, co: o.co || '', de: '', on: o.on !== false, offAt: o.offAt || null })

function makePc(over = {}) {
  const pc = {
    admin: true, delays: new Map(), writes: [], failWrites: false, ignoreWrites: false, failDelay: false,
    items: [
      item('run-hkcu', 'Discord', '"C:\\D\\Discord.exe" --start', { co: 'Discord Inc.' }),
      item('run-hkcu', 'Spotify', '"C:\\S\\Spotify.exe" --autostart', { co: 'Spotify Ltd' }),
      item('run-hkcu', 'OneDrive', '"C:\\O\\OneDrive.exe" /background', { co: 'Microsoft Corporation' }),
      item('run-hkcu', 'Gone', 'C:\\Gone\\gone.exe -x', { exists: false }),
      item('run-hkcu', 'Epic', '"C:\\E\\Epic.exe"', { on: false, offAt: NOW - 3 * D }),
      item('run-hklm', 'RtkAudUService', '"C:\\W\\RtkAudUService64.exe"', { co: 'Realtek' }),
      item('run-hklm', 'SecurityHealth', '"C:\\W\\SecurityHealthSystray.exe"', { co: 'Microsoft Corporation' }),
      item('run-hklm', 'Mystery', '"C:\\M\\mystery.exe"'),
      item('folder-user', 'Voice (VB).LNK', '"C:\\V\\voice.exe"', { co: 'VB-AUDIO' }),
    ],
    tasks: [{ path: '\\', name: 'MyLogonTask', cmd: '"C:\\T\\task.exe"', exe: 'C:\\T\\task.exe', on: true }],
    appx: [{ pkg: 'Claude_abc', task: 'ClaudeStartup', state: 0 }, { pkg: 'Foo.Bar_x', task: 'Bar', state: 2 }],
    legacyDisabled: [], legacyTasks: [], sw: { 'restart-apps': null }, procs: { discord: { n: 2, mb: 300 }, spotify: { n: 1, mb: 250 } },
    boot: { status: 'ok', boots: [], slow: [], lastBoot: NOW - 3600000 },
    ...over,
  }
  return pc
}
const bytesOf = e => (e.on ? catalog.ON_BYTES : catalog.offBytes(e.offAt || NOW))
const unq = s => String(s).replace(/''/g, "'")
function exec(pc, line) {
  let m
  pc.writes.push(line)
  if (pc.failWrites) return { ok: false, err: 'Access is denied' }
  if (pc.ignoreWrites) return { ok: true, out: '' }
  if ((m = /Set-ItemProperty -Path '((?:[^']|'')+)' -Name '((?:[^']|'')+)' -Value \(\[byte\[\]\]\(([\d,]+)\)\)/.exec(line))) {
    const approved = unq(m[1]), name = unq(m[2]), b = m[3].split(',').map(Number)
    const e = Object.keys(catalog.SOURCES).filter(k => catalog.SOURCES[k].approved === approved).map(s => pc.items.find(i => i.src === s && i.name.toLowerCase() === name.toLowerCase())).find(Boolean)
    if (e) { e.on = catalog.bytesOn(b); e.offAt = catalog.offSince(b) }
  } else if ((m = /^(Enable|Disable)-ScheduledTask -TaskPath '[^']*' -TaskName '((?:[^']|'')+)'/.exec(line))) {
    const t = pc.tasks.find(x => x.name === unq(m[2])); if (t) t.on = m[1] === 'Enable'
  } else if ((m = /Set-ItemProperty -Path '[^']+' -Name 'RestartApps' -Value (\d)/.exec(line))) pc.sw['restart-apps'] = Number(m[1])
  else if (/Remove-ItemProperty -Path '[^']+' -Name 'RestartApps'/.test(line)) pc.sw['restart-apps'] = null
  else if ((m = /\$from = '[^']+'; \$to = '[^']+'; \$n = '((?:[^']|'')+)'/.exec(line))) {
    const i = pc.legacyDisabled.findIndex(x => x.name === unq(m[1])); if (i >= 0) { const d = pc.legacyDisabled.splice(i, 1)[0]; pc.items.push(item(d.src, d.name, d.cmd, { on: false, offAt: NOW })) }
  } else if ((m = /New-ItemProperty -Path '[^']+Run' -Name '((?:[^']|'')+)' -Value '((?:[^']|'')*)' -PropertyType String/.exec(line))) pc.items.push(item('run-hkcu', unq(m[1]), unq(m[2])))
  else if ((m = /Unregister-ScheduledTask -TaskPath '[^']*' -TaskName '(JylliDelay_[^']+)'/.exec(line))) pc.legacyTasks = pc.legacyTasks.filter(t => t.name !== unq(m[1]))
  return { ok: true, out: '' }
}

function makeService(pc, o = {}) {
  let st = o.state || null
  const deps = {
    now: () => NOW,
    runPS: async s => {
      if (s.includes("'JJSTART:'")) {
        const items = pc.items.map(i => ({ src: i.src, name: i.name, cmd: i.cmd, exe: i.exe, args: i.args, exists: i.exists, co: i.co, de: '', ap: bytesOf(i) }))
        for (const t of pc.tasks) items.push({ src: 'task', name: t.name, path: t.path, cmd: t.cmd, exe: t.exe, args: '', exists: true, co: '', de: '', state: t.on ? 'Ready' : 'Disabled' })
        return { ok: true, out: 'JJSTART:' + JSON.stringify({ admin: pc.admin, items, appx: pc.appx, delay: [...pc.delays.values()].map(d => ({ name: d.name, state: 'Ready', exe: d.exe, args: d.args })), legacyTasks: pc.legacyTasks, legacyDisabled: pc.legacyDisabled, sw: pc.sw, procs: pc.procs }) }
      }
      if (s.includes("'JJLIVE:'")) return { ok: true, out: 'JJLIVE:' + JSON.stringify({ procs: pc.procs }) }
      if (s.includes("'JJBOOT:'")) return { ok: true, out: 'JJBOOT:' + JSON.stringify({ status: pc.boot.status, boots: pc.boot.boots.map(e => ({ ...e, at: new Date(e.at).toISOString() })), slow: pc.boot.slow.map(e => ({ ...e, at: new Date(e.at).toISOString() })), lastBoot: new Date(pc.boot.lastBoot).toISOString() }) }
      if (s.includes("'JJICON:'")) return { ok: true, out: 'JJICON:' + JSON.stringify({ icons: { 'C:\\D\\Discord.exe': 'iVBORw0KGgo=' } }) }
      let m
      if (s.includes('Register-ScheduledTask')) {
        if (pc.failDelay) return { ok: false, out: '' }
        const name = unq(/-TaskName '((?:[^']|'')+)' -Action/.exec(s)[1])
        pc.delays.set(name, { name, exe: unq(/New-ScheduledTaskAction -Execute '((?:[^']|'')+)'/.exec(s)[1]), args: (m = /-Argument '((?:[^']|'')*)'/.exec(s)) ? unq(m[1]) : '', sec: Number(/PT(\d+)S/.exec(s)[1]), script: s })
        return { ok: true, out: 'JJOK' }
      }
      if (s.includes('Unregister-ScheduledTask') && s.includes('\\JylliTool\\')) { pc.delays.delete(unq(/-TaskName '((?:[^']|'')+)'/.exec(s)[1])); return { ok: true, out: 'JJOK' } }
      if (s.includes('JJSTATE')) return { ok: true, out: pc.delays.has(unq(/-TaskName '((?:[^']|'')+)'/.exec(s)[1])) ? 'JJSTATE{"e":true,"v":"present"}' : 'JJSTATE{"e":false}' }
      return { ok: true, out: '' }
    },
    runRecorded: async (control, action, meta, fn) => {
      const failures = []
      const r = await fn(async l => { const x = exec(pc, l); if (x.ok === false) failures.push({ err: x.err }); return x }, async () => ({ ok: true }), () => {})
      if (failures.length && meta && meta.onFailures) meta.onFailures(failures)
      return r
    },
    isPremium: () => !!o.premium, isLaptop: () => !!o.laptop,
    state: { read: () => st, write: v => { st = JSON.parse(JSON.stringify(v)) } },
    emit: () => {},
  }
  const svc = S.create(deps)
  return { svc, pc, state: () => st, setState: v => { st = v } }
}
const idOf = (src, name) => catalog.idOf(src, name)
const by = (snap, name) => snap.entries.find(e => e.name === name)

// ── catalog ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('StartupApproved bytes: off carries the moment it was switched off and reads back', () => {
  const off = catalog.offBytes(NOW)
  assert.strictEqual(off.length, 12); assert.strictEqual(off[0], 3)
  assert.strictEqual(catalog.bytesOn(off), false); assert.strictEqual(catalog.bytesOn(catalog.ON_BYTES), true)
  assert.strictEqual(catalog.offSince(off), NOW)
  assert.strictEqual(catalog.offSince(catalog.ON_BYTES), null)
  assert.strictEqual(catalog.bytesOn([6, 0, 0, 0]), true); assert.strictEqual(catalog.bytesOn([7, 0, 0, 0]), false); assert.strictEqual(catalog.bytesOn(null), true)
})
test('delay task names are stable, safe and distinct per entry', () => {
  const a = catalog.delayTaskName('run-hkcu|spotify'), b = catalog.delayTaskName('run-hkcu|spotify'), c = catalog.delayTaskName('run-hklm|spotify')
  assert.strictEqual(a, b); assert.notStrictEqual(a, c); assert.match(a, /^Delay_[A-Za-z0-9_]+$/)
})

// ── detect ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('probe parse: Run entries, folders, tasks and Store apps become entries with the right on/off', () => {
  const out = 'noise\nJJSTART:' + JSON.stringify({
    admin: true, items: [
      { src: 'run-hkcu', name: 'A', cmd: '"C:\\x\\a.exe" -s', exe: 'C:\\x\\a.exe', exists: true, co: 'Acme', ap: catalog.offBytes(NOW) },
      { src: 'run-hkcu', name: 'B', cmd: 'b.exe', exe: '', exists: null, co: '' },
      { src: 'task', name: 'T', path: '\\Sub\\', cmd: 't.exe', exe: 't.exe', state: 'Disabled', exists: true },
      { src: 'bogus', name: 'X' },
    ],
    appx: [{ pkg: 'Foo.Bar_123', task: 'T1', state: 2 }, { pkg: 'Baz_9', task: 'T2', state: 1 }, { pkg: 'Pol_9', task: 'T3', state: 3 }],
    delay: [{ name: 'Delay_x', state: 'Ready', exe: 'a.exe', args: '' }], legacyDisabled: [{ src: 'run-hkcu', name: 'Old', cmd: 'old.exe' }], legacyTasks: [{ path: '\\', name: 'JylliDelay_Z', exe: 'z.exe', args: '-a', state: 'Ready' }],
    sw: { 'restart-apps': 0 }, procs: { Foo: { n: 2, mb: 10 } },
  })
  const p = detect.parse(out)
  assert.strictEqual(p.items.length, 6)
  const a = p.items.find(i => i.name === 'A'); assert.strictEqual(a.enabled, false); assert.strictEqual(a.offAt, NOW); assert.strictEqual(a.stem, 'a'); assert.strictEqual(a.publisher, 'Acme')
  assert.strictEqual(p.items.find(i => i.name === 'B').enabled, true); assert.strictEqual(p.items.find(i => i.name === 'B').exists, null)
  const t = p.items.find(i => i.name === 'T'); assert.strictEqual(t.enabled, false); assert.strictEqual(t.id, catalog.idOf('task', '\\Sub\\T'))
  assert.deepStrictEqual(p.items.filter(i => i.src === 'appx').map(i => [i.name, i.enabled, !!i.policy]), [['Foo.Bar', true, false], ['Baz', false, false], ['Pol', false, true]])
  assert.strictEqual(p.delays.length, 1); assert.strictEqual(p.legacy.disabled.length, 1); assert.strictEqual(p.legacy.tasks[0].name, 'JylliDelay_Z')
  assert.strictEqual(p.switches['restart-apps'], 0); assert.strictEqual(p.procs.foo.n, 2); assert.strictEqual(p.admin, true)
})
test('probe parse: garbage is null, never a guess', () => {
  assert.strictEqual(detect.parse(''), null); assert.strictEqual(detect.parse('JJSTART:{nope'), null); assert.strictEqual(detect.parseBoot('x'), null); assert.strictEqual(detect.parseLive(''), null)
})
test('probe scripts only read (no write cmdlets) and carry their markers', () => {
  for (const s of [detect.buildScript(), detect.liveScript(), detect.bootScript()]) assert.doesNotMatch(s, /Set-ItemProperty|New-ItemProperty|Remove-Item|Register-|Unregister-|Disable-|Enable-|Stop-Process/)
  assert.ok(detect.buildScript().includes("'JJSTART:'")); assert.ok(detect.bootScript().includes("'JJBOOT:'")); assert.ok(detect.liveScript().includes("'JJLIVE:'"))
})
test('icons: only base64 is accepted', () => {
  const ok = detect.parseIcons('JJICON:' + JSON.stringify({ icons: { 'C:\\a.exe': 'iVBORw0KGgo=', 'C:\\b.exe': '<script>' } }))
  assert.deepStrictEqual(Object.keys(ok), ['C:\\a.exe']); assert.ok(ok['C:\\a.exe'].startsWith('data:image/png;base64,'))
})
test('boot probe parse keeps the event fields untouched and drops events without a time', () => {
  const p = detect.parseBoot('JJBOOT:' + JSON.stringify({ status: 'ok', boots: [{ at: '2026-11-13T10:00:00.000Z', d: { BootTime: '45000' } }, { at: 'garbage', d: {} }], slow: [], lastBoot: '2026-11-14T08:00:00.000Z' }))
  assert.strictEqual(p.boots.length, 1); assert.strictEqual(p.boots[0].d.BootTime, '45000'); assert.strictEqual(p.status, 'ok'); assert.ok(p.lastBoot > 0)
  assert.strictEqual(detect.parseBoot('JJBOOT:' + JSON.stringify({ status: 'weird' })).status, 'error')
})

// ── boot + impact ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('boots: only plausible boot times, newest first, missing fields stay null', () => {
  const b = boot.parseBoots([{ at: 2, d: { BootTime: '45000', MainPathBootTime: '30000' } }, { at: 3, d: { BootTime: '50' } }, { at: 4, d: {} }, { at: 5, d: { BootTime: '60000' } }])
  assert.deepStrictEqual(b.map(x => x.at), [5, 2]); assert.strictEqual(b[0].mainMs, null); assert.strictEqual(b[1].mainMs, 30000)
})
test('boot summary: median of five and a trend only with six boots', () => {
  const mk = ms => ms.map((m, i) => ({ at: 100 - i, ms: m, mainMs: null, postMs: null, apps: null }))
  assert.strictEqual(boot.summary(mk([40000, 42000, 44000])).trend, null)
  const s = boot.summary(mk([40000, 40000, 40000, 50000, 50000, 50000]))
  assert.strictEqual(s.trend.deltaMs, -10000); assert.strictEqual(boot.summary([]), null)
})
test('boot compare: waits for a restart, then for the log, then compares honestly', () => {
  const base = { at: 1000, bootMs: 50000, mainMs: 30000, n: 2 }
  assert.strictEqual(boot.compare(null, [], 0), null)
  assert.strictEqual(boot.compare(base, [], 900, 2000).state, 'restart')
  assert.strictEqual(boot.compare(base, [], 1500, 1500 + 60000).state, 'waiting')
  assert.strictEqual(boot.compare(base, [], 1500, 1500 + boot.WAIT_MS + 1).state, 'unavailable')
  const done = boot.compare(base, [{ at: 1600, ms: 41000, mainMs: 25000 }], 1500, 99999)
  assert.strictEqual(done.state, 'done'); assert.strictEqual(done.deltaMs, -9000); assert.strictEqual(done.mainDeltaMs, -5000)
  assert.strictEqual(boot.compare({ at: 1000, bootMs: null, n: 1 }, [{ at: 1600, ms: 41000 }], 1500, 99999).deltaMs, null)
})
test('slow starters: tolerant field names, median, levels; unflagged is not "low" without a log', () => {
  const s = impact.parseSlow([{ at: 1, d: { Name: 'C:\\x\\Foo.exe', DegradationTime: '4200' } }, { at: 2, d: { Path: 'foo.exe', TotalTime: '2000' } }, { at: 3, d: { Name: 'bar.exe', Duration: '900' } }, { at: 4, d: { Name: 'zero.exe' } }])
  assert.strictEqual(s.foo.count, 2); assert.strictEqual(s.foo.medianMs, 3100); assert.strictEqual(s.zero, undefined)
  assert.strictEqual(impact.impactOf('foo', 'launcher', s, true).level, 'high'); assert.strictEqual(impact.impactOf('bar', 'chat', s, true).level, 'low')
  assert.deepStrictEqual(impact.impactOf('x', 'launcher', s, true), { level: 'low', basis: 'clear' })
  assert.deepStrictEqual(impact.impactOf('x', 'launcher', {}, false), { level: 'medium', basis: 'typical' })
  assert.deepStrictEqual(impact.impactOf('x', 'unknown', {}, false), { level: null, basis: 'none' })
})

// ── model + findings ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('lanes: launchers and chat are worth switching off, drivers and security are kept, unknown is your call', async () => {
  const { svc } = makeService(makePc())
  const s = await svc.scan()
  assert.strictEqual(by(s, 'Discord').lane, 'worth'); assert.strictEqual(by(s, 'Spotify').lane, 'worth')
  assert.strictEqual(by(s, 'OneDrive').lane, 'call'); assert.strictEqual(by(s, 'Mystery').lane, 'call')
  assert.strictEqual(by(s, 'RtkAudUService').lane, 'keep'); assert.strictEqual(by(s, 'SecurityHealth').lane, 'keep'); assert.strictEqual(by(s, 'SecurityHealth').why, 'security')
  assert.strictEqual(by(s, 'Epic').lane, 'off'); assert.strictEqual(by(s, 'Epic').offAt, NOW - 3 * D)
  assert.strictEqual(by(s, 'Gone').lane, 'worth'); assert.strictEqual(by(s, 'Gone').why, 'broken'); assert.strictEqual(by(s, 'Gone').broken, true)
  assert.strictEqual(s.verdict.kind, 'worth')
})
test('lanes: running memory is matched by program name; Store apps are shown but never toggled', async () => {
  const { svc } = makeService(makePc())
  const s = await svc.scan()
  assert.deepStrictEqual(by(s, 'Discord').running, { n: 2, mb: 300 }); assert.strictEqual(by(s, 'Mystery').running, null)
  const claude = s.entries.find(e => e.src === 'appx' && e.name === 'Claude')
  assert.strictEqual(claude.canToggle, false); assert.strictEqual(claude.lane, 'off')
  assert.ok(!s.rec.includes(s.entries.find(e => e.name === 'Foo.Bar').id))
  const r = await svc.run({ items: [{ id: claude.id, action: 'on' }] })
  assert.strictEqual(r.run.items[0].reason, 'appx')
})
test('recommended = worth, on and switchable; laptops keep hotkey and power helpers', async () => {
  const pc = makePc(); pc.items.push(item('run-hklm', 'ASUS Hotkey Helper', '"C:\\A\\asus.exe" -x', { co: 'ASUSTeK' }), item('run-hkcu', 'Jylli Tool', '"C:\\J\\jylli.exe"'))
  const lap = await makeService(pc, { laptop: true }).svc.scan(), desk = await makeService(makePc()).svc.scan()
  assert.strictEqual(by(lap, 'Jylli Tool').lane, 'keep'); assert.strictEqual(by(lap, 'Jylli Tool').why, 'protected')
  assert.ok(lap.entries.filter(e => e.lane === 'worth').every(e => lap.rec.includes(e.id) || !e.canToggle))
  assert.strictEqual(by(desk, 'Discord').lane, 'worth')
})
test('without administrator rights machine-wide entries cannot be switched', async () => {
  const { svc } = makeService(makePc({ admin: false }))
  const s = await svc.scan()
  assert.strictEqual(by(s, 'Mystery').canToggle, false); assert.strictEqual(by(s, 'Mystery').needsAdmin, true); assert.strictEqual(by(s, 'Discord').canToggle, true)
  assert.ok(s.findings.some(f => f.kind === 'noAdmin'))
  const r = await svc.run({ items: [{ id: by(s, 'Mystery').id, action: 'off' }] })
  assert.strictEqual(r.run.items[0].reason, 'admin')
})
test('a failed scan says so instead of inventing an empty list', async () => {
  const pc = makePc(); const { svc } = makeService(pc)
  const orig = pc.items; pc.items = null
  const bad = S.create({ runPS: async () => ({ ok: false, out: '' }), runRecorded: async () => {}, state: { read: () => null, write() {} }, isPremium: () => false })
  const s = await bad.scan(); assert.strictEqual(s.read, false); assert.strictEqual(s.verdict.kind, 'unread'); assert.strictEqual(s.entries.length, 0)
  pc.items = orig; void svc
})
test('findings: came back, broken, new and heavy are named; nothing is made up for a clean PC', async () => {
  const pc = makePc()
  pc.boot = { status: 'ok', boots: [{ at: NOW - D, d: { BootTime: '50000' } }], slow: [{ at: NOW - D, d: { Path: 'C:\\S\\Spotify.exe', DegradationTime: '5000' } }], lastBoot: NOW - 3600000 }
  const h = makeService(pc, { state: { seen: ['x'], offByUs: { [idOf('run-hkcu', 'Discord')]: NOW - D }, fresh: {} } })
  const s = await h.svc.scan()
  const kinds = s.findings.map(f => f.kind)
  for (const k of ['cameBack', 'broken', 'new', 'heavy']) assert.ok(kinds.includes(k), k)
  assert.strictEqual(by(s, 'Spotify').impact.level, 'high'); assert.strictEqual(by(s, 'Spotify').impact.basis, 'measured')
  const clean = makeService(makePc({ items: [item('run-hklm', 'SecurityHealth', '"C:\\W\\sh.exe"')], tasks: [], appx: [] }))
  const c = await clean.svc.scan(); assert.strictEqual(c.verdict.kind, 'lean'); assert.deepStrictEqual(c.findings, [])
})

// ── changes ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('switching off writes Windows\' own switch, is read back, and Task Manager would agree', async () => {
  const h = makeService(makePc()); await h.svc.scan()
  const id = idOf('run-hkcu', 'Discord')
  const r = await h.svc.run({ items: [{ id, action: 'off' }] })
  assert.strictEqual(r.ok, true); assert.strictEqual(r.run.items[0].verified, true)
  const e = h.pc.items.find(i => i.name === 'Discord'); assert.strictEqual(e.on, false); assert.strictEqual(e.offAt, NOW)
  assert.ok(h.pc.writes.some(w => /StartupApproved\\Run' -Name 'Discord' -Value \(\[byte\[\]\]\(3,/.test(w)))
  assert.ok(!h.pc.writes.some(w => /Remove-ItemProperty|AutorunsDisabled/.test(w)), 'nothing is deleted or moved')
  assert.strictEqual(by(r.snapshot, 'Discord').lane, 'off')
})
test('a logon task is switched with its own path and name', async () => {
  const h = makeService(makePc()); const s = await h.svc.scan()
  const r = await h.svc.run({ items: [{ id: by(s, 'MyLogonTask').id, action: 'off' }] })
  assert.strictEqual(r.run.items[0].ok, true); assert.strictEqual(h.pc.tasks[0].on, false)
  assert.ok(h.pc.writes.some(w => /Disable-ScheduledTask -TaskPath '\\' -TaskName 'MyLogonTask'/.test(w)))
})
test('already in the wanted state is a no-op that claims nothing', async () => {
  const h = makeService(makePc()); const s = await h.svc.scan()
  const r = await h.svc.run({ items: [{ id: by(s, 'Epic').id, action: 'off' }, { id: by(s, 'Discord').id, action: 'on' }] })
  assert.ok(r.run.items.every(i => i.noop && i.ok)); assert.strictEqual(h.pc.writes.length, 0)
  assert.deepStrictEqual(h.state().applied || {}, {})
})
test('a write Windows did not accept is reported as not verified, never as done', async () => {
  const pc = makePc(); const h = makeService(pc); await h.svc.scan()
  pc.ignoreWrites = true
  const r = await h.svc.run({ items: [{ id: idOf('run-hkcu', 'Discord'), action: 'off' }] })
  assert.strictEqual(r.run.items[0].ok, false); assert.strictEqual(r.run.items[0].reason, 'not-verified'); assert.strictEqual(r.ok, false)
  assert.ok(!(h.state().offByUs || {})[idOf('run-hkcu', 'Discord')])
})
test('a rejected write is a failure with a reason', async () => {
  const pc = makePc(); const h = makeService(pc); await h.svc.scan(); pc.failWrites = true
  const r = await h.svc.run({ items: [{ id: idOf('run-hkcu', 'Discord'), action: 'off' }] })
  assert.strictEqual(r.run.items[0].ok, false); assert.ok(['failed', 'not-verified'].includes(r.run.items[0].reason))
})
test('unknown ids and bad actions are refused, a long list is rejected', async () => {
  const h = makeService(makePc()); await h.svc.scan()
  const r = await h.svc.run({ items: [{ id: 'run-hkcu|nope', action: 'off' }, { id: idOf('run-hkcu', 'Discord'), action: 'explode' }] })
  assert.deepStrictEqual(r.run.items.map(i => i.reason), ['unknown', 'unknown'])
  assert.strictEqual((await h.svc.run({ items: [] })).error, 'invalid_items'); assert.strictEqual((await h.svc.run({ items: Array(61).fill({ id: 'x', action: 'off' }) })).error, 'invalid_items')
})
test('delay: creates a task without a time limit, switches the original off, and shows it as delayed', async () => {
  const h = makeService(makePc()); await h.svc.scan()
  const id = idOf('run-hkcu', 'Spotify')
  const r = await h.svc.run({ items: [{ id, action: 'delay', sec: 60 }] })
  assert.strictEqual(r.run.items[0].ok, true); assert.strictEqual(h.pc.delays.size, 1)
  const t = [...h.pc.delays.values()][0]; assert.strictEqual(t.sec, 60); assert.strictEqual(t.exe, 'C:\\S\\Spotify.exe'); assert.strictEqual(t.args, '--autostart')
  assert.match(t.script, /ExecutionTimeLimit \(\[TimeSpan\]::Zero\)/); assert.doesNotMatch(t.script, /Hours 1|PT1H/); assert.match(t.script, /AllowStartIfOnBatteries/)
  const e = by(r.snapshot, 'Spotify'); assert.strictEqual(e.delayed, true); assert.strictEqual(e.lane, 'delayed'); assert.strictEqual(e.delay.sec, 60)
  assert.strictEqual(h.pc.items.find(i => i.name === 'Spotify').on, false); assert.ok(!r.snapshot.entries.some(x => /^Delay_/.test(x.name)), 'the delay task is not a row of its own')
  assert.ok(!r.snapshot.rec.includes(id))
})
test('delay: only 30/60/120 s and only per-user programs; a failed task leaves everything as it was', async () => {
  const pc = makePc(); const h = makeService(pc); const s = await h.svc.scan()
  assert.strictEqual((await h.svc.run({ items: [{ id: by(s, 'Spotify').id, action: 'delay', sec: 45 }] })).run.items[0].reason, 'bad-delay')
  assert.strictEqual((await h.svc.run({ items: [{ id: by(s, 'Mystery').id, action: 'delay', sec: 60 }] })).run.items[0].reason, 'no-delay')
  assert.strictEqual(by(s, 'Gone').canDelay, false)
  pc.failDelay = true
  const r = await h.svc.run({ items: [{ id: by(s, 'Spotify').id, action: 'delay', sec: 60 }] })
  assert.strictEqual(r.run.items[0].ok, false); assert.strictEqual(pc.items.find(i => i.name === 'Spotify').on, true); assert.strictEqual(pc.delays.size, 0)
})
test('undelay and switching on remove the task and start the program normally', async () => {
  const h = makeService(makePc()); await h.svc.scan(); const id = idOf('run-hkcu', 'Spotify')
  await h.svc.run({ items: [{ id, action: 'delay', sec: 30 }] })
  const r = await h.svc.run({ items: [{ id, action: 'undelay' }] })
  assert.strictEqual(r.run.items[0].ok, true); assert.strictEqual(h.pc.delays.size, 0); assert.strictEqual(h.pc.items.find(i => i.name === 'Spotify').on, true); assert.strictEqual(by(r.snapshot, 'Spotify').lane, 'worth')
  await h.svc.run({ items: [{ id, action: 'delay', sec: 30 }] })
  const off = await h.svc.run({ items: [{ id, action: 'off' }] })
  assert.strictEqual(h.pc.delays.size, 0); assert.strictEqual(by(off.snapshot, 'Spotify').lane, 'off')
})
test('undo puts back exactly what was there, including a delay', async () => {
  const h = makeService(makePc()); await h.svc.scan()
  const a = idOf('run-hkcu', 'Spotify'), b = idOf('run-hkcu', 'Discord')
  await h.svc.run({ items: [{ id: a, action: 'delay', sec: 120 }] })
  const r = await h.svc.run({ items: [{ id: a, action: 'off' }, { id: b, action: 'off' }] })
  const u = await h.svc.undoRun({ runId: r.run.id })
  assert.strictEqual(u.ok, true)
  assert.strictEqual(by(u.snapshot, 'Spotify').delay.sec, 120); assert.strictEqual(by(u.snapshot, 'Spotify').delayed, true); assert.strictEqual(by(u.snapshot, 'Discord').lane, 'worth')
  assert.strictEqual((await h.svc.undoRun({ runId: 'zzz' })).error, 'not-found')
})
test('switch off all recommended in one run, then Undo restores every one', async () => {
  const h = makeService(makePc()); const s = await h.svc.scan()
  const n = s.rec.length; assert.ok(n >= 2)
  const r = await h.svc.tuneRecommended()
  assert.strictEqual(r.run.items.filter(i => i.ok).length, n); assert.strictEqual(r.snapshot.rec.length, 0)
  const u = await h.svc.undoRun({ runId: r.run.id }); assert.strictEqual(u.snapshot.rec.length, n)
})
test('before/after: the first change records the boot baseline, more changes add to it, undo takes them off', async () => {
  const pc = makePc(); pc.boot = { status: 'ok', boots: [1, 2, 3].map(i => ({ at: NOW - i * D, d: { BootTime: '50000', MainPathBootTime: '30000' } })), slow: [], lastBoot: NOW - 7200000 }
  const h = makeService(pc); await h.svc.scan()
  const r1 = await h.svc.run({ items: [{ id: idOf('run-hkcu', 'Discord'), action: 'off' }] })
  assert.deepStrictEqual([h.state().baseline.n, h.state().baseline.bootMs, h.state().baseline.mainMs], [1, 50000, 30000]); assert.strictEqual(r1.snapshot.boot.compare.state, 'restart')
  await h.svc.run({ items: [{ id: idOf('run-hkcu', 'Spotify'), action: 'off' }] })
  assert.strictEqual(h.state().baseline.n, 2)
  const r2 = await h.svc.run({ items: [{ id: idOf('run-hkcu', 'OneDrive'), action: 'off' }] })
  await h.svc.undoRun({ runId: r2.run.id }); assert.strictEqual(h.state().baseline.n, 2)
  await h.svc.undoRun({ runId: r1.run.id }); assert.strictEqual(h.state().baseline.n, 1)
})
test('after a restart the next boot is compared with the baseline', async () => {
  const pc = makePc(); pc.boot = { status: 'ok', boots: [{ at: NOW - 20 * 60000, d: { BootTime: '41000', MainPathBootTime: '25000' } }], slow: [], lastBoot: NOW - 25 * 60000 }
  const h = makeService(pc, { state: { baseline: { at: NOW - D, bootMs: 52000, mainMs: 33000, n: 3 } } })
  const s = await h.svc.scan()
  assert.strictEqual(s.boot.compare.state, 'done'); assert.strictEqual(s.boot.compare.deltaMs, -11000)
})

// ── memory of what Jylli did ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('new entries are remembered until acknowledged; the first scan flags nothing as new', async () => {
  const pc = makePc(); const h = makeService(pc)
  const first = await h.svc.scan(); assert.strictEqual(first.counts.isNew, 0)
  pc.items.push(item('run-hkcu', 'Installer Thing', '"C:\\I\\i.exe"'))
  const s = await h.svc.scan(); assert.strictEqual(by(s, 'Installer Thing').isNew, true); assert.strictEqual(s.counts.isNew, 1)
  const s2 = await h.svc.scan(); assert.strictEqual(by(s2, 'Installer Thing').isNew, true, 'still new on the next scan')
  const a = h.svc.ack({ id: by(s2, 'Installer Thing').id }); assert.strictEqual(by(a.snapshot, 'Installer Thing').isNew, false)
  assert.strictEqual(h.svc.history().fresh[0].name, 'Installer Thing')
})
test('a program Jylli switched off that turns itself on again is flagged and logged once', async () => {
  const pc = makePc(); const h = makeService(pc); await h.svc.scan()
  const id = idOf('run-hkcu', 'Discord'); await h.svc.run({ items: [{ id, action: 'off' }] })
  pc.items.find(i => i.name === 'Discord').on = true
  const s = await h.svc.scan(); assert.strictEqual(by(s, 'Discord').cameBack, true); assert.ok(s.findings.some(f => f.kind === 'cameBack'))
  await h.svc.scan(); assert.strictEqual(h.svc.history().cameBack.length, 1)
  const r = await h.svc.run({ items: [{ id, action: 'on' }] }); assert.ok(r.run.items[0].noop)
  assert.strictEqual(by(await h.svc.scan(), 'Discord').cameBack, false, 'a noop "on" still clears the flag')
})
test('keep off is Premium; the guard switches a pinned program off again and logs it', async () => {
  const free = makeService(makePc()); await free.svc.scan()
  assert.strictEqual((await free.svc.keepSet({ id: idOf('run-hkcu', 'Discord'), on: true })).error, 'premium_required')
  const pc = makePc(); const h = makeService(pc, { premium: true }); await h.svc.scan()
  const id = idOf('run-hkcu', 'Discord')
  const k = await h.svc.keepSet({ id, on: true }); assert.strictEqual(k.ok, true); assert.strictEqual(pc.items.find(i => i.name === 'Discord').on, false)
  pc.items.find(i => i.name === 'Discord').on = true
  const s = await h.svc.scan(); await h.svc.guard()
  assert.strictEqual(pc.items.find(i => i.name === 'Discord').on, false); assert.ok(h.svc.history().guard.some(g => g.name === 'Discord'))
  assert.strictEqual(by(s, 'Discord').pinned, true)
  await h.svc.run({ items: [{ id, action: 'on' }] }); assert.ok(!h.state().pinned[id], 'switching it on yourself ends the pin')
})
test('the guard does nothing for a free account', async () => {
  const pc = makePc(); const h = makeService(pc, { state: { pinned: { [idOf('run-hkcu', 'Discord')]: NOW } } }); await h.svc.scan()
  assert.strictEqual((await h.svc.guard()).skipped, true); assert.strictEqual(pc.items.find(i => i.name === 'Discord').on, true)
})
test('the restart-apps switch is read back, ours only, and restores the previous value', async () => {
  const pc = makePc(); const h = makeService(pc); await h.svc.scan()
  assert.strictEqual((await h.svc.switchSet({ id: 'restart-apps', on: false })).error, 'not-ours')
  const on = await h.svc.switchSet({ id: 'restart-apps', on: true }); assert.strictEqual(on.ok, true); assert.strictEqual(pc.sw['restart-apps'], 0); assert.strictEqual(on.snapshot.switches[0].state, 'set')
  const off = await h.svc.switchSet({ id: 'restart-apps', on: false }); assert.strictEqual(off.ok, true); assert.strictEqual(pc.sw['restart-apps'], null)
  pc.sw['restart-apps'] = 1; await h.svc.scan(); await h.svc.switchSet({ id: 'restart-apps', on: true }); await h.svc.switchSet({ id: 'restart-apps', on: false }); assert.strictEqual(pc.sw['restart-apps'], 1)
  assert.strictEqual((await h.svc.switchSet({ id: 'nope', on: true })).error, 'unknown')
})

// ── old versions ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('migrate: values an old version hid come back to Run and stay off; an old flat delay task is rebuilt as a normal entry', async () => {
  const pc = makePc({ legacyDisabled: [{ src: 'run-hkcu', name: 'Teams', cmd: '"C:\\T\\Teams.exe"' }], legacyTasks: [{ path: '\\', name: 'JylliDelay_Dropbox', exe: 'C:\\Dropbox\\Dropbox.exe', args: '/home', state: 'Ready' }] })
  const h = makeService(pc); const s = await h.svc.scan()
  assert.strictEqual(s.legacy.length, 2); assert.ok(s.findings.some(f => f.kind === 'legacy'))
  const m = await h.svc.migrate()
  assert.strictEqual(m.ok, true); assert.strictEqual(m.migrated, 2); assert.strictEqual(m.snapshot.legacy.length, 0)
  assert.strictEqual(by(m.snapshot, 'Teams').enabled, false); assert.strictEqual(by(m.snapshot, 'Dropbox').enabled, true)
  assert.strictEqual(pc.items.find(i => i.name === 'Dropbox').cmd, '"C:\\Dropbox\\Dropbox.exe" /home')
})

// ── journal handler + actions + misc ───────────────────────────────────────────────────────────────────────────────────────────────────────
test('journal handler for the delay task: read, remove a created task, recreate a removed one', async () => {
  const pc = makePc(); const h = makeService(pc); await h.svc.scan()
  const H = h.svc.handlers()['startup-task']
  await h.svc.run({ items: [{ id: idOf('run-hkcu', 'Spotify'), action: 'delay', sec: 60 }] })
  const name = [...pc.delays.keys()][0]
  assert.deepStrictEqual(await H.read({ name }), { exists: true, value: 'present' })
  assert.strictEqual(await H.restore({ name, before: { exists: false } }), true); assert.deepStrictEqual(await H.read({ name }), { exists: false })
  assert.strictEqual(await H.restore({ name, exe: 'C:\\S\\Spotify.exe', args: '--autostart', sec: 60, before: { exists: true } }), true); assert.strictEqual(pc.delays.has(name), true)
  assert.strictEqual(await H.restore({ name: 'x', before: { exists: true } }), false)
})
test('actions: scripts quote user values and never run unquoted names', () => {
  const l = actions.approvedLines('run-hkcu', "O'Brien App", false, NOW)
  assert.ok(l[1].includes("'O''Brien App'")); assert.strictEqual(actions.approvedLines('task', 'x', true).length, 0)
  const d = actions.delayCreateScript({ name: 'Delay_x', exe: "C:\\It's\\a.exe", args: '--x "y"', sec: 9999 })
  assert.ok(d.includes("'C:\\It''s\\a.exe'")); assert.ok(d.includes('PT600S')); assert.ok(d.includes('-WorkingDirectory'))
  assert.strictEqual(actions.stateOk('JJSTATE{"e":true,"v":"present"}').exists, true); assert.ok(actions.stateOk('nothing').unknown)
})
test('live refresh returns only what is running, and icons come once per file', async () => {
  const h = makeService(makePc()); await h.svc.scan()
  const l = await h.svc.live(); assert.strictEqual(l.ok, true); assert.strictEqual(l.running[idOf('run-hkcu', 'Discord')].mb, 300)
  const ic = await h.svc.icons(); assert.ok(ic[idOf('run-hkcu', 'Discord')].startsWith('data:image/png;base64,'))
  assert.strictEqual(h.svc.fileOf(idOf('run-hkcu', 'Discord')), 'C:\\D\\Discord.exe'); assert.strictEqual(h.svc.fileOf('nope'), '')
})
test('boot log states are named: none, denied, and the list still works', async () => {
  for (const status of ['none', 'denied']) {
    const pc = makePc(); pc.boot = { status, boots: [], slow: [], lastBoot: NOW }
    const s = await makeService(pc).svc.scan()
    assert.strictEqual(s.boot.status, status); assert.strictEqual(s.boot.summary, null); assert.strictEqual(by(s, 'Discord').impact.basis, 'typical')
    assert.strictEqual(s.findings.some(f => f.kind === 'bootDenied'), status === 'denied')
  }
})
test('verdict only counts what can really be switched off (a Store app in the worth lane is not a promise)', async () => {
  const pc = makePc({ items: [item('run-hklm', 'SecurityHealth', '"C:\W\sh.exe"')], tasks: [], appx: [{ pkg: 'Microsoft.YourPhone_x', task: 'YourPhone', state: 2 }] })
  const s = await makeService(pc).svc.scan()
  assert.strictEqual(s.entries.find(e => e.src === 'appx').lane, 'worth'); assert.strictEqual(s.rec.length, 0); assert.strictEqual(s.verdict.kind, 'lean')
})
