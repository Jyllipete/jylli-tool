// The cut list. Positions are 'bar.beat' on the music grid in beats.json (140 BPM, bar 0 = 0 s): 4.0 = the first drop, 28.0 = the second, 60.0 = the last.
// cam keys: {b: beats after scene start the move LANDS on, z: zoom, x/y: focus 0..1 of the still, mv: beats the move takes}. flash/hit only on drops.
// To retime for another track: npm run promo:analyze, then move the three drop bars and the silent beats (27.3, 59.3, 84.0) here.
;(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.PromoScenes = factory() })(typeof self !== 'undefined' ? self : this, function () {
  const K = (b, z, x, y, mv) => ({ b, z, x, y, mv })
  const S = []
  const add = o => S.push(o)
  const side = (a, b) => [{ shot: a, x: -760, y: 70, z: -320, sc: 0.56, at: 1.5 }, { shot: b, x: 760, y: 90, z: -320, sc: 0.56, at: 2 }]

  // ---- intro: black, the J, "Jylli Tool", "1.6.0" on bar 2, black on the silent beat before the drop ----
  add({ id: 'black-open', kind: 'black', at: '0.0', to: '0.1', enter: 0.01 })
  add({ id: 'logo-intro', kind: 'logo', at: '0.1', to: '3.2', enter: 3, wordAt: 3.5, verAt: 7.5, kickAt: 9.5 })
  add({ id: 'black-pre-a', kind: 'black', at: '3.2', to: '4.0', enter: 0.25 })

  // ---- drop A (bars 4-11): Home "Helm" ----
  add({ id: 'helm', kind: 'shot', at: '4.0', to: '6.0', shot: 'home', head: 'helm', hit: true, flash: true, tilt: [-5, 2], from: -1, side: side('boot-scan', 'glass'),
    cam: [K(0, 2.2, 0.64, 0.27), K(7, 1.15, 0.5, 0.5, 7)] })
  add({ id: 'index', kind: 'shot', at: '6.0', to: '7.0', shot: 'home', head: 'index', tilt: [3, 2], from: 1, cam: [K(0, 1.5, 0.7, 0.3), K(3, 2.1, 0.78, 0.27, 3)] })
  add({ id: 'move', kind: 'shot', at: '7.0', to: '8.0', shot: 'home', head: 'move', tilt: [-3, 1], from: -1, cam: [K(0, 1.5, 0.78, 0.55), K(3, 2.0, 0.78, 0.67, 3)] })
  add({ id: 'glass', kind: 'shot', at: '8.0', to: '10.0', shot: 'glass', head: 'glass', tilt: [4, 3], from: 1, side: side('light', 'toast'), cam: [K(0, 1.0, 0.5, 0.5), K(7, 1.7, 0.2, 0.25, 7)] })
  add({ id: 'proof-a', kind: 'proof', at: '10.0', to: '12.0', head: 'proof1', compact: true,
    counters: [{ fact: 'views', from: 0.5, to: 4 }, { fact: 'heroTabs', from: 0.5, to: 4 }, { fact: 'languages', from: 0.5, to: 4 }] })

  // ---- quiet section (12-19): first launch, slow 2-bar drifts ----
  add({ id: 'arrival', kind: 'shot', at: '12.0', to: '14.0', shot: 'arrival', head: 'arrival', tilt: [-3, 1], cam: [K(0, 1.2, 0.5, 0.55), K(7, 2.0, 0.5, 0.6, 7)] })
  add({ id: 'recog', kind: 'shot', at: '14.0', to: '16.0', shot: 'boot-scan', head: 'recog', tilt: [3, 1], from: 1, cam: [K(0, 1.3, 0.4, 0.45), K(3, 2.0, 0.28, 0.4, 3), K(7, 1.7, 0.77, 0.5, 3)] })
  add({ id: 'tours', kind: 'shot', at: '16.0', to: '18.0', shot: 'tour', head: 'tours', tilt: [-3, 1], from: -1, cam: [K(0, 1.2, 0.3, 0.3), K(3, 2.3, 0.2, 0.16, 3), K(7, 1.7, 0.25, 0.35, 3)] })
  add({ id: 'concierge', kind: 'shot', at: '18.0', to: '20.0', shot: 'home', head: 'concierge', tilt: [3, 2], cam: [K(0, 1.3, 0.6, 0.5), K(4, 2.0, 0.78, 0.68, 4), K(7, 2.0, 0.75, 0.85, 3)] })

  // ---- build (20-27): Auto-Optimize, cuts tighten, silent beat 27.3 ----
  add({ id: 'ao', kind: 'shot', at: '20.0', to: '22.0', shot: 'ao-plan', head: 'ao', tilt: [-4, 2], cam: [K(0, 1.0, 0.5, 0.5), K(4, 1.7, 0.65, 0.28, 4)] })
  add({ id: 'ao-diag', kind: 'shot', at: '22.0', to: '24.0', shot: 'ao-diag', head: 'aoScan', tilt: [4, 2], from: 1, cam: [K(0, 1.6, 0.12, 0.5), K(4, 2.0, 0.6, 0.28, 4), K(7, 1.8, 0.6, 0.6, 3)] })
  add({ id: 'ao-max', kind: 'shot', at: '24.0', to: '26.0', shot: 'ao-max', head: 'aoMax', tilt: [-4, 1], from: -1, cam: [K(0, 1.8, 0.7, 0.27), K(5, 1.8, 0.6, 0.68, 5)] })
  add({ id: 'ao-expert', kind: 'shot', at: '26.0', to: '27.0', shot: 'ao-expert', head: 'aoExpert', compact: true, tilt: [3, 2], cam: [K(0, 1.9, 0.55, 0.45), K(3, 1.9, 0.6, 0.62, 3)] })
  add({ id: 'ao-result', kind: 'shot', at: '27.0', to: '27.2', shot: 'ao-result', tilt: [-3, 1], cam: [K(0, 2.0, 0.65, 0.27)] })
  add({ id: 'ao-quick', kind: 'shot', at: '27.2', to: '27.3', shot: 'apps', tilt: [3, 1], cam: [K(0, 2.0, 0.3, 0.3)] })
  add({ id: 'black-pre-b', kind: 'black', at: '27.3', to: '28.0', enter: 0.2 })

  // ---- drop B (28-42): hardware ----
  add({ id: 'gpu', kind: 'shot', at: '28.0', to: '30.0', shot: 'gpu', head: 'gpu', hit: true, flash: true, tilt: [-5, 2], from: -1, side: side('gpu-rails', 'gpu-display'), cam: [K(0, 1.8, 0.5, 0.4), K(7, 1.15, 0.55, 0.5, 7)] })
  add({ id: 'cpu', kind: 'shot', at: '30.0', to: '32.0', shot: 'cpumem', head: 'cpu', tilt: [4, 2], from: 1, cam: [K(0, 1.15, 0.5, 0.5), K(3, 1.9, 0.35, 0.5, 3), K(7, 2.0, 0.35, 0.93, 3)] })
  add({ id: 'power', kind: 'shot', at: '32.0', to: '34.0', shot: 'power', head: 'power', tilt: [-4, 1], from: -1, cam: [K(0, 1.15, 0.5, 0.45), K(3, 2.0, 0.76, 0.4, 3), K(7, 1.9, 0.3, 0.55, 3)] })
  add({ id: 'net', kind: 'shot', at: '34.0', to: '36.0', shot: 'net-history', head: 'net', tilt: [4, 2], from: 1, cam: [K(0, 1.15, 0.53, 0.3), K(4, 1.15, 0.53, 0.3), K(7, 2.0, 0.35, 0.45, 3)] })
  add({ id: 'windows', kind: 'shot', at: '36.0', to: '38.0', shot: 'windows', head: 'windows', tilt: [-3, 2], from: -1, cam: [K(0, 1.2, 0.5, 0.4), K(4, 2.1, 0.42, 0.37, 4)] })
  add({ id: 'qol', kind: 'shot', at: '38.0', to: '40.0', shot: 'qol', head: 'qol', tilt: [3, 2], from: 1, cam: [K(0, 1.2, 0.5, 0.4), K(4, 2.2, 0.4, 0.36, 4)] })
  add({ id: 'proof-b', kind: 'proof', at: '40.0', to: '42.0', head: 'proof2', compact: true,
    counters: [{ fact: 'tests', from: 0.5, to: 4 }, { fact: 'heroTabs', from: 0.5, to: 4 }, { fact: 'views', from: 0.5, to: 4 }] })
  add({ id: 'net-measure', kind: 'shot', at: '42.0', to: '43.0', shot: 'net-measure', head: 'measure', compact: true, tilt: [-3, 1], cam: [K(0, 1.8, 0.55, 0.47), K(3, 1.6, 0.55, 0.55, 3)] })

  // ---- breakdown (43-51): safety, slow ----
  add({ id: 'journal', kind: 'shot', at: '43.0', to: '45.0', shot: 'journal', head: 'journal', tilt: [-3, 1], cam: [K(0, 1.3, 0.5, 0.72), K(4, 1.3, 0.5, 0.76, 3), K(7, 1.8, 0.78, 0.75, 3)] })
  add({ id: 'safety', kind: 'shot', at: '45.0', to: '47.0', shot: 'restore', head: 'safety', tilt: [3, 1], from: 1, cam: [K(0, 1.2, 0.5, 0.4), K(3, 2.0, 0.35, 0.46, 3), K(7, 2.3, 0.2, 0.14, 3)] })
  add({ id: 'diag', kind: 'shot', at: '47.0', to: '49.0', shot: 'diag', head: 'diag', tilt: [-3, 2], from: -1, cam: [K(0, 1.2, 0.5, 0.5), K(4, 1.8, 0.55, 0.47, 4), K(7, 2.0, 0.4, 0.9, 3)] })
  add({ id: 'diag-tl', kind: 'shot', at: '49.0', to: '51.0', shot: 'diag-timeline', head: 'diagTl', tilt: [3, 1], cam: [K(0, 1.8, 0.7, 0.1), K(5, 2.0, 0.45, 0.45, 5)] })
  add({ id: 'debloat', kind: 'shot', at: '51.0', to: '52.0', shot: 'debloat', head: 'debloat', compact: true, tilt: [-3, 1], cam: [K(0, 1.3, 0.5, 0.4), K(3, 2.1, 0.4, 0.38, 3)] })

  // ---- build 2 (52-59): the shell, silent beat 59.3 ----
  add({ id: 'palette', kind: 'shot', at: '52.0', to: '54.0', shot: 'palette', head: 'palette', tilt: [-4, 1], cam: [K(0, 1.5, 0.5, 0.2), K(7, 2.3, 0.5, 0.19, 7)] })
  add({ id: 'shortcuts', kind: 'shot', at: '54.0', to: '56.0', shot: 'shortcuts', head: 'shortcuts', tilt: [4, 2], from: 1, cam: [K(0, 1.3, 0.5, 0.5), K(7, 2.0, 0.5, 0.5, 7)] })
  add({ id: 'toast', kind: 'shot', at: '56.0', to: '58.0', shot: 'toast', head: 'toast', tilt: [-4, 2], from: -1, cam: [K(0, 1.5, 0.47, 0.7), K(7, 2.2, 0.47, 0.78, 7)] })
  add({ id: 'light', kind: 'shot', at: '58.0', to: '59.0', shot: 'light', head: 'light', compact: true, tilt: [3, 2], cam: [K(0, 1.0, 0.5, 0.5), K(3, 1.7, 0.72, 0.3, 3)] })
  add({ id: 'q-glass', kind: 'shot', at: '59.0', to: '59.2', shot: 'glass', tilt: [-3, 1], cam: [K(0, 1.5, 0.2, 0.25)] })
  add({ id: 'q-journal', kind: 'shot', at: '59.2', to: '59.3', shot: 'journal', tilt: [3, 1], cam: [K(0, 1.8, 0.75, 0.78)] })
  add({ id: 'black-pre-c', kind: 'black', at: '59.3', to: '60.0', enter: 0.2 })

  // ---- final drop (60-83): games, wall, end card ----
  add({ id: 'pulse', kind: 'shot', at: '60.0', to: '62.0', shot: 'pulse', head: 'pulse', hit: true, flash: true, tilt: [-5, 2], from: -1, side: side('pulse-cockpit', 'pulse-debrief'), cam: [K(0, 2.2, 0.3, 0.33), K(7, 1.15, 0.5, 0.55, 7)] })
  add({ id: 'hud', kind: 'shot', at: '62.0', to: '63.0', shot: 'pulse-hud', head: 'hud', compact: true, tilt: [4, 2], from: 1, cam: [K(0, 1.2, 0.5, 0.55), K(3, 2.0, 0.72, 0.45, 3)] })
  add({ id: 'receipt', kind: 'shot', at: '63.0', to: '64.0', shot: 'pulse-receipt', head: 'receipt', compact: true, tilt: [-4, 2], from: -1, cam: [K(0, 1.3, 0.7, 0.5), K(3, 2.3, 0.9, 0.72, 3)] })
  add({ id: 'games', kind: 'shot', at: '64.0', to: '66.0', shot: 'games', head: 'games', tilt: [3, 2], from: 1, cam: [K(0, 1.2, 0.5, 0.5), K(4, 2.2, 0.3, 0.85, 4)] })
  add({ id: 'fivem', kind: 'shot', at: '66.0', to: '68.0', shot: 'fivem', head: 'fivem', tilt: [-4, 2], from: -1, cam: [K(0, 1.2, 0.5, 0.4), K(4, 1.8, 0.64, 0.33, 4), K(7, 2.0, 0.4, 0.6, 3)] })
  add({ id: 'reclaim', kind: 'shot', at: '68.0', to: '70.0', shot: 'cleanup', head: 'reclaim', tilt: [4, 1], from: 1, cam: [K(0, 2.2, 0.25, 0.33), K(4, 2.0, 0.5, 0.25, 3), K(7, 1.5, 0.55, 0.8, 3)] })
  add({ id: 'heroes', kind: 'shot', at: '70.0', to: '72.0', shot: 'apps', head: 'heroes', tilt: [-3, 2], from: -1, side: side('qol', 'windows'), cam: [K(0, 1.2, 0.5, 0.4), K(4, 2.0, 0.4, 0.3, 4)] })
  add({ id: 'measure', kind: 'shot', at: '72.0', to: '74.0', shot: 'net-history', head: 'netHist', tilt: [3, 2], from: 1, cam: [K(0, 1.3, 0.5, 0.4), K(4, 1.9, 0.3, 0.78, 4)] })
  add({ id: 'gpu2', kind: 'shot', at: '74.0', to: '76.0', shot: 'gpu-display', head: 'display', tilt: [-3, 1], from: -1, cam: [K(0, 1.6, 0.7, 0.6), K(5, 2.2, 0.27, 0.56, 5)] })
  add({ id: 'wall', kind: 'wall', at: '76.0', to: '82.0', head: 'wall', compact: true, subAt: 6,
    wall: ['net', 'gpu', 'cpumem', 'power', 'diag', 'debloat', 'pulse', 'fivem', 'journal', 'restore', 'windows', 'cleanup', 'games', 'apps', 'latency'] })
  add({ id: 'end-cta', kind: 'shot', at: '82.0', to: '84.0', shot: 'home', head: 'endCta', tilt: [-3, 2], cam: [K(0, 1.0, 0.5, 0.5), K(7, 1.25, 0.6, 0.35, 7)] })

  // ---- the track cuts to silence on 84.0: hard black, then the logo holds and fades ----
  add({ id: 'black-end', kind: 'black', at: '84.0', to: '84.1', enter: 0.01 })
  add({ id: 'logo-end', kind: 'logo', at: '84.1', to: '86.3', enter: 2, wordAt: 1, verAt: 3, kickAt: 5, kicker: 'Päivitä nyt' })
  add({ id: 'black-out', kind: 'black', at: '86.3', to: '87.2', enter: 2 })
  return { scenes: S }
})
