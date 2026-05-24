## v1.4.9 — 2026-05-24

- Suomennettu Yleiset viritykset -korttien "Odotettu vaikutus" -kuvaukset — näkyy suomeksi kun kieli on asetettu suomeksi.

- Korjattu bugi, jossa useat viritykset (HPET, TSC Sync, MSI Mode jne.) näyttivät olevan pois päältä uudelleenkäynnistyksen jälkeen, vaikka ne olivat edelleen aktiivisena. Sovellus tarkistaa nyt järjestelmän todellisen tilan käynnistyessä.
- Korjattu uudelleenkäynnistysrivi ("X viritystä odottaa uudelleenkäynnistystä") näkymästä turhaan uudelleenkäynnistyksen jälkeen jo aktiiville virityksille.
- Korjattu HPET-virityksen tunnistus — sovellus tarkistaa nyt oikean rekisteriarvon (`useplatformtick`) eikä arvoa, jonka aktivointi tahallisesti poistaa.
- Korjattu bcdedit-kysely, joka epäonnistui hiljaa väärän PowerShell-lainausmerkkikäytännön vuoksi — aiheutti sen, että kaikki BCD-pohjaiset viritykset (HPET, TSC Sync jne.) näyttivät aina soveltamattomilta.
- Korjattu uudelleenkäynnistysrivi, joka näkyi joka käynnistyksellä eikä vain uudelleenkäynnistyksen jälkeen — seurantarakenne alustettiin vain uudelleenkäynnistyslogiikan sisällä, joten muilla käynnistyksillä se oli määrittelemätön.

## v1.4.8 — 2026-05-24

- Translated all General Tweaks info card "Expected Impact" descriptions to Finnish. The popup now shows Finnish text when the language is set to Finnish and falls back to English otherwise.

- Fixed tweaks (HPET, TSC Sync, MSI Mode, GPU Hardware Scheduling, Cursor Max Rate, Spectre/Meltdown, BCD Boot Tweaks, Global Timer Resolution) showing as disabled after reboot even though they were still active on the system. The app now re-checks actual system state on launch after a reboot instead of blindly resetting those toggles to off.
- Fixed reboot bar ("X tweaks need a reboot") incorrectly appearing after a reboot for tweaks that have already been verified as active. The bar now only shows for tweaks applied in the current session that genuinely still need a reboot.
- Fixed HPET tweak toggling off after reboot — the detection was checking for a registry value that the apply step deliberately deletes. Now correctly detects HPET state via `useplatformtick` instead.
- Fixed bcdedit query in the startup tweak-state check failing silently due to incorrect PowerShell quoting — `bcdedit /enum '{current}'` was passing literal quote characters to bcdedit, causing it to error and return no data, so all BCD-based tweaks (HPET, TSC Sync, BCD tweaks) always showed as not applied after reboot.
- Fixed reboot bar always showing on every launch (not just post-reboot) — the verified-tweaks tracking Set was only initialized inside the reboot-detection block, so on any non-reboot launch it was undefined and all applied tweaks were counted as pending.
