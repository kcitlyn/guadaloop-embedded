# CAN bring-up

**The only proven CAN traffic in this codebase.** Three STM32F446RE CubeIDE
projects that got frames across a two-wire bus between boards.

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

## How A confirms delivery

A does not just queue and hope. It blocks on the mailbox and then reads the
error register:

```c
st = HAL_CAN_AddTxMessage(&hcan1, &TxHeaderWireless, TxData, &mailbox);
while (HAL_CAN_IsTxMessagePending(&hcan1, mailbox)) { }
canErr = HAL_CAN_GetError(&hcan1);
if (canErr == HAL_CAN_ERROR_NONE) { /* someone ACKed it */ }
```

That is a real check. CAN is ACKed at the bit level by every receiving node, so
`HAL_CAN_ERROR_NONE` after the mailbox drains means another node actually
acknowledged the frame. Note `AutoRetransmission = DISABLE` on A — a failed frame
is dropped, not retried, which is what makes this a clean pass/fail test.

Receivers use interrupt-driven RX into a 48-deep ring buffer:

```c
void HAL_CAN_RxFifo0MsgPendingCallback(CAN_HandleTypeDef *hcan) {
  HAL_CAN_GetRxMessage(&hcan1, CAN_RX_FIFO0, &RxHeader, RxData[RxIndex]);
  RxIndex = (RxIndex + 1) % 48;
}
```

## ⚠️ The three boards do not use the same bit timing

All three land on 500 kbit/s, but by completely different routes:

| | Board A | Boards B / C |
|---|---|---|
| SYSCLK | 84 MHz (PLL 16/336/÷4) | 180 MHz (PLL 8/180/÷2, overdrive) |
| APB1 | 42 MHz (÷2) | 45 MHz (÷4) |
| Prescaler | 6 | 18 |
| BS1 / BS2 | 11 TQ / 2 TQ | 2 TQ / 2 TQ |
| TQ per bit | 14 | 5 |
| Bitrate | 42 MHz ÷ (6 × 14) = **500 kbit/s** | 45 MHz ÷ (18 × 5) = **500 kbit/s** |
| **Sample point** | **85.7 %** | **60 %** |

The bitrates match, which is why this works on the bench. The sample points do
not, and that is the part to fix before this goes near a full-length pod loom.

CiA 301 recommends 87.5 % at 500 kbit/s. A is close. B and C sampling at 60 %
have far less tolerance for propagation delay across a long harness and for
oscillator drift between nodes. Only 5 TQ per bit also means the resynchronisation
jump width can only correct in coarse 20 % steps.

Before the pod loom: pick one timing — 87.5 %, ≥ 8 TQ per bit — and use it on
every node. This is worth doing when the CAN ID allocation gets agreed.

## Wiring

CAN is a differential bus. You cannot wire TX to RX directly between MCU pins —
both boards need a transceiver (MCP2551, TJA1050 or similar):

```
Board A  PA12/PA11  ──  transceiver  ──┬── CAN_H ──┬──  transceiver  ── PA11/PA12  Board B
                                       └── CAN_L ──┘
                       120 Ω across H/L at each physical end of the bus
                       common ground between all boards
```

## Note on `CAN_Communication_Setup.md`

That document is **stale**. It describes an earlier revision: message ID `0x123`,
a `"Hello!"` payload, prescaler 18 with BS1=2/BS2=2 on both boards, and LED
toggling. The code in this directory does none of that. Trust the source, and
this README, over that file. It is kept because it documents the hardware setup
and troubleshooting steps, which are still accurate.
