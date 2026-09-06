# Center hub firmware — three-way divergence

Read this before editing center hub firmware. Three copies of this firmware
exist, they are not the same, and **none of them is a superset of the others.**

| Copy | Where | Sensors | Averaging | NaN / divide-by-zero guards |
|---|---|---|---|---|
| Canonical | `firmware/center_hub_unit/` | 3 temp, 3 Hall | **Yes**, 8-sample | **No** — commented out |
| `temp` branch | `temp_branch/` | **6 temp, 4 Hall** | No | No |
| GUI snapshot | `gui_repo_snapshot/stm32_main.c` | 3 temp, 3 Hall | No | **Yes** |

## What actually differs

**Canonical vs GUI snapshot** — 138 lines. Two independent changes moving in
opposite directions:

The canonical version added a moving average:

```c
#define AVG_N 8
uint32_t temp_sum_va[3] = {0};
uint16_t temp_hist_va[3][AVG_N] = {0};
```

…and in the same edit commented out the safety guards:

```c
//float compute_temp(float Va, float Vb) {
//    if (fabsf(denom) < 0.001f || Va < 0.01f) { return 0.0f; }
//    if (isnan(tempValue) || isinf(tempValue)) { return 0.0f; }
```

The GUI snapshot still has them live:

```c
float compute_temp(float Va, float Vb) {
    float denom = 2.0f * Va - Vb;
    if (fabsf(denom) < 0.001f || Va < 0.01f) return 0.0f;   // <-- only here
    ...
    if (isnan(tempValue) || isinf(tempValue)) return 0.0f;  // <-- only here
}
```

This matters. `compute_temp` divides by `(2·Va − Vb)`. With a disconnected or
shorted RTD that denominator goes to zero and the canonical build returns `inf`
or `NaN`, which `printf("%.2f")` emits as `inf` or `nan` — and the GUI's
`parseFloat` turns that into `NaN`, which propagates into the dashboard.
A missing sensor is exactly the case you hit on the bench.

**`temp` branch vs canonical** — the `temp` branch is sized for the full sensor
set (6 RTD across 12 ADC1 channels, 4 Hall) and prints over `USART1` using
`__io_putchar`. The canonical version is scaled back to 3+3 on `USART2` using
`_write`. Different UART, different redirect, different array sizes.

## If you are picking one to develop

Start from `firmware/center_hub_unit/`, then port the guards back in from
`gui_repo_snapshot/`. That gets you averaging and safety together. Nobody has
done this yet — it is deliberately left alone so the consolidation stays a
consolidation.

Pull the channel-count scaling from `temp_branch/` when the remaining sensors
are physically installed.
