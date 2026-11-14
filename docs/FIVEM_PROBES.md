# FiveM: open questions and the probe that answers them

`tools/fivem-probe/probe.ps1` is read-only. It changes nothing and sends nothing anywhere except the optional `-Server` request to
that server's own public `info.json` / `dynamic.json`. It writes one JSON report you can read before sharing it.

```
powershell -NoProfile -ExecutionPolicy Bypass -File tools/fivem-probe/probe.ps1 -Server host:port -Out report.json
```

Run it **while connected to a server** (joined, in game) for the best answers. Run it once on a Legacy PC and once on a PC with
FiveM for GTAV Enhanced.

| Question | What the probe records | Why it matters | Status |
|---|---|---|---|
| Which server did the player really join (direct or via proxy)? | Established TCP connections owned by the FiveM/GTA processes; connection lines from the newest log | Session tagging and the route target (`docs/FIVEM_EVIDENCE.md`: the connect endpoint can be a proxy) | **open**: nothing was running when it was first tried |
| Does the Enhanced client use other folders / exe names? | Any folder named like `FiveM...Enhanced` under LocalAppData / AppData, first 60 files, newest log | The tab only reports Enhanced, it cannot edit it | **open**: no Enhanced client on the first PC tried |
| Which values does `gta5_settings.xml` really hold? | The graphics keys of the real file | Step ranges of the graphics editor | **answered** on one PC: texture/shader/particle 2, reflection/postFX/shadow/tessellation 3, MSAA 4 (consistent with Rockstar's ranges); other PCs welcome |
| What does `info.json` publish? | Top-level keys, `vars` names, build, pure level, resource count of one server | Fit Check fields (`build`, `pure`, `resources` are optional and treated as "not reported") | **open**: needs a server |
| Where does `profiler saveJSON` save on a client? | Recently written profile/trace JSON files under the FiveM folder | Profiler import | **open**. Lead: `FiveM.app\citizen\load_profile.json` exists on the first PC (34 KB, a map of numeric keys, not a Chrome trace; meaning unknown, not used) |
| Does the UDP endpoint appear anywhere without ETW? | Local UDP ports of the FiveM processes | A UDP round-trip would be a better path measure than TCP/ICMP | **open**, expected: remote UDP addresses are not in the socket table |

Nothing in the app depends on an open item. Fit Check, route memory and the console coach work from what is already measured.
