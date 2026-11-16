const test = require('node:test')
const assert = require('node:assert')
const { needs, liveSensors, UNLOAD_AFTER_MS } = require('../lib/tray')

test('a hidden app with nothing running needs nothing', () => {
  assert.deepStrictEqual(needs({}), [])
  assert.strictEqual(liveSensors({ visible: false }), false)
})

test('every reason is reported by name and wakes the sensors', () => {
  const all = { visible: 1, game: 1, session: 1, powerGuard: 1, hud: 1, aria: 1, pulseSub: 1 }
  assert.deepStrictEqual(needs(all), ['visible', 'game', 'session', 'power-guard', 'hud', 'aria', 'pulse-sub'])
  for (const k of Object.keys(all)) assert.strictEqual(liveSensors({ [k]: true }), true, k)
})

test('the page is unloaded after a minute', () => { assert.strictEqual(UNLOAD_AFTER_MS, 60000) })

test('LibreHardwareMonitor runs only while something wants it', () => {
  const T = require('../lib/tray')
  assert.equal(T.lhmWanted({}), false)                       // hidden, no game, nothing reading it
  assert.equal(T.lhmWanted({ visible: true }), true)
  assert.equal(T.lhmWanted({ session: true }), true)
  assert.equal(T.lhmWanted({}, true), true)                  // a reader asked for it in the last minute
  assert.equal(T.lhmWanted({ aria: true, hud: true, powerGuard: true }), false)   // those are served by the sensor bridge, not by LHM
})
