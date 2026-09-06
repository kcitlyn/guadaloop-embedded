# Guadaloop — Embedded Systems

One repository for everything the embedded team writes: hub and control-unit
firmware, the CAN bring-up projects, the sensor rigs, and the ground-station
GUI. Before this, the same system was spread across two repositories and seven
branches, and you had to know which branch held which working code. Now it is
all in one checkout.

**This is a consolidation, not a rewrite.** Every file here was written by a
teammate and is committed unmodified. Nothing was refactored, merged, or
"cleaned up." See [`docs/PROVENANCE.md`](docs/PROVENANCE.md) for the exact
branch, author, date and commit SHA behind every directory.

---

## Layout

```
firmware/       The five ECUs that go on the pod. This is the target architecture.
experiments/    Bench work, sensor rigs, and superseded variants.
gui/            React dashboard + Express serial bridge + MongoDB logging.
docs/           Provenance and repo conventions.
```

### `firmware/` — the pod

| Project | MCU | State |
|---|---|---|
| `vehicle_control_unit/` | STM32F446RE | Peripheral init, no application logic yet |
| `front_hub_unit/` | STM32F446RE | CubeMX skeleton only |
| `center_hub_unit/` | STM32F446RE | **Real code.** 3 RTD + 3 Hall, dual ADC + DMA, 8-sample moving average, ASCII telemetry to the GUI |
| `rear_hub_unit/` | STM32F446RE | CubeMX skeleton only |
| `propulsion_control_unit/` | STM32F446RE | Peripheral drivers split into `adc.c` / `can.c` / `tim.c` / `usart.c` |

> Front, rear and vehicle hub `main.c` are currently **byte-identical CubeMX
> boilerplate**. That is not a mistake in the consolidation — they genuinely
> have not been written yet. Center hub is the only hub with working sensor code.

### `experiments/` — bench work

| Directory | What it is |
|---|---|
| `center_hub_variants/` | Two center-hub firmwares that diverged from the one in `firmware/`. Read the README there before touching center hub. |
| `hall_effect_f411/` | Standalone Hall calibration rig. **Different MCU (STM32F411RE)** — does not drop into a hub project as-is. |
| `sensor_packing_prototype/` | Plain-C bit-packing prototype. No HAL, compiles with `gcc`, runs on your laptop. |
| `legacy_embedded_25-26/` | The original single-project workspace, plus the contactor/precharge state machine. |
| `vehical_control_unit_superseded/` | Earlier, differently-spelled VCU project. Kept for reference; use `firmware/vehicle_control_unit/` instead. |

### `gui/` — ground station

React dashboard reading the pod over Web Serial, an Express bridge that owns the
serial port, and MongoDB run logging. Arduino libraries for LoRa (SX127x) and the
VL6180 ToF sensor live in `gui/libraries/` — both are vendored and currently unused
by any firmware in this repo.

---

## Getting set up

### Firmware (STM32CubeIDE)

Each directory under `firmware/` and `experiments/` is a **self-contained CubeIDE
project** with its own `.project`, `.cproject`, `.ioc` and vendored `Drivers/`.
Do not open the repo root as a workspace.

```
File > Import > General > Existing Projects into Workspace
Root directory:  <this repo>/firmware/center_hub_unit
Do NOT tick "Copy projects into workspace"
```

Import each project you need separately. Build output lands in `Debug/`, which is
gitignored — a rebuild will never show up as a diff.

### GUI

```bash
cd gui/guad-gui
npm install
npm start                 # dashboard on :3000

cd gui/guad-gui/server
npm install
cp .env.example .env      # add your Mongo URI
npm start                 # bridge + API on :5000
```

No hardware? `gui/guad-gui/server/testing/serial-simulator.js` replays synthetic
packets in the real wire format.

---

## Working in here

Branch off `main`, one branch per piece of work:

```
feat/<what>     new capability      feat/can-integration
fix/<what>      bug fix             fix/temp-nan-guard
docs/<what>     documentation       docs/can-id-allocation
```

Open a PR into `main` and get one review. Direct pushes to `main` are how the
old repo ended up with seven branches nobody could tell apart.

**Firmware conventions that keep merges survivable:**

- Keep hand-written code inside `/* USER CODE BEGIN */` … `/* USER CODE END */`.
  CubeMX overwrites everything outside those markers when someone regenerates
  from the `.ioc`, and it will silently eat your work.
- Commit the `.ioc` alongside any generated code change, in the same commit.
- Never commit `Debug/`. If `git status` shows `.o` or `.map` files, your
  `.gitignore` is not being applied — say something rather than force-adding.

---

## Known issues, inherited

These came with the code. They are written down so nobody rediscovers them.

1. **The two center-hub firmwares each have something the other lacks.**
   `firmware/center_hub_unit` has an 8-sample moving average but its
   divide-by-zero and NaN guards are commented out. The GUI repo's snapshot has
   the guards but no averaging. Neither is a superset. Details in
   `experiments/center_hub_variants/README.md`.

2. **CAN bring-up is unfinished and lives on the `can-testing` branch, not here.**
   The three test boards all reach 500 kbit/s but sample the bit at 85.7% (A)
   versus 60% (B and C) — the newest upstream commit changed board A's timing
   alone, after the last verified test. The set has never been checked as a whole.
   `git checkout can-testing` and read its README before using any of it.

3. **Padded telemetry is indistinguishable from real readings.** Center hub emits
   10 temperature and 12 Hall values but only 3 of each are real sensors — the
   rest are literal `0`. The GUI renders all of them as live readings at named pod
   locations. Nothing on the dashboard says "no sensor here."

4. **`firmware/vehicle_control_unit/contributed/` does not build.** It needs three
   headers that exist nowhere in this repo. See the README in that directory.

5. **No firmware on the pod transmits CAN.** Four units call `MX_CAN2_Init()`;
   none calls `HAL_CAN_Start()`, and none configures a receive filter — on bxCAN,
   no filter means every frame is rejected, so the RX interrupt would never fire
   even once started. Telemetry today is ASCII over USB serial.

6. **The GUI's CI workflow no longer runs.** `gui/.github/workflows/build-deploy.yml`
   came from the GUI repo root. GitHub only reads `.github/` at the *repository*
   root, so nested here it is inert — no builds, no red X's, just a dormant file.
   It is preserved as-is. To revive it, move it to `.github/workflows/` and fix its
   build contexts: `./guad-gui/server` → `./gui/guad-gui/server`, and
   `./guad-gui` → `./gui/guad-gui`.

7. **`experiments/sensor_packing_prototype/` decodes nothing.** It packs three
   temperatures and prints six zeros. Its decode loop treats a `0x00` byte as
   end-of-data, and the first byte of the first record is always `0x00`. Verified
   by running it; explained in that directory's README. Worth fixing before this
   framing idea becomes the pod's wire format.
