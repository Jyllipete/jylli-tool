// Tiny static file server for browser-based previews (no dependencies): node tools/ui-preview/serve.js [port]
// Serves the repo root so pages such as tools/ui-preview/twin-demo.html can load css/, js/ and test fixtures.
// /app opens the REAL index.html with `window.api` answered by tools/ui-preview/fixtures.js (the same mock the Electron preview uses):
// no registry, services, PowerShell or network is ever touched. Add ?lang=fi&tier=free to change the fixture context.
const http = require('http'), fs = require('fs'), path = require('path')
const root = path.join(__dirname, '..', '..')
const port = Number(process.argv[2]) || 5177
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.ps1': 'text/plain; charset=utf-8', '.csv': 'text/plain; charset=utf-8' }
const apiKeys = () => [...new Set([...fs.readFileSync(path.join(root, 'preload.js'), 'utf8').matchAll(/^\s{2}([A-Za-z0-9_]+):\s/gm)].map(m => m[1]))]

const SHIM = keys => `(() => {
  const subs = new Map(), api = {}
  for (const k of ${JSON.stringify(keys)}) {
    if (/^on[A-Z]/.test(k)) api[k] = cb => { if (!subs.has(k)) subs.set(k, new Set()); subs.get(k).add(cb); return () => subs.get(k)?.delete(cb) }
    else if (/^off[A-Z]/.test(k)) api[k] = () => { subs.delete('on' + k.slice(3)) }
    else api[k] = (...args) => fetch('/__api/' + k + location.search, { method: 'POST', body: JSON.stringify(args, (_, v) => (typeof v === 'function' ? undefined : v)) }).then(r => r.json()).then(j => j.v)
  }
  window.api = api
  window.__pushEvent = (name, data) => { for (const cb of subs.get(name) || []) { try { cb(data) } catch {} } }
})()`

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  if (url.pathname === '/app') {
    const h = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace('<head>', '<head><script src="/__shim.js"></script>')
    res.writeHead(200, { 'Content-Type': types['.html'], 'Cache-Control': 'no-store' }).end(h); return
  }
  if (url.pathname === '/__shim.js') { res.writeHead(200, { 'Content-Type': types['.js'], 'Cache-Control': 'no-store' }).end(SHIM(apiKeys())); return }
  if (url.pathname.startsWith('/__api/') && req.method === 'POST') {
    let body = ''
    req.on('data', c => { body += c })
    req.on('end', async () => {
      try {
        const { respond } = require('./fixtures')
        const ctx = { lang: url.searchParams.get('lang') || 'en', premium: (url.searchParams.get('tier') || 'premium') === 'premium' }
        const v = await respond(url.pathname.slice(7), JSON.parse(body || '[]'), ctx)
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ v: v === undefined ? null : v }))
      } catch (e) { res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ v: null, error: String(e && e.message || e) })) }
    })
    return
  }
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
  const file = path.normalize(path.join(root, rel))
  if (!file.startsWith(root) || /node_modules|\.git[\\/]/.test(file)) { res.writeHead(403).end(); return }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end('not found'); return }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(buf)
  })
}).listen(port, '127.0.0.1', () => console.log('serving ' + root + ' on http://127.0.0.1:' + port))
