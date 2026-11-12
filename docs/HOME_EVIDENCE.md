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

## Rewind strip
`lib/home/rewind.js`. 7 days from `get-metrics-history` (one sample a minute: CPU and RAM only; temperatures were never recorded, so none are shown) and one mark per journal batch. Buckets with no sample stay empty. Undo goes through `auto-opti-undo` for Auto-Optimize batches and `journal-undo` for the rest, so the same conflict rules apply.

## Live instruments
The telemetry hub (`twin-telemetry`, `JylliTelemetry`), not the old 3 s `get-metrics` poll, which reports 0 for a missing value. A sensor that is not there says "Not available". The sparklines and the Now / Average / Peak values cover the time since Home was opened.

## Retired from the old Home
- The quick score's slow PowerShell scan is only a fallback now (`home2-legacy`, once, in the background).
- `settings.lastHealthScore` and `aom_run_days` were never written, so the weekly report always showed 0. Its job now belongs to the index history and the ledger.
- The Quick Health card and the Windows health button. The Vitals checkup covers Windows integrity.

Back to [[Home]]
