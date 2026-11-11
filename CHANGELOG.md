# Changelog

## Julkaisematon (Välilehtien uudistus)

### FiveM 2.0 (Uplink)
- FiveM-välilehti on rakennettu uudelleen oman moottorin (lib/fivem) päälle viidellä näkymällä: **Yhteys**, **Istunnot**, **Grafiikka**, **Asiakasohjelma** ja **Kaatumislaboratorio**. Lähtökohta: jokainen näytetty luku on mitattu tai luettu tiedostosta, eikä mitään arvata (docs/FIVEM_EVIDENCE.md)
- Uusi **reittitutka**: oikea reitti tietokoneelta valitsemallesi palvelimelle (cfx.re/join-linkki tai IP:portti), yksi piste per reititin, hyppykohtainen viive, vaihtelu ja häviö kerran sekunnissa sekä ICMP- ja TCP-mittaus palvelimelle. Tulos nimeää, mistä ongelma alkaa (oma verkko, operaattori, internet vai palvelin). Reitittimen vastausten rajoitus ei näy pakettihäviönä, koska häviö lasketaan vain, jos se jatkuu palvelimelle asti. Lisäksi MTU-testi
- Uudet **istunnot**: pelatun FiveM-istunnon kuvaruutuaika, kuorma, lämpötilat ja viive palvelimelle samalla aikajanalla. Jokainen nykäisy saa syyn (kuumuus, näytönohjaimen muisti, RAM, GPU/CPU rajalla, kellotaajuuden lasku) vain jos tallennettu mittaus tukee sitä, muuten "tuntematon". Verkkotapahtumat näytetään erikseen eikä niitä syytetä nykäisyistä
- **Grafiikka** korvaa erillisen ikkunan: gta5_settings.xml muokataan vain avaimilta, jotka tiedostossa jo ovat, arvot validoidaan, ennen tallennusta näkyy muutosluettelo ja tiedosto varmuuskopioidaan. Esiasetukset, VRAM-tietoinen suositus (tuntematon VRAM ei enää tarkoita "heikkoa konetta") ja suhteellinen kuormamittari
- **Asiakasohjelma**: vain todistetut muutokset (CPU- ja levyprioriteetti, ikkunoidun kokonäytön yhteensopivuus, Game Bar, Defender-poikkeus), CitizenFX.ini oikeasta tiedostosta vain FiveM:n dokumentoimilla avaimilla sekä välimuisti, joka ei koske pelin omiin tiedostoihin. Kaikki kulkee muutospäiväkirjan kautta kumottavissa, ja kumoaminen palauttaa käyttäjän oman alkuperäisen arvon
- Poistettu: neljä jo poistettua säätöä, `fivem-auto-opti` (ei tehnyt mitään), `fivem-disable-update-checks` (ilmoitti onnistuneensa tekemättä mitään), commandline.txt:n ylikirjoitus sekä CitizenFX.ini-avaimet, joita FiveM ei dokumentoi. Aiemmat muutokset voi palauttaa Asiakasohjelma-näkymästä
- Korjattu: Smart Recommend valitsi aina heikon koneen asetukset (luki vääriä kenttiä), Home-näkymän istuntoyhteenveto lakkasi toimimasta FiveM-välilehdellä käynnin jälkeen, välimuistin tyhjennys poisti myös pelin omat tiedostot (cachegame, server-cachegame), HUD:n "CFX ping" mittasi Cfx:n palvelinta eikä pelaajan omaa palvelinta (nyt valittu palvelin, 11 px:n tekstit)
- Premium-esittely kuvaa nyt oikeita ominaisuuksia (ei enää "9 / 12")

### Diagnostiikka 2.0 (Vitals)
- Diagnostiikka-välilehti on rakennettu uudelleen oman moottorin (lib/diagnostics) päälle: oikea terveystarkistus vanhan "turvapisteen" tilalle. Jokainen tulos näyttää mitatun arvon, rajan ja lähteen; mittaamatonta aluetta ei koskaan pisteytetä arvauksella
- Uusi **Vitals-rengas**: kymmenen osaa (vakaus, tallennus, muisti, CPU ja lämpötilat, GPU ja näyttö, ajurit, Windowsin eheys, tietoturva, verkko, asetukset), jotka täyttyvät vain kun niiden oikeat tarkistukset valmistuvat
- Nopea ja syvä tarkistus; syvä lisää SFC/DISM-varmistuksen sekä lämpö- ja muistitestit kuormituksessa (Pro)
- Uusi **aikajana**: 30 päivän kaatumiset (sininen ruutu, Kernel-Power 41, WHEA, näytönohjaimen nollaus, levyvirheet) pysäytyskoodeineen selitettynä, sekä ajuri-, päivitys- ja viritysmuutokset samalla janalla. **Todennäköinen syy** yhdistää kaatumiset sitä edeltäneeseen muutokseen
- Noin 50 todisteellista löydöstä, joista jokaisessa on korjaus tai oikotie oikealle välilehdelle. Korjaukset kulkevat muutospäiväkirjan kautta (näkyvät Historiassa) ja luovat tarvittaessa palautuspisteen
- Ajurit: virheelliset laitteet ja vanhat ajurit (tyhjäksi jäänyt lista korjattu) sekä puuttuvat ajoympäristöt. Suorituskykytestit: oikeat CPU-, muisti- ja levytestit pisteinä, vertailukohta ja historia. Raportti: terveyshistoria sekä vienti HTML:nä ja yhteenveto leikepöydälle
- Vanha pre-flight-skannaus (run-preflight-scan) palauttaa saman rakenteen kuin ennen, joten viritysten "jo käytössä" -merkintä, Auto-Optimize ja Arrival toimivat ennallaan

### Diagnostiikka 2.0 (Vitals)
- Diagnostiikka-välilehti on rakennettu uudelleen oman moottorin (lib/diagnostics) päälle: oikea terveystarkistus vanhan "turvapisteen" tilalle. Jokainen tulos näyttää mitatun arvon, rajan ja lähteen; mittaamatonta aluetta ei koskaan pisteytetä arvauksella
- Uusi **Vitals-rengas**: kymmenen osaa (vakaus, tallennus, muisti, CPU ja lämpötilat, GPU ja näyttö, ajurit, Windowsin eheys, tietoturva, verkko, asetukset), jotka täyttyvät vain kun niiden oikeat tarkistukset valmistuvat
- Nopea ja syvä tarkistus; syvä lisää SFC/DISM-varmistuksen sekä lämpö- ja muistitestit kuormituksessa (Pro)
- Uusi **aikajana**: 30 päivän kaatumiset (sininen ruutu, Kernel-Power 41, WHEA, näytönohjaimen nollaus, levyvirheet) pysäytyskoodeineen selitettynä, sekä ajuri-, päivitys- ja viritysmuutokset samalla janalla. **Todennäköinen syy** yhdistää kaatumiset sitä edeltäneeseen muutokseen
- Noin 50 todisteellista löydöstä, joista jokaisessa on korjaus tai oikotie oikealle välilehdelle. Korjaukset kulkevat muutospäiväkirjan kautta (näkyvät Historiassa), ja vaativat palautuspisteen tarvittaessa
- Ajurit: virheelliset laitteet ja vanhat ajurit (korjattu tyhjäksi jäänyt lista), puuttuvat ajoympäristöt. Suorituskykytestit: oikeat CPU-, muisti- ja levytestit pisteinä, vertailukohta ja historia. Raportti: terveyshistoria sekä vienti HTML:nä ja yhteenveto leikepöydälle
- Vanha  palauttaa saman rakenteen kuin ennen, joten viritysten "jo käytössä" -merkintä, Auto-Optimize ja Arrival toimivat ennallaan

### Yhteinen pohja
- Uusi **välilehtipohja** (`js/ui/tab-kit.js`, `js/ui/filter.js`, `css/tab-kit.css`): sama hero (mittari, otsikko, rivistö, yksi pääpainike), sama haku ja suodatinchipit, osiot, kehys sekä lataus-, tyhjä- ja virhetila Yritä uudelleen -painikkeella
- Yksi hakusuodatin korvasi neljä erillistä; se koskee vain omaa listaansa eikä piilota Live-monitoria, työkaluja tai muita osioita
- `registerPageCleanup` on nyt additiivinen: Verkko-välilehden live-ping ei jää käyntiin välilehdeltä poistuttaessa
- `body.game-running` → `body.game-live` (pelin aikainen animaatioiden pysäytys toimii nyt oikeasti); ui.css:n nollaukset eivät enää syö uusien herojen varjoja

### Bloatware 2.0 (Kevyt)
- Bloatware-välilehti on rakennettu uudelleen yhden moottorin (lib/debloat) päälle: yksi luettelo siitä, mitä saa poistaa tai kytkeä pois, yksi mittaus ja yksi ajo, joten näytetty luku on se, mikä muuttuu (vanha pistemäärä luettiin DOM-merkeistä)
- Uusi **jalanjälki-Ydin** (sovellukset, palvelut, tehtävät, mainokset, ominaisuudet), mitatut luvut (muisti nyt, levy, heräämiset 24 h:ssa) ja **taustahälinäjana**: oikeat ajastettujen tehtävien seuraavat ajat, ei arvioita
- Kolme kaistaa: **Turvallista poistaa**, **Sinun päätöksesi** ja **Käytössä, säilytetään** (jokainen kertoo syyn: tulostin kytketty, Bluetooth-laitteita paritettu, Xbox-ohjain, avattu hiljattain, suojattu). "Tämä kone on tarkoitettu" -valinnat tunnistetaan koneesta ja päivittävät listat heti
- Ajo tapahtuu paikan päällä: palautuspiste ensin, kohta kohdalta oikeat tapahtumat, kuitti **mitatuilla** ennen/jälkeen-arvoilla ja **Peru tämä ajo**. Palvelut, tehtävät, mainosasetukset ja kontekstivalikon kohdat palautuvat muutospäiväkirjan kautta täsmälleen vanhoihin arvoihinsa; poistetuille sovelluksille on **Paluu** (offline, jos Windows säilyttää paketin, muuten Storen sivu). Poisto vaatii pitkän painalluksen
- Sovellusten poisto poistaa nyt myös asennuskuvan kopion (valinnainen), jotta Windows ei asenna niitä uudelleen; vanha toiminta ei koskaan tehnyt tätä
- **Mainoskartta**: kaavakuva työpöydästä ja nastat jokaiselle mainospaikalle (16 asetusta, aiemmin 10); **Ohjelmat**: koko, viimeisin avaus, valmistajan apuohjelmat; **Lisät**: haamulaitteet ja kontekstivalikon kohdat; **Historia**: ajot ja Peru / Paluu
- **Vahti**: huomaa, mitä Windows toi takaisin päivityksen jälkeen. Ilmainen: ilmoitus välilehteä avattaessa. Premium: taustatarkistus päivitysten jälkeen ja valinnainen hiljainen uudelleenpoisto
- Luettelo kattaa nykyisen Windows 11:n (Copilot, uusi Outlook, uusi Teams, Widgetit, Dev Home, sponsoroidut sovellukset) ja uusia palveluita; vanhat, käyttämättömät kanavat ja vanha tulos-hero poistettu

### Siivous 2.0 (Vapauta)
- Siivous on rakennettu uudelleen yhden moottorin (lib/cleanup) päälle: mittaus, siivous, clean-*-säädöt, komentopaletti ja Auto-Optimize käyttävät samaa kohdeluetteloa, joten näytetty luku on se, mikä poistuu (aiemmin esim. WinSxS laskettiin kokonaan ja NVIDIA mitattiin eri kansioista kuin siivottiin)
- Uusi **Ydin**: levy renkaana, jonka kaaret kasvavat skannauksen aikana ja tyhjenevät siivouksen aikana oikeiden tapahtumien mukaan; keskellä löydetty ja lopuksi vapautettu määrä
- Kolme kaistaa: **Turvallista poistaa** (valittu valmiiksi), **Kannattaa katsoa** (varjostinvälimuistit, tapahtumalokit, WinSxS, kehityskansiot) ja **Pysyvät** (Roskakori, Windows.old, selainhistoria; ei koskaan yhden napin siivouksessa, jokainen vaatii pitkän painalluksen)
- Siivous näyttää todelliset poistetut tavut per kohde, kertoo avoimet sovellukset ja omilta näyttävät tiedostot (säilytetään aina) ja päättyy **kuittiin**: vapautettu, vapaa tila ennen ja jälkeen, ohitetut syyineen, yritä uudelleen, tallenna kuva
- Laajempi kattavuus: kaikki selainprofiilit (Edge, Chrome, Brave, Vivaldi, Opera, Firefox), AMD-varjostinvälimuisti, Delivery Optimization, VS Code, Teams ja Slack, päivitysjäänteet; alle vuorokauden vanhoja temp-tiedostoja ei poisteta
- Mittaus kestää sekunteja (aiemmin jopa 45 s) eikä seuraa linkkejä tai liitoskohtia
- **Premium**: Tilakartta (levy puukarttana), Suuret ja unohtuneet tiedostot, Jääneet sovelluskansiot (kaikki Roskakoriin), Autopilotti (hiljainen turvallisen kaistan siivous viikoittain tai rajan ylittyessä) ja täyttymisnopeudet Historiassa
- Poistettu kuolleet toiminnot (regret-banneri ja turvamerkit, joita mikään ei koskaan täyttänyt) ja vanha Pikasiivous-ikkuna

### Välilehdet
- **Windows / Elämänlaatu**: hero kattavuusmittarilla, osioiden rivistö (klikkaus vierittää ja korostaa), Suositellut-painike rajattuna avoimeen välilehteen; Pikavoitot-nauha yhdistettiin heroon; suodatinchipit (Kaikki, Suositellut, Käytössä, Vaatii käynnistyksen, Riskialttiit)
- **CPU & Muisti / GPU / Virta**: työkalupaneelit omilla välilehdillään (Topologia ja Latenssibudjetti → CPU & Muisti, Thermal → GPU, Tehokkuus → Virta); tyhjät osiot (Audio) piilossa; haku ja laskurit vain avoimelle välilehdelle
- **Verkko**: yksi pistehero (DNS-palvelimet lasketaan yhtenä, vain tarjotut säädöt lasketaan) ja Säädöt | Mittaa -kytkin; **Pulse**: hero ja DOM-järjestys vastaa näkyvää järjestystä (CSS-order-kikka poistettu)
- **FiveM**: sama suodatin; FiveM:n **Käytä kaikki turvalliset** toimii nyt (se ei tehnyt mitään) ja pisteet voivat nousta 100 %:iin
- **Korjaukset**: hero ja "Suositeltu tälle koneelle" -osio ylhäällä
- **Pikasiivous**: hero mittaa vapautettavan koon heti avattaessa, osiokohtainen rivistö, vahvistus ennen siivousta (Roskakori tyhjenee pysyvästi), epäonnistunut mittaus ei enää näytä "ei siivottavaa"
- **Latenssi, Pelit, Toisto, Diagnostiikka, Ajastin, Historia**: heroon nostettu olennainen luku (DPC+ISR, optimoidut pelit, tallenteet, turvapisteet viime skannauksesta, seuraava ajo, kirjatut muutokset)
- **Toisto**: päälista ja tiedot rinnakkain; lukuvirhe näytetään virheenä eikä "ei tallenteita"
- **Historia**: erän ja istunnon peruutus kysyy ensin; **Ajastin**: kaikkien ottaminen käyttöön tai keskeyttäminen kysyy ensin
- **Koti**: viimeksi optimoitu, putki ja viimeisin ajo päivittyvät joka vierailulla; varoitukset suomeksi
- **Asetukset**: sivupalkki näyttää nykyisen osion; Tarkista-painike (sormenjälki) avaa oikean välilehden
- **Muuta**: Käynnistys-haun tyhjä tila ei enää näytä raakaavaimia; Palautuspisteen kuvaus escapataan; useita kovakoodattuja englanninkielisiä tekstejä siirretty LANG:iin (EN ja FI)
- Opastukset (Siivous, Prosessit, Historia) päivitetty vastaamaan uusia sivuja
## Julkaisematon (Suorituskykyauditointi)

### Auto-optimointi: Maksimitila
- Uusi **Maksimi**-ajotila (Premium) Turvallisen rinnalle: lisää koneeseen sopivat säädöt, joissa on kompromissi, ja näyttää jokaisen riskit ennen ajoa; Turvallinen toimii kuten ennen ja on oletus, viimeksi käytetty tila muistetaan
- **Asiantuntijasäädöt** (hypervisor pois, muistin eheys pois, Spectre/Meltdown pois): omassa osiossaan, mitään ei valita puolestasi, jokainen vaatii kirjoitetun vahvistuksen ja tarjotaan vain koneilla joilla niistä on hyötyä (ei toimialueen koneille eikä ytimen huijauksenestolla)
- Ajo tarkistaa itse: vahvistamaton asiantuntijasäätö ei koskaan etene suunnitelmasta ajoon asti; uudelleenkäynnistyksen jälkeen tarkistetaan että muistin eheys tai hypervisor todella sammui
- Korjattu: Muistin eheyden erillinen valinta ohitti kirjoitettavan vahvistuksen

### Säädöt
- **Placebo pois**: 24 säätöä jäi eläkkeelle (mm. TCP-pino, NVIDIA/AMD-rekisteriavaimet, MMCSS, SvcHost-yhdistys); ne eivät muuttaneet mitään mitattavaa. Todisteet: `docs/TWEAK_EVIDENCE.md`
- **Uudet säädöt**: pelien ajo erillisellä GPU:lla (hybridigrafiikka), hiiren osoitin 6/11, Fault Tolerant Heap -nollaus, Wi-Fi-pelioptimointi, hypervisorin sammutus (riskitaso 3); MPO ja MSI-tila uudistettu
- **Riskilohko**: jokaisella riskitason 2 ja 3 säädöllä on "Mitä voi tapahtua / Älä käytä näissä" -osio kortissa ja vahvistusikkunassa
- Auto-optimointi löytää uusia asioita: Intel 13./14. sukupolven mikrokoodi, Intel APO, ReBAR pois, pelit kiintolevyllä, Windows 10, hybridiprosessori Windows 10:llä

### Laitteistontunnistus
- Yksi `caps`-kuvaus koneesta ja yksi sääntötaulu (`lib/tweak-applicability.js`), jota sekä Auto-optimointi että käsinvalintasivut käyttävät
- Uudet tunnistukset: prosessorin P/E-ytimet ja CCD-määrä, mikrokoodi, VBS/HVCI käynnissä, hypervisor, oikea VRAM, keskeytystila, järjestelmälevyn väylä, Wi-Fi-ajurin asetukset, ajastimen tarkkuus
- Korjattu: Intel Arc luokiteltiin integroiduksi, NVMe-tunnistus oli aina tosi, kahden CCD:n X3D tunnistettiin ytimien määrästä, parkkeeraus ja AMD-virrankäyttösuunnitelma näkyivät X3D-koneilla, HAGS-ehdotus ilman tietoa, tuntematon kotelotyyppi ohitti kaikki pöytäkonehavainnot

### Turvallisuus
- Kirjoitettava vahvistus (riskitaso 3) toimii nyt myös Windows-, Laatu- ja Laitteisto-välilehtien korteissa ja epäonnistuu suljetusti jos tietoja ei ole ladattu
- Korjattu VBS-varoitus: se ei riko WSL2:ta; Valorant-varoitus kohdistuu CFG:hen

## Julkaisematon (4.0 "Lasin läpi")

### Ulkoasu
- **3D-maailma taustalla**: koneesi malli on koko sovelluksen takana ja jokainen sivun hero-alue on ikkuna siihen; pinnat ovat savulasia, jonka reunoja valaisee yksi yhteinen valo
- Asetukset › Visuaalinen tyyli: Elokuvamainen, Tasapainoinen (oletus), Kevyt, Klassinen (ei 3D-taustaa); maailma on vain tummassa teemassa
- Numerot vierivät numero kerrallaan ja niiden päälle vietäessä näkyy mistä arvo on peräisin ja kuinka vanha se on
- Muutosten käyttöönotto pitämällä pohjassa; valo kulkee painikkeesta muutettuun osaan ja kumoaminen näyttää saman takaperin
- **Aikajana**: tallennetut muutokset, pelisessiot ja suorittimen kuorma; liu'uttamalla näet koneen kuorman siitä hetkestä (lämpötiloja ei ole tallennettu, joten niitä ei näytetä)
- Kotisivun osat saavat reaaliaikaiset kuplat ja viivat; Ctrl K ymmärtää oireita ("nykii", "korkea ping", "kuuma kone")
- Toisto: tallenna jakokortti PNG-kuvana (vain tallennetut arvot)
- Diagnostiikan aikana valotaso pyyhkäisee koneen läpi ja osat välähtävät; siivouksen jälkeen vapautuneet tavut nousevat asemasta; tehtäväpalkki näyttää etenemisen muutoksia otettaessa käyttöön; palautuspisteet näkyvät aikajanalla
- Verkko: nopeustestin lento (kirkas pallo linkkejä pitkin testin alussa ja lopussa); Siivous: levyn täyttöpalkki, josta poistettava osa tyhjenee; Toisto: heikoin sekunti ja tasaisuus, jakokortissa kuva oikeasta 3D-koneesta; tehtäväpalkin kuvake kertoo kun uudelleenkäynnistys tarvitaan; Ctrl K ja valintaikkunat lasia
- Uudet ilmoitukset: lasia, alareunassa keskellä, uusin päällä; Kumoa on ilmoituksen sisällä (erillinen kumoa-palkki poistui); pitkät nimet lyhennetään keskeltä; ilmoitus pysähtyy kun osoitin on sen päällä
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
