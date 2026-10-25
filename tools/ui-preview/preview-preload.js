// Mock `window.api` for the UI preview harness. Every call is answered by fixtures in the harness main process —
// nothing here (or there) ever touches the registry, services, PowerShell or the network.
const { contextBridge, ipcRenderer } = require('electron')

const keys = ipcRenderer.sendSync('mock-keys')
const subs = new Map()   // event name (on…) -> Set(callback)

const api = {}
for (const k of keys) {
  if (/^on[A-Z]/.test(k)) {
    api[k] = (cb) => { if (!subs.has(k)) subs.set(k, new Set()); subs.get(k).add(cb); return () => subs.get(k)?.delete(cb) }
  } else if (/^off[A-Z]/.test(k)) {
    api[k] = () => { subs.delete('on' + k.slice(3)) }
  } else {
    api[k] = (...args) => ipcRenderer.invoke('mock', k, JSON.parse(JSON.stringify(args, (_, v) => (typeof v === 'function' ? undefined : v))))
  }
}
contextBridge.exposeInMainWorld('api', api)

// the harness can push events (e.g. tier updates) into the page
ipcRenderer.on('mock-event', (_, name, data) => { for (const cb of subs.get(name) || []) { try { cb(data) } catch {} } })
