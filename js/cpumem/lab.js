'use strict'
// CPU & Memory tab, Lab view (Premium): a core plan for one game (previewed on the die map), a per-program CPU priority, the CPU/GPU bottleneck check,
// a quick RAM check and the memory timings. Everything here acts on one named program or runs one measurement; nothing is a background tweak.
// Engine side: lib/cpumem/index.js (pin, unpin, priority) + the existing latency-budget, bios-ram-stress and cpuz handlers.
;(function (root) {
  const api = { mount() { return null } }
  root.JylliCpuMemLab = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  api.mount = function (slot, ctx) {
    const { T, esc, S, P } = ctx
    const st = { exe: '', plan: null, remember: false, games: [], finding: false, busy: '', prio: { level: 'above', real: {}, unread: false }, bn: { on: false, tick: null }, ram: null, timings: null, timingsBusy: false, ramBusy: false }
    let disposed = false, bnUnsub = null

    const premiumPitch = () => `<section class="nt-card cm-lab-pitch"><i class="fa fa-crown" aria-hidden="true"></i><div><b>${esc(T('labPitchT'))}</b><p>${esc(T('labPitchS'))}</p><ul>${[1, 2, 3].map(n => `<li><i class="fa fa-check" aria-hidden="true"></i>${esc(T('labPitch' + n))}</li>`).join('')}</ul></div><button type="button" class="nt-cta" data-lab="premium"><i class="fa fa-crown" aria-hidden="true"></i>${esc(T('unlockLab'))}</button></section>`

    function planCard() {
      const plans = (S.facts && S.facts.plans) || []
      const rules = S.rules.rules || {}, pinned = S.rules.pinned || {}
      const exeKey = st.exe.trim().toLowerCase()
      const opts = st.games.map(g => `<option value="${esc(g)}"></option>`).join('')
      const list = plans.length ? plans.map(p => `<label class="cm-plan" data-on="${st.plan === p.kind ? '1' : '0'}"><input type="radio" name="cm-plan" value="${p.kind}" data-lab="plan"${st.plan === p.kind ? ' checked' : ''}><span class="cm-plan-ico"><i class="fa fa-${P.PLAN_ICON[p.kind] || 'microchip'}" aria-hidden="true"></i></span><span class="cm-plan-t"><b>${esc(T('plan_' + p.kind))}</b><span>${esc(T('planS_' + p.kind, { n: p.count, t: p.total }))}</span></span><em class="mono">${p.count}/${p.total}</em></label>`).join('')
        : `<p class="cm-lab-none"><i class="fa fa-circle-info" aria-hidden="true"></i>${esc(T('planNone'))}</p>`
      const ruleRows = Object.entries(rules).map(([exe, kind]) => `<li><span class="cm-rule-n">${esc(P.progName(exe))}</span><span>${esc(T('plan_' + kind))}</span>${pinned[exe] ? `<em class="cm-rule-on">${esc(T('pinnedNow'))}</em>` : ''}<button type="button" class="nt-sec sm" data-lab="forget" data-exe="${esc(exe)}" aria-label="${esc(T('forget'))}"><i class="fa fa-xmark" aria-hidden="true"></i></button></li>`).join('')
      return `<section class="nt-card cm-lab-card" data-lab-card="plan"><header class="nt-card-h"><div><b>${esc(T('planTitle'))}</b><span>${esc(T('planSub'))}</span></div></header>
        <div class="cm-exe"><label><span>${esc(T('exeLabel'))}</span><input type="text" data-lab="exe" list="cm-games" placeholder="game.exe" value="${esc(st.exe)}" spellcheck="false" autocomplete="off"></label><datalist id="cm-games">${opts}</datalist>
          <button type="button" class="nt-sec sm" data-lab="find"${st.finding ? ' disabled' : ''}><i class="fa fa-${st.finding ? 'circle-notch fa-spin' : 'magnifying-glass'}" aria-hidden="true"></i>${esc(T('findGames'))}</button></div>
        ${st.games.length ? `<div class="cm-games">${st.games.map(g => `<button type="button" class="nt-chip" data-lab="pick" data-exe="${esc(g)}" aria-pressed="${g.toLowerCase() === exeKey}">${esc(P.progName(g))}</button>`).join('')}</div>` : ''}
        <div class="cm-plans" role="radiogroup" aria-label="${esc(T('planTitle'))}">${list}</div>
        ${plans.length ? `<label class="cm-check"><input type="checkbox" data-lab="remember"${st.remember ? ' checked' : ''}><span>${esc(T('planRemember'))}</span></label>` : ''}
        <div class="cm-lab-act"><button type="button" class="nt-cta sm" data-lab="pin"${!plans.length || !st.plan || !exeKey || st.busy ? ' disabled' : ''}><i class="fa fa-${st.busy === 'pin' ? 'circle-notch fa-spin' : 'thumbtack'}" aria-hidden="true"></i>${esc(T('pinNow'))}</button><button type="button" class="nt-sec sm" data-lab="unpin"${!exeKey || st.busy ? ' disabled' : ''}><i class="fa fa-xmark" aria-hidden="true"></i>${esc(T('release'))}</button><span class="cm-note" data-lab-note aria-live="polite"></span></div>
        <p class="cm-fine">${esc(T('planFine'))}</p>
        ${ruleRows ? `<h4 class="cm-sub">${esc(T('rulesTitle'))}</h4><ul class="cm-rules">${ruleRows}</ul>` : ''}</section>`
    }

    function prioCard() {
      const real = st.prio.real || {}, rows = Object.entries(real).filter(([, v]) => v).map(([exe, v]) => `<li><span class="cm-rule-n">${esc(P.progName(exe))}</span><span>${esc(T('prio_' + v))}</span><button type="button" class="nt-sec sm" data-lab="prio-clear" data-exe="${esc(exe)}" aria-label="${esc(T('forget'))}"><i class="fa fa-xmark" aria-hidden="true"></i></button></li>`).join('')
      const exeKey = st.exe.trim()
      return `<section class="nt-card cm-lab-card" data-lab-card="prio"><header class="nt-card-h"><div><b>${esc(T('prioTitle'))}</b><span>${esc(T('prioSub'))}</span></div></header>
        <div class="cm-seg" role="radiogroup" aria-label="${esc(T('prioTitle'))}">${['above', 'high'].map(l => `<button type="button" role="radio" aria-checked="${st.prio.level === l}" data-lab="level" data-level="${l}"><b>${esc(T('prio_' + l))}</b><span>${esc(T('prioS_' + l))}</span></button>`).join('')}</div>
        <div class="cm-lab-act"><button type="button" class="nt-cta sm" data-lab="prio-set"${!exeKey || st.busy ? ' disabled' : ''}><i class="fa fa-${st.busy === 'prio' ? 'circle-notch fa-spin' : 'gauge-high'}" aria-hidden="true"></i>${esc(T('prioSet', { exe: exeKey ? P.progName(exeKey) : '…' }))}</button><span class="cm-note" data-lab-note2 aria-live="polite"></span></div>
        <p class="cm-fine">${esc(T('prioFine'))}</p>${rows ? `<ul class="cm-rules">${rows}</ul>` : ''}${st.prio.unread ? `<p class="cm-fine">${esc(T('prioUnread'))}</p>` : ''}</section>`
    }

    function bnCard() {
      const t = st.bn.tick
      let body = `<p class="cm-fine">${esc(T('bnHint'))}</p>`
      if (st.bn.on) {
        const label = t && t.bottleneck === 'cpu' ? T('bnCpu') : t && t.bottleneck === 'gpu' ? T('bnGpu') : T('bnCapturing')
        body = `<div class="cm-bn" data-b="${t && t.bottleneck ? t.bottleneck : ''}"><b>${esc(label)}</b><span class="mono">${t && t.frameMs != null ? esc(T('bnFrame', { ms: t.frameMs })) : ''}${t && t.frameP99 != null ? ' · ' + esc(T('bnP99', { ms: t.frameP99 })) : ''}</span></div>
          ${t && t.cpuMs != null ? `<dl class="cm-mini"><div><dt>CPU</dt><dd class="mono">${t.cpuMs.toFixed(1)} ms</dd></div><div><dt>GPU</dt><dd class="mono">${t.gpuMs != null ? t.gpuMs.toFixed(1) : '–'} ms</dd></div><div><dt>${esc(T('bnDisp'))}</dt><dd class="mono">${t.dispMs != null ? t.dispMs.toFixed(1) : '–'} ms</dd></div></dl>` : ''}
          <p class="cm-fine">${esc(T('bnRunning'))}</p>`
      }
      return `<section class="nt-card cm-lab-card" data-lab-card="bn"><header class="nt-card-h"><div><b>${esc(T('bnTitle'))}</b><span>${esc(T('bnSub'))}</span></div>${st.bn.on ? `<button type="button" class="nt-sec sm" data-lab="bn-stop"><i class="fa fa-stop" aria-hidden="true"></i>${esc(T('stop'))}</button>` : `<button type="button" class="nt-cta sm" data-lab="bn-start"><i class="fa fa-play" aria-hidden="true"></i>${esc(T('start'))}</button>`}</header>${body}</section>`
    }

    function checkCard() {
      const r = st.ram, tm = st.timings
      const ramOut = st.ramBusy ? `<p class="cm-note"><i class="fa fa-circle-notch fa-spin" aria-hidden="true"></i> ${esc(T('ramRunning'))}</p>`
        : r ? `<p class="cm-note" data-tone="${r.ok && r.passed ? 'ok' : 'bad'}">${esc(!r.ok ? T('ramFail') : r.passed ? T('ramPass', { n: r.passes || 0 }) : T('ramErrors', { n: r.errors || 0 }))}</p>` : ''
      const tmOut = st.timingsBusy ? `<p class="cm-note"><i class="fa fa-circle-notch fa-spin" aria-hidden="true"></i> ${esc(T('timingsRunning'))}</p>`
        : tm ? (tm.ok ? `<dl class="cm-mini"><div><dt>CL</dt><dd class="mono">${esc(tm.cl)}</dd></div><div><dt>tRCD</dt><dd class="mono">${esc(tm.trcd)}</dd></div><div><dt>tRP</dt><dd class="mono">${esc(tm.trp)}</dd></div><div><dt>tRAS</dt><dd class="mono">${esc(tm.tras)}</dd></div><div><dt>CR</dt><dd class="mono">${esc(tm.cr)}</dd></div></dl>` : `<p class="cm-note" data-tone="warn">${esc(T(tm.error === 'not_found' ? 'timingsMissing' : 'timingsFail'))}</p>`) : ''
      return `<section class="nt-card cm-lab-card" data-lab-card="checks"><header class="nt-card-h"><div><b>${esc(T('checksTitle'))}</b><span>${esc(T('checksSub'))}</span></div></header>
        <div class="cm-check-row"><div><b>${esc(T('ramTitle'))}</b><span>${esc(T('ramSub'))}</span></div><button type="button" class="nt-sec sm" data-lab="ram"${st.ramBusy ? ' disabled' : ''}><i class="fa fa-play" aria-hidden="true"></i>${esc(T('ramRun'))}</button></div>${ramOut}
        <div class="cm-check-row"><div><b>${esc(T('timingsTitle'))}</b><span>${esc(T('timingsSub'))}</span></div><button type="button" class="nt-sec sm" data-lab="timings"${st.timingsBusy ? ' disabled' : ''}><i class="fa fa-glasses" aria-hidden="true"></i>${esc(T('timingsRead'))}</button></div>${tmOut}</section>`
    }

    function paint() {
      if (disposed) return
      const focus = document.activeElement && slot.contains(document.activeElement) ? document.activeElement.getAttribute('data-lab') : null
      slot.innerHTML = !S.premium ? premiumPitch() : `<div class="cm-lab">${planCard()}${prioCard()}${bnCard()}${checkCard()}</div>`
      if (focus === 'exe') { const i = slot.querySelector('[data-lab="exe"]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length) } }
    }
    function note(sel, text, tone) { const n = slot.querySelector(sel); if (n) { n.textContent = text; n.dataset.tone = tone || '' } }

    async function loadPrio() {
      if (!S.premium) return
      try { const r = await ctx.api.cpumem2Priorities(); if (!disposed && r && r.ok) { st.prio.real = r.priorities || {}; st.prio.unread = !!r.unread } } catch (e) { /* optional */ }
    }

    async function findGames() {
      st.finding = true; paint()
      try {
        const procs = await ctx.api.getProcesses()
        const known = typeof GAME_DATABASE !== 'undefined' ? new Set(GAME_DATABASE.map(g => g.exe.toLowerCase())) : new Set()
        st.games = [...new Set((procs || []).map(p => String(p.name || p.Name || p.exe || '')).map(n => (n && !/\.exe$/i.test(n) ? n + '.exe' : n)).filter(n => known.has(n.toLowerCase())))]
        if (!st.games.length) ctx.toast(T('findGames'), T('noGamesRunning'), 'info')
        else if (!st.exe) st.exe = st.games[0]
      } catch (e) { ctx.toast(T('findGames'), T('runFailS'), 'err') }
      st.finding = false; paint()
    }

    async function pin() {
      st.busy = 'pin'; paint()
      let r
      try { r = await ctx.api.cpumem2Pin({ exe: st.exe.trim(), kind: st.plan, remember: st.remember }) } catch (e) { r = null }
      st.busy = ''
      if (r && r.ok) { ctx.applyRules({ rules: r.rules, pinned: r.pinned, priority: r.priority }); paint(); note('[data-lab-note]', r.processes ? T('pinned', { n: r.processes, c: r.count, t: r.total }) : T('pinnedLater'), r.processes ? 'ok' : 'warn') }
      else { paint(); note('[data-lab-note]', pinErr(r), 'bad') }
    }
    const pinErr = r => { const k = 'pinErr_' + ((r && r.error) || 'x'); const v = T(k); return v === k ? T('pinErr_x') : v }
    async function unpin(exe, forget) {
      st.busy = 'unpin'; paint()
      let r
      try { r = await ctx.api.cpumem2Unpin({ exe, forget }) } catch (e) { r = null }
      st.busy = ''
      if (r && r.ok) { ctx.applyRules({ rules: r.rules, pinned: r.pinned, priority: r.priority }); paint(); note('[data-lab-note]', T('released'), 'ok') }
      else { paint(); note('[data-lab-note]', pinErr(r), 'bad') }
    }
    async function setPrio() {
      st.busy = 'prio'; paint()
      let r
      try { r = await ctx.api.cpumem2Priority({ exe: st.exe.trim(), level: st.prio.level }) } catch (e) { r = null }
      st.busy = ''
      if (r && r.ok) { st.prio.real = r.priorities || {}; st.prio.unread = !!r.unread; paint(); note('[data-lab-note2]', T('prioDone'), 'ok'); ctx.loadHistory() }
      else { paint(); note('[data-lab-note2]', pinErr(r), 'bad') }
    }
    async function clearPrio(exe) {
      let r; try { r = await ctx.api.cpumem2PriorityClear({ exe }) } catch (e) { r = null }
      if (r && r.ok) { st.prio.real = r.priorities || {}; paint(); ctx.loadHistory() }
    }
    async function bnStart() {
      let r; try { r = await ctx.api.latencyBudgetStart() } catch (e) { r = null }
      if (!r || !r.ok) { ctx.toast(T('bnTitle'), T('bnNoTool'), 'warn'); return }
      st.bn = { on: true, tick: null }
      if (!bnUnsub && ctx.api.onLatencyBudgetTick) bnUnsub = ctx.api.onLatencyBudgetTick(tick => { if (disposed || !st.bn.on) return; st.bn.tick = tick; const c = slot.querySelector('[data-lab-card="bn"]'); if (c) { const box = el(bnCard()); c.replaceWith(box) } })
      paint()
    }
    const el = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild }
    async function bnStop() { try { await ctx.api.latencyBudgetStop() } catch (e) { /* already stopped */ } st.bn.on = false; paint() }
    async function ramRun() {
      st.ramBusy = true; st.ram = null; paint()
      let r; try { r = await ctx.api.biosRamStress(30) } catch (e) { r = null }
      st.ramBusy = false; st.ram = r || { ok: false }; paint()
    }
    async function timings() {
      st.timingsBusy = true; paint()
      let r; try { r = await ctx.api.cpuzReadTimings() } catch (e) { r = null }
      st.timingsBusy = false; st.timings = r || { ok: false }; paint()
    }

    slot.addEventListener('click', e => {
      const t = e.target.closest('[data-lab]'); if (!t || !slot.contains(t)) return
      switch (t.dataset.lab) {
        case 'premium': if (root.JylliPremium) root.JylliPremium.open(); break
        case 'find': findGames(); break
        case 'pick': st.exe = t.dataset.exe; paint(); break
        case 'plan': break
        case 'pin': pin(); break
        case 'unpin': unpin(st.exe.trim(), false); break
        case 'forget': unpin(t.dataset.exe, true); break
        case 'level': st.prio.level = t.dataset.level; paint(); break
        case 'prio-set': setPrio(); break
        case 'prio-clear': clearPrio(t.dataset.exe); break
        case 'bn-start': bnStart(); break
        case 'bn-stop': bnStop(); break
        case 'ram': ramRun(); break
        case 'timings': timings(); break
        default: break
      }
    })
    slot.addEventListener('change', e => {
      const t = e.target.closest('[data-lab]'); if (!t) return
      if (t.dataset.lab === 'plan') { st.plan = t.value; const p = ((S.facts && S.facts.plans) || []).find(x => x.kind === st.plan); ctx.setPreview(p ? p.cpus : null); paint() }
      else if (t.dataset.lab === 'remember') st.remember = t.checked
      else if (t.dataset.lab === 'exe') { st.exe = t.value; paint() }
    })
    slot.addEventListener('input', e => { const t = e.target; if (t && t.dataset && t.dataset.lab === 'exe') { st.exe = t.value; const pin = slot.querySelector('[data-lab="pin"]'), un = slot.querySelector('[data-lab="unpin"]'), pr = slot.querySelector('[data-lab="prio-set"]'); const has = !!st.exe.trim(); if (pin) pin.disabled = !has || !st.plan; if (un) un.disabled = !has; if (pr) pr.disabled = !has } })

    paint()
    loadPrio().then(paint)
    return {
      refresh() { if (disposed) return; paint(); loadPrio().then(paint) },
      destroy() { disposed = true; if (st.bn.on) { try { ctx.api.latencyBudgetStop() } catch (e) { /* already stopped */ } } if (typeof bnUnsub === 'function') { try { bnUnsub() } catch (e) { /* gone */ } } slot.innerHTML = '' },
    }
  }
})(typeof window !== 'undefined' ? window : globalThis)
