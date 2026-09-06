# Contributed VCU firmware — does not build

`main_vcu_contributed.c` (38 KB) is a vehicle control unit implementation
handed over as a loose file. It is committed **as received and unmodified** so
the work is not lost, but it is quarantined in this subfolder because it cannot
compile.

## Missing dependencies

```c
#include "VCU_Tasks.h"
#include "Initialization_Helper.h"
#include "CAN_Helper.h"
```

None of these three headers exists anywhere in this repository, in either
upstream repository, or on any of the seven original branches. Searched and
confirmed. Whoever wrote this has them locally.

**To finish this:** get those three headers (and their `.c` files) from the
author, drop them into `Core/Inc` and `Core/Src`, and move `main_vcu_contributed.c`
to `Core/Src/main.c`. Then it can leave this folder.

## What it contains, for whoever picks it up

- Contactor / precharge state machine driving the HV path
- CAN transmit and receive using both `hcan1` and `hcan2`
- ADC sampling and TIM-based scheduling
- Inverter control lines: `RFE_CTL` (negative logic — 1 = connectors raised /
  coast) and `RUN_EN_OUT`, with a `g_polarity_out` flag for inverter direction

## One thing to check before trusting it

```c
#if defined(STM32F446xx) && !defined(CAN2)
  #define CAN2 CAN1
  #define hcan2 hcan1
#endif
```

The premise is wrong: **the STM32F446RE does have two CAN peripherals**, CAN1 and
CAN2. The guard is written as though it has only one, and aliases CAN2 onto CAN1.

Because `CAN2` *is* defined in the ST headers for this part, the `!defined(CAN2)`
condition is false and the aliasing does not actually happen — so this is
currently inert rather than harmful. But it signals that the author was working
around a peripheral that appeared missing, which usually means CAN2 was never
clock-enabled rather than absent. On bxCAN, CAN1 is the master: it owns the
shared filter block, and CAN2 will not receive anything unless CAN1's clock is
enabled and `SlaveStartFilterBank` is set, even if CAN1 itself is otherwise unused.

Worth resolving deliberately when this code is revived, rather than leaving a
dead `#if` in the tree.
