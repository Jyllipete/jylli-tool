const test = require('node:test')
const assert = require('node:assert')
const G = require('../lib/games-registry')

const LIBRARYFOLDERS = `"libraryfolders"
{
\t"0"
\t{
\t\t"path"\t\t"C:\\\\Program Files (x86)\\\\Steam"
\t\t"apps"
\t\t{
\t\t\t"730"\t\t"28000000000"
\t\t}
\t}
\t"1"
\t{
\t\t"path"\t\t"D:\\\\SteamLibrary"
\t\t"apps"
\t\t{
\t\t\t"570"\t\t"1"
\t\t}
\t}
}`
const acf = (id, name, dir) => `"AppState"\n{\n\t"appid"\t\t"${id}"\n\t"name"\t\t"${name}"\n\t"installdir"\t\t"${dir}"\n\t"StateFlags"\t\t"4"\n}`

test('VDF parser handles nesting and escaped paths', () => {
  const v = G.parseVdf(LIBRARYFOLDERS)
  assert.strictEqual(v.libraryfolders['0'].path, 'C:\\Program Files (x86)\\Steam')
  assert.strictEqual(v.libraryfolders['1'].apps['570'], '1')
  assert.deepStrictEqual(G.libraryPaths(LIBRARYFOLDERS), ['C:\\Program Files (x86)\\Steam', 'D:\\SteamLibrary'])
  assert.deepStrictEqual(G.libraryPaths('"libraryfolders" { "1" "D:\\\\Old" }'), ['D:\\Old'])
})

test('manifests', () => {
  assert.deepStrictEqual(G.parseAppManifest(acf(730, 'Test Game', 'TestDir')), { appid: '730', name: 'Test Game', installdir: 'TestDir' })
  assert.strictEqual(G.parseAppManifest('"AppState" { }'), null)
  assert.deepStrictEqual(G.parseEpicItem('{"AppName":"abc","DisplayName":"Epic Game","InstallLocation":"E:\\\\Games\\\\Epic","LaunchExecutable":"x.exe"}'), { id: 'abc', name: 'Epic Game', install: 'E:\\Games\\Epic', exe: 'x.exe' })
  assert.strictEqual(G.parseEpicItem('not json'), null)
  assert.strictEqual(G.parseEpicItem({ AppName: 'dlc', DisplayName: 'DLC', bIsApplication: false }), null)
})

test('scan: Steam libraries + Epic, canonical ids, preset aliases keep old settings working', () => {
  const files = {
    'S/steamapps/libraryfolders.vdf': LIBRARYFOLDERS.replace('C:\\\\Program Files (x86)\\\\Steam', 'S'),
    'S/steamapps/appmanifest_730.acf': acf(730, 'Counter Strike 2', 'cs2'),
    'D:\\SteamLibrary/steamapps/appmanifest_570.acf': acf(570, 'Some Other Game', 'other'),
    'E/a.item': '{"AppName":"fort","DisplayName":"Fortnite","InstallLocation":"E:\\\\Fortnite"}',
  }
  const io = {
    join: (...p) => p.join('/'), readFile: p => files[p] ?? null,
    listDir: d => Object.keys(files).filter(k => k.startsWith(d + '/') && !k.slice(d.length + 1).includes('/')).map(k => k.slice(d.length + 1)),
  }
  const games = G.scan({ steamRoot: 'S', epicDir: 'E', io, presets: { fortnite: 'Fortnite', cs2: 'Counter-Strike 2' } })
  assert.deepStrictEqual(games.map(g => g.id), ['steam:730', 'epic:fort', 'steam:570'])
  assert.deepStrictEqual(games.find(g => g.id === 'steam:730').aliases, ['cs2'])      // punctuation-insensitive name match
  assert.strictEqual(G.resolve(games, 'fortnite').id, 'epic:fort')                     // old preset id still resolves
  assert.strictEqual(G.resolve(games, 'steam:570').name, 'Some Other Game')
  assert.strictEqual(G.resolve(games, 'nope'), null)
})

test('cover candidates cover both librarycache layouts', () => {
  const c = G.coverCandidates('S', 730, (...p) => p.join('/'))
  assert.ok(c[0].endsWith('730_library_600x900.jpg')); assert.ok(c.some(x => x.endsWith('730/library_600x900.jpg')))
})
