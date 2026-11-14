'use strict'
// The only services Competitive Mode may pause for a session. Each is stopped only if it was running, and started again at the end.
// A service is listed only with an evidence note (docs/COMPETE_EVIDENCE.md); anything else stays out.
const SERVICES = [
  { name: 'WSearch', label: 'Windows Search', note: 'Indexer; paused for the session, never disabled. Start type is not touched.' },
]
const NAMES = new Set(SERVICES.map(s => s.name))
const validName = n => NAMES.has(String(n))

/** PowerShell: stop each listed service that is Running; prints "JJSVC:<name>" for every one it stopped. */
function pauseScript(names = SERVICES.map(s => s.name)) {
  const list = names.filter(validName).map(n => `'${n}'`).join(',')
  return `foreach($n in @(${list})){ $s=Get-Service -Name $n -ErrorAction SilentlyContinue; if($s -and $s.Status -eq 'Running'){ try{ Stop-Service -Name $n -Force -ErrorAction Stop; Write-Output ('JJSVC:'+$n) }catch{} } }`
}
/** PowerShell: start the services that were stopped by this session. */
function resumeScript(names) {
  const list = (names || []).filter(validName).map(n => `'${n}'`).join(',')
  if (!list) return ''
  return `foreach($n in @(${list})){ try{ Start-Service -Name $n -ErrorAction Stop; Write-Output ('JJSVC-UP:'+$n) }catch{} }`
}
const parsePaused = text => String(text || '').split(/\r?\n/).map(l => l.trim()).filter(l => l.startsWith('JJSVC:')).map(l => l.slice(6)).filter(validName)

module.exports = { SERVICES, validName, pauseScript, resumeScript, parsePaused }
