# Devices tab: evidence

What the System › Devices tab reads, where each fact comes from, how sure it is, and what it will not do. Code: `lib/devices/`, `js/devices/`.
Written 2026-11-15. Everything here was checked on the author's Windows 11 PC unless it says otherwise.

## What is read (all read-only, no admin needed)

| Source | How | What it gives | Confidence |
|---|---|---|---|
| Windows device list | `Get-PnpDevice -PresentOnly` for the classes in `lib/devices/sources.js`, ONE batched `Get-PnpDeviceProperty` | class, friendly name, driver version, problem code, **container id** (= one physical device), location (hub / port), parent | Windows = medium / high |
| Name the device reports on the bus | `DEVPKEY_Device_BusReportedDeviceDesc` | real product names where Device Manager only says "USB Composite Device" ("WLMOUSE BEAST MAX", "PRO Gaming Keyboard", "AURA LED Controller") | device = high |
| HID strings and usages | `CreateFile` with access 0, then `HidD_GetManufacturerString`, `HidD_GetProductString`, `HidP_GetCaps` | maker string, product string, top-level usage page / usage per interface (01/02 pointer, 01/06 keyboard, 01/05 gamepad, 0C consumer, FFxx vendor-defined) | device = high |
| Monitors | `WmiMonitorID` + `WmiMonitorBasicDisplayParams` (root\wmi) | EDID maker code, model, year, size in whole cm (diagonal is approximate) | device = high, size = medium |
| Paired Bluetooth devices | `BTHENUM` / `BTHLE` PnP ids + battery property `{104EA319-...} 2` | name, status, battery when the device publishes it | **no paired device on the author's PC, so this path is untested on real hardware** |
| Core parts | the existing RigSpec (`lib/inventory.js`) | CPU, GPUs, RAM modules, drives, board, network adapters | Windows = high |
| Vendor name | `lib/devices/vendors.js` (short hand-made USB vendor id table) | maker for known ids | table = medium / high (see below) |

Opening a HID device with access 0 does not read its reports and does not need exclusive access: it only asks the HID class driver for descriptor strings.

## How a device is decided

1. Windows container id groups interfaces: the WLMOUSE has 11 interfaces (pointer, keyboard, consumer, vendor-defined...) and is ONE mouse.
2. No container (all zeros / all F) falls back to VID+PID; a second group of the same VID+PID is joined when exactly one container group has it (the fifine mic).
3. Audio endpoints have containers of their own, so they are tied to their sound device by the adapter name in brackets (`Speakers (fifine Microphone)`).
4. Category from the HID usages first, then Windows class, then name words. A mouse with a keyboard interface (macros) stays a mouse.
5. Software devices (G HUB virtual keyboard, VHF, Xbox synthetic bus, Voicemeeter, VB-Cable) are recognised by id prefix / name and shown apart, never counted as hardware.

## Vendor table

`lib/devices/vendors.js` is short on purpose. `check: 'device'` = the id was confirmed against a real device string here (Logitech 046D, ASUS 0B05).
`check: 'listed'` = taken from the public USB-IF vendor list from memory and **not verified against a device or the list in this session** (a fetch of the Linux USB id list failed on a certificate error). An id that is not in the table is shown as "Vendor ID xxxx", never guessed.
OEM chip makers (Foxconn, Realtek, Holtek, SINO WEALTH...) are marked `oem` because their id says who made the chip, not whose product it is.
Abbreviated device strings ("WL", "CX") are shown as abbreviations with low confidence and are never put in the title.

## What can be changed, and what cannot

| Setting | Here? | Why |
|---|---|---|
| Keyboard repeat delay (0-3) and rate (0-31) | **Yes** | Documented Windows settings (`HKCU\Control Panel\Keyboard`, `SystemParametersInfo`). Journaled, read back, applied to the running session, undoable. |
| Mouse acceleration, pointer speed 1:1 | Linked | Owned by the Windows tab (`lib/windows/catalog.js`); this tab shows the state and opens that tab. |
| Mouse polling rate | **Measured only** | Windows exposes no polling-rate value. See below. |
| DPI, polling-rate write, lighting, button mapping, macros, dead zones, EQ | **Display only** | No documented API (below). |
| Vendor app | Open button | Only an `.exe` Jylli already knows for a peripheral app in `lib/apps/known.js`. |

### Why no DPI / polling-rate writes

- Corsair iCUE SDK v4: the device property ids (`CDPI_*`) are 14 values (battery level, microphone / sidetone / surround flags, equalizer preset, key layouts, macro keys, channel counts). None is polling rate or DPI. Source: https://docs.rs/cue-sdk-sys (raw bindings of the iCUE SDK 4.0.84).
- Logitech G HUB: a search for a public API to change DPI or polling rate found only end-user support articles (for example https://support.logi.com/hc/articles/22766568765719), and a G HUB Lua scripting mechanism that is separate. No public SDK for DPI or polling rate was found.
- Razer and SteelSeries: **not searched in this session.** As far as I know their public SDKs (Razer Chroma, SteelSeries GameSense) cover lighting and game events, not DPI or polling rate; treat that as unverified.
- The device protocols behind these settings are private HID feature reports that differ per model. A wrong write can leave a mouse unusable, so Jylli Tool never writes to a device.

### Polling-rate measurement

- Raw Input (`RegisterRawInputDevices`, usage 01/02, sink mode) on a message-only window counts the movement reports of each physical mouse per 100 ms. Each `WM_INPUT` carries the device handle, so the count belongs to ONE mouse and is mapped to its instance id and container. Movement injected by software has no handle and is ignored (and counted).
- The rate is the 90th percentile of the per-100 ms counts while the mouse moves, snapped to a standard rate (125 / 250 / 500 / 1000 / 2000 / 4000 / 8000 Hz) within 12%. Confidence is high only with at least 15 active bins within 6% of a standard rate and steady movement.
- It reports **what the mouse delivered during the test**. Motion sync, power saving, a wireless dongle in a low-power state or a busy hub can change it. It is not a certified rate.
- Chromium's `pointerrawupdate` was rejected: it needs a secure context and cannot tell which mouse moved.

## Verification (2026-11-15)

- Unit tests: `test/devices-{engine,polling,run,ui}.test.js` (the engine tests run on a real capture of this PC, `test/fixtures/devices/probe-desktop.json`, serial-like ids masked).
- Real probe on this PC, not elevated: 2.7 s, 10 devices: 2 mice, 1 keyboard, 3 audio devices, an RGB controller, a Bluetooth radio with problem code 32, 2 monitors (MSI MAG 244F, Samsung Odyssey G5 with year and size), plus 5 software devices. Matches Device Manager.
- Real keyboard repeat round trip on this PC with the real journal service: set (1,31) -> (0,20), read back, journaled as two registry changes with before/after, undone, registry back to (1,31).
- Real Raw Input run on this PC: the WLMOUSE was matched to its instance id. One 3 s run during the build counted 209 reports in 26 active bins and read 125 Hz (high confidence). **That was not cross-checked against the mouse's own app**, so it is not proof the mouse is set to 125 Hz. A second run with no movement correctly returned "too little".
- Page: rendered in the browser pane on the real `index.html` with the real service on this capture: loaded, failed-probe, denied-parts, disconnected-devices and Finnish states; polling test and keyboard apply / undo driven through the page.

## Not verified

- Elevated probe (needs a UAC prompt). The probe uses no admin-only call, so it should match.
- Paired Bluetooth devices and battery, a wireless game controller, cameras (none on this PC).
- Phone-width layout (the pane would not narrow below its own width); the CSS has a 720 px breakpoint.
- The packaged app (Electron). The preview runs the same page code against the same service with fake `window.api` answers.
- Polling rate against a mouse whose rate is known.
- The USB vendor ids marked `listed`.
- The live `SystemParametersInfo` call: its result is not checked; the registry read-back is.
