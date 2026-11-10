'use strict'
// Tour definitions for js/tour.js. key = tab id (js/routes.js) or 'prolock'. Raise v to show a tour again. Stops whose target is missing are skipped.
// Each stop targets a data-tour attribute named <tab>-<topic>. Where a builder has no attribute, the tour's `tag` maps that name to a
// stable existing selector and the engine sets the attribute when the element appears (tools/check-ui.js verifies both kinds).
// Copy is voiced as "we", calm, no exclamation marks. Every string has en and fi.
;(function (root) {
  const T = (name, en, fi) => ({ sel: `[data-tour="${name}"]`, en: { t: en[0], b: en[1] }, fi: { t: fi[0], b: fi[1] } })

  root.JylliTours = {
    home: { v: 1, stops: [
      { sel: '#j-nav', en: { t: 'Everything in five places', b: 'Optimize, Gaming, Clean and System sit in the sidebar. Press Ctrl K from anywhere to search for a page or a tweak.' }, fi: { t: 'Kaikki viidessä paikassa', b: 'Optimointi, Pelaaminen, Siivous ja Järjestelmä löytyvät sivupalkista. Ctrl K hakee mistä tahansa sivun tai säädön.' } },
      T('home-ring', ['Your PC health', 'One score from your latest scan. It moves as you apply tweaks and as Windows changes.'], ['Koneesi kunto', 'Yksi pistemäärä viimeisimmästä tarkistuksesta. Se muuttuu, kun otat säätöjä käyttöön ja Windows muuttuu.']),
      T('home-rig', ['Your machine, drawn from your hardware', 'Hover a part to see what it is doing right now. Nothing here changes your system.'], ['Koneesi laitteistosi mukaan', 'Vie osan päälle nähdäksesi, mitä se tekee juuri nyt. Tämä näkymä ei muuta järjestelmää.']),
      T('home-moves', ['Your first moves', 'A short list we prepared for this PC. Nothing is applied until you choose it.'], ['Ensimmäiset askeleesi', 'Lyhyt lista, jonka laadimme tälle koneelle. Mitään ei oteta käyttöön ennen kuin valitset sen.']),
    ] },
    windows: { v: 1, stops: [
      T('windows-search', ['Find a tweak', 'Search by name or effect. Safe defaults applies only the well-proven ones.'], ['Etsi säätö', 'Hae nimellä tai vaikutuksella. Turvalliset oletukset ottaa käyttöön vain hyväksi todetut.']),
      T('tweak-card', ['Reading a card', 'The dot shows its safety tier: a plain dot is safe, a triangle needs care, a warning sign is for experts. The impact label tells you what to expect.'], ['Kortin lukeminen', 'Piste kertoo turvatason: pelkkä piste on turvallinen, kolmio vaatii harkintaa ja varoitusmerkki on asiantuntijoille. Vaikutusmerkintä kertoo odotettavissa olevan hyödyn.']),
      T('windows-undo', ['Every change can be undone', 'Apply a card to use it, apply it again to undo it. This button reverts everything applied here.'], ['Jokaisen muutoksen voi perua', 'Ota kortti käyttöön ja peru se samasta kortista. Tämä painike perii kaiken täällä käyttöön otetun.']),
    ] },
    cpumem: { v: 1, tag: { 'cpumem-hero': '#cpumem-twin-slot', 'cpumem-tweaks': '.section-card[data-sec-id]', 'cpumem-reboot': '.reboot-badge' }, stops: [
      T('cpumem-hero', ['Your processor and memory', 'Read from your hardware. Model, cores and each memory stick are listed beside the drawing.'], ['Prosessori ja muisti', 'Luettu laitteistostasi. Malli, ytimet ja jokainen muistikampa näkyvät piirroksen vieressä.']),
      T('cpumem-tweaks', ['Tweaks for this part', 'Each card explains what it changes. Memory tweaks matter most on PCs with less than 16 GB.'], ['Tämän osan säädöt', 'Jokainen kortti kertoo, mitä se muuttaa. Muistisäädöt ovat tärkeimpiä alle 16 Gt:n koneilla.']),
      T('cpumem-reboot', ['Needs a restart', 'This badge means the change takes effect after the next restart.'], ['Vaatii uudelleenkäynnistyksen', 'Tämä merkki kertoo, että muutos tulee voimaan seuraavan uudelleenkäynnistyksen jälkeen.']),
    ] },
    gpu: { v: 1, tag: { 'gpu-hero': '#gpu-twin-slot', 'gpu-vendor': '.section-card[data-sec-id]', 'gpu-power': '#gpu-power-limit' }, stops: [
      T('gpu-hero', ['Your graphics card', 'Detected from your system. Nothing here changes until you apply a card.'], ['Näytönohjaimesi', 'Tunnistettu järjestelmästäsi. Mikään ei muutu ennen kuin otat kortin käyttöön.']),
      T('gpu-vendor', ['Settings for your vendor', 'We show the tweaks that fit your GPU maker and hide the rest.'], ['Valmistajasi asetukset', 'Näytämme näytönohjaimesi valmistajalle sopivat säädöt ja piilotamme muut.']),
      T('gpu-power', ['Power limit, with care', 'Lowering it runs cooler; raising it only helps if your cooling can keep up. Reset returns the default.'], ['Virtaraja varoen', 'Alentaminen viilentää; nostaminen auttaa vain, jos jäähdytys pysyy mukana. Nollaus palauttaa oletuksen.']),
    ] },
    power: { v: 1, tag: { 'power-storage': '#storage-twin-slot', 'power-tweaks': '.section-card[data-sec-id]' }, stops: [
      T('power-storage', ['Drives and power plan', 'Your drives and the active power plan, as Windows reports them.'], ['Asemat ja virrankäyttösuunnitelma', 'Asemasi ja aktiivinen virrankäyttösuunnitelma Windowsin ilmoittamana.']),
      T('power-tweaks', ['Power tweaks', 'On a laptop we take extra care with these, so battery life is not given up by accident.'], ['Virtasäädöt', 'Kannettavalla olemme näiden kanssa erityisen varovaisia, jotta akunkesto ei kärsi vahingossa.']),
    ] },
    network: { v: 1, tag: { 'network-scene': '#net-stage', 'network-test': '#ping-run-btn', 'network-tweaks': '.tweak-card-grid' }, stops: [
      T('network-scene', ['Your connection', 'Your adapter and live traffic. Wi-Fi and Ethernet are treated differently.'], ['Yhteytesi', 'Verkkosovittimesi ja reaaliaikainen liikenne. Wi-Fiä ja Ethernetiä kohdellaan eri tavoin.']),
      T('network-test', ['Test before you tune', 'Run the ping test to see latency and bufferbloat first, then compare after changes.'], ['Testaa ennen viritystä', 'Aja ping-testi nähdäksesi viiveen ja puskuroinnin ensin ja vertaa muutosten jälkeen.']),
      T('network-tweaks', ['Adapter and DNS tweaks', 'Each card can be undone. DNS changes are the gentlest place to start.'], ['Sovittimen ja DNS:n säädöt', 'Jokaisen kortin voi perua. DNS-muutokset ovat lempein aloituspaikka.']),
    ] },
    fixes: { v: 1, tag: { 'fixes-search': '#fix-search-input', 'fixes-list': '.fix-card' }, stops: [
      T('fixes-search', ['Describe the problem', 'Search the fixes by what you are seeing, such as slow updates or a broken search.'], ['Kuvaile ongelma', 'Hae korjauksia näkemäsi perusteella, esimerkiksi hitaat päivitykset tai rikkinäinen haku.']),
      T('fixes-list', ['Repairs, one at a time', 'Fixes such as SFC and DISM repair Windows files. They can take several minutes; you can keep using the PC meanwhile.'], ['Korjaukset yksi kerrallaan', 'Korjaukset, kuten SFC ja DISM, korjaavat Windowsin tiedostoja. Ne voivat kestää useita minuutteja; konetta voi käyttää sillä aikaa.']),
    ] },
    pulse: { v: 1, tag: { 'pulse-hero': '#pulse-hero', 'pulse-score': '#pulse-score-row', 'pulse-session': '#gw-session-strip' }, stops: [
      T('pulse-hero', ['Pulse is a gaming mode', 'Pick a preset and Pulse tunes timers and cores for your session, then restores everything when it ends.'], ['Pulse on pelitila', 'Valitse esiasetus, ja Pulse virittää ajastimet ja ytimet istuntoa varten ja palauttaa kaiken lopuksi.']),
      T('pulse-session', ['Your session', 'While a game runs we show what Pulse is doing right now.'], ['Istuntosi', 'Pelin ollessa käynnissä näytämme, mitä Pulse tekee juuri nyt.']),
      T('pulse-score', ['Before and after', 'The score compares your session with the state before Pulse.'], ['Ennen ja jälkeen', 'Pisteet vertaavat istuntoasi tilaan ennen Pulsea.']),
    ] },
    games: { v: 1, tag: { 'games-carousel': '#game-row', 'games-profile': '.tweak-card' }, stops: [
      T('games-carousel', ['Your games', 'Games we found on this PC. Choose one to open its profile.'], ['Pelisi', 'Koneelta löytyneet pelit. Valitse peli avataksesi sen profiilin.']),
      T('games-profile', ['A profile per game', 'Each profile holds the tweaks for that game and can be undone on its own.'], ['Profiili jokaiselle pelille', 'Jokainen profiili sisältää kyseisen pelin säädöt, ja sen voi perua erikseen.']),
    ] },
    apps: { v: 1, tag: { 'apps-hero': '.ao-hero', 'apps-list': '.ao-card' }, stops: [
      T('apps-hero', ['Tuning for your apps', 'Optimize all applies the recommended changes for the apps we detected.'], ['Sovellusten viritys', 'Optimoi kaikki ottaa käyttöön suositellut muutokset tunnistetuille sovelluksille.']),
      T('apps-list', ['Apps and priority', 'Each app shows what will change, including process priority, before you apply it.'], ['Sovellukset ja prioriteetti', 'Jokainen sovellus näyttää, mitä muuttuu, myös prosessin prioriteetti, ennen käyttöönottoa.']),
    ] },
    fivem: { v: 1, tag: { 'fivem-score': '#fivem-opti-ring', 'fivem-tweaks': '.tweak-card-grid' }, stops: [
      T('fivem-score', ['FiveM at a glance', 'How many FiveM and GTA V tweaks are applied, and the current tier.'], ['FiveM yhdellä silmäyksellä', 'Kuinka monta FiveM- ja GTA V -säätöä on käytössä, ja nykyinen taso.']),
      T('fivem-tweaks', ['Cache and tweaks', 'Cache cleanup and settings for FiveM. Run them in the order shown.'], ['Välimuisti ja säädöt', 'FiveM:n välimuistin siivous ja asetukset. Aja ne esitetyssä järjestyksessä.']),
    ] },
    latency: { v: 1, tag: { 'latency-graph': '.j-lat-canvas', 'latency-spikes': '#dpc-spike-log', 'latency-drivers': '.j-lat-fixes' }, stops: [
      T('latency-graph', ['DPC and ISR time', 'Driver work that delays your game. Lower and steadier is better.'], ['DPC- ja ISR-aika', 'Ajurityö, joka viivästyttää peliäsi. Pienempi ja tasaisempi on parempi.']),
      T('latency-spikes', ['Spike log', 'Spikes are recorded here so you can see which driver caused them.'], ['Piikkiloki', 'Piikit tallentuvat tänne, jotta näet, mikä ajuri ne aiheutti.']),
      T('latency-drivers', ['What usually helps', 'Common causes and fixes for stutter, in order of effort.'], ['Mikä yleensä auttaa', 'Nykimisen yleisimmät syyt ja korjaukset vaivan mukaan järjestettynä.']),
    ] },
    replay: { v: 1, tag: { 'replay-timeline': '#replay-list', 'replay-compare': '#replay-detail' }, stops: [
      T('replay-timeline', ['Past sessions', 'Each gaming session is saved here. Choose one to look back at it.'], ['Aiemmat istunnot', 'Jokainen pelisessio tallentuu tänne. Valitse yksi katsoaksesi sitä.']),
      T('replay-compare', ['Look at one session', 'Scrub through frame rate, temperatures and load, and read what we noticed.'], ['Tarkastele yhtä istuntoa', 'Selaa kuvataajuutta, lämpötiloja ja kuormaa, ja lue havaintomme.']),
    ] },
    cleanup: { v: 1, tag: { 'cleanup-hero': '.cleanup-hero-card', 'cleanup-categories': '.cleanup-main-col' }, stops: [
      T('cleanup-hero', ['How much can go', 'An estimate of what cleaning would free. Nothing is deleted until you start.'], ['Kuinka paljon voi poistua', 'Arvio siitä, kuinka paljon siivous vapauttaisi. Mitään ei poisteta ennen kuin aloitat.']),
      T('cleanup-categories', ['Choose what to clean', 'Pick categories, then clean. Temporary files and caches only; your documents are never touched.'], ['Valitse siivottava', 'Valitse luokat ja siivoa. Vain väliaikaistiedostoja ja välimuisteja; asiakirjoihisi ei koskaan kosketa.']),
    ] },
    debloat: { v: 1, tag: { 'debloat-list': '.bloat-tier-hero', 'debloat-shield': '#uwp-keep-xbox-store' }, stops: [
      T('debloat-list', ['Apps Windows added', 'The list of pre-installed apps and how lean your Windows is today.'], ['Windowsin lisäämät sovellukset', 'Esiasennetut sovellukset ja se, kuinka kevyt Windowsisi on nyt.']),
      T('debloat-shield', ['Keep Xbox and Store', 'On by default, so removing apps never breaks games or the Store.'], ['Säilytä Xbox ja Store', 'Oletuksena päällä, jotta sovellusten poisto ei riko pelejä tai kauppaa.']),
    ] },
    startup: { v: 1, tag: { 'startup-impact': '#startup-hero', 'startup-list': '#startup-list', 'startup-search': '#startup-search-wrap' }, stops: [
      T('startup-impact', ['Startup impact', 'How much your startup items slow down boot, in one number.'], ['Käynnistyksen vaikutus', 'Kuinka paljon käynnistyskohteet hidastavat käynnistystä, yhtenä lukuna.']),
      T('startup-search', ['Find an item', 'Search by name. Items we recommend turning off are marked.'], ['Etsi kohde', 'Hae nimellä. Suosittelemamme pois kytkettävät kohteet on merkitty.']),
      T('startup-list', ['Switch items off', 'Turn an item off with its toggle. It stays installed and can be turned on again.'], ['Kytke kohteita pois', 'Kytke kohde pois sen kytkimestä. Se pysyy asennettuna ja sen voi kytkeä takaisin.']),
    ] },
    diagnostics: { v: 1, stops: [
      T('diagnostics-scan', ['Start with a scan', 'The scan reads your system and does not change anything. It takes about a minute.'], ['Aloita tarkistuksella', 'Tarkistus lukee järjestelmän eikä muuta mitään. Siihen menee noin minuutti.']),
      T('diagnostics-results', ['Score and recommendations', 'Your safety score and what we found appear here, with the tweaks already active on your system.'], ['Pisteet ja suositukset', 'Turvapisteet ja löydökset näkyvät tässä, samoin jo käytössä olevat säädöt.']),
      T('diagnostics-drivers', ['Drivers', 'Check for outdated drivers. We only list them; installing is up to you.'], ['Ajurit', 'Tarkista vanhentuneet ajurit. Listaamme ne vain; asennus on sinun päätettävissäsi.']),
    ] },
    processes: { v: 1, tag: { 'processes-hogs': '#pf-hog-cards', 'processes-list': '#proc-table', 'processes-filter': '#proc-filter' }, stops: [
      T('processes-hogs', ['Heavy hitters', 'Processes using unusual amounts of CPU or memory right now.'], ['Raskaat prosessit', 'Prosessit, jotka käyttävät juuri nyt poikkeuksellisen paljon suoritinta tai muistia.']),
      T('processes-filter', ['Find a process', 'Filter by name. Priority can be changed per process from its row.'], ['Etsi prosessi', 'Suodata nimellä. Prioriteetin voi muuttaa prosessin riviltä.']),
      T('processes-list', ['Take care here', 'Ending a system process can make Windows unstable. If you are unsure, leave it alone.'], ['Varovaisuutta', 'Järjestelmäprosessin lopettaminen voi tehdä Windowsista epävakaan. Jos olet epävarma, jätä se rauhaan.']),
    ] },
    bios: { v: 1, tag: { 'bios-board': '.bw-strip', 'bios-scan': '#bw-grid' }, stops: [
      T('bios-board', ['Your board and BIOS', 'What your motherboard and firmware report, and which engine reads it.'], ['Emolevysi ja BIOS', 'Mitä emolevysi ja laiteohjelmistosi ilmoittavat ja mikä moottori niitä lukee.']),
      T('bios-scan', ['Every setting, with its risk', 'Pick a new value to stage it. Writing to the BIOS stays locked until an engine is proven on real hardware.'], ['Jokainen asetus riskeineen', 'Valitse uusi arvo valmistellaksesi sen. BIOSiin kirjoitus pysyy lukittuna, kunnes moottori on todistettu oikealla laitteella.']),
    ] },
    scheduler: { v: 1, tag: { 'scheduler-create': '#sched-action', 'scheduler-tasks': '#sched-task-list' }, stops: [
      T('scheduler-create', ['Schedule a task', 'Pick what to run and when, such as a cleanup every Sunday.'], ['Ajasta tehtävä', 'Valitse mitä ajetaan ja milloin, esimerkiksi siivous joka sunnuntai.']),
      T('scheduler-tasks', ['Your tasks', 'Scheduled tasks are listed here and can be removed at any time.'], ['Tehtäväsi', 'Ajastetut tehtävät näkyvät tässä, ja ne voi poistaa milloin tahansa.']),
    ] },
    restore: { v: 1, tag: { 'restore-create': '#rp-desc', 'restore-list': '#rp-table-wrap' }, stops: [
      T('restore-create', ['Create a restore point', 'A snapshot of Windows you can return to. Windows allows one per day.'], ['Luo palautuspiste', 'Tilannevedos Windowsista, johon voit palata. Windows sallii yhden päivässä.']),
      T('restore-list', ['Roll back', 'Choose a point and restore it if something goes wrong. Your files stay as they are.'], ['Palaa takaisin', 'Valitse piste ja palauta se, jos jokin menee pieleen. Tiedostosi pysyvät ennallaan.']),
    ] },
    history: { v: 1, tag: { 'history-journal': '#journal-box', 'history-list': '#changelog-list' }, stops: [
      T('history-journal', ['Everything we changed', 'A journal of every change, with the option to undo it.'], ['Kaikki muuttamamme', 'Loki jokaisesta muutoksesta, ja mahdollisuus perua se.']),
      T('history-list', ['Applied tweaks', 'The list of tweaks currently applied, newest first.'], ['Käytössä olevat säädöt', 'Tällä hetkellä käytössä olevat säädöt, uusin ensin.']),
    ] },
    settings: { v: 1, stops: [
      T('settings-general', ['Sounds and startup', 'Quiet chimes, advanced mode and when the app starts are all here.'], ['Äänet ja käynnistys', 'Hiljaiset äänet, edistynyt tila ja sovelluksen käynnistys löytyvät täältä.']),
      T('settings-appearance', ['Make it yours', 'Accent colour, light or dark, motion and how much 3D you would like.'], ['Tee siitä omasi', 'Korostusväri, vaalea tai tumma, liike ja 3D:n määrä.']),
      T('settings-tours', ['Tours and welcome', 'Turn guided tours off, show them again, or run the welcome from the beginning.'], ['Kierrokset ja tervetulo', 'Poista opastetut kierrokset käytöstä, näytä ne uudelleen tai aja tervetulo alusta.']),
    ] },
    prolock: { v: 2, stops: [
      T('prolock-card', ['This page is part of Premium', 'The rest of the app is fully yours. Premium adds this page and the advanced controls behind it, and one purchase covers all of them.'], ['Tämä sivu kuuluu Premiumiin', 'Muu sovellus on täysin käytössäsi. Premium lisää tämän sivun ja sen taakse jäävät edistyneet säätimet, ja yksi ostos kattaa ne kaikki.']),
      T('prolock-cta', ['When you are ready', 'This opens the store in your browser. Nothing is purchased here.'], ['Kun olet valmis', 'Tämä avaa kaupan selaimessa. Mitään ei osteta täällä.']),
    ] },
  }
})(typeof window !== 'undefined' ? window : globalThis)
