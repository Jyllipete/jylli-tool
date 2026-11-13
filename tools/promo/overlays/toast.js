(() => {
  const undo = { label: 'Kumoa', run() {} }
  toast('Muutos otettu käyttöön', 'Verkko: DNS vaihdettu', 'ok', 60000, { action: undo })
  toast('Pikaopt. valmis', '3,3 Gt vapautettu', 'ok', 60000, { action: undo })
  toast('Palautuspiste luotu', 'Voit palata tähän milloin tahansa', 'info', 60000)
  return 'toast'
})()
