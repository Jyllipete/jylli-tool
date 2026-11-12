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
      T('home-ring', ['The Jylli Index', 'Three bands: health, tuning and protection. Click one to see exactly what the number is made of. Anything that could not be measured is left out, never guessed.'], ['Jylli-indeksi', 'Kolme kaistaa: terveys, viritys ja suojaus. Napsauta yhtä nähdäksesi tarkasti, mistä luku koostuu. Mitä ei voitu mitata, jätetään pois eikä arvata.']),
      T('home-rig', ['Your machine, drawn from your hardware', 'Hover a part to see what it is doing right now. Nothing here changes your system.'], ['Koneesi laitteistosi mukaan', 'Vie osan päälle nähdäksesi, mitä se tekee juuri nyt. Tämä näkymä ei muuta järjestelmää.']),
      T('home-moves', ['Your next best move', 'One recommendation, picked from what is really going on with this PC. Nothing is applied until you press the button, and each change can be undone.'], ['Paras seuraava siirtosi', 'Yksi suositus, valittu sen perusteella mitä koneella oikeasti tapahtuu. Mitään ei oteta käyttöön ennen kuin painat nappia, ja jokaisen muutoksen voi kumota.']),
    ] },
    windows: { v: 2, stops: [
      T('windows-search', ['Find a switch', 'Search by name or effect, or filter to what is recommended, set, or was put back by Windows.'], ['Etsi säädin', 'Hae nimellä tai vaikutuksella, tai suodata suositeltuihin, asetettuihin tai Windowsin palauttamiin.']),
      T('tweak-card', ['Reading a row', 'The glyph is the live state, read from Windows. The switch changes it, and the row confirms what Windows really says afterwards. Open a row to see exactly which settings it touches.'], ['Rivin lukeminen', 'Kuvake on todellinen tila, luettu Windowsista. Kytkin muuttaa sitä, ja rivi vahvistaa jälkeenpäin mitä Windows oikeasti sanoo. Avaa rivi nähdäksesi tarkasti mitä asetuksia se koskee.']),
      T('windows-undo', ['Every change can be undone', 'This undoes your last batch of changes in one step. The History view lists every change with its own undo.'], ['Jokaisen muutoksen voi perua', 'Tämä perii viimeisimmän muutoserän yhdellä askeleella. Historia-näkymä listaa jokaisen muutoksen omalla peruutuksellaan.']),
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
    network: { v: 2, tag: { 'network-stage': '[data-tour="net-stage"]', 'network-checkup': '[data-tour="net-checkup"]', 'network-views': '[data-tour="net-views"]' }, stops: [
      T('network-stage', ['Your connection, drawn as a path', 'This PC, the link, your router, your ISP and the internet, each with the latency it measured. A red node is where the problem is.'], ['Yhteytesi reittinä', 'Tämä kone, yhteys, reitittimesi, operaattorisi ja internet, kukin mitatun viiveensä kanssa. Punainen kohta on se, missä ongelma on.']),
      T('network-checkup', ['Run a checkup', 'One click traces the route, times your DNS and reads your settings. You get a short list of what is wrong, each with a fix.'], ['Aja tarkistus', 'Yksi napsautus jäljittää reitin, mittaa DNS:n nopeuden ja lukee asetuksesi. Saat lyhyen listan siitä, mikä on vialla, ja korjauksen kullekin.']),
      T('network-views', ['Tune, Measure, History', 'Tune holds the DNS resolver and adapter settings, Measure the speed test and a live trace, History every change with undo.'], ['Säädöt, Mittaa, Historia', 'Säädöt sisältää DNS-resolverin ja sovittimen asetukset, Mittaa nopeustestin ja reaaliaikaisen jäljityksen, Historia jokaisen muutoksen peruutusmahdollisuuden kanssa.']),
    ] },
    fixes: { v: 1, tag: { 'fixes-search': '#fix-search-input', 'fixes-list': '.fix-card' }, stops: [
      T('fixes-search', ['Describe the problem', 'Search the fixes by what you are seeing, such as slow updates or a broken search.'], ['Kuvaile ongelma', 'Hae korjauksia näkemäsi perusteella, esimerkiksi hitaat päivitykset tai rikkinäinen haku.']),
      T('fixes-list', ['Repairs, one at a time', 'Fixes such as SFC and DISM repair Windows files. They can take several minutes; you can keep using the PC meanwhile.'], ['Korjaukset yksi kerrallaan', 'Korjaukset, kuten SFC ja DISM, korjaavat Windowsin tiedostoja. Ne voivat kestää useita minuutteja; konetta voi käyttää sillä aikaa.']),
    ] },
    pulse: { v: 2, tag: { 'pulse-hero': '#pulse-hero', 'pulse-river': '#pu-river', 'pulse-limiter': '#pu-limiter' }, stops: [
      T('pulse-hero', ['Pulse is a gaming mode', 'Pick a game and boost it. Pulse tunes timers and cores for the session, lists every step it took and restores everything when you end it.'], ['Pulse on pelitila', 'Valitse peli ja tehosta se. Pulse virittää ajastimet ja ytimet istuntoa varten, listaa jokaisen askeleensa ja palauttaa kaiken, kun lopetat.']),
      T('pulse-river', ['Every frame, measured', 'This river is the last minute of frame times. A hitch is marked with its likely cause. Hover to read a moment.'], ['Jokainen ruutu mitattuna', 'Tämä virta on viimeisen minuutin ruutuajat. Pätkiminen merkitään todennäköisellä syyllään. Vie hiiri päälle, niin näet hetken tiedot.']),
      T('pulse-limiter', ['What is holding you back', 'The Limiter says in one sentence what limits your FPS right now, with the numbers behind it.'], ['Mikä sinua hidastaa', 'Rajoittaja kertoo yhdellä lauseella, mikä rajoittaa FPS:ääsi juuri nyt, ja näyttää luvut sen takana.']),
    ] },
    games: { v: 1, tag: { 'games-carousel': '#game-row', 'games-profile': '.tweak-card' }, stops: [
      T('games-carousel', ['Your games', 'Games we found on this PC. Choose one to open its profile.'], ['Pelisi', 'Koneelta löytyneet pelit. Valitse peli avataksesi sen profiilin.']),
      T('games-profile', ['A profile per game', 'Each profile holds the tweaks for that game and can be undone on its own.'], ['Profiili jokaiselle pelille', 'Jokainen profiili sisältää kyseisen pelin säädöt, ja sen voi perua erikseen.']),
    ] },
    apps: { v: 1, tag: { 'apps-hero': '.ao-hero', 'apps-list': '.ao-card' }, stops: [
      T('apps-hero', ['Tuning for your apps', 'Optimize all applies the recommended changes for the apps we detected.'], ['Sovellusten viritys', 'Optimoi kaikki ottaa käyttöön suositellut muutokset tunnistetuille sovelluksille.']),
      T('apps-list', ['Apps and priority', 'Each app shows what will change, including process priority, before you apply it.'], ['Sovellukset ja prioriteetti', 'Jokainen sovellus näyttää, mitä muuttuu, myös prosessin prioriteetti, ennen käyttöönottoa.']),
    ] },
    fivem: { v: 2, tag: { 'fivem-servers': '.fv-rail', 'fivem-radar': '.fv-radar', 'fivem-views': '.fv-bar .j-seg' }, stops: [
      T('fivem-servers', ['Your servers', 'Add the server you play on with its cfx.re/join link or IP and port. The route to it is traced from here.'], ['Palvelimesi', 'Lisää palvelin, jolla pelaat, cfx.re/join-linkillä tai IP-osoitteella ja portilla. Reitti sinne jäljitetään tästä.']),
      T('fivem-radar', ['The route radar', 'Every router between this PC and the server, measured once a second. The verdict says where a problem starts, or that the path is clean.'], ['Reittitutka', 'Jokainen reititin tämän tietokoneen ja palvelimen välillä, mitattuna kerran sekunnissa. Tulos kertoo, mistä ongelma alkaa tai että reitti on puhdas.']),
      T('fivem-views', ['Sessions, graphics and more', 'Sessions names the cause of each hitch. Graphics and Client edit your real FiveM files with a backup and an undo. Crash lab reads your log.'], ['Istunnot, grafiikka ja muuta', 'Istunnot nimeää jokaisen nykäisyn syyn. Grafiikka ja Asiakasohjelma muokkaavat oikeita FiveM-tiedostojasi varmuuskopion ja kumoamisen kanssa. Kaatumislaboratorio lukee lokisi.']),
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
    cleanup: { v: 3, tag: { 'cleanup-hero': '.cu-stage', 'cleanup-categories': '.cu-lanes' }, stops: [
      T('cleanup-hero', ['How much can go', 'The ring is measured the moment you open the tab: what is safe to clear, what is worth a look, and how much of your drive it is. Nothing is deleted until you press Clean.'], ['Kuinka paljon voi poistua', 'Rengas mitataan heti, kun avaat välilehden: mikä on turvallista poistaa, mikä kannattaa katsoa ja kuinka suuri osa levystäsi se on. Mitään ei poisteta ennen kuin painat Siivoa.']),
      T('cleanup-categories', ['Three lanes, one rule', 'Safe items are ticked and rebuild by themselves. Worth a look costs a slower first launch. Permanent items can never be undone, so each needs a long press. Files that look like yours are always kept.'], ['Kolme kaistaa, yksi sääntö', 'Turvalliset on valittu ja rakentuvat itsestään uudelleen. Katsomisen arvoiset hidastavat ensimmäistä käynnistystä. Pysyviä ei voi perua, joten jokainen vaatii pitkän painalluksen. Omilta näyttävät tiedostot jätetään aina rauhaan.']),
    ] },
    debloat: { v: 2, tag: { 'debloat-list': '.db-stage', 'debloat-for': '.db-intents', 'debloat-shield': '#db-protect' }, stops: [
      T('debloat-list', ['What Windows added', 'Apps, services, background tasks and ads on this PC, measured. Everything in Safe to remove is ticked; Remove only works while you hold the button.'], ['Mitä Windows lisäsi', 'Tämän koneen sovellukset, palvelut, taustatehtävät ja mainokset mitattuina. Turvallista poistaa -kohdat on valittu; poisto toimii vain painiketta pitämällä.']),
      T('debloat-for', ['Tell it what this PC is for', 'Printer, Bluetooth and Xbox are detected. Change a chip and the lists update at once, so things you use stay in Kept.'], ['Kerro, mihin tätä konetta käytetään', 'Tulostin, Bluetooth ja Xbox tunnistetaan. Muuta valintaa, niin listat päivittyvät heti ja käyttämäsi pysyy Säilytetään-listalla.']),
      T('debloat-shield', ['Keep Xbox and Store', 'On by default, so removing apps never breaks games or the Store.'], ['Säilytä Xbox ja Store', 'Oletuksena päällä, jotta sovellusten poisto ei riko pelejä tai kauppaa.']),
    ] },
    startup: { v: 1, tag: { 'startup-impact': '#startup-hero', 'startup-list': '#startup-list', 'startup-search': '#startup-search-wrap' }, stops: [
      T('startup-impact', ['Startup impact', 'How much your startup items slow down boot, in one number.'], ['Käynnistyksen vaikutus', 'Kuinka paljon käynnistyskohteet hidastavat käynnistystä, yhtenä lukuna.']),
      T('startup-search', ['Find an item', 'Search by name. Use Recommended in the header to turn off the items that cost the most.'], ['Etsi kohde', 'Hae nimellä. Käytä otsikon Suositellut-toimintoa kytkeäksesi pois eniten kuluttavat kohteet.']),
      T('startup-list', ['Switch items off', 'Turn an item off with its toggle. It stays installed and can be turned on again.'], ['Kytke kohteita pois', 'Kytke kohde pois sen kytkimestä. Se pysyy asennettuna ja sen voi kytkeä takaisin.']),
    ] },
    diagnostics: { v: 2, stops: [
      T('diagnostics-scan', ['Run a checkup', 'A quick checkup reads your system and changes nothing. A deep one also verifies Windows files and tests thermals and memory.'], ['Aja tarkistus', 'Nopea tarkistus lukee järjestelmän eikä muuta mitään. Syvä tarkistus varmistaa myös Windowsin tiedostot ja testaa lämpötilat ja muistin.']),
      T('diagnostics-results', ['Findings with evidence', 'Every problem shows what was measured and where it came from, and offers a fix or a shortcut to the right tab.'], ['Löydökset todisteineen', 'Jokaisesta ongelmasta näkyy, mitä mitattiin ja mistä tieto tuli, sekä korjaus tai oikotie oikealle välilehdelle.']),
      T('diagnostics-drivers', ['Drivers and devices', 'Devices with errors and outdated drivers. We only list them; installing is up to you.'], ['Ajurit ja laitteet', 'Virheelliset laitteet ja vanhentuneet ajurit. Listaamme ne vain; asennus on sinun päätettävissäsi.']),
    ] },
    processes: { v: 2, tag: { 'processes-hogs': '#pf-hog-cards', 'processes-list': '#proc-table', 'processes-filter': '#proc-filter' }, stops: [
      T('processes-hogs', ['Heavy hitters', 'Processes using unusual amounts of CPU or memory right now.'], ['Raskaat prosessit', 'Prosessit, jotka käyttävät juuri nyt poikkeuksellisen paljon suoritinta tai muistia.']),
      T('processes-filter', ['Find a process', 'Filter by name. Freeze a heavy process from the rail above, or end it from its row.'], ['Etsi prosessi', 'Suodata nimellä. Jäädytä raskas prosessi yllä olevasta palkista tai lopeta se sen riviltä.']),
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
    history: { v: 2, tag: { 'history-journal': '#journal-box', 'history-list': '#changelog-list' }, stops: [
      T('history-journal', ['Everything we changed', 'A journal of every change, with the option to undo it.'], ['Kaikki muuttamamme', 'Loki jokaisesta muutoksesta, ja mahdollisuus perua se.']),
      T('history-list', ['Every apply and restore', 'The plain event log of what was applied or restored, newest first.'], ['Jokainen käyttöönotto ja palautus', 'Selkeä tapahtumaloki siitä, mitä otettiin käyttöön tai palautettiin, uusin ensin.']),
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
