# GPU tab "Headroom": evidence

What the GPU tab may show or change, and why. The same rule as the other rebuilt tabs: unverified = not shipped, and a value nobody measured prints "–", never 0.
Code: `lib/gpu/` (engine), `js/gpu/` (page), `css/gpu.css`, LANG group `gpu2`. Tests: `test/gpu-*.test.js`. Preview: `npm run preview -- --gpu [--gp-state nvidia|hybrid|hot|amd|first|fail] [--gp-full]`.

## Switches (`lib/gpu/catalog.js` is the only list)

| id | read back from | why it is here |
|---|---|---|
| gpu-hwsch | `HKLM\...\GraphicsDrivers\HwSchMode = 2` | Documented Windows setting (WDDM 2.7 hardware-accelerated GPU scheduling). Needed by DLSS / FSR frame generation. Absent value = driver decides, so it reads "off" but is never used as evidence in a finding. |
| gpu-hags-off | `HwSchMode = 1` | Premium (it was on the Premium GPU tab). The only explicit `1` that the `fg-needs-hags` finding treats as evidence. |
| msi-mode | `MSISupported = 1` on every display-class PCI device | Documented interrupt property; only graphics adapters are touched. Needs a restart. |
| disable-mpo | `Dwm\OverlayTestMode = 5` | Known workaround for multi-monitor flicker; Windows 11 24H2 also needs `OverlayMinFPS = 0` (set by the tweak). |
| vrr-borderless | `DirectXUserGlobalSettings` contains `VRROptimizeEnable=1` and `SwapEffectUpgradeEnable=1` | Windows "Optimizations for windowed games" / VRR. Merged into the existing string, never overwritten. |
| gpu-per-app-preference | no probe (state is per game executable) | Windows per-app GPU setting `GpuPreference=2;`. Shown as "cannot be read" rather than guessed. |
| tdr-delay | `TdrDelay >= 10` | Documented TDR registry value. |
| 9 retired (nvidia-max-perf, nvidia-low-latency, nvidia-pstate-lock, nvidia-profile, amd-chill-off, amd-power-hold, amd-service-trim, amd-ulps-disable, disable-hdcp) | not probed | Retired in `RETIRED_TWEAKS` (see `TWEAK_EVIDENCE.md`). Listed only when applied, so they can be put back. |

The switches moved here from the Windows tab (`lib/windows/catalog.js`); `visual-effects`, `game-dvr` and `disable-fso` stay there. A test checks that no id is owned by two tabs.

## Live readings

| rail | source | ceiling |
|---|---|---|
| load | NVIDIA `utilization.gpu`; every vendor: max of the `GPU Engine` 3D / compute utilization of the busiest adapter | 100 % |
| clock | `nvidia-smi clocks.gr` | `clocks.max.gr` |
| power | `power.draw` (NVIDIA) or the sensor bridge | `enforced.power.limit` |
| temperature | `temperature.gpu` or the sensor bridge | `nvidia-smi -q -d TEMPERATURE` "GPU Slowdown Temp" |
| video memory | `nvidia-smi memory.used`, else `GPU Adapter Memory` dedicated usage | `memory.total` or the driver's reported size |

Engines and programs come from the Windows `GPU Engine`, `GPU Process Memory` and `GPU Adapter Memory` counters, so they work on every vendor. Per-engine utilization follows Task Manager: sum over processes per engine instance, then the busiest instance of each type.
The poller stops without a heartbeat (45 s), while the tab is hidden, and while a game runs.

### Limiter (`lib/gpu/limiter.js`)
NVML clock-event reason bits: `0x1` idle, `0x2` application clocks, `0x4` software power cap, `0x8` hardware slowdown, `0x10` sync boost, `0x20` software thermal slowdown, `0x40` hardware thermal slowdown, `0x80` hardware power brake, `0x100` display clock. Field name is `clocks_event_reasons.active` on current drivers and `clocks_throttle_reasons.active` on older ones; the service tries both and then none. Without reason bits (AMD, Intel, old drivers) the limiter is "unknown" unless the card is fully used (`load`) or over its thermal threshold.

| name | value | meaning |
|---|---|---|
| LOADED | 60 % | from here "not at full clock" means something |
| BUSY | 90 % | the card itself is the limit |
| TEMP_WARN_BELOW / TEMP_BAD_BELOW | 15 / 5 °C under slowdown | temperature rail colours |
| TEMP_WARN / TEMP_BAD | 83 / 90 °C | used only when the driver gives no slowdown temperature |
| VRAM_WARN / VRAM_BAD | 85 / 95 % | memory rail colours |

## Findings (`lib/gpu/findings.js` is the only list)

Static (from the scan): `no-driver` (Microsoft Basic Display / Render), `driver-old` (DRIVER_OLD_DAYS 180), `refresh-below-max` (best mode at the current resolution is at least REFRESH_GAP_HZ 3 above the current one, same rule as Auto-Optimize), `link-limited` (EDID max refresh at least LINK_GAP_HZ 20 above the best offered), `rebar-off` (NVIDIA only, and only when BAR1 and framebuffer sizes were read), `hybrid-games-igpu` (integrated + discrete present, switch not applied), `line-interrupts` (discrete card on line-based IRQ), `fg-needs-hags` (frame-generation capable card with `HwSchMode = 1`), `power-limit-custom`.

Live (from the last 60 one-second frames, at least LIVE_MIN_FRAMES 10, only frames with load >= LOADED): `thermal-throttle` (THROTTLE_SHARE 20 % of loaded frames with a thermal bit), `hw-slowdown` (SLOWDOWN_SHARE 20 %), `power-capped` (POWERCAP_SHARE 50 %, info only: it is normal), `hotspot-delta` (HOTSPOT_DELTA_C 25), `vram-full` (VRAM_FULL_PCT 95), `pcie-link-low` (LINK_LOW_SHARE 80 % of loaded frames below the maximum gen or width), `fan-stopped-hot` (FAN_STOPPED_TEMP_C 80 with the fan reading 0 for the whole window).

Left out on purpose: a static "PCIe width too low" (width drops at idle, so only the loaded reading is evidence) and anything about overclocking, fan curves or voltage (no writes exist for them).

## Display refresh

Only modes Windows lists for the monitor (`EnumDisplaySettingsEx`) at the current resolution are offered. Flow: `CDS_TEST`, apply for the session, ask, then persist and journal (`gpu2:display:<device>`, change kind `display-mode`, undone by the existing handler) or put the old rate back. No answer for 15 seconds = back. Refused in a remote session.

## Headroom test (`lib/gpu/loadtest.js`)

30 s of shader load on a canvas in the page (calls kept near 30 ms, never over 80 ms, so Windows never sees a hang); the service samples the card meanwhile and writes the report. It stops at core CORE_STOP_C 87 °C (same as the power-limit guard), hotspot HOTSPOT_STOP_C 100 °C, after MAX_MS 45 s, when the tab is hidden, or when a game starts, and it refuses to start while a game runs. A stopped test saves nothing. Work is reported as billions of shader iterations per second, which stays comparable between runs. The report names the renderer WebGL used and says so when it may not be the card this tab is about. Last KEEP 10 runs are kept; each is compared with the one before (work rate, clock, power, peak temperature).

## Power limit
Unchanged: `lib/gpu-power-limit.js` (desktop NVIDIA only, integer watts inside the driver's range, above default needs a confirmation, read back after the write, thermal guard, restored on quit unless "keep", crash recovery). The card shows the live draw against it.
