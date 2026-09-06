# Pod firmware

The five ECUs that go on the pod. Each directory is a self-contained STM32CubeIDE
project — import them individually, do not open this folder as a workspace.

| Project | MCU | CAN pins | State |
|---|---|---|---|
| `vehicle_control_unit` | STM32F446RE | — | Peripheral init only |
| `front_hub_unit` | STM32F446RE | — | CubeMX skeleton |
| `center_hub_unit` | STM32F446RE | — | **Real sensor code** |
| `rear_hub_unit` | STM32F446RE | — | CubeMX skeleton |
| `propulsion_control_unit` | STM32F446RE | — | Peripheral drivers split out |

## What is actually implemented

Only `center_hub_unit` reads sensors. It runs ADC1 and ADC2 with circular DMA,
converts to engineering units, applies an 8-sample moving average, and prints
ASCII telemetry over `USART2` for the GUI to parse.

Front, rear and vehicle hub `main.c` are **byte-identical to each other** — the
same untouched CubeMX output. They are placeholders awaiting their sensor sets.

`propulsion_control_unit` is the only project with peripherals split into separate
translation units (`adc.c`, `can.c`, `tim.c`, `usart.c`, `gpio.c`) rather than all
of `main.c`. That is the better structure; worth copying as the others grow.

## Nothing here transmits CAN

Every unit's `.ioc` configures CAN2 at 500 kbit/s on PB12/PB13. Four units call
`MX_CAN2_Init()` at startup, so the peripheral is configured — but **no unit ever
calls `HAL_CAN_Start()`**, and none calls `HAL_CAN_AddTxMessage`,
`HAL_CAN_GetRxMessage` or `HAL_CAN_ActivateNotification`. The bus carries zero
traffic.

Center hub is the exception, and the comment there is worth reading:

```c
// MX_CAN2_Init();  // commented out — will hang in Error_Handler if no transceiver connected
```

That is a real symptom, not a mistake. `HAL_CAN_Init` on a bus with no transceiver
and no acknowledging node fails, and CubeMX's default `Error_Handler()` is an
infinite loop with interrupts disabled — so the board appears dead. Whoever hit
this diagnosed it correctly.

Working CAN code lives in `experiments/can_testing/` and has not been brought over.

That port is the next real piece of work. When it happens, note that on bxCAN
**CAN1 is the master** — it owns the shared filter bank block. Configuring CAN2
alone will silently receive nothing: CAN1's clock must be enabled and
`SlaveStartFilterBank` set, even if CAN1 is otherwise unused.
