# Sensor packing prototype

Plain C. No HAL, no hardware. Builds and runs on your laptop:

```bash
gcc -std=c11 -Wall -Wextra -o pack main.c && ./pack
```

A worked model of packing multiple sensor readings into 8-byte CAN frames and
decoding them back out. Useful for reasoning about wire format without a board
in front of you.

## The format it demonstrates

Byte 0 of frame 0 is a header: hub ID in the high nibble, frame count in the low.

```c
buffer[0] = (HUB_CHU << 4) | (*frame_count & 0x0F);
```

Every reading after that is a 3-byte record — 2 bits of sensor type, 21 bits of
value:

```c
buf[*idx + 0] = ((type & 0x03) << 5) | ((value >> 16) & 0x1F);
buf[*idx + 1] = (value >> 8) & 0xFF;
buf[*idx + 2] =  value       & 0xFF;
```

Temperature is scaled by 100 before packing (`float_to_fixed(t1, 100)`), so 36.5 °C
travels as `3650` and the decoder divides back down. That is standard fixed-point
practice and the right instinct — floats do not belong on a CAN bus.

## Known limitations of the prototype

Written down so nobody adopts these into flight code by accident:

- **`float_to_fixed` clamps negatives to zero.** `if (val < 0) val = 0;`. Sub-zero
  temperatures become 0 °C rather than a negative reading. A signed encoding is
  needed for anything that can legitimately go below zero.
- **`decode_CHU` stops at the first zero byte, and that fires immediately.**
  This is not theoretical — build and run it and every reading prints as `0`:

  ```
  $ gcc -std=c11 -o pack main.c && ./pack
  Temps:
  0 0 0
  Hall:
  0 0 0
  ```

  It packs 36.5, 37.2 and 38.1 °C and decodes nothing. Why:

  ```c
  buf[*idx + 0] = ((type & 0x03) << 5) | ((value >> 16) & 0x1F);
  ```

  `SENSOR_TEMP` is `0`, and 3650 (36.5 °C × 100) needs only 12 bits, so
  `value >> 16` is also `0`. The first byte of the first record is therefore
  `0x00` — and the decode loop guard treats zero as end-of-data:

  ```c
  while (i <= frameNum * 8 - 3 && RxData[i/8][i%8] != 0)
  ```

  It terminates before reading a single sensor. Any temperature below 65536
  counts (i.e. all of them), so this never worked, rather than breaking on an
  edge case.

  The fix is not to special-case zero. Length is already being transmitted — the
  frame count is packed into `buffer[0]` and correctly parsed into `frameNum` —
  so the loop should be bounded by that alone and the `!= 0` guard dropped.
  Framing by sentinel value cannot work when zero is a legal payload byte.
- **Truncating cast.** `(uint32_t)(val * scale)` rounds toward zero rather than to
  nearest; `lroundf` costs nothing here.
- Type field is 2 bits (4 sensor types) and the frame-count nibble caps at 15 frames.

None of this is wrong for a prototype. It is exactly the sort of thing to settle
before it becomes the pod's wire format.
