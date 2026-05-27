## v1.5.2
- Fix: USB Selective Suspend / Power Guard palautus ei enää sammuta Logitech G HUB -palvelua pysyvästi
- Fix: Hiirispokkaus-korjauksen palautus palauttaa nyt myös G HUB -palvelun
- New Fix: "Palauta Logitech G HUB" — käynnistää G HUB -palvelun ja siivoustehtävän uudelleen käyttäjille, joita aiemmat versiot haittasivat
- Fix: JS-syntaksivirhe korjattu (sovellus kaatui käynnistyksessä)
- Fix: NIC-laitteiston purku palauttaa nyt myös RSC:n (puuttuva palautus hidasti nettinopeutta)
- Fix: Memory Guard Tune palautus korjaa nyt kaikki 4 muutosta — pagefile, LargeSystemCache ja ClearPageFileAtShutdown jäivät palauttamatta (pagefile 0 0 rajoitti verkon läpimenoa)
- Fix: Full Mitigation Wipe palautus ottaa nyt CFG:n ja SEHOP:n uudelleen käyttöön Set-ProcessMitigationilla (aiemmin poistettiin vain rekisteriavaimet)

