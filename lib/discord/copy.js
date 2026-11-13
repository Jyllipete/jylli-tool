'use strict'
// Text published to Discord. The main process cannot read js/lang/*, so the (short) presence copy lives here, EN + FI.
// "Discord", "FiveM", "CPU", "GPU", "BIOS" and "Pulse" are never translated.
const COPY = {
  en: {
    invite: 'Jylli Tool · discord.gg/jylligraffat',
    app: 'Jylli Tool',
    minimal: 'Using Jylli Tool',
    inGame: 'In a game',
    playing: 'Playing {game}',
    pulseOn: 'Pulse boost on',
    pulseHover: 'Pulse active',
    fivemHover: 'FiveM detected',
    tuned: 'Tuned by Jylli Tool',
    tweak1: '1 tweak applied',
    tweakN: '{n} tweaks applied',
    step: 'Step {step} of {total}',
    btnJoin: 'Join Discord',
    btnGet: 'Download Jylli Tool',
    tasks: { 'auto-opti': 'Auto-Optimizing', health: 'Checking Windows health', scan: 'Scanning the system' },
    taskKeys: { dism: 'Checking DISM', sfc: 'Running SFC scan', smart: 'Checking disk SMART' },
    tabs: {
      home: 'On the Home screen', windows: 'Tuning Windows', qol: 'Windows quality of life', cpumem: 'Tuning CPU & Memory', gpu: 'Tuning the GPU',
      power: 'Tuning power settings', network: 'Tuning the network', fixes: 'Applying fixes', pulse: 'Setting up Pulse', games: 'Optimizing games',
      apps: 'Optimizing apps', fivem: 'Optimizing FiveM', latency: 'Watching latency', replay: 'Reviewing a session', cleanup: 'Cleaning up the system',
      debloat: 'Trimming Windows bloat', startup: 'Managing startup apps', diagnostics: 'Running diagnostics', processes: 'Viewing processes',
      bios: 'Reviewing BIOS settings', scheduler: 'Scheduling tweaks', restore: 'Managing restore points', history: 'Reading the change history', settings: 'Adjusting settings',
    },
  },
  fi: {
    invite: 'Jylli Tool · discord.gg/jylligraffat',
    app: 'Jylli Tool',
    minimal: 'Käyttää Jylli Toolia',
    inGame: 'Pelaa peliä',
    playing: 'Pelaa: {game}',
    pulseOn: 'Pulse-tehostus päällä',
    pulseHover: 'Pulse aktiivinen',
    fivemHover: 'FiveM havaittu',
    tuned: 'Jylli Toolin viritys päällä',
    tweak1: '1 säätö käytössä',
    tweakN: '{n} säätöä käytössä',
    step: 'Vaihe {step}/{total}',
    btnJoin: 'Liity Discordiin',
    btnGet: 'Lataa Jylli Tool',
    tasks: { 'auto-opti': 'Optimoi automaattisesti', health: 'Tarkistaa Windowsin kunnon', scan: 'Skannaa järjestelmää' },
    taskKeys: { dism: 'Tarkistaa DISM:n', sfc: 'Ajaa SFC-skannauksen', smart: 'Tarkistaa levyn SMART-tiedot' },
    tabs: {
      home: 'Etusivulla', windows: 'Viritää Windowsia', qol: 'Windowsin käyttömukavuus', cpumem: 'Viritää CPU:ta ja muistia', gpu: 'Viritää GPU:ta',
      power: 'Viritää virta-asetuksia', network: 'Viritää verkkoa', fixes: 'Korjaa ongelmia', pulse: 'Säätää Pulsea', games: 'Optimoi pelejä',
      apps: 'Optimoi sovelluksia', fivem: 'Optimoi FiveMiä', latency: 'Seuraa viivettä', replay: 'Katsoo pelisessiota', cleanup: 'Siivoaa järjestelmää',
      debloat: 'Karsii Windowsin turhia osia', startup: 'Hallitsee käynnistyssovelluksia', diagnostics: 'Ajaa diagnostiikkaa', processes: 'Katsoo prosesseja',
      bios: 'Tarkastelee BIOS-asetuksia', scheduler: 'Ajastaa säätöjä', restore: 'Hallitsee palautuspisteitä', history: 'Lukee muutoshistoriaa', settings: 'Muokkaa asetuksia',
    },
  },
}
const copy = lang => COPY[lang === 'fi' ? 'fi' : 'en']
const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : ''))
module.exports = { COPY, copy, fill }
