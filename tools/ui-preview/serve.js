// Tiny static file server for browser-based previews (no dependencies): node tools/ui-preview/serve.js [port]
// Serves the repo root so pages such as tools/ui-preview/twin-demo.html can load css/, js/ and test fixtures.
const http = require('http'), fs = require('fs'), path = require('path')
const root = path.join(__dirname, '..', '..')
const port = Number(process.argv[2]) || 5177
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.ps1': 'text/plain; charset=utf-8', '.csv': 'text/plain; charset=utf-8' }
http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'
  const file = path.normalize(path.join(root, rel))
  if (!file.startsWith(root) || /node_modules|\.git[\\/]/.test(file)) { res.writeHead(403).end(); return }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end('not found'); return }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(buf)
  })
}).listen(port, '127.0.0.1', () => console.log('serving ' + root + ' on http://127.0.0.1:' + port))
