// Pulse "Flow" -tekstit (ryhmä `pulse2`). Avainperheet ja säännöt kuten pulse-en.js:ssä.
// Nimet kuten CPU, GPU, VRAM, RAM, FPS, V-Sync, MMCSS ja Game Shield pysyvät sellaisinaan kaikilla kielillä.
globalThis.LANG = globalThis.LANG || { en: {}, fi: {} }
LANG.fi.pulse2 = {
  // hero
  lead: 'Jokainen ruutu mitattuna. Pulse virittää koneen pelillesi, näyttää mikä sitä hidastaa ja säilyttää todisteet.',
  dial: 'Pulse-pisteet', statFps: 'FPS keskim.', statLow: '1 % alin', statRules: 'Säännöt päällä',
  ctaChoose: 'Valitse peli', ctaBoost: 'Tehosta: {game}', ctaEnd: 'Lopeta tehostus', ctaWorking: 'Työstetään…', openCockpit: 'Avaa ohjaamo',
  stReady: 'Valmis', stBoosted: 'Tehostettu · {game}', stBoostedIdle: 'Tehostettu · odottaa peliä', stPlaying: 'Pelissä · {game}', stWait: 'Odotetaan peliä',
  part_smooth: 'Tasaisuus', part_stable: 'Vakaus', part_thermal: 'Lämpövara', part_boost: 'Tehostusvaiheet',
  seg_live: 'Suora', seg_sessions: 'Istunnot', seg_rules: 'Säännöt', seg_preflight: 'Ennakkotarkistus',
  boostFail: 'Tehostusta ei voitu aloittaa', endFail: 'Tehostusta ei voitu lopettaa', marked: 'Hetki merkitty',
  sessionSaved: 'Istunto tallennettu', sessionSavedWhy: '{game} on tallennettu pätkimisineen ja syineen.', openDebrief: 'Avaa yhteenveto',

  // river, fps, vitals
  mark: 'Merkitse hetki', hud: 'HUD', riverAria: 'Ruutuaika viimeisen minuutin ajalta. Jokainen pätkiminen on merkitty todennäköisimmällä syyllään.', riverHint: 'Virta täyttyy heti, kun peli piirtää ruutuja.',
  tip: '{ago} s sitten · {med} ms ({fps} FPS) · hitain {worst} ms', tipSession: '{at} · {fps} FPS · hitain {worst} ms',
  fps_avg: 'FPS keskim.', fps_low1: '1 % alin', fps_low01: '0,1 % alin', fps_p99: '99. pros.', fps_smooth: 'Tasaisuus', fps_hitches: 'Pätkimiset', fps_length: 'Kesto',
  tip_avg: 'FPS keskimäärin viimeisten sekuntien aikana.', tip_low1: 'Hitaimman 1 %:n ruutujen keskimääräinen FPS.', tip_low01: 'Hitaimman 0,1 %:n ruutujen keskimääräinen FPS.',
  tip_p99: 'Ruutuaika, jonka 99 % ruuduista alittaa, millisekunteina.', tip_smooth: 'Kuinka tasaisesti ruudut saapuvat, 0–100. Tasaisempi on korkeampi.',
  notMeasured: 'Ei mitattu', srcSensor: 'Anturit', srcNvidia: 'nvidia-smi', srcOs: 'Windows', srcPulse: 'Pulse',
  vt_cpu: 'CPU', vt_gpu: 'GPU', vt_gpuClock: 'GPU:n kello', vt_vram: 'VRAM', vt_ram: 'RAM', vt_net: 'Verkko',

  // limiter
  limiter: 'Rajoittaja',
  lim_idle: 'Odotetaan ruutuja', limw_idle: 'Käynnistä peli, niin Pulse lukee jokaisen piirretyn ruudun.',
  lim_thermal: 'Lämpö hidastaa sinua', limw_thermal: 'CPU {cpuTemp}° · GPU {gpuTemp}°. Siru hidastaa itseään jäähtyäkseen.',
  lim_vram: 'Näytönohjaimen muisti on täynnä', limw_vram: '{usedMB} / {totalMB} MB käytössä. Laske tekstuurien laatua tai resoluutiota.',
  lim_ram: 'Muisti on lähes täynnä', limw_ram: 'RAM on {ram} %:ssa. Windows alkaa vaihtaa levylle, mikä näkyy pätkimisenä.',
  lim_background: 'Taustasovellus kilpailee kanssasi', limw_background: 'Se käyttää {bg} % suorittimesta pelatessasi.',
  lim_gpu: 'GPU rajoittaa', limw_gpu: 'GPU {gpu} %, CPU {cpu} %. Näytönohjain on raja, mikä on terveellisin tapa olla rajoitettu.',
  lim_cpu: 'CPU rajoittaa', limw_cpu: 'CPU {cpu} %, GPU {gpu} %. Suoritin ei ehdi valmistella ruutuja riittävän nopeasti.',
  lim_clock: 'GPU:n kello laski', limw_clock: 'Käy {mhz} MHz:llä, aiemmin {baseMhz} MHz.',
  lim_capped: 'Ruudunnopeus on rajattu', limw_capped: 'Ruudut saapuvat tasaisesti {capHz} FPS:llä, joten rajoitin tai V-Sync on raja.',
  lim_balanced: 'Tasapainossa', limw_balanced: 'Mikään ei ole täysillä (GPU {gpu} %, CPU {cpu} %). Varaa on.',
  sug_thermal: 'Suorita lämpötarkastus', sug_gameshield: 'Avaa Game Shield', sug_boost: 'Tehosta tämä peli',

  hitLog: 'Viimeisimmät pätkimiset', hitNone: 'Ei pätkimisiä viimeisen minuutin aikana.', hitAgo: '{n} s sitten',

  // picker, receipt
  pickTitle: 'Peli', killBg: 'Sulje taustasovellukset', receiptTitle: 'Tehostuskuitti', receiptIdle: 'Mitään ei ole vielä muutettu. Tehostus listaa jokaisen askeleensa, ja jokainen peruutetaan, kun lopetat sen.',
  step_timer: 'Ajastimen tarkkuus 0,5 ms', step_parking: 'CPU-ytimien parkitus pois', step_power: 'Virrankäyttösuunnitelma', step_mmcss: 'Pelien ajoitus (MMCSS)', step_affinity: 'GPU:n ja verkon keskeytykset',
  step_kill: 'Taustasovellukset', step_priority: 'Pelin prioriteetti', step_deprio: 'Taustan prioriteetti',
  fixMouse: 'Hiiri tuntuu oudolta? Nollaa keskeytysten reititys', fixMouseDone: 'Keskeytysten reititys nollattu', fixMouseFail: 'Reitityksen nollaus ei onnistunut',
  stepState_ok: 'Valmis', stepState_fail: 'Epäonnistui', stepState_run: 'Käynnissä', stepState_skip: 'Ohitettu', stepState_idle: 'Ei ajettu',

  // sessions and debrief
  noSessions: 'Ei istuntoja vielä', noSessionsWhy: 'Pelaa Pulse auki. Kun peli sulkeutuu, istunto ilmestyy tänne pätkimisineen, syineen ja pisteineen.', back: 'Takaisin istuntoihin',
  verdict_clean: 'Puhdas',
  cause_thermal: 'Lämpö', 'cause_vram-full': 'Näytönohjaimen muisti täynnä', 'cause_ram-pressure': 'Vähän vapaata RAM-muistia', 'cause_background-spike': 'Taustasovellus kuormittaa', 'cause_gpu-bound': 'GPU rajallaan', 'cause_cpu-bound': 'CPU rajallaan', 'cause_clock-drop': 'GPU:n kello laski', cause_unknown: 'Tuntematon',
  ago_now: 'juuri nyt', ago_min: '{n} min sitten', ago_hour: '{n} h sitten', ago_day: '{n} pv sitten',
  deb_clean: 'Puhdas istunto', deb_cleanWhy: 'Yksikään ruutu ei jäänyt jumiin niin pitkäksi aikaa, että se laskettaisiin pätkimiseksi.', deb_cause: 'Pätkimisten pääsyy: {cause}', deb_hitches: '{n} pätkimistä, kukin sidottu siihen, mitä kone teki sillä sekunnilla.',
  deb_noCauses: 'Ei selitettäviä pätkimisiä.', deb_beforeAfter: 'Ennen ja jälkeen tehostuksen', deb_vsLast: 'Edelliseen istuntoon verrattuna', deb_score: 'Pulse-pisteet', deb_hitchesLabel: 'Pätkimiset', deb_marks: 'Merkitsemäsi hetket', deb_causes: 'Mikä pätkimiset aiheutti', deb_parts: 'Mistä pisteet muodostuvat',
  deb_boost: 'Tehostusvaiheita tehty: {ok} / {total}.', deb_noBoost: 'Tämä istunto pelattiin ilman Pulse-tehostusta.',
  ba_cpu: 'CPU-kuorma', ba_gpu: 'GPU-kuorma', ba_ram: 'RAM käytössä', ba_cpuTemp: 'CPU:n lämpötila', ba_before: 'Ennen', ba_during: 'Pelin aikana', ba_note: 'Ennen on kone hetkellä, jolloin aloitit tehostuksen; pelin aikana on istunnon keskikohta.',

  // pre-flight
  pfTitle: 'Ennakkotarkistus', pfLead: 'Nopea katsaus koneeseen ennen peliä. Mitä ei voida lukea, näytetään ei mitattuna, ei koskaan kunnossa olevana.', pfRun: 'Tarkista uudelleen', pfRunning: 'Tarkistetaan konetta…', pfFailed: 'Tarkistus ei onnistunut',
  pf_thermal: 'Lämpötila', pf_ram: 'Muisti', pf_background: 'Taustakuorma', pf_updates: 'Windows Update', pf_power: 'Virrankäyttösuunnitelma', pf_reboot: 'Odottava uudelleenkäynnistys',
  pfw_thermal_ok: 'CPU on {cpuTemp}°, lämpövaraa riittää.', pfw_thermal_warn: 'CPU on jo {cpuTemp}° ennen aloitusta.', pfw_thermal_bad: 'CPU on {cpuTemp}°. Odota rajoittumista pitkässä istunnossa.', pfw_thermal_unknown: 'Lämpötila-anturia ei voitu lukea.',
  pfw_ram_ok: 'RAM on {ram} %:ssa.', pfw_ram_warn: 'RAM on {ram} %:ssa. Pelille jää vähemmän tilaa.', pfw_ram_bad: 'RAM on {ram} %:ssa. Peli joutuu kilpailemaan muistista.', pfw_ram_unknown: 'Muistin käyttöä ei voitu lukea.',
  pfw_background_ok: 'Kuormittavin sovellus, {name}, käyttää {cpu} % suorittimesta.', pfw_background_warn: '{name} käyttää {cpu} % suorittimesta.', pfw_background_bad: '{name} käyttää {cpu} % suorittimesta ja kilpailee pelin kanssa.', pfw_background_unknown: 'Sovelluskohtaista kuormaa ei voitu lukea.',
  pfw_updates_ok: 'Windows Update ei työskentele taustalla.', pfw_updates_warn: 'Windows Update on kiireinen ja voi kuormittaa levyä ja suoritinta kesken pelin.', pfw_updates_unknown: 'Päivitysaktiivisuutta ei voitu lukea.',
  pfw_power_ok: 'Korkean suorituskyvyn virrankäyttösuunnitelma on käytössä.', pfw_power_warn: 'Käytössä on suunnitelma {plan}. Tehostus vaihtaa nopeampaan.', pfw_power_unknown: 'Virrankäyttösuunnitelmaa ei voitu lukea.',
  pfw_reboot_ok: 'Uudelleenkäynnistystä ei odoteta.', pfw_reboot_warn: 'Windows odottaa uudelleenkäynnistystä. Se voi käynnistyä huonoon aikaan.', pfw_reboot_unknown: 'Uudelleenkäynnistyksen tilaa ei voitu lukea.',
  pfFix_gameshield: 'Avaa Game Shield', pfFix_updateguard: 'Avaa Update Guard', pfFix_boost: 'Siirry tehostukseen',

  // rules, window prefs
  hudTitle: 'Pelinaikainen HUD ja ikkuna', hudWhy: 'HUD leijuu pelisi päällä, ei ota klikkauksia vastaan ja katoaa yhdellä näppäimellä.',
  hudLayout: 'HUD:n asettelu', hudCorner: 'HUD:n kulma', hudOpacity: 'HUD:n läpinäkyvyys', layout_minimal: 'Minimaalinen', layout_standard: 'Vakio', layout_full: 'Täysi',
  corner_tl: 'Ylävasen', corner_tr: 'Yläoikea', corner_bl: 'Alavasen', corner_br: 'Alaoikea',
  pinCockpit: 'Pidä ohjaamo päällimmäisenä', pinWhy: 'Kätevä toisella näytöllä.', pinOn: 'Päällimmäisenä', hotkeys: 'Pikanäppäimet', hotkeysWhy: 'Käytössä vain, kun HUD, ohjaamo tai tehostus on auki. Käytä Ctrl-, Alt- tai Shift-näppäintä ja kirjainta, numeroa tai F-näppäintä.',
  keyHud: 'Näytä tai piilota HUD', keyMark: 'Merkitse hetki',

  // cockpit
  ck_hud: 'Näytä tai piilota HUD', ck_min: 'Pienennä', ck_close: 'Sulje', ck_keepAsk: 'Tehostus on käynnissä. Jatketaanko sitä ohjaamon sulkemisen jälkeen?', ck_keepYes: 'Jatka', ck_keepNo: 'Lopeta tehostus ja sulje', ck_keepCancel: 'Peruuta',
  ck_game: 'Peli', ck_low1: '1 % alin {n}', ck_score: 'Pulse-pisteet {n}',
  ck_cores: 'Ytimien kuorma', ck_core: 'Ydin {n}: {v} %', ck_coresN: '{n} loogista suoritinta, päivittyy 3 sekunnin välein.',
  ck_thermal: 'Lämpötarkastus', ck_auditRun: 'Suorita tarkastus', ck_auditWhy: 'Mittaa suorittimen noin viiden sekunnin ajan ja kertoo, rajoittuuko se ja miksi. Totuudenmukaisin tulos saadaan kuormituksen alla.',
  ck_auditRunning: 'Mitataan… {n} / {of}', ck_auditFail: 'Tarkastus ei onnistunut. Se tarvitsee anturipalvelun.',
  ck_sev_none: 'Ei rajoittumista', ck_sev_light: 'Lievä', ck_sev_moderate: 'Kohtalainen', ck_sev_heavy: 'Voimakas',
  ck_cause_thermal: 'Lämpö', ck_cause_powerLimit: 'Tehoraja', ck_cause_vrm: 'Emolevyn virransyöttö', ck_cause_coreImbalance: 'Epätasaiset ytimet', ck_causeNone: 'Syytä ei löytynyt',
  ck_rec_thermalPaste: 'Uusi lämpötahna tai parempi jäähdytin auttaisi eniten.', ck_rec_airflow: 'Kotelon ilmanvirtaus on todennäköinen syy: puhdista pöly ja tarkista tuulettimien suunta.', ck_rec_fanCurve: 'Tiukempi tuulettimen käyrä pitäisi pitää kellotaajuudet ylhäällä.',
  ck_throttle: 'Rajoittunut', ck_temp: 'Lämpö keskim.', ck_clock: 'MHz keskim.', ck_boostScore: 'Boost-pisteet', ck_trend: 'Rajoittuminen muuttui {d} pisteellä edellisestä tarkastuksesta.',
  ck_procs: 'Prosessit', ck_refresh: 'Päivitä', ck_name: 'Nimi', ck_kill: 'Lopeta', ck_killSure: 'Varmasti?',

  // HUD
  hud_low1: '1 % alin {n}', hud_wait: 'Odotetaan peliä', hud_cpu: 'CPU', hud_gpu: 'GPU',
  hud_lim_thermal: 'Lämpö', hud_lim_vram: 'VRAM täynnä', hud_lim_ram: 'RAM täynnä', hud_lim_background: 'Taustasovellus', hud_lim_gpu: 'GPU rajoittaa', hud_lim_cpu: 'CPU rajoittaa', hud_lim_clock: 'Kellon lasku', hud_lim_capped: 'FPS-raja', hud_lim_balanced: 'Varaa on',
}
