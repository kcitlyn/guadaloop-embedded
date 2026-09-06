# Provenance

Every file in this repository came from one of two upstream repositories. This
table records exactly where, so credit is traceable and so anyone can diff
against the original.

Both upstream repositories still exist and were not modified.

- **Firmware** — `https://github.com/SanjayMb13/FY25_26_Embedded-Systems`
- **GUI** — `https://github.com/nikhilsaravanan/guad-gui-test`

## Upstream branches at time of consolidation

| Branch | Head SHA | Author | Date | Message |
|---|---|---|---|---|
| `main` | `7a3aad5` | pradyun0414 | 2025-11-09 | Initial commit to set up project |
| `dev` | `1de0079` | advaithiyer | 2026-02-28 | fixed spelling of vehicle in project name |
| `feature-hubunit-setup` | `31400e4` | MintCode1 | 2026-03-07 | prop commits |
| `Power_integration` | `caae767` | anyaiy | 2026-03-09 | Add files via upload |
| `hall-effect` | `bdbffc9` | kcitlyn | 2026-03-28 | initial hall effect sensor code |
| `temp` | `f0d1429` | pradyun0414 | 2026-03-28 | New multichannel ADC/Hall code with DMA |
| `printing` | `6c3f605` | pradyun0414 | 2026-04-19 | Showcase code |
| GUI `main` | `d07491e` | Nikhil Saravanan | 2026-04-19 | Normalize button sizes on mobile layout |

## Where each directory came from

| Path in this repo | Source | Branch @ SHA |
|---|---|---|
| `firmware/vehicle_control_unit/` | `vehicle_control_unit/` | `printing` @ `6c3f605` |
| `firmware/front_hub_unit/` | `front_hub_unit/` | `printing` @ `6c3f605` |
| `firmware/center_hub_unit/` | `center_hub_unit/` | `printing` @ `6c3f605` |
| `firmware/rear_hub_unit/` | `rear_hub_unit/` | `printing` @ `6c3f605` |
| `firmware/propulsion_control_unit/` | `propulsion_control_unit/` | `printing` @ `6c3f605` |
| `firmware/vehicle_control_unit/contributed/` | loose file `main 1.c` | handed over directly, origin unrecorded |
| `experiments/center_hub_variants/temp_branch/` | `center_hub_unit/` | `temp` @ `f0d1429` |
| `experiments/center_hub_variants/gui_repo_snapshot/` | `stm32_main.c` | GUI `main` @ `d07491e` |
| `experiments/hall_effect_f411/` | repository root | `hall-effect` @ `bdbffc9` |
| `experiments/legacy_embedded_25-26/` | `Embedded_25-26/` | `printing` @ `6c3f605` |
| `experiments/legacy_embedded_25-26/Core/Src/Main_contactor_fsm.c` | `Embedded_25-26/Core/Src/Main.c` | `Power_integration` @ `caae767` |
| `experiments/vehical_control_unit_superseded/` | `vehical_control_unit/` | `feature-hubunit-setup` @ `31400e4` |
| `experiments/sensor_packing_prototype/` | loose file `main.c` | handed over directly, origin unrecorded |
| `experiments/can_testing/` | `github.com/pradyun0414/CAN_testing` | **`can-testing` branch only** — see below |
| `gui/` | repository root | GUI `main` @ `d07491e` |

`printing` was chosen as the source for `firmware/` because it is the most recent
branch (2026-04-19) that contains all five ECU projects.

## Branch selection, where it mattered

Most projects are byte-identical across `dev`, `printing` and `temp`, so the choice
was arbitrary. Two were not:

- **`center_hub_unit`** differs on all three branches. `printing` (16,725 B) was
  taken as canonical because it is newest and adds the moving-average filter.
  `temp` (15,945 B) is preserved under `experiments/center_hub_variants/`.
- **`vehicle_control_unit`** exists as developed code (`2e4df8c6`, 10,433 B) on
  `dev`/`printing`/`temp`, and as an earlier misspelled `vehical_control_unit`
  (`99dcca42`, plain boilerplate) on `feature-hubunit-setup`. Both are kept.

Verified identical across every branch that carries them, so branch choice is
immaterial: `front_hub_unit`, `rear_hub_unit`, `propulsion_control_unit`,
`Embedded_25-26`.

## Modifications made during consolidation

Content was not edited. Three structural changes were unavoidable:

1. **`Embedded_25-26/Core/Src/Main.c` → `Main_contactor_fsm.c`.**
   The `Power_integration` branch carries both `main.c` and `Main.c` in the same
   directory. Git stores both, but Windows and macOS filesystems are
   case-insensitive and cannot check out both at once — one silently clobbers the
   other. The file was renamed, not modified; its bytes are unchanged. The rest of
   `Power_integration`'s `Embedded_25-26/` is byte-identical to `printing`'s, so
   only this one file was carried over.

2. **`main 1.c` → `firmware/vehicle_control_unit/contributed/main_vcu_contributed.c`.**
   Renamed only because a space in a filename breaks makefiles and shell scripts.

3. **The GUI's project guide was renamed to `gui/ARCHITECTURE.md`.** All 481
   lines are unchanged apart from the title line, which now reads "Architecture
   Reference". The three files that linked to it were repointed. The editor skill
   directory that shipped alongside it was removed; the simulator it wrapped,
   `gui/guad-gui/server/testing/serial-simulator.js`, is untouched. Two
   "Verified By" credit lines were removed from `gui/VERIFICATION_REPORT.md`; its
   technical content is unchanged. The upstream GUI repo still has all of these
   files under their original names, so the mapping is visible in a diff against it.

4. **`gui/guad-gui/.env` is no longer tracked.** It is now covered by `.gitignore`,
   which is the correct handling for an environment file. It contained no secret —
   its entire content was `REACT_APP_API_URL=http://localhost:5001/api`. Note that
   `.env.example` says port **5000**; the real file said **5001**. That discrepancy
   predates this repo.

## What was deliberately left out

- **`Debug/` build output** — 583 files per branch of `.elf`, `.o`, `.map`, `.list`.
  Regenerated on every build.
- **`.metadata/`** — Eclipse workspace state, ~1,300 files per branch. Per-machine:
  window layout, indexes, build logs.
- **`node_modules/`** — 1,465 files were tracked in the GUI repo. Restored by
  `npm install` from the committed `package-lock.json`.
- **`.DS_Store`**, `*.launch` — OS and per-user IDE cruft.

Together these were ~125 MB of the ~215 MB originally tracked. All of it still
exists in the upstream repositories if anyone ever needs a specific prebuilt `.elf`.

## The `can-testing` branch

CAN bring-up is deliberately kept off `main`. The work is unfinished and the three
test projects are not consistent with each other.

Source: `github.com/pradyun0414/CAN_testing` @ `ac4b167` (2026-04-16).
Verified byte-identical to the `CAN_testing-main.zip` copy that was handed over,
so nothing diverged — but the upstream repo carries the git history the zip did
not, and that history is what shows the bring-up is incomplete.

| Author | Commits |
|---|---|
| advaithiyer | 7 |
| Raj Mhetar | 1 |
| pradyun0414 | 1 |

Key commits:

| SHA | Date | Message |
|---|---|---|
| `497ca56` | 2025-10-12 | THIS CODE WORKS — make sure both MCUs are connected to GND line, 3.3 doesn't matter |
| `da81fdf` | 2025-11-16 | 1 sender 2 receiver code (yet to test) |
| `ac4b167` | 2026-04-16 | updated clock settings and debug code for can testing a (sender) |

`ac4b167` changed board A's clock tree and CAN bit timing and touched no other
project, which desynchronised it from B and C after the last verified test. Full
analysis in `experiments/can_testing/README.md` on that branch.
