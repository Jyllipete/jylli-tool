# Changelog

## v1.5.9 (nykyinen)

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
