const { execFile } = require('child_process')

/**
 * Runs an executable with an ARGUMENT ARRAY — no shell, so renderer-derived values cannot be interpreted as commands.
 * Resolves { ok, out, err, code } and never rejects.
 */
function runFile(exe, args = [], { timeout = 30000, cwd } = {}) {
  return new Promise(resolve => {
    execFile(exe, args, { windowsHide: true, timeout, cwd, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        out: String(stdout || '').trim(),
        err: String(stderr || '').trim(),
        code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
      })
    })
  })
}

/** PowerShell -EncodedCommand payload: the script text is passed as base64, so quoting can never break out of it. */
const psEncoded = script => Buffer.from(String(script), 'utf16le').toString('base64')

module.exports = { runFile, psEncoded }
