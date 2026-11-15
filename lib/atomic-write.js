'use strict'
// Writes a file so a crash or power cut can never leave it half written: the text goes to a temp file next to it, then the temp file is renamed over the target.
// A rename on the same volume replaces the file in one step. Throws like fs.writeFileSync (callers keep their own try/catch).
const fs = require('fs')
function writeFileAtomic(file, data, enc = 'utf8') {
  const tmp = file + '.' + process.pid + '.tmp'
  try {
    fs.writeFileSync(tmp, data, enc)
    fs.renameSync(tmp, file)
  } catch (e) {
    try { fs.unlinkSync(tmp) } catch { /* nothing to clean */ }
    throw e
  }
}
module.exports = { writeFileAtomic }
