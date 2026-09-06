# Experiments

Bench work, bring-up projects, and superseded variants. Nothing here runs on the
pod as-is, but several of these are the only working implementation of something
the pod needs.

| Directory | Why it matters |
|---|---|
| `can_testing/` | CAN bring-up. **Only on this branch.** Unfinished — the three boards disagree on bit timing. Read its README first. |
| `center_hub_variants/` | Two divergent center-hub firmwares. **Read before editing center hub.** |
| `hall_effect_f411/` | Cleanest ADC + DMA example. Different MCU (F411) — cannot be copied directly. |
| `sensor_packing_prototype/` | Host-side CAN payload packing model. Compiles with `gcc`, runs on a laptop. |
| `legacy_embedded_25-26/` | Original workspace + the only contactor/precharge state machine in the repo. |
| `vehical_control_unit_superseded/` | Pre-rename VCU project. Reference only. |

Each directory has its own README explaining what it does and what is wrong with it.

## This is the `can-testing` branch

`experiments/can_testing/` exists here and **not on `main`**, deliberately. The
bring-up is unfinished: the newest upstream commit changed board A's bit timing
alone, after the last verified test, leaving the three boards inconsistent.

Do not merge this into `main` until the bus timing is agreed and a two-node test
has re-established a known-good baseline. See `can_testing/README.md`.
