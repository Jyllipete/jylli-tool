# Changelog

## Julkaisematon (UI 2.0)

### 🎨 Ulkoasu
- **Vaalea teema**: Asetukset › Ulkoasu › Teema (Järjestelmä / Tumma / Vaalea). Tumma on oletus. Pelien HUD-ikkunat pysyvät aina tummina
- 5 päävalikkoa (Etusivu, Optimoi, Pelaaminen, Siivous, Järjestelmä) ja välilehdet; mitään ominaisuutta ei poistettu
- Korjaukset-sivu tiiviiksi listaksi, Pulse: pelin valinta ja Käynnistä ensin, säännöt luettavia myös pois päältä
- Ei hehkuja, ei värillisiä reunaviivoja, kaikki tekstit vähintään 11 px, parempi kontrasti (tarkistetaan: `npm run check`)
- Komentopaletti käännetty (EN/FI), uusi toiminto "Vaihda teemaa"; pikanäppäimet Ctrl+1…5, Ctrl+, ja Ctrl+Shift+L
- Näppäimistöllä käytettävät rivit ja nimetyt kentät kaikilla sivuilla

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
