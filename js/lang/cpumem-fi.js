'use strict'
// Suoritin ja muisti -välilehti (js/cpumem/*). Ryhmä `cpumem2`; puuttuva avain haetaan jaetusta `net2`-ryhmästä (kuitti, ikkunat, rivin tiedot).
LANG.fi.cpumem2 = {
  seg_overview: 'Yleiskuva', seg_tune: 'Säädöt', seg_lab: 'Laboratorio', seg_history: 'Historia',
  chips: 'Suodata säätimiä', search: 'Etsi säädin',
  // stage
  eyeScan: 'Luetaan suoritinta ja muistia', vScan: 'Luetaan konetta', leadScan: 'Yksi vain luku -skannaus suorittimesta, muistista ja virta-asetuksista. Mitään ei muuteta.',
  eyeRun: 'Otetaan käyttöön', vRun: 'Otetaan muutokset käyttöön', leadRun: '{name} · vaihe {step}/{total}', leadRunRp: 'Luodaan ensin palautuspiste…', working: 'Työstetään…',
  eyeLive: 'Reaaliaikainen · päivittyy sekunnin välein', eyePaused: 'Reaaliaikainen näkymä tauolla', eyeStatic: 'Kertaluku', eyeNever: 'Ei vielä luettu',
  vUnread: 'Konetta ei voitu lukea', vUnreadS: 'Skannaus ei valmistunut. Yritä uudelleen tai käynnistä Jylli uudelleen, jos vika toistuu.',
  vDrift: 'Windows palautti {n} asetusta', vDriftS: 'Windows peruutti Jyllin aiemmin asettamia säätimiä, yleensä päivityksen jälkeen. Palauta ne yhdellä kertaa.',
  vOpen: '{n} turvallista muutosta saatavilla', vOpenS: 'Suositeltu tälle koneelle skannauksen perusteella. Mitään ei oteta käyttöön ennen vahvistustasi.',
  vPaused: 'Tauolla pelatessasi', vPausedS: 'Reaaliaikaiset luvut pysähtyvät pelin ajaksi, joten tämä välilehti ei vie peliltä suoritinaikaa.',
  vClean: 'Suorittimesi ja muistisi asetukset näyttävät oikeilta', vCleanS: 'Mikään ei vaadi huomiota. Reaaliaikaiset luvut tulevat suoraan Windowsin suorituskykylaskureista.',
  factCores: '{c} ydintä · {t} säiettä', cpuUnknown: 'Suoritin', rescan: 'Skannaa uudelleen',
  plan_balanced: 'Tasapainotettu suunnitelma', plan_saver: 'Virransäästösuunnitelma', plan_high: 'Korkean suorituskyvyn suunnitelma', plan_ultimate: 'Äärimmäisen suorituskyvyn suunnitelma', plan_other: 'Oma virransäästösuunnitelma',
  pkgLoad: 'Kuorma', pkgClock: 'Kello', pkgParked: 'Pysäköity', pkgTemp: 'Lämpö', pkgPower: 'Teho',
  ctaApply: 'Ota käyttöön {n} suositusta', ctaPutBack: 'Palauta {n}', undoLast: 'Kumoa viimeisin muutos',
  // banners
  bnUnreadT: 'Windowsia ei voitu lukea juuri nyt', bnUnreadS: 'Säätimet näyttävät Jyllin muistaman tilan, kunnes skannaus onnistuu.',
  bnStaleT: 'Näytetään lukema {when}', bnStaleS: 'Uutta skannausta ei saatu valmiiksi. Yritä uudelleen lukeaksesi koneen uudestaan.',
  bnDriftT: 'Windows palautti {n} asetusta', bnDriftS: 'Nämä otettiin käyttöön aiemmin ja ne näkyvät taas oletusarvoina.',
  bnRestartT: '{n} muutosta odottaa uudelleenkäynnistystä', bnRestartS: 'Ne tulevat voimaan Windowsin käynnistyttyä uudelleen.', restartNow: 'Käynnistä uudelleen nyt',
  // die map
  grp_p: 'Suorituskykyytimet', grp_e: 'Tehokkuusytimet', grp_lpe: 'Virransäästöytimet', grp_ccd: 'CCD {n}', grp_all: 'Ytimet', l3: '{mb} MB L3', vcache: 'V-Cache', parked: 'pysäköity',
  coreLabel: 'Ydin {n}: kuorma {load} %, {ghz} GHz', dieNone: 'Ydinten asettelua ei voitu lukea tällä koneella.',
  // memory
  memTitle: 'Muisti', memWaiting: 'Odotetaan ensimmäistä lukemaa', memSub: '{used} / {total} käytössä', memActive: 'Käytössä', memModified: 'Muokattu', memStandby: 'Välimuistissa', memFree: 'Vapaa',
  memCommit: 'Varattu muisti', memCompressed: 'Pakattu', memFaults: 'Levylukuja', memPools: 'Ytimen poolit', modChannel: 'Kanava {c}', modEmpty: 'Tyhjä paikka',
  freeStandby: 'Vapauta välimuistissa oleva muisti', freeStandbyHint: 'Tyhjentää välimuistin, jota Windows pitää nopeaa uudelleenavausta varten. Windows täyttää sen työskennellessäsi, joten tämä on kertaluontoiseen tarpeeseen, ei nopeutus.',
  freeing: 'Vapautetaan…', freeFailed: 'Toimintoa ei voitu suorittaa.', freeDenied: 'Windows kieltäytyi: tähän tarvitaan järjestelmänvalvojan oikeudet.', freeNothing: 'Ei vapautettavaa: välimuistissa oli vain {had}.', freeDone: 'Vapautettiin {freed} välimuistia ({before} → {after}).',
  // findings
  findTitle: 'Mitä Jylli huomasi', findSub: 'Tämän koneen skannauksesta', findSubLive: 'Skannauksesta ja reaaliaikaisista luvuista', findNoneT: 'Ei huomautettavaa', findNoneS: 'Luvuissa ei näy muisti-, ydin- tai kello-ongelmaa.',
  actBios: 'Avaa BIOS-välilehti', actConsumers: 'Mikä sitä käyttää', actApply: 'Korjaa', actReveal: 'Näytä säädin', actOpen: 'Avaa lataussivu',
  fT_ram_below_rated: 'Muisti toimii alle nimellisnopeutensa', fS_ram_below_rated: 'XMP:n tai EXPO:n kytkeminen päälle BIOSissa nostaa sen yleensä maksamaasi nopeuteen ja on useimmilla koneilla suurin muistin hyöty.',
  fT_ram_single_channel: 'Vain yksi muistimoduuli', fS_ram_single_channel: 'Muisti toimii yhdellä kanavalla. Toinen vastaava moduuli kaksinkertaistaa kaistan, mikä auttaa eniten pelejä ja integroitua grafiikkaa.',
  fT_ram_mixed: 'Muistimoduulit eroavat toisistaan', fS_ram_mixed: '{n} moduulia, joilla on eri koko tai nopeus, toimivat yhdessä hitaimman nopeudella ja joskus ilman kaksikanavaa.',
  fT_cpu_microcode: 'Suorittimen mikrokoodi on vanhentunut', fS_cpu_microcode: '{cpu} käyttää mikrokoodia {rev}. Versio {need} tai uudempi korjaa 13. ja 14. sukupolven Intel-pöytäkoneiden Vmin Shift -epävakauden. Päivitä BIOS.',
  fT_x3d_driver: 'AMD V-Cache -ajuri puuttuu', fS_x3d_driver: '{cpu} sisältää kaksi ydinryhmää, ja vain toisessa on ylimääräinen välimuisti. Ilman AMD:n piirisarjaajuria Windows ei osaa ohjata pelejä välimuistiytimille.',
  fT_x3d_steering_broken: 'Ydinasetukset estävät V-Cache-ajoituksen', fS_x3d_steering_broken: '{cpu}: Tasapainotettu suunnitelma ja oletusarvoinen ydinpysäköinti ohjaavat pelit välimuistiytimille. Maksimisuorituskykysuunnitelma tai pois kytketty pysäköinti rikkoo tämän.',
  fT_hybrid_win10: 'Windows 10 ajoittaa hybridiytimet huonosti', fS_hybrid_win10: '{cpu} sisältää suorituskyky- ja tehokkuusytimiä. Laitteiston säieohjain toimii täysin vasta Windows 11:ssä.',
  fT_hvci_costly: 'Muistin eheys rasittaa tätä suoritinta tavallista enemmän', fS_hvci_costly: '{cpu} on niin vanha, että Muistin eheys (HVCI) kulkee hitaampaa reittiä. Sen sammuttaminen voi nostaa suoritinrajoitteisia pelejä, mutta heikentää Windowsin suojausta.',
  fT_power_saver: 'Windows on Virransäästö-suunnitelmassa', fS_power_saver: 'Virransäästö rajoittaa suorittimen nopeutta. Tasapainotettu on normaali suunnitelma.',
  fT_ram_pressure: 'Muisti on lähes täynnä', fS_ram_pressure: '{pct} % muistista on ollut käytössä viime sekunnit. Windows alkaa käyttää levyä, mikä tuntuu nykimisenä. Katso mikä sitä käyttää tai sulje ne ohjelmat.',
  fT_commit_pressure: 'Varattu muisti on lähellä rajaa', fS_commit_pressure: 'Ohjelmat ovat varanneet {pct} % koko muistista ja sivutustiedostosta. Lähellä 100 %:a varaukset epäonnistuvat ja ohjelmat voivat kaatua. Ohjelmien sulkeminen tai isompi sivutustiedosto auttaa.',
  fT_hard_faults: 'Windows lukee muistia takaisin levyltä', fS_hard_faults: '{reads} sivulukua sekunnissa, kun {pct} % muistista on käytössä: ohjelmat odottavat levyä RAM-muistin sijaan.',
  fT_thermal: 'Suoritin on erittäin kuuma', fS_thermal: 'Paketin lämpötila on {c} °C. Tällä tasolla suoritin laskee omaa kelloaan suojellakseen itseään.',
  fT_clock_held: 'Suoritin käy kuormassa selvästi perusnopeuttaan hitaammin', fS_clock_held: 'Kuorma on {load} %, mutta kello on keskimäärin {mhz} MHz, alle puolet {base} MHz:n perusnopeudesta. Virtasuunnitelma, tehoraja tai lämpö pitää sitä takaisin.',
  fT_bg_hog: '{name} käyttää paljon suoritinta', fS_bg_hog: '{name} käyttää taustalla noin {cpu} % suorittimesta.',
  // consumers
  consTitle: 'Mikä sitä käyttää', consSub: 'Ohjelmat suorittimen ja muistin mukaan', consShow: 'Näytä', consRefresh: 'Päivitä', consHint: 'Lukee käynnissä olevat ohjelmat kerran pyynnöstäsi, joten se ei lisää kuormaa itsestään.',
  consGame: 'Ei luettu pelin ollessa käynnissä.', consCpu: 'Suoritin', consRam: 'Muisti', consNone: 'Ei mitään merkittävää', consFailT: 'Ohjelmia ei voitu lukea', consFailS: 'Yritä hetken kuluttua uudelleen.',
  // tune
  lane_processor: 'Suoritin', lane_corepower: 'Ytimien virta', lane_memory: 'Muisti', lane_tradeoffs: 'Tietoturvakompromissit', lane_retired: 'Ei enää tarjolla',
  laneSub_processor: 'Tehon rajoitus, ajastin ja suunnitelma', laneSub_corepower: 'Ydinpysäköinti ja lepotilat', laneSub_memory: 'SysMain, pakkaus ja sivutustiedosto', laneSub_tradeoffs: 'Nopeutta suojauksen kustannuksella', laneSub_retired: 'Vain aiemman muutoksen palauttamiseen',
  tagPremium: 'Premium', st_locked: 'Premium', unlock: 'Avaa', unreadN: '{n} säädintä ei voitu lukea tällä koneella. Ne näyttävät Jyllin muistaman tilan.', clearFilters: 'Tyhjennä suodattimet',
  histPriority: 'Suorittimen prioriteetti · {exe}', histApply: 'Otettu käyttöön', histRestore: 'Palautettu',
  scanFailT: 'Skannaus epäonnistui', scanFailS: 'Konetta ei voitu lukea. Yritä uudelleen.', runFailT: 'Muutos epäonnistui', premiumT: 'Premium-ominaisuus', premiumS: 'Tämä säädin kuuluu Premiumiin.',
  // lab
  labPitchT: 'Laboratorio: työkalut yhdelle pelille kerrallaan', labPitchS: 'Ydinsuunnitelmat, suorittimen prioriteetti ja mittaukset, jotka kohdistuvat nimettyyn ohjelmaan, eivät koskaan yleiseen säätöön.',
  labPitch1: 'Kiinnitä peli oikeille ytimille ja esikatsele se omalla ydinkartallasi', labPitch2: 'Anna yhdelle ohjelmalle korkeampi suoritinprioriteetti, joka säilyy uudelleenkäynnistyksissä', labPitch3: 'Selvitä, rajoittaako peliä suoritin vai GPU', unlockLab: 'Avaa laboratorio',
  planTitle: 'Ydinsuunnitelma pelille', planSub: 'Valitse, mitä ytimiä yksi ohjelma saa käyttää. Suunnitelman säilyttämät ytimet syttyvät yllä olevalla ydinkartalla.', exeLabel: 'Ohjelma', findGames: 'Etsi käynnissä olevat pelit', noGamesRunning: 'Tunnettua peliä ei ole käynnissä juuri nyt.',
  plan_pcores: 'Vain suorituskykyytimet', planS_pcores: 'Säilyttää {n}/{t} säiettä: suorituskykyytimet. Tehokkuusytimet jäävät vapaiksi taustatöille.',
  plan_vcache: 'Vain V-Cache-piiri', planS_vcache: 'Säilyttää {n}/{t} säiettä piirillä, jolla on ylimääräinen välimuisti. Käytä, kun AMD:n piirisarjaajuri ei tee sitä puolestasi.',
  plan_skip0: 'Jätä ensimmäinen ydin vapaaksi', planS_skip0: 'Säilyttää {n}/{t} säiettä ja jättää ytimen 0, joka käsittelee suurimman osan laitekeskeytyksistä, Windowsille ja ajureille.',
  planNone: 'Mikään ydinsuunnitelma ei sovi tälle suorittimelle. Suunnitelmia on hybridi-Intel-suorittimille, kaksipiirisille X3D-suorittimille ja vähintään 8 säikeen suorittimille.', planRemember: 'Kiinnitä automaattisesti aina kun tämä peli käynnistyy',
  pinNow: 'Kiinnitä nyt', release: 'Palauta kaikki ytimet', forget: 'Poista', rulesTitle: 'Automaattiset suunnitelmat', pinnedNow: 'kiinnitetty nyt',
  pinned: 'Kiinnitettiin {n} prosessia {c}/{t} säikeelle.', pinnedLater: 'Tallennettu. Ohjelma ei ole käynnissä, joten suunnitelma otetaan käyttöön sen käynnistyessä.', released: 'Kaikki ytimet ovat taas ohjelman käytettävissä.',
  pinErr_x: 'Ohjelmaa ei voitu muuttaa.', pinErr_premium_required: 'Tämä on Premium-työkalu.', 'pinErr_bad-exe': 'Anna ohjelman nimi, esimerkiksi game.exe. Windowsin järjestelmäohjelmat eivät ole sallittuja.',
  'pinErr_plan-not-available': 'Tämä suunnitelma ei sovi tälle suorittimelle.', 'pinErr_script-failed': 'Windows ei vastannut. Yritä uudelleen.', 'pinErr_no-topology': 'Ydinten asettelua ei vielä tunneta. Skannaa ensin uudelleen.',
  planFine: 'Suunnitelma koskee käynnissä olevaa ohjelmaa heti ja päättyy sen mukana, ellet valitse automaattista vaihtoehtoa. Se ei ole yleinen nopeutus: käytä sitä, kun peli nykii muiden ohjelmien kilpaillessa.',
  prioTitle: 'Suorittimen prioriteetti ohjelmalle', prioSub: 'Käskee Windowsia ajoittamaan yhden ohjelman muiden edelle.', prio_above: 'Normaalia korkeampi', prio_high: 'Korkea', prio_other: 'Oma',
  prioS_above: 'Lempeä: ohjelma voittaa tasatilanteet tavallisia ohjelmia vastaan.', prioS_high: 'Vahvempi: ajoitetaan useimpien ohjelmien edelle. Reaaliaikaista ei tarjota, koska se voi jäädyttää Windowsin.',
  prioSet: 'Aseta prioriteetti: {exe}', prioDone: 'Tallennettu. Tulee voimaan ohjelman seuraavalla käynnistyskerralla.', prioFine: 'Tallennetaan Windowsiin (Image File Execution Options) ja näkyy Historiassa, josta sen voi kumota.', prioUnread: 'Nykyisiä arvoja ei voitu lukea Windowsista.',
  bnTitle: 'Rajoittaako suoritin vai GPU?', bnSub: 'Seuraa käynnissä olevaa peliä ja kertoo, kumpi puoli rajoittaa sen kuvataajuutta.', bnHint: 'Käynnistä tarkistus ja pelaa minuutti. Se tarvitsee PresentMon-työkalun ja käynnissä olevan pelin.',
  bnRunning: 'Mitataan. Jatka pelaamista; tulos tarkentuu muutamassa sekunnissa.', bnCpu: 'Suoritin rajoittaa', bnGpu: 'GPU rajoittaa', bnCapturing: 'Kerätään ruutuja…', bnFrame: 'keskiarvo {ms} ms', bnP99: '99. persentiili {ms} ms', bnDisp: 'Näyttö',
  bnNoTool: 'PresentMon-työkalu puuttuu, joten ruutuja ei voi mitata.', start: 'Käynnistä', stop: 'Pysäytä',
  checksTitle: 'Muistitarkistukset', checksSub: 'Kertamittauksia. Kumpikaan ei muuta mitään.', ramTitle: 'Nopea RAM-tarkistus', ramSub: 'Kirjoittaa ja lukee kuvioita 256 MB:n muistialueella 30 sekunnin ajan. Löytää ilmeiset viat, ei jokaista.', ramRun: 'Suorita', ramRunning: 'Testataan…',
  ramFail: 'Tarkistusta ei voitu suorittaa.', ramPass: 'Ei virheitä 256 MB:ssa ({n} kierrosta).', ramErrors: 'Löytyi {n} virhettä. Testaa täydellä muistitestillä ja tarkista XMP / EXPO -asetukset.',
  timingsTitle: 'Muistin ajoitukset', timingsSub: 'Lukee CL-, tRCD-, tRP-, tRAS- ja komentonopeusarvot mukana tulevalla CPU-Z:lla.', timingsRead: 'Lue', timingsRunning: 'Luetaan…', timingsMissing: 'CPU-Z-tiedosto puuttuu tästä asennuksesta.', timingsFail: 'Ajoituksia ei voitu lukea.',
}

// säätimien puuttuvat nimet ja kuvaukset
Object.assign(LANG.fi.tweakNames, {
  'x3d-balanced': 'Ryzen X3D -tasapainotettu suunnitelma', 'power-balanced-restore': 'Poistu virransäästösuunnitelmasta', 'pagefile-auto': 'Anna Windowsin hallita sivutustiedostoa',
})
Object.assign(LANG.fi.tweakDescs, {
  'x3d-balanced': 'Vaihtaa Tasapainotettuun virtasuunnitelmaan, jonka ansiosta Windows ja AMD:n ajuri voivat ohjata pelit kaksipiirisen X3D-suorittimen V-Cache-ytimille. Maksimisuorituskykysuunnitelma rikkoo tämän.',
  'power-balanced-restore': 'Siirtää Windowsin pois Virransäästö-suunnitelmasta takaisin Tasapainotettuun. Virransäästö rajoittaa suorittimen nopeutta.',
  'pagefile-auto': 'Antaa sivutustiedoston takaisin Windowsille, joka mitoittaa sen havaitsemansa muistipaineen mukaan. Kiinteä tai puuttuva sivutustiedosto voi kaataa ohjelmia muistin loppuessa. Vaatii uudelleenkäynnistyksen.',
})
