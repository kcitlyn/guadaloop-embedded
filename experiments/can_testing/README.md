# CAN bring-up

Three STM32F446RE CubeIDE projects for getting CAN frames between boards.

> **This branch is not merged into `main` on purpose.** The bring-up work is
> unfinished and the three projects are not currently consistent with each other.
> Read "Current state" below before trusting any of it.

Upstream: `github.com/pradyun0414/CAN_testing`
Authors: advaithiyer (7 commits), Raj Mhetar (1), pradyun0414 (1)

| Project | Role | Own ID | Filter accepts |
|---|---|---|---|
| `CAN_TESTING_A` | Transmitter | `0x7E3`, `0x7E4`, `0x7E5` | — |
| `CAN_TESTING_2025_B` | Receiver | `0x003` | `0x7E3` only, mask `0x7FF` |
| `CAN_TESTING_C` | Receiver | `0x003` | `0x7E4` only, mask `0x7FF` |

B and C are the same program. The only functional difference is one line:

```c
sFilter.FilterIdHigh = 0x7E3 << 5;   // B
sFilter.FilterIdHigh = 0x7E4 << 5;   // C
```

`<< 5` is not arbitrary — bxCAN left-justifies the 11-bit standard ID in the top
of a 32-bit filter register, so the ID has to be shifted into place.

---

## Read this before you plug anything in

Two things will waste your afternoon if you don't know them up front.

### 1. The sender's ID does not match either receiver's filter

Board A transmits **only** `TxHeaderWireless`, which is **`0x7E5`**. The sends
using `TxHeaderB` (`0x7E3`) and `TxHeaderC` (`0x7E4`) are commented out:

```c
st = HAL_CAN_AddTxMessage(&hcan1, &TxHeaderWireless, TxData, &mailbox);   // 0x7E5
//  HAL_CAN_AddTxMessage(&hcan1, &TxHeaderB, TxData, &TxMailbox);         // 0x7E3
//  HAL_CAN_AddTxMessage(&hcan1, &TxHeaderC, TxData, &TxMailbox);         // 0x7E4
```

But the receivers filter for exactly one ID each, with a full `0x7FF` mask:

```c
sFilter.FilterIdHigh     = 0x7E3 << 5;   // B — accepts ONLY 0x7E3
sFilter.FilterMaskIdHigh = 0x7FF << 5;   // every ID bit must match
```

**So neither B nor C will accept anything A sends.** `RxData` stays all zeros and
`RxIndex` stays `0`.

The cruel part: **board A will still report success.** On CAN, every node on the
bus acknowledges a frame at the bit level *before* acceptance filtering is
applied. So A sees `canErr == HAL_CAN_ERROR_NONE` — a correctly wired bus with a
listening partner — while the receiver appears completely dead. That looks like a
wiring fault and is not one.

For first bring-up, make the receiver accept everything:

```c
sFilter.FilterIdHigh     = 0x0000;
sFilter.FilterMaskIdHigh = 0x0000;   // mask 0 = don't care = accept all IDs
```

Once frames are arriving, put the filter back and align the IDs deliberately.

### 2. Nothing prints and no LED blinks

`CAN_Communication_Setup.md` in this folder promises UART terminal output and
alternating LEDs. **Neither exists in this code.** The only `printf` in any of the
three projects is a commented-out example inside `assert_failed()`. UART2 is
initialised at 115200 but never written to, and `HAL_GPIO_TogglePin` appears
nowhere.

Both receivers' main loop is, in full:

```c
while (1) { int k = 0; }
```

**Verification is entirely through the debugger.** That is how this was originally
tested, and the two `.launch` configs in this folder are the ones the authors used.

---

## Current state: what has and has not been tested

The upstream history is unusually honest, and it matters:

| Commit | Date | Author | Message |
|---|---|---|---|
| `497ca56` | 2025-10-12 | advaithiyer | **THIS CODE WORKS** — make sure both MCUs are connected to GND line, 3.3 doesn't matter |
| `da81fdf` | 2025-11-16 | advaithiyer | 1 sender 2 receiver code (**yet to test**) |
| `ac4b167` | 2026-04-16 | advaithiyer | updated clock settings and debug code for can testing a (sender) |

Reading that in order:

1. **At `497ca56` it genuinely worked** — one sender, one receiver. At that commit
   boards A and B had *identical* bit timing: prescaler 18, BS1 2 TQ, BS2 2 TQ.
2. **`da81fdf` added the third board** and says plainly it was never tested.
3. **`ac4b167` changed board A only.** Verified from the diff — it touches
   `CAN_TESTING_A/` and nothing else in `Core/`:

   ```diff
   -  RCC_OscInitStruct.PLL.PLLM = 8;     RCC_OscInitStruct.PLL.PLLN = 180;
   -  RCC_OscInitStruct.PLL.PLLP = RCC_PLLP_DIV2;
   -  RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV4;
   -  hcan1.Init.Prescaler = 18;          hcan1.Init.TimeSeg1 = CAN_BS1_2TQ;
   +  RCC_OscInitStruct.PLL.PLLM = 16;    RCC_OscInitStruct.PLL.PLLN = 336;
   +  RCC_OscInitStruct.PLL.PLLP = RCC_PLLP_DIV4;
   +  RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV2;
   +  hcan1.Init.Prescaler = 6;           hcan1.Init.TimeSeg1 = CAN_BS1_11TQ;
   ```

**So the set as committed has never been verified working.** The last known-good
configuration had all boards matched; the newest commit desynchronised them.

## What that left behind

All three still land on 500 kbit/s, but by different routes:

| | Board A (now) | Boards B / C (unchanged) |
|---|---|---|
| SYSCLK | 84 MHz (PLL 16/336/÷4) | 180 MHz (PLL 8/180/÷2, overdrive) |
| APB1 | 42 MHz (÷2) | 45 MHz (÷4) |
| Prescaler | 6 | 18 |
| BS1 / BS2 | 11 TQ / 2 TQ | 2 TQ / 2 TQ |
| TQ per bit | 14 | 5 |
| Bitrate | 42 MHz ÷ (6 × 14) = **500 kbit/s** | 45 MHz ÷ (18 × 5) = **500 kbit/s** |
| **Sample point** | **85.7 %** | **60 %** |

The bitrates match, which is why this may still appear to work on a short bench
harness. The sample points do not.

CiA 301 recommends 87.5 % at 500 kbit/s. Board A is close. B and C sampling at
60 % have much less tolerance for propagation delay across a long harness and for
oscillator drift between nodes — and with only 5 TQ per bit, resynchronisation can
only correct in coarse 20 % steps.

**Before this goes near a pod loom:** pick one timing — 87.5 %, at least 8 TQ per
bit — and apply it to every node. Board A's current settings are the better
starting point, and `firmware/propulsion_control_unit/Core/Src/can.c` on `main`
already matches them exactly (same 16/336/÷4 clock tree, same prescaler 6 /
11 TQ / 2 TQ). Bringing B and C in line with A would make four nodes agree.

## How A confirms delivery

A does not just queue and hope. It blocks on the mailbox and reads the error
register:

```c
st = HAL_CAN_AddTxMessage(&hcan1, &TxHeaderWireless, TxData, &mailbox);
while (HAL_CAN_IsTxMessagePending(&hcan1, mailbox)) { }
canErr = HAL_CAN_GetError(&hcan1);
if (canErr == HAL_CAN_ERROR_NONE) { /* someone ACKed it */ }
```

That is a real check. CAN is ACKed at the bit level by every receiving node, so
`HAL_CAN_ERROR_NONE` after the mailbox drains means another node genuinely
acknowledged the frame. `AutoRetransmission = DISABLE` means a failed frame is
dropped rather than retried, which is what makes this a clean pass/fail test.

Receivers use interrupt-driven RX into a 48-deep ring buffer:

```c
void HAL_CAN_RxFifo0MsgPendingCallback(CAN_HandleTypeDef *hcan) {
  HAL_CAN_GetRxMessage(&hcan1, CAN_RX_FIFO0, &RxHeader, RxData[RxIndex]);
  RxIndex = (RxIndex + 1) % 48;
}
```

Note both receivers sit in an empty `while(1) { int k = 0; }` — the ring buffer
fills but nothing consumes it. Fine for inspecting `RxData` in a debugger, which
is how this was tested; it is not a data path.

## Wiring

CAN is a differential bus. You cannot wire TX to RX directly between MCU pins —
both boards need a transceiver (MCP2551, TJA1050 or similar):

```
Board A  PA12/PA11  ──  transceiver  ──┬── CAN_H ──┬──  transceiver  ── PA11/PA12  Board B
                                       └── CAN_L ──┘
                       120 Ω across H/L at each physical end of the bus
                       common ground between all boards
```

**Grounds matter more than supply.** From `497ca56`: *"MAKE SURE BOTH MCUs ARE
CONNECTED TO GND LINE, 3.3 DOESN'T MATTER."* That was the fix that made it work.
CAN signalling is differential but still referenced to a common ground; without a
shared return the two nodes' common-mode voltages drift apart and the receivers
cannot resolve the differential pair. `b543bc1` ("pull up for pa11", Raj Mhetar)
is a related workaround — an idle-high pull-up on RX when no transceiver is
driving the line.

## Note on `CAN_Communication_Setup.md`

That document is **stale**. It describes an earlier revision: message ID `0x123`,
a `"Hello!"` payload, prescaler 18 with BS1=2/BS2=2 on *both* boards, and LED
toggling. The code here does none of that. Trust the source and this README over
it. It is kept because its hardware setup and troubleshooting sections are still
accurate.

## Picking this up

1. Decide the bus timing: 87.5 %, ≥ 8 TQ/bit, 500 kbit/s. Apply to A, B, C and
   `can.c` on `main`.
2. Re-run the two-node test from `497ca56` to re-establish a known-good baseline.
3. Only then add the third node, which has never been tested.
4. Agree the CAN ID allocation before any of this reaches hub firmware — `0x7E3`
   through `0x7E5` are bench placeholders, not a scheme.
