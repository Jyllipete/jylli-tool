'use strict'
// Last known specs on disk (userData/jt_sysinfo.json) so a second launch can show the machine instantly.
const fs = require('fs')
const path = require('path')
const { signature } = require('./fingerprint')
const VERSION = 1
// Never replayed from disk: these are asked live every launch.
const VOLATILE = ['isAdmin', 'onBattery', 'hasInternet', 'wifiSsid', 'wifiBand', 'wifiSignal']

function read(file) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!j || j.v !== VERSION || !j.info || typeof j.info !== 'object' || !(j.info.cpu || j.info.gpu)) return null
    return j
  } catch { return null }
}
function write(file, info, now = Date.now()) {
  const keep = Object.assign({}, info)
  for (const k of VOLATILE) delete keep[k]
  const body = JSON.stringify({ v: VERSION, savedAt: now, signature: signature(info), info: keep })
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = file + '.tmp'
    fs.writeFileSync(tmp, body); fs.renameSync(tmp, file)
    return true
  } catch { return false }
}
module.exports = { read, write, VERSION, VOLATILE }
