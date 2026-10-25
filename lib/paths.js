const path = require('path')

/** True only when `target` is strictly INSIDE `root` (not equal, no traversal, same drive). Case-insensitive like NTFS. */
function isStrictSubpath(root, target) {
  if (typeof root !== 'string' || typeof target !== 'string' || !root || !target) return false
  const r = path.win32.resolve(root)
  const t = path.win32.resolve(target)
  const rel = path.win32.relative(r.toLowerCase(), t.toLowerCase())
  return rel !== '' && !rel.startsWith('..') && !path.win32.isAbsolute(rel)
}

/** First path component of `target` below `root` (the application folder name), lower-cased. */
function topFolderUnder(root, target) {
  const rel = path.win32.relative(path.win32.resolve(root).toLowerCase(), path.win32.resolve(target).toLowerCase())
  return rel.split('\\')[0]
}

module.exports = { isStrictSubpath, topFolderUnder }
