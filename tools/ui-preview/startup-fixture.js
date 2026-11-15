// Startup tab "Ignition" answers for the browser preview: the REAL lib/startup service on a synthetic PC (launchers, chat, cloud sync, drivers, a broken entry, a Store app, a logon task).
// State comes from ?su=full|first|legacy|lean|noadmin|noboot|done|fail on /app (serve.js passes it as ctx.su). The fake PC keeps its Run values, StartupApproved bytes, tasks and
// delay tasks in memory, so switching off / delaying / undoing really round-trips through probe -> run -> read back like on a real machine.
const zlib = require('zlib')
const Startup = require('../../lib/startup')
const catalog = require('../../lib/startup/catalog')

const D = 86400000
const run = (src, name, cmd, o = {}) => ({ src, name, cmd, exe: o.exe === undefined ? (/^"([^"]+)"/.exec(cmd) || [, cmd.split(' ')[0]])[1] : o.exe, args: o.args || '', exists: o.exists === undefined ? true : o.exists, co: o.co || '', de: o.de || '', on: o.on !== false, offAt: o.offAt || null })

function pcFor(state) {
  const now = Date.now()
  const items = [
    run('run-hkcu', 'Discord', '"C:\\Users\\Preview\\AppData\\Local\\Discord\\Discord.exe" --processStart Discord.exe', { co: 'Discord Inc.', de: 'Discord' }),
    run('run-hkcu', 'Steam', '"C:\\Program Files (x86)\\Steam\\steam.exe" -silent', { co: 'Valve Corporation', de: 'Steam Client Bootstrapper' }),
    run('run-hkcu', 'Spotify', '"C:\\Users\\Preview\\AppData\\Roaming\\Spotify\\Spotify.exe" --autostart --minimized', { co: 'Spotify Ltd', de: 'Spotify' }),
    run('run-hkcu', 'OneDrive', '"C:\\Users\\Preview\\AppData\\Local\\Microsoft\\OneDrive\\OneDrive.exe" /background', { co: 'Microsoft Corporation', de: 'Microsoft OneDrive' }),
    run('run-hkcu', 'Medal', '"C:\\Users\\Preview\\AppData\\Local\\Medal\\Medal.exe" --silent', { co: 'Medal B.V.', de: 'Medal' }),
    run('run-hkcu', 'LGHUB', '"C:\\Program Files\\LGHUB\\system_tray\\lghub_system_tray.exe" --minimized', { co: 'Logitech, Inc.', de: 'G HUB' }),
    run('run-hkcu', 'Free Download Manager', '"C:\\Program Files\\Softdeluxe\\Free Download Manager\\fdm.exe" --hidden', { co: 'Softdeluxe', on: false, offAt: now - 21 * D }),
    run('run-hkcu', 'EpicGamesLauncher', '"C:\\Program Files\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe" -silent', { co: 'Epic Games, Inc.', on: false, offAt: now - 15 * D }),
    run('run-hkcu', 'RiotClient', 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe --launch-background-mode', { exists: false, on: state === 'lean' ? false : true, offAt: state === 'lean' ? now - 14 * D : null }),
    run('run-hkcu', 'RobloxPlayerBeta', '"C:\\Users\\Preview\\AppData\\Local\\Roblox\\Versions\\v1\\RobloxPlayerBeta.exe" --launch-to-tray', { co: 'Roblox Corporation', on: false, offAt: now - 1 * D }),
    run('run-hklm', 'RtkAudUService', '"C:\\Windows\\System32\\DriverStore\\FileRepository\\realtekservice\\RtkAudUService64.exe" -background', { co: 'Realtek Semiconductor', de: 'Realtek HD Audio Background Process' }),
    run('run-hklm', 'SecurityHealth', '"C:\\Windows\\System32\\SecurityHealthSystray.exe"', { co: 'Microsoft Corporation', de: 'Windows Security notification icon' }),
    run('run-hklm', 'AdobeAAMUpdater', '"C:\\Program Files (x86)\\Common Files\\Adobe\\OOBE\\PDApp\\UWA\\UpdaterStartupUtility.exe"', { co: 'Adobe Inc.', de: 'Adobe Updater Startup Utility' }),
    run('folder-user', 'Voicemeeter (VB-Audio).LNK', '"C:\\Program Files (x86)\\VB\\Voicemeeter\\voicemeeterpro.exe"', { co: 'VB-AUDIO Software', de: 'VoiceMeeter' }),
  ]
  const tasks = [{ path: '\\', name: 'MicrosoftEdgeUpdateTaskUserS-1-5-21-111-222-333-1001Core{2CFC7DE1-7B41-4D79-939E-A49AA5BAB845}', cmd: '"C:\\Users\\Preview\\AppData\\Local\\Microsoft\\EdgeUpdate\\MicrosoftEdgeUpdate.exe" /ua /installsource scheduler', exe: 'C:\\Users\\Preview\\AppData\\Local\\Microsoft\\EdgeUpdate\\MicrosoftEdgeUpdate.exe', co: 'Microsoft Corporation', on: true },
    { path: '\\', name: 'Overwolf Updater', cmd: '"C:\\Program Files (x86)\\Overwolf\\OverwolfUpdater.exe"', exe: 'C:\\Program Files (x86)\\Overwolf\\OverwolfUpdater.exe', co: 'Overwolf Ltd', on: true }]
  const appx = [{ pkg: 'Claude_pzs8sxrjxfjjc', task: 'ClaudeStartup', state: 0 }, { pkg: 'Microsoft.GamingApp_8wekyb3d8bbwe', task: 'Xbox.App.Tasks.FullTrustComponent', state: 0 }, { pkg: 'Microsoft.YourPhone_8wekyb3d8bbwe', task: 'YourPhone', state: 2 }]
  const procs = { discord: { n: 3, mb: 330 }, steam: { n: 1, mb: 336 }, spotify: { n: 3, mb: 280 }, onedrive: { n: 1, mb: 190 }, medal: { n: 2, mb: 410 }, lghub_system_tray: { n: 1, mb: 65 }, rtkauduservice64: { n: 1, mb: 12 }, securityhealthsystray: { n: 1, mb: 9 }, voicemeeterpro: { n: 1, mb: 51 }, microsoftedgeupdate: { n: 0, mb: 0 } }
  const pc = { admin: state !== 'noadmin', items, tasks, appx, delays: [], legacyDisabled: [], legacyTasks: [], sw: { 'restart-apps': null }, procs, files: { 'C:\\Users\\Preview\\AppData\\Local\\Discord\\Discord.exe': 1 } }
  if (state === 'lean') {
    for (const i of items) if (['Spotify', 'OneDrive', 'Medal', 'Discord', 'Steam'].includes(i.name)) { i.on = false; i.offAt = now - 9 * D }
    for (const t of tasks) if (t.name === 'Overwolf Updater') t.on = false
    delete procs.spotify; delete procs.onedrive; delete procs.medal; delete procs.discord; delete procs.steam
  }
  if (state === 'legacy') {
    pc.legacyDisabled = [{ src: 'run-hkcu', name: 'Teams', cmd: '"C:\\Users\\Preview\\AppData\\Local\\Microsoft\\Teams\\Update.exe" --processStart "Teams.exe"' }]
    pc.legacyTasks = [{ path: '\\', name: 'JylliDelay_Dropbox', exe: 'C:\\Program Files\\Dropbox\\Client\\Dropbox.exe', args: '/home', state: 'Ready' }]
  }
  return pc
}

const BOOT_FIELDS = (ms, main, post, apps) => ({ BootTime: String(ms), MainPathBootTime: String(main), BootPostBootTime: String(post), BootNumStartupApps: String(apps) })
function bootFor(state) {
  if (state === 'noboot') return { status: 'none', boots: [], slow: [], lastBoot: Date.now() - 3 * 3600000 }
  if (state === 'noadmin') return { status: 'denied', boots: [], slow: [], lastBoot: Date.now() - 3 * 3600000 }
  const now = Date.now(), at = i => new Date(now - (i + 1) * D + 3 * 3600000).toISOString()
  const times = [43000, 47500, 52000, 51000, 54500, 50000, 55000, 49500]
  const boots = times.map((t, i) => ({ at: at(i), d: BOOT_FIELDS(t, Math.round(t * 0.72), Math.round(t * 0.28), 13) }))
  const slow = []
  for (let i = 0; i < 4; i++) slow.push({ at: at(i), d: { Name: 'Spotify.exe', Path: 'C:\\Users\\Preview\\AppData\\Roaming\\Spotify\\Spotify.exe', DegradationTime: String(3800 + i * 200) } })
  for (let i = 0; i < 3; i++) slow.push({ at: at(i), d: { Name: 'Medal.exe', Path: 'C:\\Users\\Preview\\AppData\\Local\\Medal\\Medal.exe', DegradationTime: String(1500 + i * 100) } })
  for (let i = 0; i < 2; i++) slow.push({ at: at(i), d: { Name: 'Discord.exe', Path: 'C:\\Users\\Preview\\AppData\\Local\\Discord\\Discord.exe', DegradationTime: String(1100 + i * 80) } })
  slow.push({ at: at(1), d: { Name: 'OneDrive.exe', DegradationTime: '700' } })
  return { status: 'ok', boots, slow, lastBoot: now - 3 * 3600000 }
}

/** A small, valid PNG of one colour with a lighter rounded square, so icons have something to show without any real file. */
function pngFor(seed) {
  const W = 32, H = 32, raw = Buffer.alloc((W * 4 + 1) * H)
  const hue = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7)
  const hsl = (h, s, l) => { s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return [f(0), f(8), f(4)].map(x => Math.round(x * 255)) }
  const c1 = hsl(hue, 62, 52), c2 = hsl(hue, 45, 80)
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0
    for (let x = 0; x < W; x++) {
      const o = y * (W * 4 + 1) + 1 + x * 4, dx = Math.abs(x - 15.5), dy = Math.abs(y - 15.5)
      const inBox = dx < 14 && dy < 14 && !(dx > 11 && dy > 11), inner = dx < 6 && dy < 6
      const c = inner ? c2 : c1
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; raw[o + 3] = inBox ? 255 : 0
    }
  }
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0 }
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64')
}

const unq = s => String(s).replace(/''/g, "'")
const cache = new Map()
function rig(state, premium) {
  const key = state + '|' + premium
  if (cache.has(key)) return cache.get(key)
  const pc = pcFor(state)
  const boot = bootFor(state)
  const bytesOf = e => (e.on ? catalog.ON_BYTES : catalog.offBytes(e.offAt || Date.now()))
  const find = (src, name) => pc.items.find(i => i.src === src && i.name.toLowerCase() === String(name).toLowerCase())
  const apSrcOf = approved => Object.keys(catalog.SOURCES).find(k => catalog.SOURCES[k].approved === approved && (k === 'run-hkcu' || k === 'run-hklm' || k === 'folder-user' || k === 'folder-all'))
  const ds = { delay: new Map() }
  let st = null
  const exec = line => {
    let m
    if ((m = /Set-ItemProperty -Path '((?:[^']|'')+)' -Name '((?:[^']|'')+)' -Value \(\[byte\[\]\]\(([\d,]+)\)\)/.exec(line))) {
      const approved = unq(m[1]), name = unq(m[2]), b = m[3].split(',').map(Number)
      const srcs = Object.keys(catalog.SOURCES).filter(k => catalog.SOURCES[k].approved === approved)
      const e = srcs.map(s => find(s, name)).find(Boolean)
      if (e) { e.on = catalog.bytesOn(b); e.offAt = catalog.offSince(b) }
      return true
    }
    if ((m = /^(Enable|Disable)-ScheduledTask -TaskPath '((?:[^']|'')+)' -TaskName '((?:[^']|'')+)'/.exec(line))) { const t = pc.tasks.find(x => x.name === unq(m[3])); if (t) t.on = m[1] === 'Enable'; return true }
    if ((m = /Set-ItemProperty -Path '[^']+' -Name 'RestartApps' -Value (\d) -Type DWord/.exec(line))) { pc.sw['restart-apps'] = Number(m[1]); return true }
    if (/Remove-ItemProperty -Path '[^']+' -Name 'RestartApps'/.test(line)) { pc.sw['restart-apps'] = null; return true }
    if ((m = /\$from = '[^']+'; \$to = '[^']+'; \$n = '((?:[^']|'')+)'/.exec(line))) { const n = unq(m[1]); const i = pc.legacyDisabled.findIndex(x => x.name === n); if (i >= 0) { const d = pc.legacyDisabled.splice(i, 1)[0]; pc.items.push(run(d.src, d.name, d.cmd, { on: false, offAt: Date.now(), co: 'Microsoft Corporation' })) } return true }
    if ((m = /New-ItemProperty -Path '[^']+Run' -Name '((?:[^']|'')+)' -Value '((?:[^']|'')*)' -PropertyType String/.exec(line))) { pc.items.push(run('run-hkcu', unq(m[1]), unq(m[2]), { co: 'Dropbox, Inc.' })); return true }
    if ((m = /Unregister-ScheduledTask -TaskPath '[^']*' -TaskName '(JylliDelay_[^']+)'/.exec(line))) { pc.legacyTasks = pc.legacyTasks.filter(t => t.name !== unq(m[1])); return true }
    return true
  }
  const rec = { ps: async l => { exec(l); return { ok: true, out: '' } }, cmd: async () => ({ ok: true, out: '' }), note: () => {} }
  const deps = {
    runPS: async s => {
      if (state === 'fail') return { ok: false, out: '' }
      if (s.includes("'" + 'JJSTART:' + "'")) {
        const items = pc.items.map(i => ({ src: i.src, name: i.name, cmd: i.cmd, exe: i.exe, args: i.args, exists: i.exists, co: i.co, de: i.de, ap: bytesOf(i), file: i.src.startsWith('folder') ? 'C:\\Users\\Preview\\Startup\\' + i.name : undefined }))
        for (const t of pc.tasks) items.push({ src: 'task', name: t.name, path: t.path, cmd: t.cmd, exe: t.exe, args: '', exists: true, co: t.co, de: '', state: t.on ? 'Ready' : 'Disabled', boot: false })
        return { ok: true, out: 'JJSTART:' + JSON.stringify({ admin: pc.admin, items, appx: pc.appx, delay: [...ds.delay.values()].map(d => ({ name: d.name, state: 'Ready', exe: d.exe, args: d.args })), legacyTasks: pc.legacyTasks, legacyDisabled: pc.legacyDisabled, sw: pc.sw, procs: pc.procs }) }
      }
      if (s.includes("'" + 'JJLIVE:' + "'")) { const j = () => 0.9 + Math.random() * 0.2; const p = {}; for (const [k, v] of Object.entries(pc.procs)) p[k] = { n: v.n, mb: Math.round(v.mb * j()) }; return { ok: true, out: 'JJLIVE:' + JSON.stringify({ procs: p }) } }
      if (s.includes("'" + 'JJBOOT:' + "'")) return { ok: true, out: 'JJBOOT:' + JSON.stringify({ status: boot.status, boots: boot.boots, slow: boot.slow, lastBoot: new Date(boot.lastBoot).toISOString() }) }
      if (s.includes("'" + 'JJICON:' + "'")) {
        const paths = JSON.parse(/ConvertFrom-Json '((?:[^']|'')*)'/.exec(s)[1].replace(/''/g, "'")).paths
        const icons = {}; for (const p of paths) if (!/Medal|Overwolf/i.test(p)) icons[p] = pngFor(p)
        return { ok: true, out: 'JJICON:' + JSON.stringify({ icons }) }
      }
      let m
      if (s.includes('Register-ScheduledTask')) {
        const name = /-TaskName '((?:[^']|'')+)' -Action/.exec(s)[1], exe = unq(/New-ScheduledTaskAction -Execute '((?:[^']|'')+)'/.exec(s)[1])
        const args = (m = /-Argument '((?:[^']|'')*)'/.exec(s)) ? unq(m[1]) : ''
        ds.delay.set(unq(name), { name: unq(name), exe, args, sec: Number(/PT(\d+)S/.exec(s)[1]) })
        return { ok: true, out: 'JJOK' }
      }
      if ((m = /Unregister-ScheduledTask -TaskPath '[^']*' -TaskName '((?:[^']|'')+)'/.exec(s)) && s.includes("\\JylliTool\\")) { ds.delay.delete(unq(m[1])); return { ok: true, out: 'JJOK' } }
      if (s.includes('JJSTATE')) { const nm = /-TaskName '((?:[^']|'')+)'/.exec(s); return { ok: true, out: ds.delay.has(unq(nm[1])) ? 'JJSTATE{"e":true,"v":"present"}' : 'JJSTATE{"e":false}' } }
      return { ok: true, out: '' }
    },
    runRecorded: async (control, action, meta, fn) => fn(rec.ps, rec.cmd, rec.note),
    isPremium: () => premium, isLaptop: () => false,
    state: { read: () => st, write: v => { st = JSON.parse(JSON.stringify(v)) } },
    emit: () => {},
  }
  const svc = Startup.create(deps)
  const out = { svc, pc, ds, ready: null, get: () => st, set: v => { st = v } }
  cache.set(key, out)
  return out
}

/** A returning user: one program appeared since the last look, Discord was switched off here and turned itself back on, a boot was on file before a change. */
async function seed(R, state) {
  if (!(state === 'full' || state === 'done' || state === 'noboot')) return
  await R.svc.scan()
  const st = R.get(), D2 = 2 * D
  st.seen = st.seen.filter(id => id !== catalog.idOf('run-hkcu', 'Medal'))
  st.fresh = {}; st.newLog = []
  st.offByUs = { [catalog.idOf('run-hkcu', 'Discord')]: Date.now() - D2 }; st.applied = { [catalog.idOf('run-hkcu', 'Discord')]: Date.now() - D2 }
  st.baseline = state === 'done' ? { at: Date.now() - D2, bootMs: 54000, mainMs: 39000, n: 3 } : null
  R.set(st)
}

async function respond(name, args, ctx) {
  const state = ctx.su || 'full'
  const R = rig(state, !!ctx.premium)
  const { svc } = R
  if (!R.ready) R.ready = seed(R, state)
  await R.ready
  const a = (args && args[0]) || {}
  try {
    switch (name) {
      case 'startup2Scan': if (state === 'fail') return { ok: false, error: 'scan failed' }; return await svc.scan(a)
      case 'startup2Live': if (state === 'fail') return { ok: false }; return await svc.live()
      case 'startup2Icons': return await svc.icons()
      case 'startup2State': return svc.state()
      case 'startup2Run': return await svc.run(a)
      case 'startup2Tune': return await svc.tuneRecommended()
      case 'startup2UndoRun': return await svc.undoRun(a)
      case 'startup2History': return svc.history()
      case 'startup2Ack': return svc.ack(a)
      case 'startup2Keep': return await svc.keepSet(a)
      case 'startup2Switch': return await svc.switchSet(a)
      case 'startup2Migrate': return await svc.migrate()
      case 'startup2Reveal': return { ok: true }
      case 'startup2OpenSettings': return { ok: true }
      case 'getStartupItems': return []
      default: return undefined
    }
  } catch (e) { return { ok: false, error: String((e && e.message) || e) } }
}

module.exports = { respond, rig }
