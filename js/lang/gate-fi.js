'use strict'
// Discord-portin tekstit (ryhmä gate). Avainperheet ovat samat kuin gate-en.js:ssä.
globalThis.LANG = globalThis.LANG || { en: {}, fi: {} }
LANG.fi.gate = {
  h_title: 'Sinun PC:si, viritetty peleille.', h_sub: 'Jylli Tool on Jylli Tool Discord-palvelimen jäsenille. Yhdistä Discord kerran, niin pääset sisään.',
  v_1: 'Virittele Windows pelaamiseen muutamalla klikkauksella', v_2: 'Jokaisen muutoksen voi perua palautuspisteellä', v_3: 'Asetuksesi pysyvät tällä koneella',
  tr_1: 'Kirjaudut discord.com-sivustolla. Jylli Tool ei näe salasanaasi.', tr_2: 'Istuntosi on salattu tällä koneella.', tr_3: 'Se pysyy voimassa 30 päivää.',
  st_browser: 'Selain avattu', st_approve: 'Hyväksy Discordissa', st_verify: 'Jäsenyys tarkistettu', st_unlocked: 'Avattu',
  s_idle: 'Valmiina kun sinä olet', s_expired: 'Istuntosi päättyi. Kirjaudu uudelleen jatkaaksesi.', s_opening: 'Avataan selainta',
  s_waiting: 'Hyväksy Jylli Tool juuri avautuneessa selaimen välilehdessä.', s_verify: 'Tarkistetaan jäsenyyttäsi ja avainta',
  s_browserFailed: 'Selain ei avautunut. Avaa linkki itse tai kopioi se.',
  s_timeout: 'Kirjautumisikkuna sulkeutui 2 minuutin jälkeen. Mitään ei muutettu.', s_offline: 'Palvelimeen ei saatu yhteyttä. Tarkista yhteytesi. Jylli Tool yrittää uudelleen, kun olet taas verkossa.',
  s_checking: 'Tarkistetaan tallennettua istuntoa', s_noSession: 'Tällä koneella ei ole vielä tallennettua istuntoa. Yhdistä Discord aloittaaksesi.',
  s_denied: 'Ei kirjautunut',
  d_member: 'Discord-tilisi ei ole vielä Jylli Tool -palvelimella. Liity sinne ja tarkista uudelleen.',
  d_key: 'Palvelimen avainta ei voitu vahvistaa. Päivitä Jylli Tool tai yritä uudelleen.',
  d_expired: 'Kirjautumislinkki vanheni. Aloita alusta.',
  d_cancelled: 'Peruit kirjautumisen. Mitään ei jaettu. Aloita uudelleen, kun olet valmis.',
  d_banned: 'Tällä Discord-tilillä ei voi käyttää Jylli Toolia. Jos tämä on mielestäsi virhe, ota yhteyttä palvelimen ylläpitoon.',
  d_error: 'Discord ei vastannut odotetusti. Mitään ei muutettu. Yritä uudelleen.',
  b_link: 'Yhdistä Discord', b_cancel: 'Peruuta', b_again: 'Yritä uudelleen', b_join: 'Liity palvelimelle', b_joined: 'Liityin, tarkista uudelleen',
  b_reopen: 'Avaa uudelleen', b_copy: 'Kopioi linkki', b_copied: 'Kopioitu', b_saved: 'Tarkista tallennettu istunto', b_lang: 'Kieli', b_min: 'Pienennä', b_close: 'Sulje',
  left: '{n} s jäljellä', hasAccess: 'Oletko jo kirjautunut tällä koneella?',
  g_welcome: 'Tervetuloa', g_premium: 'Premium on käytössä.', g_free: 'Ilmainen taso on käytössä. Premium tuo lisää työkaluja, kun haluat.', g_loading: 'Käynnistetään Jylli Tool',
  aria_dial: 'Kirjautumisen eteneminen',
}
