# Hall effect calibration rig

Standalone bench project for reading Hall sensors via ADC + DMA.

> ⚠️ **Different MCU.** This targets the **STM32F411RE**, not the STM32F446RE the
> pod uses. `startup_stm32f411retx.s` and `STM32F411RETX_FLASH.ld` are F411-specific
> and the clock tree differs. You cannot copy this project into a hub unit — port
> the ADC/DMA configuration by hand, or regenerate from the hub's own `.ioc`.

Four channels DMA'd into a single buffer:

```c
uint16_t adc_buf[4];   // DMA fills this with 4 sensor readings
```

Kept because it is the cleanest isolated example of the ADC + DMA pattern the hub
units use, with nothing else in the way.
