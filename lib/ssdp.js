'use strict'
// Router identity from UPnP/SSDP, without touching anything beyond the local network:
//   1. M-SEARCH on 239.255.255.250:1900 and collect responses
//   2. only a responder whose address IS the default gateway is considered
//   3. its description XML is fetched only from that gateway IP (never from a host named in a response), and only when private
// The parsers are pure and unit-tested. Nothing is invented: no response, no identity.

const MSEARCH = ['M-SEARCH * HTTP/1.1', 'HOST: 239.255.255.250:1900', 'MAN: "ssdp:discover"', 'MX: 2', 'ST: upnp:rootdevice', '', ''].join('\r\n')

function isPrivateIp(ip) {
  const m = String(ip).match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
}

function parseSsdpResponse(text) {
  const lines = String(text).split(/\r?\n/)
  if (!/^HTTP\/1\.1 200/i.test(lines[0] || '') && !/^NOTIFY/i.test(lines[0] || '')) return null
  const h = {}
  for (const l of lines.slice(1)) { const i = l.indexOf(':'); if (i > 0) h[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim() }
  if (!h.location) return null
  let u; try { u = new URL(h.location) } catch { return null }
  return { location: h.location, host: u.hostname, port: u.port || '80', server: h.server || null, usn: h.usn || null }
}

const tag = (xml, name) => { const m = String(xml).match(new RegExp('<' + name + '>([^<]*)</' + name + '>', 'i')); return m ? m[1].trim() : null }
const decode = s => (s == null ? null : s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"))

function parseDeviceXml(xml) {
  // The first <device> block is the root device; take its fields
  const dev = String(xml).match(/<device>([\s\S]*?)(?:<deviceList>|<\/device>)/i)
  const scope = dev ? dev[1] : String(xml)
  const out = { manufacturer: decode(tag(scope, 'manufacturer')), model: decode(tag(scope, 'modelName')), friendlyName: decode(tag(scope, 'friendlyName')), modelNumber: decode(tag(scope, 'modelNumber')) }
  return out.manufacturer || out.model || out.friendlyName ? out : null
}

/**
 * Picks the gateway's responder and returns what may be fetched: { url } or null.
 * The fetch target is rebuilt from the gateway IP and the response's port/path, so a hostile "LOCATION" cannot redirect it.
 */
function pickGatewayDescription(responses, gatewayIp) {
  if (!isPrivateIp(gatewayIp)) return null
  for (const r of responses) {
    if (!r || r.host !== gatewayIp) continue
    let u; try { u = new URL(r.location) } catch { continue }
    if (!/^https?:$/.test(u.protocol) || u.protocol === 'https:') continue
    return { url: `http://${gatewayIp}:${u.port || 80}${u.pathname}${u.search}` }
  }
  return null
}

module.exports = { MSEARCH, isPrivateIp, parseSsdpResponse, parseDeviceXml, pickGatewayDescription }
