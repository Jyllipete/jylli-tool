'use strict'
// The only list of diagnoses the Crash lab may state from a CitizenFX log. Community-graded (docs/FIVEM_EVIDENCE.md: no
// official list of log messages exists), so each entry names a failure class from the text that was actually in the log and
// the advice never touches a setting the evidence does not support. Wording lives in LANG sig_<id> / sigf_<id>.
;(function (root) {
  const SIGNATURES = [
    { id: 'gpu-removed',  re: /DXGI_ERROR_DEVICE_(REMOVED|HUNG|RESET)|device (was )?(removed|hung)/i },
    { id: 'out-of-memory', re: /out of memory|not enough (virtual )?memory|insufficient memory/i },
    { id: 'dll-load',     re: /(failed|unable|could not|couldn't) to? ?load[^\n]{0,80}\.dll/i },
    { id: 'pack-file',    re: /can'?t open pack ?file|pack ?file[^\n]{0,40}(fail|corrupt|invalid)/i },
    { id: 'd3d-init',     re: /ERR_GFX_D3D_INIT|d3d(11)? (device )?(creation|init)[^\n]{0,30}fail/i },
    { id: 'conn-timeout', re: /(server )?connection (to the server )?timed out|connection (was )?lost|lost connection to the server/i },
    { id: 'crash',        re: /unhandled exception|access violation|exception_access_violation|minidump written|crash dump/i },
  ]
  const IDS = SIGNATURES.map(s => s.id)

  /** log text -> [{ i, text, sev }] for the last `max` non-empty lines. sev: error | warn | info (by the words in the line). */
  function parse(text, max = 400) {
    const lines = String(text || '').split(/\r?\n/)
    const out = []
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i]
      if (!t.trim()) continue
      out.push({ i, text: t.length > 400 ? t.slice(0, 400) : t, sev: /\b(error|fatal|exception|failed|crash)\b/i.test(t) ? 'error' : /\bwarn(ing)?\b/i.test(t) ? 'warn' : 'info' })
    }
    return out.slice(-max)
  }

  /** parsed lines -> [{ id, count, sample }] (sample = the last matching line, trimmed). */
  function scan(lines) {
    const out = []
    for (const s of SIGNATURES) {
      let count = 0, sample = null
      for (const l of lines) if (s.re.test(l.text)) { count++; sample = l.text }
      if (count) out.push({ id: s.id, count, sample: sample.trim().slice(0, 160) })
    }
    return out
  }

  const api = { SIGNATURES, IDS, parse, scan }
  root.JylliFivemSignatures = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
