'use strict'
// BIOS workstation "Instruments" deck tab: live readings from the telemetry hub and a RAM stress run whose result is kept as a
// measurement, so a BIOS change can be judged by numbers (passes/s, errors, temperature) instead of feel. Logic: lib/bios/instruments.js.
// Nothing here changes the PC. Runs are stored in this browser profile only (localStorage), newest first.
;(function (root) {
  const { html } = root.ui
  const T = (k, v) => root.tG('bios', k, v)
  const I = root.JylliBiosInstruments
  const KEY = 'jt_bios_proof'
  const S = { runs: null, secs: 30, label: '', busy: false, snap: null, error: null }
  let cur = null, unsub = null, subscribed = false

  const load = () => { if (S.runs) return; try { S.runs = I.parseStored(localStorage.getItem(KEY)) } catch { S.runs = [] } }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S.runs)) } catch {} }

  function readingsHtml() {
    const list = I.readings(S.snap)
    if (!list.some(r => r.value != null)) return html`<p class="bw-muted bw-pad">${T('instr_noSensors')}</p>`
    return html`<div class="bw-readings">${list.map(r => html`<div class="bw-reading ${r.hot ? 'bw-hot' : ''}" ${r.value == null ? 'data-na' : ''}><span>${T('instr_' + r.key.replace(/\./g, '_'))}</span><strong class="bw-mono">${r.text || '—'}</strong></div>`)}</div>`
  }
  const verdictText = c => T('instr_v_' + c.verdict, { pct: (c.pct > 0 ? '+' : '') + c.pct })

  function runsHtml() {
    if (!S.runs.length) return html`<p class="bw-muted bw-pad">${T('instr_noRuns')}</p>`
    return html`<ul class="bw-changes bw-runs">${S.runs.map((r, i) => { const c = I.compare(S.runs[i + 1], r); return html`<li><span>${new Date(r.ts).toLocaleString()}${r.label ? ' · ' + r.label : ''}</span><span class="bw-mono">${T('instr_runLine', { rate: r.rate, secs: r.secs, errors: r.errors })}${r.cpuTemp != null ? ' · ' + r.cpuTemp + ' °C' : ''}</span>${c ? html`<span class="j-badge j-badge-${c.verdict === 'errors' ? 'danger' : c.verdict === 'slower' ? 'warn' : 'neutral'}">${verdictText(c)}</span>` : html`<span></span>`}</li>` })}</ul>`
  }

  function paint() {
    if (!cur || !cur.isConnected) return
    cur.innerHTML = String(html`
      <div id="bi-readings">${readingsHtml()}</div>
      <div class="bw-instr-bar">
        <label>${T('instr_label')}<input id="bi-label" class="bw-input" maxlength="60" placeholder="${T('instr_labelHint')}" value="${S.label}"></label>
        <label>${T('instr_duration')}<select id="bi-secs" class="bw-input">${I.DURATIONS.map(d => html`<option value="${d}" ${d === S.secs ? 'selected' : ''}>${d} s</option>`)}</select></label>
        <button type="button" class="j-btn j-btn-primary j-btn-sm" id="bi-run" ${S.busy ? 'disabled' : ''}><i class="fa ${S.busy ? 'fa-spinner fa-spin' : 'fa-memory'}" aria-hidden="true"></i> ${S.busy ? T('instr_running', { secs: S.secs }) : T('instr_run')}</button>
        ${S.runs.length ? html`<button type="button" class="j-btn j-btn-ghost j-btn-sm" id="bi-clear" ${S.busy ? 'disabled' : ''}>${T('instr_clear')}</button>` : ''}
      </div>
      <p class="bw-muted bw-pad bw-instr-note">${T('instr_note')}</p>
      ${S.error ? html`<p class="bw-pad bw-instr-err">${T('instr_failed')}</p>` : ''}
      ${runsHtml()}`)
    cur.querySelector('#bi-label').addEventListener('input', e => { S.label = e.target.value })
    cur.querySelector('#bi-secs').addEventListener('change', e => { S.secs = Number(e.target.value) || 30 })
    cur.querySelector('#bi-run').addEventListener('click', run)
    const clr = cur.querySelector('#bi-clear'); if (clr) clr.addEventListener('click', () => { S.runs = []; save(); paint() })
  }

  function paintReadings() {
    if (!cur || !cur.isConnected) return
    const box = cur.querySelector('#bi-readings'); if (box) box.innerHTML = String(readingsHtml())
  }

  async function run() {
    if (S.busy) return
    S.busy = true; S.error = null; paint()
    const secs = S.secs
    let r = null
    try { r = await root.api.biosRamStress(secs) } catch { r = null }
    if (r && r.reason === 'premium_required') { S.busy = false; paint(); if (root.JylliPremium) root.JylliPremium.open(); return }
    const run = I.makeRun({ ram: r, secs, label: S.label, now: Date.now(), list: I.readings(S.snap) })
    S.busy = false
    if (run) { S.runs = I.addRun(S.runs, run); save(); S.error = null; if (run.errors > 0) root.toast(T('instr_errTitle'), T('instr_errBody', { n: run.errors }), 'error') }
    else S.error = true
    paint()
  }

  async function start() {
    if (subscribed) return
    subscribed = true
    try {
      if (root.api.onTwinTelemetry) unsub = root.api.onTwinTelemetry(d => { S.snap = d; paintReadings() })
      const r = await root.api.telemetrySubscribe(); if (r && r.snapshot) { S.snap = r.snapshot; paintReadings() }
    } catch { /* no telemetry: the tab says so */ }
  }
  function stop() {
    if (!subscribed) return
    subscribed = false
    if (unsub) { try { unsub() } catch {} unsub = null }
    try { root.api.telemetryUnsubscribe() } catch {}
  }

  // container = the deck body element; calling again re-paints in place (state lives here, so a staging redraw loses nothing)
  function render(container) { load(); cur = container; paint(); start() }
  root.JylliBiosInstrumentsUI = { render, stop }
})(typeof window !== 'undefined' ? window : globalThis)
