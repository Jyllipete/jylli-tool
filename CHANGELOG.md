## v1.5.3

### Pulse
- Korjaus: CPU%-sarake näyttää nyt oikeat käyttöprosentit kertyneiden sekuntien sijaan; CPU-palkki = todellinen %, RAM-palkki täynnä = 2048 Mt; CPU näytetään yhden desimaalin tarkkuudella
- Korjaus: Pulse-ikkuna läpäisee nyt fullscreen Direct3D -pelit — overlay ei enää katoa
- Korjaus: Istunnon yhteenveto näyttää nyt oikeat Avg FPS ja 1% Low -arvot
- Uusi: SULAVUUS-pistytys (0–100) ruutuaikojen vaihtelusta — korvaa vanhan vakausarvioin; värikoodattu vihreä/oranssi/punainen
- Uusi: ARIA ennakoiva tila — lineaarinen regressio ennustaa CPU/GPU/RAM-piikkejä 8 s etukäteen ("CPU nousemassa 92%:iin (~6s)")
- Uusi: Keskeytysreititys valitsee automaattisesti vähiten kuormitetun P-ytimen GPU/NIC DPC-kutsuille (ei enää kovakoodattu CPU 3); Intel E-ytimet jätetään pois
- Uusi: Per-ydin CPU-lämpökartta Live-monitorissa — värikoodatut solut päivittyvät 3 s välein; P/E-ydinten välinen erotin Intel-hybridiprosessoreilla
- Uusi: GPU TEMP -rivi Live-monitorissa °C-arvolla ja värikoodatulla palkilla; vaikuttaa nyt uhkamittariin
- Uusi: Istuntohistoria — jokainen Pulse-istunto tallennetaan, viimeiset 5 näkyvät kokoontaitettavassa kortissa (peli, kesto, Avg FPS, sulavuus)
- Uusi: FPS Command Center — Avg FPS, 1% Low, Vakaus-% kolmella laattalla + 90-näytteen sparkline
- Uusi: Tittelipalkin live FPS-merkki (`⚡ 144 FPS`) + 20-näytteen sparkline
- Uusi: LEVY- ja KÄYNTIAIKA-rivit Live-monitorissa
- Uusi: Järjestelmäuhkamittari — 5 vyöhykettä (OPTIMAL → KRIITTINEN) CPU/GPU/lämpö/RAM-painotuksilla
- Uusi: ARIA-anomaliafeed Pulse-ikkunaan — >2σ piikit näkyvät värikkäinä sirpaleina, häipyvät 8 s:n jälkeen
- Uusi: Aktivointianimaatio — 1.4 s skannausviiva + korttivälähdykset + kolmisävelinen äänivihjaus
- Uusi: Peliherobiitti + `HH:MM:SS` istuntolaskuri aktivoinnin aikana; peliruudukko palautuu sammutuksessa
- Uusi: Istunnon yhteenvetokortti session jälkeen (peli, kesto, huippuarvot, FPS); häipyy 15 s:n jälkeen
- Uusi: Aktiivinen peliprosessi korostettu `GAME`-merkillä ja vihreällä rivitaustalla; RECLAIM MEMORY -nappi kun RAM > 70%

### Debloat-välilehti
- Uusi: Poistetut UWP-sovellukset poistetaan myös provisioidusta OS-kuvasta — eivät palaa Windows-päivitysten jälkeen; "⚡ provisioned" -merkki skannauksen jälkeen
- Uusi: Bloat Score -yhteenvetokortti (0–100) reaaliaikaisilla laskureilla + sparkline 8 viimeisestä sessiosta
- Uusi: Windows-mainospaneeli — 10 rekisteriavainta (lukitusnäytön mainokset, Käynnistä-valikon ehdotukset, hiljainen sovellusasennus jne.); "Tapa kaikki mainokset" -nappi
- Uusi: Kehittäjä-PC ja Striimaaja-PC -esiasetukset debloat-skanneriin
- Parannettu: Palveluiden/tehtävien poistovahvistus näyttää nyt vaikutusesikatselun ennen poistoa
- Uusi: Debloat-historia localStorage:ssa + yksittäiset "Ota uudelleen käyttöön" -napit palveluille ja tehtäville
- Uusi: Pikavalikkoskanneri (`HKCR` shellex) — orvot merkitään oranssilla, poisto varmuuskopioi ensin `.reg`-tiedostoon
- Uusi: Windowsin valinnaiset ominaisuudet (DISM, 15 ominaisuutta; SMB 1.0 merkitty punaisella "Tietoturvariski"-merkillä)
- Uusi: OEM-turvottamistunnistus — Dell, HP, Lenovo, ASUS, MSI, Acer, Samsung, Toshiba, Sony
- Uusi: Vapautuva levytila näkyy toimintopalkissa valittaessa sovelluksia Win32-poistajassa
- Uusi: UserAssist-pohjainen viimeisin käyttö + käynnistyskerrat per sovellus (esim. "8kk sitten (2×)")

### Ajastin
- Uusi: Tehtäväkortit ikoneilla, kategoriavärillä, tila-merkillä (Valmis/Käynnissä/Pois käytöstä) ja seuraavan ajon laskurilla ("4h 23m kuluttua")
- Uusi: Aja nyt, Poista käytöstä/Ota käyttöön ja Historia-painikkeet jokaisella kortilla (5 viimeistä ajoa)
- Uusi: Luontilomake: toiminnot ryhmitelty kategorioittain selityksineen, mukautettu kellonaika, viikonpäivävalitsin, tuntiväli-vaihtoehto
- Uusi: Bulkki-toiminnot: Poista kaikki käytöstä / Ota kaikki käyttöön / Poista kaikki

### Kotinäkymä
- Uusi: Järjestelmäidentiteettikortti ylhäällä — tietokonenimi, OS, CPU, GPU, RAM pill-merkeinä + reaaliaikainen käyntiaikakello
- Uusi: Kriittiset varoitukset nostettu ARIA-paneelin yläpuolelle
- Uusi: Trendinuolet (↑↓→) kaikissa neljässä mittarilaatikossa (CPU, GPU, RAM, NET)
- Uusi: Optimointiputki-laskuri — liekkisiruке näyttää peräkkäiset päivät
- Uusi: "Kaikki kunnossa" -banneri kun CPU <60%, GPU <80%, lämpö <75°C, terveyspistemäärä ≥70
- Uusi: ARIA näyttää 2–3 älykkäätä havaintoa myös ilman aktiivista pelisessiota

### Älykäs konfliktimoottori
- Uusi: Estää säädöt tilanteissa joissa ne voivat aiheuttaa haittaa — Wi-Fi + verkkoasetukset, videopuhelu + MMCSS, OBS-striimaus + MMCSS, kannettava + C-States, <8 Gt RAM + SuperFetch-poisto jne. (6 sääntöä)

### Sovellusoptimoija
- Uusi: Juuri nyt pyörivät optimoimattomat sovellukset merkitään LIVE-merkillä; "Optimoi kaikki käynnissä olevat" -herobiitti yhdellä klikkauksella

### FiveM
- Uusi: Asetuspaketti — vie/tuo kaikki FiveM-asetukset yhtenä `.jyt`-tiedostona
- Uusi: Smart Recommend päivitetty 4-tason per-asetus-logiikaksi (31 asetusta); GPU-valmistajan tunnistus (NVIDIA/AMD/Intel)
- Uusi: VRAM-mukautuva grafiikka (4 porrasta: <4 Gt → 8+ Gt) ja commandline.txt
- Uusi: Haku/suodatus, suoritusbudjettimittari, kokoontaitettavat kategoriat, tooltipsit kaikille 33 asetukselle
- Uusi: Kumoa-pino (20 tasoa, Ctrl+Z); näppäinoikotiet Ctrl+S/Z/R/E, /, Esc
- Uusi: Usean muodon vienti (teksti, JSON, XML); muuttuneet asetukset korostettu vaaleanpunaisella raidalla
- Uusi: Optimointipistemäärä-kortti FiveM-sivulla
- Uusi: Timer Resolution -säätö (`fivem-timer-resolution`) — lukitsee Windowsin ajastimen ~0.5ms:iin
- Korjaus: Verkon terveystarkistus -nappi korjattu (PowerShell `${hop}` escapaus)
- Korjaus: Smart Recommend luki VRAM:n aina 0:ksi (kenttänimen mismatch) — korjattu

### Auto-Optimize
- Uusi: Vastaukset muistetaan seuraavaa kertaa varten; älykäs esitäyttö tunnistaa Edge, Chrome, OneDrive, Bluetooth jne. automaattisesti
- Uusi: Todellinen ennen/jälkeen-raportti (vapautunut RAM, DPC-latenssi, säätöjen määrä)
- Uusi: Ajo-historia koontinäkymässä; viikkoraportti (säädöt, pelikerrat, Avg FPS, putki-päivät)
- Uusi: Älytila / Pelitila / Turvallinen tila -valitsin; kannettavilla ei enää ajeta virranhallintasäätöjä
- Uusi: Tyhjäkäyntiaikataulu — optimoi automaattisesti 15 min joutokäynnin jälkeen
- Uusi: Esikonfliktivaroitukset (striimaus, videopuhelut, korkea RAM-paine)
- Uusi: Säätökorttien merkintätooltipsit; sivupalkissa vihreä laskurimerkki ajojen jälkeen
- Uusi: "Näytä käytössä olevat" ja "Kumoa"-napit AOM-valmistumisnäytöllä

### ARIA
- Uusi: Suorituspäiväkirja — viimeiset 5 peliistuntoa FPS-trendeineen ja varoituksineen
- Uusi: DPC-piikkikirjanpito — automaattinen loki >3% DPC-piikeistä, vietävissä .txt-raporttina
- Uusi: Säätövaikutusmittari — mittaa CPU/RAM/GPU% ennen ja jälkeen jokaisen säädön, näyttää vihreänä/punaisena

### BIOS
- Uusi: Profiilien vertailu — rinnakkainen diff-taulukko kahdesta BIOS-profiilista (oranssi / sininen sarake)

### Palautuspisteet
- Uusi: Vahvistusikkuna näyttää ennen palauttamista mitkä säädöt peruuntuisivat

### Yleiset korjaukset
- Korjaus: Sovellus sulkeutuu välittömästi X-napista; yksittäinen instanssi — toinen kopio fokusoi olemassa olevan
- Korjaus: Ensimmäinen käynnistys ilman admin-oikeuksia → 3 s laskuri + automaattinen uudelleenkäynnistys korotetuin oikeuksin
- Korjaus: Käynnistysohjelmat-kytkin korjattu; poistetut kohteet siirtyvät AutorunsDisabled-kansioon
- Korjaus: Uudelleenkäynnistysvaatimuspalkki ei enää jää jumiin
- Korjatus: Pelin aikainen taustakuormitus pienennetty (mittarit 15 s välein, prosessiskannaus 10 s); FPS HUD:in blur-efekti poistettu
- Korjaus: NIC-säädöissä keltainen ping-piikkivaroitus Ethernet-käyttäjille
- Korjaus: Verkko-välilehti — Wi-Fi-käyttäjille varoitus tcp-buffers-, tcp-ctcp-, qos-reserve- ja net-throttling-säädöissä
- Uusi: "Palauta kaikki" -nappi Yleiset säädöt -sivulle