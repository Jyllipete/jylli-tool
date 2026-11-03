// Preview-only mock of the Auto-Optimize backend: runs the REAL engine (findings, plan) on a fixture profile and streams the same
// events main.js would. Nothing here touches the machine. Used by `--auto-opti` in preview-main.js.
const path = require('path')
const ao = require('../../lib/auto-opti')
const { P } = require('../../test/fixtures/auto-opti/profiles')

const sleep = ms => new Promise(r => setTimeout(r, ms))
const PROFILE = () => { const n = process.argv.indexOf('--ao-profile'); return n >= 0 ? process.argv[n + 1] : 'cluttered' }

const FAKE = {
  'game-dvr': [{ labelKey: 'bgCapture', label: '', before: { v: 'on', fmt: 'onoff' }, after: { v: 'off', fmt: 'onoff' }, unit: '' }],
  'game-mode-on': [{ labelKey: 'gameMode', label: '', before: { v: 'off', fmt: 'onoff' }, after: { v: 'on', fmt: 'onoff' }, unit: '' }],
  'gpu-hwsch': [{ labelKey: 'hags', label: '', before: { v: 'off', fmt: 'onoff' }, after: { v: 'on', fmt: 'onoff' }, unit: '' }],
  'disable-mouse-accel': [{ labelKey: 'mouseAccel', label: '', before: { v: 'on', fmt: 'onoff' }, after: { v: 'off', fmt: 'onoff' }, unit: '' }],
  'telemetry-tasks': ['Microsoft Compatibility Appraiser', 'ProgramDataUpdater', 'Consolidator'].map(n => ({ labelKey: 'task', label: n, before: { v: 'on', fmt: 'onoff' }, after: { v: 'off', fmt: 'onoff' }, unit: '' })),
  'fast-startup-off': [{ labelKey: 'fastStartup', label: '', before: { v: 'on', fmt: 'onoff' }, after: { v: 'off', fmt: 'onoff' }, unit: '' }],
  'delivery-opt': [{ labelKey: 'deliveryOpt', label: '', before: { v: 'on', fmt: 'onoff' }, after: { v: 'off', fmt: 'onoff' }, unit: '' }],
  'vrr-borderless': [{ labelKey: 'windowedGames', label: '', before: { v: null, fmt: 'unset' }, after: { v: 'VRROptimizeEnable=1;', fmt: 'raw' }, unit: '' }],
}

let st = null     // { profile, scanId, confirm: resolver }

function profileFor() {
  const p = (P[PROFILE()] || P.cluttered)()
  p.scanMs = 2310; p.gpuList = p.gpus
  p.probes = Object.fromEntries(ao.probes.PROBES.map(x => [x.id, { ok: true, ms: 300 }]))
  return p
}
const ctxOf = (req, premium) => ({ useCase: (req && req.useCase) || 'fps', answers: (req && req.answers) || {}, applied: new Set() })

async function handle(name, args, sender, ctx) {
  const req = args && args[0]
  const send = (ch, d) => { try { sender.send('mock-event', ch, d) } catch {} }
  switch (name) {
    case 'aoScan': {
      const profile = profileFor(); const scanId = 'pv1'
      st = { profile, scanId }
      for (const pr of ao.probes.PROBES) {
        send('onAoScanProgress', { scanId, probe: pr.id, state: 'start' })
        await sleep(520)
        let chips = []
        try { chips = ao.probes.chipsFor(pr.id, profile) } catch {}
        send('onAoScanProgress', { scanId, probe: pr.id, state: 'done', ms: 180 + Math.round(Math.random() * 900), chips })
      }
      const c = ctxOf(req)
      return { ok: true, scanId, profile, findings: ao.findings.findings(profile, c), useCase: c.useCase, ms: 2310 }
    }
    case 'aoPlan': {
      const c = ctxOf(req); const findings = ao.findings.findings(st.profile, c)
      const include = (req.include || []), exclude = (req.exclude || [])
      return { ok: true, findings, useCase: c.useCase, plan: ao.plan.plan(findings, { include, exclude, modules: req.modules || {}, startupItems: req.startupItems, premium: ctx.premium }) }
    }
    case 'aoRun': {
      const c = ctxOf(req); const findings = ao.findings.findings(st.profile, c)
      const plan = ao.plan.plan(findings, { include: req.include || [], exclude: req.exclude || [], modules: req.modules || {}, startupItems: req.startupItems, premium: ctx.premium })
      const ev = (e) => send('onAoEvent', { runId: 'pv', ...e })
      const counters = { settingsChanged: 0, startupRemoved: 0, tasksDisabled: 0, bytesReclaimed: 0 }
      ev({ phase: 'measure', state: 'start' }); await sleep(700); ev({ phase: 'measure', state: 'done' })
      ev({ phase: 'restore-point', state: 'start' }); await sleep(900); ev({ phase: 'restore-point', state: 'done' })
      const results = []
      let cur = null
      for (const s of plan.steps) {
        if (s.module !== cur) { if (cur) ev({ phase: 'module-done', module: cur }); cur = s.module; ev({ phase: 'module-start', module: cur }) }
        ev({ phase: 'step-start', stepId: s.stepId, module: s.module, findingId: s.findingId })
        await sleep(650)
        let changes = FAKE[s.tweakId] || [], status = 'ok'
        if (s.control === 'display-refresh') {
          const t = s.params.targets[0]
          ev({ phase: 'confirm-request', stepId: s.stepId, device: t.device, from: t.from, to: t.hz, deadline: Date.now() + 15000 })
          await new Promise(r => { st.confirm = r })
          changes = [{ labelKey: 'refreshRate', label: t.device, before: { v: String(t.from), fmt: 'raw' }, after: { v: String(t.hz), fmt: 'raw' }, unit: 'Hz' }]
        } else if (s.control === 'startup-cleanup') {
          changes = s.params.items.map(n => ({ labelKey: 'startupItem', label: n, before: { v: 'on', fmt: 'onoff' }, after: { v: 'off', fmt: 'onoff' }, unit: '' }))
          counters.startupRemoved += changes.length
        } else if (s.control === 'junk-clean') {
          for (let i = 1; i <= 6; i++) { counters.bytesReclaimed += 560 * 1024 ** 2; ev({ phase: 'counter', counters: { ...counters } }); await sleep(260) }
          changes = [{ labelKey: 'junk', label: '', before: { v: null, fmt: 'raw' }, after: { v: String(counters.bytesReclaimed), fmt: 'raw' }, unit: 'bytes' }]
        }
        if (s.tweakId === 'telemetry-tasks') counters.tasksDisabled += changes.length
        if (s.control !== 'junk-clean') counters.settingsChanged += changes.length
        results.push({ stepId: s.stepId, findingId: s.findingId, status, changes })
        ev({ phase: 'step-done', stepId: s.stepId, module: s.module, findingId: s.findingId, status, changes, counters: { ...counters } })
      }
      if (cur) ev({ phase: 'module-done', module: cur })
      await sleep(300)
      const shield = { ok: true, checked: true, changed: [] }
      ev({ phase: 'shield-verified', ...shield })
      const rows = [
        { key: 'refresh', label: 'LG 27GP850', before: 60, after: 165, unit: 'Hz', better: 'better' },
        { key: 'startupEnabled', before: 8, after: 3, unit: '', better: 'better' },
        { key: 'procs', before: 214, after: 187, unit: '', better: 'better' },
        { key: 'freeDiskGB', before: 400, after: 403.3, unit: 'GB', better: 'better' },
      ]
      ev({ phase: 'done', ok: true, rebootRequired: plan.rebootRequired, counters, rows, shield })
      return { ok: true, runId: 'pv', batchId: 'b1', results, counters, rows, shield, needsYou: findings.filter(f => f.kind === 'manual').map(f => f.id), rebootRequired: plan.rebootRequired }
    }
    case 'aoConfirm': if (st && st.confirm) { st.confirm(); st.confirm = null } return { ok: true }
    case 'aoStop': return { ok: true }
    case 'aoUndo': return { ok: true }
    case 'aoVerify': return { pending: true, rebooted: true, runAt: Date.now() - 1e6, boot: { beforeMs: 61200, afterMs: 43800, deltaMs: -17400 },
      persisted: { total: 21, same: 20, drifted: [{ tweakId: 'startup-cleanup', items: ['Spotify'] }] },
      rows: [{ key: 'procs', before: 214, after: 181, unit: '', better: 'better' }, { key: 'idleCpuPct', before: 6.4, after: 2.1, unit: '%', better: 'better' }] }
    case 'aoDismissVerify': return { ok: true }
    default: return undefined
  }
}

module.exports = { handle }
