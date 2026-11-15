// Game Shield: which background processes may be stopped when a game starts, and when. Pure logic only (no I/O) so it is unit-tested;
// main.js does the process listing, stopping and relaunching.
//
//  tier 1   stopped at game launch (sync/chat clients that do nothing for the game)
//  tier 3   stopped at launch only when RAM use is at or above the tier-3 threshold (Discord, Spotify, Steam web helper)
//  browsers stopped mid-session when RAM use reaches the mid-session threshold
// steam.exe itself is never listed: games started through Steam need it.

const TIER1 = ['onedrive', 'teams', 'ms-teams', 'skype', 'dropbox', 'googledrivefs', 'yourphone', 'phoneexperiencehost']
const TIER3 = ['discord', 'spotify', 'steamwebhelper']
const BROWSERS = ['chrome', 'msedge', 'firefox', 'brave', 'opera', 'vivaldi']

const EXE_RE = /^[a-z0-9 _.\-()+]{1,64}\.exe$/
const MAX_EXCLUSIONS = 50

/** User-supplied "always keep alive" list -> unique, lower-case "name.exe" entries; anything malformed is dropped. */
function normalizeExclusions(list) {
  if (!Array.isArray(list)) return []
  const out = []
  for (const raw of list) {
    if (typeof raw !== 'string') continue
    let v = raw.trim().toLowerCase()
    if (!v) continue
    if (!v.endsWith('.exe')) v += '.exe'
    if (EXE_RE.test(v) && !out.includes(v)) out.push(v)
    if (out.length >= MAX_EXCLUSIONS) break
  }
  return out
}

/** Thresholds are RAM percentages (50-95); mid-session must stay at least 5 points above tier 3, as the sliders enforce. */
function clampThresholds(tier3, mid) {
  const num = (v, d) => Number.isFinite(Number(v)) ? Number(v) : d
  const t3 = Math.min(90, Math.max(50, Math.round(num(tier3, 70))))
  const m = Math.min(95, Math.max(t3 + 5, Math.round(num(mid, 80))))
  return { tier3: t3, mid: m }
}

const keep = (names, exclusions) => names.filter(n => !exclusions.includes(n + '.exe'))

/** Process names (no .exe) to stop at launch. */
function launchKillList({ ramPct, tier3Threshold, exclusions = [] }) {
  const { tier3 } = clampThresholds(tier3Threshold, 80)
  const names = [...TIER1]
  if (ramPct >= tier3) names.push(...TIER3)
  return keep(names, exclusions)
}

/** Process names (no .exe) to stop during the session; never repeats something already stopped. */
function midSessionKillList({ ramPct, tier3Threshold, midThreshold, exclusions = [], alreadyStopped = [] }) {
  const { mid } = clampThresholds(tier3Threshold, midThreshold)
  if (ramPct < mid) return []
  return keep([...TIER3, ...BROWSERS], exclusions).filter(n => !alreadyStopped.includes(n))
}

/** Only relaunch an absolute path to an .exe that Get-Process reported (never a renderer-supplied value). */
function isRelaunchable(p) {
  return typeof p === 'string' && /^[A-Za-z]:\\[^<>"|?*\r\n]+\.exe$/i.test(p) && !p.includes('..')
}

/** One "always keep alive" entry typed by the user: { ok, value } or { ok:false, reason: empty | format | duplicate | limit }. */
function validateExclusion(raw, list = []) {
  let v = String(raw == null ? '' : raw).trim().toLowerCase()
  if (!v) return { ok: false, reason: 'empty' }
  if (!v.endsWith('.exe')) v += '.exe'
  if (!EXE_RE.test(v)) return { ok: false, reason: 'format' }
  if (list.includes(v)) return { ok: false, reason: 'duplicate' }
  if (list.length >= MAX_EXCLUSIONS) return { ok: false, reason: 'limit' }
  return { ok: true, value: v }
}

/** When Game Shield would close this program: 'launch' | 'tier3' | 'mid' | null (it never touches it, so keeping it alive changes nothing). */
function coverage(exe) {
  const n = String(exe || '').trim().toLowerCase().replace(/\.exe$/, '')
  if (TIER1.includes(n)) return 'launch'
  if (TIER3.includes(n)) return 'tier3'
  if (BROWSERS.includes(n)) return 'mid'
  return null
}

/** What happened to one stopped program when Game Shield tried to start it again. */
function restoreVerdict({ path, alreadyRunning, exists, started }) {
  if (alreadyRunning) return 'already-running'
  if (!isRelaunchable(path)) return 'no-path'
  if (!exists) return 'missing'
  return started ? 'restarted' : 'start-failed'
}

const GS_LIMITS = { tier3: { min: 50, max: 90 }, mid: { min: 55, max: 95 }, gap: 5 }

module.exports = { TIER1, TIER3, BROWSERS, GS_LIMITS, MAX_EXCLUSIONS, normalizeExclusions, validateExclusion, coverage, restoreVerdict, clampThresholds, launchKillList, midSessionKillList, isRelaunchable }
