# Home evidence

Home ("Helm") only says what other engines recorded. It runs no scan of its own. This file says where each number comes from and why it is weighted the way it is. Rule: **unverified = not shipped**.

## The Jylli Index (0-100)
`lib/home/model.js`. Three pillars, blended with `js/score.js`, which leaves out anything not measured and renormalises. Nothing unmeasured is ever counted as 0 or as an average.

| Pillar | Weight | Source | Not measured when |
|---|---|---|---|
| Health | 50 | Vitals score (`diag2-cached`, `lib/diagnostics/grade.js`). Fallback: the quick `get-health-score` | No checkup yet and no quick score |
| Tuned | 30 | `settings.tweak_*` = applied, against the tweaks `get-applicability` marks `recommended` for this PC. Tweaks found changed back (`run-tweak-health`) count as not applied | The hardware profile does not exist yet, or nothing applies to this PC |
| Protected | 20 | Newest restore point (70 %: fresh 1, older than 7 days 0.5, none 0) and administrator rights (30 %) | Both unknown |

- **No Index without Health.** Tuning and protection say little about how the PC is doing, so with no measured Health pillar the dial shows the bands and no number.
- **Why 50 / 30 / 20.** This is a judgement call, not a measurement. Health comes first because the Vitals score is the only pillar built from many real checks. Tuned is next because it is what the app exists to change. Protected is smallest because it is a safety margin, not a condition of the PC. The drawer shows every input, so the weights are never hidden.
- **A checkup older than 30 days** still counts but is flagged stale, and the lead text says so.
- **Verdict** follows the weakest measured pillar: below 60 and with more than one pillar measured, the verdict names it.
- **History**: one reading per UTC day in `jt_home.json`, 60 days. The trend chip compares with about a week ago and needs at least a day between readings.

## Next Best Move
`lib/home/moves.js`. Ranks real state, merged with the concierge's moves (`js/concierge.js`). A concierge move a Home move already covers is dropped. One move per tab. Blocking moves first, then score.

| Move | Raised when | Base |
|---|---|---|
| Create restore point (blocking) | No restore point at all | 100 |
| Fix serious findings | A Vitals finding is `critical` or `high` (blocking if `critical`) | 92 |
| Apply tweaks again | `run-tweak-health` found applied tweaks changed back | 88 |
| First Auto-Optimize run | `aom_last_run` does not exist | 86 |
| Refresh restore point | Newest is older than 7 days | 82 |
| First Vitals checkup | No checkup | 70 |
| Auto-Optimize again | Last run older than 30 days | 55 |
| Restart as admin | Not elevated | 50 |
| Free space | Last Cleanup scan, safe lane only, found 500 MB or more (scan not older than 14 days) | 45+ |
| Remove what is not used | Debloat summary has 3 or more safe items | 38 |
| AI suggestions | The local model is loaded and a recommendation scores 70 % or more | 35 |
| Watch this game | A game is running | 30 |

"Not now" snoozes a move for 3 days (`settings.homeSnooze`). It never dismisses it for good.

## Proof Ledger
`lib/home/proof.js`. A tile exists only if there is recorded evidence. No evidence means no tile.

| Tile | Source |
|---|---|
| Boot time before / after | `auto-opti-verify`, kept by `home2` (`noteVerify`) because the verify result is gone once dismissed. Needs both readings and a restart |
| Space reclaimed | `jt_cleanup_history.json` (`freedBytes`); falls back to the last Auto-Optimize run's counter |
| Items removed | `aom_last_run.counters` (startup items, tasks) and `debloat2-summary` count |
| Tweaks holding | Applied tweaks minus the ones found changed back |
| This week | `jt_journal.jsonl`, last 7 days, one batch = one run; undo entries are not counted |

Not shown, on purpose: an estimate of "what you can gain". No source measures it before a run.

## Timeline
`lib/home/trace.js` (tabs, spikes, your normal, narrator, pins), `lib/home/processes.js` (the process list), `js/home/trace-view.js` (canvas). One surface for live data and for the recorded week.

**Sources**
- Live (1 min / 10 min): the telemetry hub. `telemetry-series` backfills up to 10 minutes from its ring, then `twin-telemetry` (4 Hz) follows. The ring keeps only the source that currently wins a key (the same rule as the snapshot), because the OS counter and the sensor bridge report CPU load at different rates and scales and would zigzag one line.
- Disk activity (`disk.load`, `disk.read`, `disk.write`): the PhysicalDisk `_Total` performance counters in `lib/os-poller.ps1`. A PC with those counters switched off has no such keys and the Disk tab says so.
- 7 days: `get-metrics-history` (CPU and RAM only, one sample a minute) and the journal. GPU, Disk and Network were never recorded, so those tabs are disabled in that window.
- A missing sensor reads "Not available" with its reason (no driver, no sensor, needs administrator rights). A gap of more than 3 s breaks the line. Nothing is interpolated.
- The 10-minute window smooths percentage lines with a 5-sample moving average for display only. Spike detection and the crosshair readout use the raw samples.

**Spike rule** (`spikes()`, thresholds per tab in `TABS`): a rise of 25 points or more within 5 s that ends at 60 % or higher (CPU), or 85 % or higher held for 5 s. Memory and disk have their own thresholds. One event, one flag: nothing new fires for 20 s.

**What caused it**: one per-process read (`home2-culprit`, `Win32_PerfFormattedData_PerfProc_Process`), taken 2 s after the spike starts so the counters have a full interval. Instances of one program are added up (twenty Chrome processes are one browser). A process is named only when it clearly stands out: 15 % of the CPU, 300 MB of private memory, or 2 MB/s of disk transfer. Below that the flag says the load is spread across many. During a game nothing is read (the read would add load) and the flag says so. A read must finish within 12 s of the spike or it is discarded. At most one read every 6 s. Spikes from before Home was opened are pinned too, marked "the cause was not recorded".

**The process list** (`processes.js`, about 23 entries): Windows Defender, the search indexer, Windows Update, the compatibility check, service hosts, the shell, the common browsers, game launchers, OneDrive, Teams, Discord, VS Code, NVIDIA services, PowerShell and Jylli Tool itself. Each has a name and a sentence that says "usually": it describes what the program normally does, never a claim about this moment. A process not in the list is shown by its executable name and nothing else. PowerShell is worded "this can include Jylli Tool's own readings", because the app uses PowerShell to read the PC.

**Your normal**: the 25th to 75th percentile of that metric around this hour of the day (plus or minus one hour), from earlier days only. It needs samples on 3 or more different days, otherwise it is not shown and the narrator does not compare. "High" means above the 75th percentile by 25 % and by at least 10 points.

**Throttle limit**: the line on the temperature axis is `THERMAL_LIMIT` in `lib/pulse/attribution.js` (CPU 95 °C, GPU 87 °C), the same numbers Pulse uses to call a hitch thermal.

**Pins**: Jylli changes (journal batches), game start and end, restore points, spikes. Changes can be undone from the 7-day view through `auto-opti-undo` or `journal-undo`.

**The sentence under the chart**: `narrate()`. Order: a missing reading (with the reason), a spike in the last 30 s (with its cause only if measured), heat within 5 °C of the limit, your normal, otherwise "Nothing unusual". Ordinary text changes at most every 5 s; a spike shows at once, with its age in 5-second steps.

## Retired from the old Home
- The quick score's slow PowerShell scan is only a fallback now (`home2-legacy`, once, in the background).
- `settings.lastHealthScore` and `aom_run_days` were never written, so the weekly report always showed 0. Its job now belongs to the index history and the ledger.
- The Quick Health card, the Windows health button and the five small instrument tiles (replaced by the Timeline). The Vitals checkup covers Windows integrity.

Back to [[Home]]
