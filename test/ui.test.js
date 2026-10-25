'use strict'
const test = require('node:test')
const assert = require('node:assert')
const ui = require('../js/ui')
const { html, raw } = ui

test('html escapes interpolated values and keeps trusted fragments', () => {
  const evil = '<img src=x onerror=alert(1)>"\''
  const out = String(html`<b>${evil}</b>${raw('<i>ok</i>')}${html`<u>${evil}</u>`}`)
  assert.ok(!out.includes('<img'))
  assert.ok(out.includes('&lt;img'))
  assert.ok(out.includes('<i>ok</i>'))
  assert.strictEqual((out.match(/&lt;img/g) || []).length, 2)   // nested html`` is not double-escaped
})

test('arrays join, null/false render nothing', () => {
  assert.strictEqual(String(html`${[html`<a>1</a>`, 'x<', null, false]}`), '<a>1</a>x&lt;')
})

test('component text and attributes are escaped', () => {
  const b = String(ui.button({ label: '<x>', onclick: 'go("a")', title: '"q"' }))
  assert.ok(b.includes('&lt;x&gt;'))
  assert.ok(b.includes('onclick="go(&quot;a&quot;)"'))
  assert.ok(b.includes('title="&quot;q&quot;"'))
  const r = String(ui.row({ title: '<script>', sub: '<b>' }))
  assert.ok(!r.includes('<script>') && !r.includes('<b>'))
})

test('tabs substitute a sanitised id into the handler', () => {
  const t = String(ui.tabs([{ id: 'a"b', label: 'A' }, { id: 'c', label: 'C', pro: true }], 'c', "tab('{id}')"))
  assert.ok(t.includes("tab(&#39;ab&#39;)"))
  assert.ok(t.includes('j-tab-active'))
  assert.ok(t.includes('j-badge-pro'))
})

test('meter and ring clamp their input', () => {
  assert.ok(String(ui.meter(250)).includes('width:100%'))
  assert.ok(String(ui.meter(-4)).includes('width:0%'))
  assert.ok(String(ui.ring(NaN, 'x')).includes('0.0 '))
})

test('table renders rows, and the empty fallback when there are none', () => {
  const cols = [{ key: 'n', label: 'Name', sortable: true }, { key: 'v', label: 'V', align: 'right', render: r => html`<b>${r.v}</b>` }]
  const t = String(ui.table({ columns: cols, rows: [{ n: '<a>', v: 1 }], sort: { key: 'n', dir: 'asc' }, onSort: 'sortBy' }))
  assert.ok(t.includes('&lt;a&gt;') && t.includes('<b>1</b>') && t.includes('fa-arrow-up') && t.includes('sortBy(&#39;n&#39;)'))
  assert.strictEqual(String(ui.table({ columns: cols, rows: [], empty: 'none' })), 'none')
})
