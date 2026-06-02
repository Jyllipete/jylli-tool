# Jylli Tool Changelog

## v1.5.4 — Pulse Update Guard & Game Shield, Advanced Tab Tools, App Optimizer Upgrades, Cleanup Additions, BIOS Tuner Diagnostics, Settings Enhancements

### Pulse
- **Update Guard** — Prevents Windows Update from starting during game sessions; resumes automatically after the game closes. | Estää Windows Updaten käynnistymisen pelisessioiden aikana — jatkuu automaattisesti pelin sulkemisen jälkeen.
- **Game Shield** — Kills background processes on game launch for maximum CPU headroom; restored after the game closes. | Tappaa taustaprosessit pelin käynnistyessä maksimaalisen CPU-tilan saamiseksi — palautetaan pelin sulkemisen jälkeen.
- Improved overall Pulse logic and reliability. | Ylipäätänsä paranneltu Pulsen logiikkaa ja toimivuutta.

### Advanced (Lisäasetukset)
- **Interrupt Affinity Tool** — Sets Interrupt Management → Affinity Policy in the Windows device registry for NIC, audio and USB driver classes; moves IRQ handling to logical cores 2+, leaving cores 0–1 free for your game thread. | Asettaa affiniteettikäytännön laitteistoluokille, siirtää IRQ-käsittelyn loogisille ytimille 2+, jättäen ytimet 0–1 vapaaksi pelisäikeellesi.
- **CPU Core Topology Optimizer** — Pin your game to the best cores. | Kiinnitä peli parhaisiin ytimiin.
- **Thermal Throttle Finder** — Real-time throttle reason detection. | Reaaliaikainen rajoitussyyn tunnistus.
- **Power Efficiency Monitor** — GPU watts per frame — find your optimal TDP. | GPU-wattia per ruutu — löydä optimaalinen TDP.
- **Latency Profiler** — Frame pipeline view: CPU, GPU and display queue. | Ruutuputkilinja — CPU, GPU ja näyttöjono.

### App Optimizer (Sovellussäätö)
- **Smart Game Mode** — Automatic background management during gameplay. | Automaattinen taustahallinta pelin aikana.
- **Conflict Detector** — Identifies all conflicts in app combinations and tells you how to fix them. | Tunnistaa kaikki ristiriidat sovellusyhdistelmissä ja kertoo miten korjata ne.

### Cleanup (Siivous)
- **Ghost App Detector** — Find leftover data from uninstalled apps. | Löydä tietoja poistettujen sovellusten jäljiltä.
- **Disk Health Timeline** — Track cleanup history and disk fill rate. | Seuraa siivoushistoriaa ja levyn täyttönopeutta.

### BIOS Tuner (BIOS-säätäjä)
- **Stability Confidence Score** — Runs a quick background test after tuning and checks Windows hardware error logs for instability signals. | Suorittaa nopean taustatestin virityksen jälkeen ja tarkistaa Windowsin laitteistovirhelokeja epävakauden merkkejä varten.
- **Thermal Fingerprint** — 60-second passive observation classifies your system's thermal personality. | 60 sekunnin passiivinen tarkkailu luokittelee tietokoneesi termisen persoonallisuuden.
- **Boot Time Chronicle** — Shows exactly where your PC spends time at startup using Windows boot data. | Näyttää tarkalleen missä tietokoneesi käyttää aikaa käynnistyksen aikana Windows-käynnistystietoja käyttäen.
- Improved overall BIOS Tuner logic and reliability. | Paranneltu logiikkaa ja toimivuutta ylipäätänsä.

### Settings (Asetukset)
- **Quiet Mode** — Jylli pauses its own background activity and silences Windows notifications during gaming. | Jylli keskeyttää taustatoimintansa ja hiljentää Windowsin ilmoitukset pelaamisen aikana.
- **Low Resource Mode** — Slows background checks while in tray — game detection may take up to 30 s, thermal monitoring pauses. | Hidastaa taustatarkistuksia kelluessa ilmoitusalueella — pelidetektio voi kestää 30 s, lämpöseuranta pysähtyy.
- **ThermalGuard** — Shows CPU temperature in the sidebar continuously; warns if CPU runs too hot at idle. | Näyttää CPU-lämpötilan sivupalkissa jatkuvasti — varoittaa, jos CPU lämpenee liikaa tyhjäkäynnillä.

### General
- Every tab audited and every found bug fixed. | Jokainen sivu käyty läpi ja korjattu jokainen bugi mitä löytyi.
- Numerous recurring bugs and errors fixed. | Korjattu paljon ilmeneviä bugeja/erroreita.
- ARIA analysis improved — significantly more accurate readings. | ARIA:n analyysiä paranneltu, se antaa nykyään huomattavasti tarkempia lukemia.
- Many other extras and improvements! | Paljon muuta extraa!
