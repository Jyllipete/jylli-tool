'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { schedSummary } = require('../js/pages/system-scheduler.js')

const NOW = Date.parse('2026-11-10T12:00:00Z')
test('counts active and paused, picks the earliest enabled run', () => {
  const s = schedSummary([
    { TaskName: 'JT_ClearTemp', Description: 'Clear temp', State: 'Ready', NextRunTime: '2026-11-11T03:00:00Z' },
    { TaskName: 'JT_FlushDns', State: 'Ready', NextRunTime: '2026-11-10T18:00:00Z' },
    { TaskName: 'JT_Old', State: 'Disabled', NextRunTime: '2026-11-10T13:00:00Z' },
  ], NOW)
  assert.strictEqual(s.total, 3); assert.strictEqual(s.active, 2); assert.strictEqual(s.paused, 1)
  assert.strictEqual(s.next.name, 'FlushDns')   // the disabled task is never "next", JT_ is stripped when there is no label
  assert.strictEqual(s.overdue, false)
})
test('overdue and empty', () => {
  assert.strictEqual(schedSummary([{ TaskName: 'JT_A', State: 'Ready', NextRunTime: '2026-11-10T11:00:00Z' }], NOW).overdue, true)
  assert.deepStrictEqual(schedSummary(null, NOW), { total: 0, active: 0, paused: 0, next: null, overdue: false })
})
