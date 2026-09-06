# Experiments

Bench work, bring-up projects, and superseded variants. Nothing here runs on the
pod as-is, but several of these are the only working implementation of something
the pod needs.

| Directory | Why it matters |
|---|---|
| `center_hub_variants/` | Two divergent center-hub firmwares. **Read before editing center hub.** |
| `hall_effect_f411/` | Cleanest ADC + DMA example. Different MCU (F411) — cannot be copied directly. |
| `sensor_packing_prototype/` | Host-side CAN payload packing model. Compiles with `gcc`, runs on a laptop. |
| `legacy_embedded_25-26/` | Original workspace + the only contactor/precharge state machine in the repo. |
| `vehical_control_unit_superseded/` | Pre-rename VCU project. Reference only. |

Each directory has its own README explaining what it does and what is wrong with it.

## Not on this branch

**CAN bring-up lives on the `can-testing` branch**, not `main`. It is unfinished:
the three test projects are not consistent with each other, and the newest commit
desynchronised their bit timing after the last verified test.

```bash
git checkout can-testing        # experiments/can_testing/
```

Its README explains what was actually verified and what was not. Nothing there is
ready to be merged into hub firmware.
