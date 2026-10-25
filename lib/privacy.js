// Removes the OS user name from anything that leaves the machine (stack traces, error text, paths).
function scrubPaths(str) {
  if (typeof str !== 'string') return str
  return str
    .replace(/[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s'"`)]+/gi, 'C:\\Users\\<user>')
    .replace(/\/(?:Users|home)\/[^/\s'"`)]+/g, '/Users/<user>')
}

module.exports = { scrubPaths }
