# Changelog

## Julkaisematon (4.0 "Lasin läpi")

### Ulkoasu
- **3D-maailma taustalla**: koneesi malli on koko sovelluksen takana ja jokainen sivun hero-alue on ikkuna siihen; pinnat ovat savulasia, jonka reunoja valaisee yksi yhteinen valo
- Asetukset › Visuaalinen tyyli: Elokuvamainen, Tasapainoinen (oletus), Kevyt, Klassinen (ei 3D-taustaa); maailma on vain tummassa teemassa
- Numerot vierivät numero kerrallaan ja niiden päälle vietäessä näkyy mistä arvo on peräisin ja kuinka vanha se on
- Muutosten käyttöönotto pitämällä pohjassa; valo kulkee painikkeesta muutettuun osaan ja kumoaminen näyttää saman takaperin
- **Aikajana**: tallennetut muutokset, pelisessiot ja suorittimen kuorma; liu'uttamalla näet koneen kuorman siitä hetkestä (lämpötiloja ei ole tallennettu, joten niitä ei näytetä)
- Kotisivun osat saavat reaaliaikaiset kuplat ja viivat; Ctrl K ymmärtää oireita ("nykii", "korkea ping", "kuuma kone")
- Toisto: tallenna jakokortti PNG-kuvana (vain tallennetut arvot)
- Peli päällä 3D-maailma pysähtyy kokonaan; Verkko-välilehdellä malli väistyy verkon oman 3D-näkymän tieltä

## Julkaisematon (3.0 "Living hardware")

### Luotettavuus
- **Muutosloki**: jokainen sovelluksen tekemä muutos kirjataan todellisine ennen/jälkeen-arvoineen (`userData/jt_journal.jsonl`); Kumoa palauttaa tallennetut arvot ja kysyy ensin, jos arvo on muuttunut
- **Yksi käyttöönottoputki** (`apply-batch`): Auto-Optimize, älykäs profiiliopas, valmistellut muutokset ja pelivahti kirjautuvat samaan lokiin; Auto-Optimize palauttaa tarkan listan käyttöön otetuista, ohitetuista ja epäonnistuneista
- Puuttuva anturi näytetään muodossa "Ei saatavilla" (syyn kanssa), ei koskaan nollana; CPU-lämpötila ei enää lainaa emolevyn lämpövyöhykettä; terveyspisteet jättävät mittaamattomat osat pois ja normalisoivat
- Korjauksia: AI-suositusten "Käytä" toimii, NVIDIA-säädöt käyttävät oikeaa näyttö-ohjaimen avainta, pelien palautus kumoaa myös MMCSS-, FSO- ja DVR-muutokset, IRQ-paneeli piilotetaan kun ei tuettu

### Ulkoasu
- **Elävä 3D-malli** koneestasi (Three.js, proseduraalinen, rakennettu havaitusta laitteistosta); kuumuus ja tuulettimet näkyvät vain jos anturilukema on olemassa; tunnistamattomat osat piirretään haamuina; kannettava piirretään kannettavana
- Staattinen SVG-varakuva kun 3D ei ole käytettävissä (ohjelmistopiirto, hidas GPU tai pois päältä); Asetukset › Ulkoasu › 3D-visuaalit
- Ensikäynnistyksen kokoamisanimaatio, ohitettavissa; ei aja mitään automaattisesti
- Tarkista ensin -tila (Asetukset › Yleiset › Muutosten käyttöönotto): muutokset kerätään telakkaan ja otetaan käyttöön yhtenä erä
- Historia-välilehti: muutosloki puuna (istunto › erä › muutos) ja kumoaminen
- Valinnaiset ääniefektit (oletuksena pois)
- Uusi Toisto-välilehti: pelisessiot ruudunpäivityksineen, kuormineen ja lämpötiloineen sekä todisteisiin perustuvat havainnot; pelit kansikuvineen Etusivulla (Steam/Epic)

### Laitteisto ja verkko
- GPU: reaaliaikaiset lukemat ja NVIDIA:n tehoraja (vain pöytäkone, validoitu, palautuu sovelluksen sulkeutuessa, lämpösuoja)
- Verkko: yhteydet sovittimittain todellisista laskureista, reitittimen tunnistus UPnP:llä (vain yhdyskäytävältä), Cloudflare-nopeustesti (vain käyttäjän käynnistämänä)
- CPU ja muisti: todellinen nimellis- ja käyntinopeus; Virta ja tallennus: asemat ja virrankäyttösuunnitelma; BIOS: emolevyn oikea malli
- Asetukset › Anturit: mitä luetaan ja miksi jokin puuttuu

### Tekniset
- Pysyvä PowerShell-kyselijä ja nvidia-smi korvaavat sekunnin välein käynnistettävät prosessit; `--perf-log`-lippu
- `lib/`: journal, journal-runner, journal-prelude, cmd-parse, settings-merge, telemetry-hub/service, inventory, gpu-power-limit, speedtest, ssdp, games-registry, session-recorder; `js/twin/`: layout, mapping, motion, fallback, engine, host
- Three.js 0.170.0 paketoituna (`tools/build-three.js`, `tools/check-vendor.js`); `--motion-scale` ja Vähennetty-liikeasetus
- **Tiedossa**: JylliSensorin paketoitu LHM-kirjasto puuttuu riippuvuuksia (System.Memory, RAMSPDToolkit-NDD, DiskInfoToolkit), joten laitteistoanturisilta ei käynnisty; ilman sitä CPU-lämpötila ja tuulettimet näytetään "Ei saatavilla"

## Julkaisematon (UI 2.0)

### 🎨 Ulkoasu
- **Vaalea teema**: Asetukset › Ulkoasu › Teema (Järjestelmä / Tumma / Vaalea). Tumma on oletus. Pelien HUD-ikkunat pysyvät aina tummina
- 5 päävalikkoa (Etusivu, Optimoi, Pelaaminen, Siivous, Järjestelmä) ja välilehdet; mitään ominaisuutta ei poistettu
- Korjaukset-sivu tiiviiksi listaksi, Pulse: pelin valinta ja Käynnistä ensin, säännöt luettavia myös pois päältä
- Ei hehkuja, ei värillisiä reunaviivoja, kaikki tekstit vähintään 11 px, parempi kontrasti (tarkistetaan: `npm run check`)
- Komentopaletti käännetty (EN/FI), uusi toiminto "Vaihda teemaa"; pikanäppäimet Ctrl+1…5, Ctrl+, ja Ctrl+Shift+L
- Näppäimistöllä käytettävät rivit ja nimetyt kentät kaikilla sivuilla
- Käynnistysohjelmat ja Pulse rakennettu uudelleen yhteisillä komponenteilla; tilavärit (onnistui/varoitus/virhe) seuraavat valittua teemaa; tyhjät ja virhetilat selkeämmiksi

### 🔧 Tekniset
- Uusi asetus `colorScheme`; sivujen ikkunat saavat `?scheme=`-parametrin
- Esikatselutyökalu: `--lint`, `--scheme`, `--scale`, `--noshot`; `tools/check-contrast.js` osana `npm run check`

## v1.6.0 (nykyinen)

### 🎨 Uusi ulkoasu
- **Grafiitti + yksi korostusväri (#8B7CF6)**, Geist-fontti paketoituna sovellukseen
- **Teemat vaihtavat vain korostusvärin** — pinnat ovat samat joka sivulla ja ikkunassa
- Säätökortit ja Quick Wins -kortit litistetty; Pulse-säännöt ja BIOS-palautusohje luettavammiksi
- Pulse-, FiveM- ja Arma-ikkunat käyttävät samaa korostusväriä kuin pääikkuna

### 🔐 Tietoturva
- **Ei salaisuuksia tai webhookeja asiakasohjelmassa**; Premium-oikeudet allekirjoitettu (Ed25519) ja varmennettu paikallisesti
- **Telemetria vapaaehtoinen** suostumusikkunalla
- Komentoinjektiokorjaukset (`lib/validate.js`, `lib/shell.js`), turvalliset polku-, ini-, xml- ja BIOS-kirjoittajat
- XSS-korjaukset, sandboxatut ikkunat, navigoinnin esto, yksi instanssi, CSP
- **Huom:** v1.5.9-asiakkaat eivät voi kirjautua ennen kuin 1.6.0 ja uusi botti on julkaistu

### 🛠️ Korjaukset
- Kaikki säädöt luokiteltu tasoihin (fail-closed); tilannekuvat MSI-, NetBIOS-, virrankäyttö- ja Pulse-säädöille → Palauta toimii oikein
- Game Boost, prosessin jäädytys ja CPU-kiinnitys korjattu; BIOS-arvot luetaan uudelleen ennen kirjoitusta
- Sovellus sulkeutuu siististi, päivitys asentuu suljettaessa; Electron 33 → 45, turhat riippuvuudet pois
- Ilmoitukset ja viestit käännetty (EN/FI), `<html lang>` seuraa kieltä, Premium-lukon englanninkielinen teksti korjattu

## v1.5.9

### 🔍 Laitteistontunnistus — Älykkäämpi kuin koskaan
- **CPU/GPU-merkit** tunnistetaan automaattisesti (Intel/AMD/NVIDIA) — ei ylimääräisiä prosesseja
- **Ethernet, Bluetooth, akku & internet** havaitaan rinnakkain käynnistyksen yhteydessä
- Kaikki 4 tunnistuskyselyä ajetaan aidosti samanaikaisesti — nolla lisäviivettä

### 🛡️ TWEAK_COMPAT — Yhteensopivuusmoottori
- **Uusi:** keskitetty `TWEAK_COMPAT`-kartta — 30 tweakia, yksi totuuden lähde kaikille reiteille (AOM, Hardware, SPW)
- **Kannettavat:** viisi virranhallintatweakia piilotetaan kokonaan — ei varoituksia, ei kortteja
- **CPU/GPU-tarkkuus:** Intel-tweakit piilossa AMD:llä ja päinvastoin; NVIDIA/AMD GPU-tweakit vastaavasti
- **NVMe, NIC, RAM, Bluetooth** — jokainen osio näkyy vain jos laitteisto tukee sitä
- **Bugikorjaus:** `intel-power-plan` / `amd-power-plan` eivät enää vuoda SPW:hen kannettavilla

### 🚀 Auto-Optimize — Täysin uudistettu Premium-UI
- **Uusi modaalikuori:** frosted glass -tausta, gradienttipalkki, raketti-ikoni ja askelilmaisin vanhojen pisteiden tilalle
- **Käyttötapaukset:** 2×2-ruudukko ponnahdusanimaatiolla, hover-efektillä ja animoidulla valintamerkillä
- **Kysymykset:** valintaruutujen tilalle toggle-kortit värivaihtuvalla ikonilla
- **FiveM-portti:** premium-lukkosivu tai pill-välilehdet premium-käyttäjille
- **Katsaus:** tilastopalkit, kategoriablokit ja tier-turvamerkit
- **Suoritus:** shimmer-edistymispalkki → kiinteä vihreä valmiina; värikoodattu loki
- **Valmis:** animoitu GRS-pistemittari SVG-ringillä
- **Gate-näytöt:** Health Check ja Preflight uudistettu hero-ikonein ja skannauspalkein
- Kaikki IPC-kanavat, DOM-id:t ja LANG-avaimet säilyvät — pelkkä UI-uudistus

## v1.5.8

### 🛡️ Järjestelmän palautus — Täysin uudistettu
- Kokonaan uusi ulkoasu: hero-kortti live-tilastoilla (pisteiden määrä, tallennustila, ikä)
- Luonti näyttää animoidun edistymisen vaihe vaiheelta
- Kaksipalstainen asettelu — lista vasemmalla, toiminnot oikealla
- **Uusi:** 4-tason ikämerkinnät (tuore / äskettäinen / vanha / muinainen) värikoodattuna
- Palautuksen vahvistus näyttää selkeän ennen/jälkeen-eron

### 🎮 Pulse — Uudet live-analytiikkaominaisuudet
- **Uusi:** Pulse-pisteet (0–1000) — reaaliaikainen suorituskykymittari lämpö-, FPS- ja optimointidatan perusteella
- **Uusi:** Ennen/jälkeen-vertailu — näyttää CPU/GPU/RAM-muutoksen Pulsen aktivoinnista lähtien
- **Uusi:** Istuntohistoria tallentaa Pulse-pisteet ja huipputempperatuurin pelisessiokohtaisesti
- Aktiviteettiloki uudistettu värikoodatuilla korteilla

### 🧹 Siivous & Debloater — Uudistettu ulkoasu
- Siivous-välilehti uusittu: kategoriat vasemmalla, analytiikka kiinteässä sivupalkissa oikealla
- Vapautuva tila näkyy isona värikoodattuna numerona jokaisella rivillä
- **Uusi:** Debloater-tierhero — 4 tasoa (Puhdas / Kohtalainen / Turvonnut / Kriittinen) värillisellä taustalla
