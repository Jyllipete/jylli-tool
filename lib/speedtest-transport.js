'use strict'
// Node transport for lib/speedtest.js: streaming download, chunked upload and a TTFB latency probe, all against
// speed.cloudflare.com over HTTPS. No cookies, no redirects followed to other hosts, bounded by the abort signal.
const https = require('https')

const HOST = 'speed.cloudflare.com'
const agent = new https.Agent({ keepAlive: true, maxSockets: 12 })

function fetchChunked(url, { method = 'GET', uploadBytes = 0, onChunk = () => {}, signal } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    if (u.hostname !== HOST) return reject(new Error('host not allowed'))
    const req = https.request({ hostname: HOST, path: u.pathname + u.search, method, agent, headers: { 'User-Agent': 'JylliTool-speedtest', 'Cache-Control': 'no-store', ...(method === 'POST' ? { 'Content-Type': 'application/octet-stream', 'Content-Length': uploadBytes } : {}) } }, res => {
      res.on('data', d => { if (method === 'GET') onChunk(d.length) })
      res.on('end', () => resolve({ headers: res.headers }))
      res.on('error', reject)
    })
    req.on('error', reject)
    const onAbort = () => { req.destroy(); resolve({ headers: {} }) }
    if (signal) { if (signal.aborted) return onAbort(); signal.addEventListener('abort', onAbort, { once: true }) }
    if (method === 'POST') {
      const chunk = Buffer.alloc(64 * 1024)
      let sent = 0
      const pump = () => {
        while (sent < uploadBytes) {
          const n = Math.min(chunk.length, uploadBytes - sent)
          const ok = req.write(n === chunk.length ? chunk : chunk.subarray(0, n))
          sent += n; onChunk(n)
          if (!ok) { req.once('drain', pump); return }
        }
        req.end()
      }
      pump()
    } else req.end()
  })
}

/** Time to first byte of a tiny request, in ms. Reuses the keep-alive socket, so it is close to the round-trip time. */
function latencyProbe() {
  return new Promise(resolve => {
    const t0 = process.hrtime.bigint()
    const req = https.request({ hostname: HOST, path: '/__down?bytes=0', method: 'GET', agent, headers: { 'Cache-Control': 'no-store' } }, res => {
      res.once('data', () => {}); res.on('end', () => {})
      resolve(Number(process.hrtime.bigint() - t0) / 1e6)
      res.resume()
    })
    req.on('error', () => resolve(null))
    req.setTimeout(3000, () => { req.destroy(); resolve(null) })
    req.end()
  })
}

module.exports = { fetchChunked, latencyProbe }
