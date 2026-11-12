// Boot scan copy (group `boot`, read with tG('boot', key, vars)). Names like CPU, GPU, RAM, VRAM, BIOS and Windows stay as they are in every language.
globalThis.LANG = globalThis.LANG || { en: {}, fi: {} }
LANG.en.boot = {
  // headline states
  tagScanning: 'Reading your PC',
  tagRemembered: 'Welcome back — checking nothing changed',
  tagDone: 'Your PC, identified',
  trust: 'Read-only scan. Nothing on your PC is changed.',
  // row labels (CPU / RAM / GPU / VRAM keep their names)
  lblDisplay: 'Display',
  lblBoard: 'Board',
  lblOs: 'OS & Admin',
  // row states
  reading: 'Reading…',
  waiting: 'Waiting…',
  remembered: 'remembered',
  verified: 'verified',
  unavailable: 'Unavailable, skipped',
  slow: 'This PC is slow to answer. Still reading {what}.',
  continueNow: 'Continue now',
  // row detail pieces
  threads: '{n} threads',
  driver: 'Driver {v}',
  build: 'Build {n}',
  admin: 'Administrator',
  standard: 'Standard user',
  // identity card
  signature: 'Rig signature',
  rigHighDesktop: 'High-end desktop',
  rigMidDesktop: 'Mainstream desktop',
  rigEntryDesktop: 'Entry-level desktop',
  rigHighLaptop: 'High-end laptop',
  rigMidLaptop: 'Mainstream laptop',
  rigEntryLaptop: 'Entry-level laptop',
  // closing line: only facts we hold
  pFirst: 'Ready to tune this PC.',
  pSame: 'Same PC as last launch.',
  pChanged: 'Changed since last launch: {list}',
  pApplied: '{n} tweaks active',
  pOptToday: 'Optimised today',
  pOptDays: 'Last optimised {n} days ago',
  // screen readers
  ariaRow: '{label}: {value}',
  ariaDone: 'Scan complete',
}
