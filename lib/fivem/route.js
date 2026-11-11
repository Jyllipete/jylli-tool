'use strict'
// Route poller: one long-lived PowerShell child sends TTL-limited ICMP echoes to the server's IPv4 address, one round per second,
// and prints one `JJROUTE:{json}` line per round (d = ttl of the destination once it has answered, h = [[ttl, ip|null, rtt|null]]).
// Per-hop latency is timed by the helper itself: .NET reports 0 ms for every TTL-expired reply, so RoundtripTime cannot be used.
// The caller also feeds the TCP connect time to the game port into each round. The target is an IPv4 literal that Node validated;
// the script never receives a host name or any other text from the renderer.
const V = require('../validate')

const HELPER = `
using System; using System.Diagnostics; using System.Globalization; using System.Net; using System.Net.NetworkInformation; using System.Text; using System.Threading.Tasks;
public static class JjTrace {
  static int dest = 0, last = 0, rounds = 0;
  class R { public bool ok, succ; public string ip; public double ms; }
  static R One(IPAddress a, int ttl, byte[] buf) {
    var r = new R();
    try {
      using (var p = new Ping()) {
        var sw = Stopwatch.StartNew();
        var rep = p.Send(a, 1000, buf, new PingOptions(ttl, true));
        sw.Stop();
        if (rep.Status == IPStatus.Success || rep.Status == IPStatus.TtlExpired) { r.ok = true; r.succ = rep.Status == IPStatus.Success; r.ip = rep.Address.ToString(); r.ms = sw.Elapsed.TotalMilliseconds; }
      }
    } catch { }
    return r;
  }
  public static string Round(string ip) {
    var a = IPAddress.Parse(ip); var buf = new byte[32];
    rounds++;
    int top = dest > 0 ? dest : (rounds > 10 && last > 0 ? Math.Min(30, last + 2) : 30);
    var tasks = new Task<R>[top];
    for (int t = 1; t <= top; t++) { int ttl = t; tasks[t - 1] = Task.Factory.StartNew(() => One(a, ttl, buf), TaskCreationOptions.LongRunning); }
    Task.WaitAll(tasks);
    for (int t = 1; t <= top; t++) { var r = tasks[t - 1].Result; if (r.ok) { if (t > last) last = t; if (r.succ && (dest == 0 || t < dest)) dest = t; } }
    var sb = new StringBuilder("{\\"d\\":" + dest + ",\\"h\\":[");
    int end = dest > 0 ? Math.Min(dest, top) : top;
    for (int t = 1; t <= end; t++) {
      var r = tasks[t - 1].Result;
      if (t > 1) sb.Append(',');
      if (r.ok) sb.Append("[" + t + ",\\"" + r.ip + "\\"," + Math.Round(r.ms, 1).ToString(CultureInfo.InvariantCulture) + "]"); else sb.Append("[" + t + ",null,null]");
    }
    return sb.Append("]}").ToString();
  }
}`

function pollScript(ip) {
  if (!V.isIp(ip) || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) throw new Error('bad-ip')
  return [
    "$ErrorActionPreference='SilentlyContinue'; $ProgressPreference='SilentlyContinue'",
    "if(-not ('JjTrace' -as [type])){ Add-Type -TypeDefinition @'",
    HELPER,
    "'@ }",
    'while($true){',
    '  $t0=[DateTime]::UtcNow',
    `  $line=[JjTrace]::Round('${ip}')`,
    "  [Console]::Out.WriteLine('JJROUTE:'+$line); [Console]::Out.Flush()",
    '  $wait=1000-([DateTime]::UtcNow-$t0).TotalMilliseconds',
    '  if($wait -gt 0){Start-Sleep -Milliseconds $wait}',
    '}',
  ].join('\n')
}

/** One line of poller output -> round | null. d = 0 means "not found yet". */
function parseLine(line) {
  const m = String(line || '').match(/^JJROUTE:(\{.*\})\s*$/)
  if (!m) return null
  try {
    const o = JSON.parse(m[1])
    if (!Array.isArray(o.h)) return null
    return { d: Number.isInteger(o.d) && o.d > 0 ? o.d : null, h: o.h.filter(r => Array.isArray(r) && Number.isInteger(r[0])) }
  } catch { return null }
}

function mtuScript(ip) {
  if (!V.isIp(ip) || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) throw new Error('bad-ip')
  return [
    "$ErrorActionPreference='SilentlyContinue'; $ProgressPreference='SilentlyContinue'",
    `$ip=[Net.IPAddress]::Parse('${ip}')`,
    '$p=New-Object Net.NetworkInformation.Ping',
    '$o=New-Object Net.NetworkInformation.PingOptions(64,$true)',
    'function Ok($n){ $r=$p.Send($ip,1500,(New-Object byte[] $n),$o); return ($r.Status -eq \'Success\') }',
    '$lo=0;$hi=1472',
    'if(-not (Ok 32)){ \'JJMTU:{"payload":null}\'; return }',
    '$lo=32',
    'while($lo -lt $hi){ $mid=[int](($lo+$hi+1)/2); if(Ok $mid){$lo=$mid}else{$hi=$mid-1} }',
    '\'JJMTU:{"payload":\'+$lo+\'}\'',
  ].join('\n')
}
function parseMtu(out) {
  const m = String(out || '').match(/JJMTU:(\{.*\})/)
  if (!m) return null
  try { const p = JSON.parse(m[1]).payload; return Number.isInteger(p) && p >= 32 && p <= 1472 ? p + 28 : null } catch { return null }
}

/** deps: { spawn, onRound(round), log? }. One poller at a time. */
function create(deps) {
  let proc = null, buf = '', target = null
  const stop = () => { const p = proc; proc = null; buf = ''; target = null; if (p) { try { p.kill() } catch { /* already gone */ } } }
  function start(ip) {
    stop()
    let script
    try { script = pollScript(ip) } catch { return { ok: false, error: 'bad-ip' } }
    try {
      proc = deps.spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true })
    } catch { proc = null; return { ok: false, error: 'spawn-failed' } }
    target = ip
    const mine = proc
    mine.stdout.on('data', d => {
      buf += d.toString('utf8')
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1)
        const round = parseLine(line)
        if (round && proc === mine) { try { deps.onRound(round) } catch { /* the page went away */ } }
      }
    })
    mine.on('exit', () => { if (proc === mine) { proc = null; target = null } })
    mine.on('error', () => { if (proc === mine) { proc = null; target = null } })
    return { ok: true }
  }
  return { start, stop, get running() { return !!proc }, get target() { return target } }
}

module.exports = { pollScript, parseLine, mtuScript, parseMtu, create }
