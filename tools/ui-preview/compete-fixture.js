// Competitive Mode answers for the browser preview: a synthetic PC with six games. State changes are pushed from the page with
// window.__pushEvent('onCompeteState', {...}) (see the comments in docs/COMPETE_EVIDENCE.md for the scenes).
const GAMES = [
  { id: 'steam:2807960', source: 'steam', name: 'Battlefield™ 6' },
  { id: 'steam:1938090', source: 'steam', name: 'Call of Duty®' },
  { id: 'xbox:Activision.CODBO6_x', source: 'xbox', name: 'Call of Duty® Black Ops 6' },
  { id: 'epic:Fortnite', source: 'epic', name: 'Fortnite' },
  { id: 'steam:271590', source: 'steam', name: 'Grand Theft Auto V Legacy' },
  { id: 'steam:2073850', source: 'steam', name: 'THE FINALS' },
]
const CPUS = Array.from({ length: 16 }, (_, n) => ({ n, core: n >> 1, smt: n % 2 === 1 }))
function respond(name, args, ctx) {
  switch (name) {
    case 'competeGames': return { ok: true, games: GAMES }
    case 'competeState': return { ok: true, state: 'idle', premium: !!ctx.premium, cores: { ok: true, kinds: ['skip0'], logical: 16, cpus: CPUS }, last: null, opts: {}, services: ['WSearch'] }
    case 'competeStart': return { ok: true, state: 'waiting' }
    case 'competeStop': return { ok: true, state: 'idle' }
    case 'competeBrowse': return { ok: false, canceled: true }
    case 'competeShortcut': return ctx.premium ? { ok: true } : { ok: false, reason: 'premium_required' }
    default: return undefined
  }
}
module.exports = { respond }
