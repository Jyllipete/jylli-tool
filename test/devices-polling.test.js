const test = require('node:test')
const assert = require('node:assert')
const { polling, pollscript } = require('../lib/devices-all')

// A deterministic wobble so the traces are not perfectly flat.
let seed = 7
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
/** bins of a mouse moved in bursts: `hz` reports per second while moving, with jitter, separated by idle gaps. */
function trace(hz, { seconds = 4, jitter = 0.03, idleEvery = 7, slow = false } = {}) {
  const out = []
  for (let i = 0; i < seconds * 10; i++) {
    if (i % idleEvery === idleEvery - 1) { out.push(0); continue }
    const full = hz / 10
    const n = slow && i % 3 === 0 ? Math.round(full * 0.35) : Math.round(full * (1 + (rnd() - 0.5) * 2 * jitter))
    out.push(n)
  }
  return out
}

for (const hz of [125, 250, 500, 1000, 2000, 4000, 8000]) {
  test('estimate ' + hz + ' Hz from a moving mouse with idle gaps', () => {
    const e = polling.estimate(trace(hz))
    assert.strictEqual(e.ok, true)
    assert.strictEqual(e.hz, hz, JSON.stringify(e))
    assert.strictEqual(e.snapped, true)
    assert.ok(['high', 'medium'].includes(e.confidence))
  })
}

test('slow, uneven movement still reads the fast end (the 90th percentile), not the average', () => {
  const e = polling.estimate(trace(1000, { slow: true, seconds: 5 }))
  assert.strictEqual(e.ok, true)
  assert.strictEqual(e.hz, 1000)
  assert.ok(e.rawHz >= 900)
})

test('confidence drops when the data is thin or messy', () => {
  const few = polling.estimate([10, 10, 10, 10, 10, 10, 10, 10, 10, 10])      // 10 active bins, exactly 100 Hz-ish worth of counts per bin = 100 Hz... not a standard rate
  assert.strictEqual(few.ok, true)
  assert.strictEqual(few.snapped, false, '100 Hz is not within 12% of 125 Hz')
  assert.strictEqual(few.confidence, 'low')
  // mostly crawling with a few fast flicks: the fast end looks like 125 Hz but most of the data does not agree, so it is not "high"
  const mixed = polling.estimate([1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 12, 12, 13, 12, 12])
  assert.strictEqual(mixed.ok, true)
  assert.strictEqual(mixed.steady, false)
  assert.notStrictEqual(mixed.confidence, 'high')
  const crawl = polling.estimate([3, 4, 3, 5, 4, 3, 4, 5, 3, 4, 4, 3])
  assert.strictEqual(crawl.snapped, false, 'slow movement never reaches a standard rate')
  assert.strictEqual(crawl.confidence, 'low')
})

test('not enough to say anything: says so instead of a number', () => {
  assert.deepStrictEqual(polling.estimate([]).reason, 'no_movement')
  assert.deepStrictEqual(polling.estimate([0, 0, 0, 0]).reason, 'no_movement')
  assert.strictEqual(polling.estimate([5, 5, 5]).reason, 'too_little')
  assert.strictEqual(polling.estimate(null).ok, false)
  assert.strictEqual(polling.estimate(['x', NaN]).ok, false)
})

test('device path -> instance id', () => {
  assert.strictEqual(polling.pathToInstance('\\\\?\\HID#VID_36A7&PID_A881&MI_00#8&3578d41d&0&0000#{378de44c-56ef-11d1-bc8c-00a0c91405dd}'), 'HID\\VID_36A7&PID_A881&MI_00\\8&3578D41D&0&0000')
  assert.strictEqual(polling.pathToInstance('garbage'), '')
  assert.strictEqual(polling.pathToInstance(null), '')
})

test('helper output parsing: bad lines are null, good ones keep per-device bins', () => {
  assert.strictEqual(polling.parse(''), null)
  assert.strictEqual(polling.parse('JJPOLL:{bad'), null)
  const p = polling.parse('x\nJJPOLL:' + JSON.stringify({ ok: true, seconds: 4, synthetic: 3, devices: [{ path: '\\\\?\\HID#VID_1&PID_2#a#{x}', n: 5, w: [1, 2, 2] }, { n: 1 }] }))
  assert.strictEqual(p.synthetic, 3)
  assert.strictEqual(p.devices.length, 1)
  assert.deepStrictEqual(p.devices[0].bins, [1, 2, 2])
  assert.strictEqual(polling.parse('JJPOLL:' + JSON.stringify({ ok: false, error: 'register' })).error, 'register')
})

test('the helper only listens: no input is sent, nothing is written, the window is message-only', () => {
  const s = pollscript.buildScript(4)
  assert.ok(!/SendInput|keybd_event|mouse_event|SetCursorPos|WriteFile|DeviceIoControl|HidD_Set|Set-ItemProperty|reg add/i.test(s))
  assert.ok(/RegisterRawInputDevices/.test(s) && /new IntPtr\(-3\)/.test(s), 'HWND_MESSAGE parent')
  assert.ok(/dwFlags = 0x100/.test(s), 'sink mode')
  assert.ok(/if \(dev == 0\) synthetic\+\+/.test(s), 'input without a device handle is counted apart, never as a mouse')
  assert.match(s, /JJPoll\]::Run\(4\)/)
  assert.match(pollscript.buildScript(99), /Run\(10\)/, 'seconds are clamped')
  assert.match(pollscript.buildScript(0), /Run\(4\)|Run\(2\)/)
})
