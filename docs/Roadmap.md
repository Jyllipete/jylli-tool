# Roadmap

Built from the evidence docs. Rule: unverified = not shipped.

## Next
- Rebuild the BIOS Instruments (Hyper-V, C-states, Intel power, RAM stress, LHM sensors, boot chronicle, stability check) inside the workstation. Their handlers still live in `main.js`. See [[BIOS_EVIDENCE]].

## Blocked / needs verification
- **BIOS setting names:** aliases and option labels are verified only on the HP ProBook 440 G8. Other boards need real dumps, and the brand menu hints are worded "usually". See [[BIOS_EVIDENCE]].
- **Native NVMe driver (`nvmedisk.sys`):** sources conflict on whether the workaround still works, and a wrong guess can leave Windows unbootable. Verify on a machine with a restore point first. See [[TWEAK_EVIDENCE]].
- **amd-\* registry tweaks:** the `KMD_*` keys are unverified, so they stay out. See [[TWEAK_EVIDENCE]].
- **Memory Integrity auto-enable (13 Oct 2026):** this date has passed. Re-check the `vbs-disable` / `hvci-offload` wording and conditions. See [[TWEAK_EVIDENCE]].

## Parked (no credible evidence)
- Defender game-folder exclusions (removed for security in commit 2f50738)
- Win32PrioritySeparation variants, HPET bcdedit, NetworkThrottlingIndex, Dev Drive for games
- `fivem-commandline` stays retired (it overwrote the user's `commandline.txt`). See [[FIVEM_EVIDENCE]].

## Ideas
- 

Back to [[Home]]
