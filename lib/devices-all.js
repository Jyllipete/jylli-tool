'use strict'
// One require for the whole Devices engine (tests and the page harness), like lib/startup/index.js exposes its parts.
module.exports = {
  detect: require('./devices/detect'), classify: require('./devices/classify'), model: require('./devices/model'), vendors: require('./devices/vendors'),
  findings: require('./devices/findings'), controls: require('./devices/controls'), polling: require('./devices/polling'), pollscript: require('./devices/pollscript'),
  sources: require('./devices/sources'), service: require('./devices'),
}
