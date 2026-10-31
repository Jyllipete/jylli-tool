// Real PowerShell, real registry, but only under HKCU\Software\JyllitoolTest. Proves apply -> journal -> undo restores the key.
const test = require('node:test')
const assert = require('node:assert')
const { execFileSync, execFile } = require('child_process')
const { buildEntry, undoEntry } = require('../lib/journal')
const prelude = require('../lib/journal-prelude')

const KEY = 'HKCU\\Software\\JyllitoolTest'
const PSKEY = 'HKCU:\\Software\\JyllitoolTest'
const winOnly = { skip: process.platform !== 'win32' }

const ps = (command) => new Promise(resolve => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
  { windowsHide: true, timeout: 60000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => resolve({ ok: !err, out: stdout || '', err: stderr || '' })))
const cmd = (c) => new Promise(resolve => require('child_process').exec(c, { windowsHide: true }, (err, stdout) => resolve({ ok: !err, out: stdout || '', code: err ? err.code : 0 })))
const dump = () => { try { return execFileSync('reg', ['query', KEY, '/s'], { encoding: 'utf8' }) } catch { return '' } }
const cleanup = () => { try { execFileSync('reg', ['delete', KEY, '/f'], { stdio: 'ignore' }) } catch {} }

test('apply under the prelude, then undo restores the registry byte for byte', winOnly, async () => {
  cleanup()
  await ps(`New-Item -Path '${PSKEY}\\Nic\\{A}' -Force | Out-Null; New-Item -Path '${PSKEY}\\Nic\\{B}' -Force | Out-Null
Set-ItemProperty -Path '${PSKEY}' -Name Existing -Value 7 -Type DWord; Set-ItemProperty -Path '${PSKEY}' -Name Text -Value 'keep me' -Type String
Set-ItemProperty -Path '${PSKEY}' -Name Bin -Value ([byte[]](1,2,3)) -Type Binary`)
  const before = dump()
  assert.ok(before.includes('Existing'))

  const script = `
Set-ItemProperty -Path '${PSKEY}' -Name Existing -Value 1 -Type DWord -Force
Set-ItemProperty -Path '${PSKEY}' -Name Text -Value 'changed "quoted"' -Type String
Set-ItemProperty -Path '${PSKEY}' -Name Bin -Value ([byte[]](9,9)) -Type Binary
New-ItemProperty -Path '${PSKEY}' -Name Fresh -Value 5 -PropertyType DWord -Force | Out-Null
Get-ChildItem '${PSKEY}\\Nic' | ForEach-Object { Set-ItemProperty -Path $_.PSPath -Name TcpAckFrequency -Value 1 -Type DWord -Force }
Write-Output 'tweak output'`
  const r = await ps(prelude.wrap(script))
  const { clean, changes, bad } = prelude.extract(r.out)
  assert.strictEqual(bad, 0)
  assert.strictEqual(clean.trim(), 'tweak output')
  assert.strictEqual(changes.length, 6)
  assert.notStrictEqual(dump(), before)

  const entry = buildEntry({ tweakId: 't', changes })
  assert.strictEqual(entry.fidelity, 'exact')
  const u = await undoEntry(entry, { ps, cmd })
  assert.strictEqual(u.ok, true, JSON.stringify(u))
  // Values created by the tweak are gone; everything else is back. (Subkeys created by the test itself stay.)
  assert.strictEqual(dump(), before)
  cleanup()
})

test('undo reports a conflict when someone changed the value since', winOnly, async () => {
  cleanup()
  await ps(`New-Item -Path '${PSKEY}' -Force | Out-Null; Set-ItemProperty -Path '${PSKEY}' -Name V -Value 1 -Type DWord`)
  const r = await ps(prelude.wrap(`Set-ItemProperty -Path '${PSKEY}' -Name V -Value 2 -Type DWord`))
  const entry = buildEntry({ changes: prelude.extract(r.out).changes })
  await ps(`Set-ItemProperty -Path '${PSKEY}' -Name V -Value 3 -Type DWord`)
  const u = await undoEntry(entry, { ps, cmd })
  assert.strictEqual(u.ok, false)
  assert.strictEqual(u.conflicts.length, 1)
  assert.ok(dump().includes('0x3'))
  const forced = await undoEntry(entry, { ps, cmd, force: true })
  assert.strictEqual(forced.ok, true)
  assert.ok(dump().includes('0x1'))
  cleanup()
})

test('reg.exe changes round-trip through cmd-parse descriptors', winOnly, async () => {
  cleanup()
  await cmd(`reg add "${KEY}" /v Keep /t REG_DWORD /d 4 /f`)
  const cp = require('../lib/cmd-parse')
  const line = `reg add "${KEY}" /v Keep /t REG_DWORD /d 9 /f`
  const [d] = cp.parseCmd(line)
  const b = cp.parseReadBack(d, (await cmd(cp.readBackCmd(d))).out)
  await cmd(line)
  const a = cp.parseReadBack(d, (await cmd(cp.readBackCmd(d))).out)
  assert.deepStrictEqual([b.value, a.value], ['4', '9'])
  const entry = buildEntry({ changes: [{ kind: 'reg', via: 'cmd', key: KEY, name: 'Keep', before: b, after: a }] })
  assert.strictEqual((await undoEntry(entry, { ps, cmd })).ok, true)
  assert.strictEqual(cp.parseReadBack(d, (await cmd(cp.readBackCmd(d))).out).value, '4')
  cleanup()
})
