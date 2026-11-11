'use strict'
// The only list of client changes the FiveM tab may make (docs/FIVEM_EVIDENCE.md says why each is in). get(id) looks the id up
// by own property, so an unknown id can never run anything. Every apply goes through the change journal (rec.ps / rec.cmd record
// the exact before and after values; rec.note records the Defender exclusion, which has its own undo handler below).
const IFEO = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options'
const LAYERS = 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers'
const FSO_FLAG = 'DISABLEDXMAXIMIZEDWINDOWEDMODE'

const q = s => "'" + String(s).replace(/'/g, "''") + "'"
const base = p => String(p).replace(/^.*[\\/]/, '')
const safeExe = n => /^[\w.\- ]{1,80}\.exe$/i.test(n)

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k)

/** ctx: { exes: [full path], appDir }. Names come from the folder listing, never from the renderer. */
const TWEAKS = {
  priority: {
    admin: true, restart: false, risk: 'safe',
    async apply(ctx, rec) {
      for (const e of ctx.exes.map(base).filter(safeExe)) {
        const r = await rec.cmd(`reg add "${IFEO}\\${e}\\PerfOptions" /v CpuPriorityClass /t REG_DWORD /d 3 /f`, 8000)
        if (r && r.ok === false) return { ok: false, error: 'reg-failed' }
      }
      return { ok: true }
    },
  },
  'io-priority': {
    admin: true, restart: false, risk: 'safe',
    async apply(ctx, rec) {
      for (const e of ctx.exes.map(base).filter(safeExe)) {
        const r = await rec.cmd(`reg add "${IFEO}\\${e}\\PerfOptions" /v IoPriority /t REG_DWORD /d 3 /f`, 8000)
        if (r && r.ok === false) return { ok: false, error: 'reg-failed' }
      }
      return { ok: true }
    },
  },
  fso: {
    admin: false, restart: false, risk: 'safe',
    async apply(ctx, rec) {
      const names = ctx.exes.filter(p => safeExe(base(p)))
      if (!names.length) return { ok: false, error: 'no-exe' }
      const script = [
        `$k=${q(LAYERS)}`,
        'if(-not (Test-Path $k)){New-Item -Path $k -Force|Out-Null}',
        `foreach($p in @(${names.map(q).join(',')})){`,
        '  $cur=(Get-ItemProperty -Path $k -Name $p -ErrorAction SilentlyContinue).$p',
        `  if($cur -notmatch '${FSO_FLAG}'){ $v=if($cur){$cur+' ${FSO_FLAG}'}else{'~ ${FSO_FLAG}'}; Set-ItemProperty -Path $k -Name $p -Value $v -Type String }`,
        '}',
      ].join('\n')
      const r = await rec.ps(script, 10000)
      return r && r.ok === false ? { ok: false, error: 'ps-failed' } : { ok: true }
    },
  },
  gamebar: {
    admin: false, restart: false, risk: 'safe',
    async apply(ctx, rec) {
      const a = await rec.cmd('reg add "HKCU\\System\\GameConfigStore" /v GameDVR_Enabled /t REG_DWORD /d 0 /f', 6000)
      const b = await rec.cmd('reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR" /v AppCaptureEnabled /t REG_DWORD /d 0 /f', 6000)
      return (a && a.ok === false) || (b && b.ok === false) ? { ok: false, error: 'reg-failed' } : { ok: true }
    },
  },
  defender: {
    admin: true, restart: false, risk: 'confirm',
    async apply(ctx, rec, deps) {
      const dir = ctx.appDir
      if (!dir || /[\r\n"]/.test(dir)) return { ok: false, error: 'bad-path' }
      const had = await defenderHas(deps.runPS, dir)
      if (had === true) return { ok: true }
      await deps.runPS(`Add-MpPreference -ExclusionPath ${q(dir)}`, 15000)
      if (!(await defenderHas(deps.runPS, dir))) return { ok: false, error: 'defender-refused' }   // third-party AV, tamper protection, policy
      rec.note({ kind: 'fivem-defender', path: dir, before: { exists: true, value: false }, after: { exists: true, value: true } })
      return { ok: true }
    },
  },
}
const IDS = Object.keys(TWEAKS)
const get = id => (typeof id === 'string' && has(TWEAKS, id) ? TWEAKS[id] : null)
const meta = id => { const t = get(id); return t ? { id, admin: t.admin, restart: t.restart, risk: t.risk } : null }

async function defenderHas(runPS, dir) {
  const r = await runPS(`$p=(Get-MpPreference -ErrorAction SilentlyContinue).ExclusionPath; if($p -and ($p -contains ${q(dir)})){'JJDEF:1'}else{'JJDEF:0'}`, 12000)
  const m = r && String(r.out || '').match(/JJDEF:([01])/)
  return m ? m[1] === '1' : null
}

/** Journal undo handlers for the two changes the registry recorder cannot see: the Defender exclusion and a patched file.
 *  A file change is compared by content hash, so a same-length edit ("0" to "1") is still a recorded change. */
function handlers(deps) {
  const sha = f => require('crypto').createHash('sha1').update(deps.fs.readFileSync(f)).digest('hex')
  return {
    'fivem-file': {
      read: async c => { try { return { exists: true, value: sha(c.file) } } catch { return { exists: false } } },
      restore: async c => { try { deps.fs.copyFileSync(c.backup, c.file); return true } catch { return false } },
    },
    'fivem-defender': {
      read: async c => { const v = await defenderHas(deps.runPS, c.path); return v == null ? { unknown: true } : { exists: true, value: v } },
      restore: async c => { await deps.runPS(`Remove-MpPreference -ExclusionPath ${q(c.path)}`, 15000); return (await defenderHas(deps.runPS, c.path)) === false },
    },
  }
}

/** One read-only script for "is this applied": priority and io need every real exe set, fso every exe flagged. */
function probeScript(ctx) {
  const names = ctx.exes.map(base).filter(safeExe)
  const paths = ctx.exes.filter(p => safeExe(base(p)))
  return [
    "$ErrorActionPreference='SilentlyContinue'",
    '$o=[ordered]@{}',
    `$n=@(${names.map(q).join(',')})`,
    `$f=@(${paths.map(q).join(',')})`,
    `$ifeo='Registry::${IFEO.replace('HKLM', 'HKEY_LOCAL_MACHINE')}'`,
    "$o.priority=($n.Count -gt 0) -and -not ($n|Where-Object{ (Get-ItemProperty -Path (Join-Path $ifeo ($_+'\\PerfOptions')) -Name CpuPriorityClass).CpuPriorityClass -ne 3 })",
    "$o.io=($n.Count -gt 0) -and -not ($n|Where-Object{ (Get-ItemProperty -Path (Join-Path $ifeo ($_+'\\PerfOptions')) -Name IoPriority).IoPriority -ne 3 })",
    `$k=${q(LAYERS)}`,
    `$o.fso=($f.Count -gt 0) -and -not ($f|Where-Object{ ((Get-ItemProperty -Path $k -Name $_).$_) -notmatch '${FSO_FLAG}' })`,
    "$o.gamebar=((Get-ItemProperty 'HKCU:\\System\\GameConfigStore').GameDVR_Enabled -eq 0) -and ((Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR').AppCaptureEnabled -eq 0)",
    ctx.appDir ? `$d=(Get-MpPreference).ExclusionPath; $o.defender=[bool]($d -and ($d -contains ${q(ctx.appDir)}))` : '$o.defender=$false',
    "'JJFV:'+($o|ConvertTo-Json -Compress)",
  ].join('\n')
}
function parseProbe(out) {
  const m = String(out || '').match(/JJFV:(\{.*\})/)
  if (!m) return null
  try { const o = JSON.parse(m[1]); const r = {}; for (const id of IDS) r[id] = o[id === 'io-priority' ? 'io' : id] === true; return r } catch { return null }
}

/** Old-tab tweaks that no longer exist. Restore only: the main process still holds their restore functions. */
const LEGACY = ['fivem-priority', 'fivem-io-priority', 'fivem-defender', 'fivem-hang-fix', 'fivem-gamebar', 'fivem-mouse-accel', 'fivem-power-plan',
  'fivem-network', 'fivem-mmcss', 'fivem-fso', 'fivem-gpu', 'fivem-vm', 'fivem-commandline', 'fivem-streaming-mem', 'fivem-worker-threads',
  'fivem-disable-crash-reporter', 'fivem-disable-anticheat-upload', 'fivem-disable-update-checks', 'fivem-preload-ipl', 'fivem-reduce-draw-distance']

module.exports = { TWEAKS, IDS, LEGACY, get, meta, handlers, probeScript, parseProbe }
