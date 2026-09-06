#include <stdint.h>
#include <stdio.h>
#include <string.h>

// constants 

#define SENSOR_TEMP  0
#define SENSOR_HALL  2

#define HUB_CHU      2

#define FRAME_SIZE   8
#define MAX_FRAMES   4   // enough for 6 sensors

// storage 

uint32_t CHU_Temp[3];
uint32_t CHU_Hall[3];

// float to fixed

uint32_t float_to_fixed(float val, float scale)
{
    if (val < 0) val = 0;
    return (uint32_t)(val * scale);
}

// sensor packing

void pack_sensor(uint8_t *buf, uint16_t *idx,
                 uint8_t type, uint32_t value)
{
    buf[*idx + 0] = ((type & 0x03) << 5) | ((value >> 16) & 0x1F);
    buf[*idx + 1] = (value >> 8) & 0xFF;
    buf[*idx + 2] = value & 0xFF;

    *idx += 3;
}

// frames for data

void build_frames(uint8_t *buffer, uint8_t *frame_count)
{
    uint16_t idx = 1;

    // ex values for adc that needs to be replaced
    float t1 = 36.5, t2 = 37.2, t3 = 38.1;
    uint32_t h1 = 1, h2 = 0, h3 = 1;

    // packing sensors - calling function

    pack_sensor(buffer, &idx, SENSOR_TEMP, float_to_fixed(t1, 100));
    pack_sensor(buffer, &idx, SENSOR_TEMP, float_to_fixed(t2, 100));
    pack_sensor(buffer, &idx, SENSOR_TEMP, float_to_fixed(t3, 100));

    pack_sensor(buffer, &idx, SENSOR_HALL, h1);
    pack_sensor(buffer, &idx, SENSOR_HALL, h2);
    pack_sensor(buffer, &idx, SENSOR_HALL, h3);

   // 0 padding to align to frame size
    while (idx % 8 != 0) buffer[idx++] = 0;

    *frame_count = idx / 8;

    buffer[0] = (HUB_CHU << 4) | (*frame_count & 0x0F);
}

// rx

uint8_t RxData[8][8];

void simulate_rx(uint8_t *buffer, uint8_t frames)
{
    for (int i = 0; i < frames; i++)
        memcpy(RxData[i], &buffer[i * 8], 8);
}

// process and decode data from frames

void decode_CHU()
{
    uint8_t frameNum = RxData[0][0] & 0x0F;

    uint16_t i = 1;

    int temp_idx = 0;
    int hall_idx = 0;

    while (i <= frameNum * 8 - 3 && RxData[i/8][i%8] != 0)
    {
        uint8_t b1 = RxData[i/8][i%8];
        uint8_t b2 = RxData[(i+1)/8][(i+1)%8];
        uint8_t b3 = RxData[(i+2)/8][(i+2)%8];

        uint8_t type = (b1 & 0x60) >> 5;

        uint32_t value =
            ((uint32_t)(b1 & 0x1F) << 16) |
            ((uint32_t)b2 << 8) |
            ((uint32_t)b3);

        // assignments

        if (type == SENSOR_TEMP && temp_idx < 3)
        {
            CHU_Temp[temp_idx++] = value;
        }
        else if (type == SENSOR_HALL && hall_idx < 3)
        {
            CHU_Hall[hall_idx++] = value;
        }

        i += 3;
    }
}

// debug if needed

void print_results()
{
    printf("Temps:\n");
    for(int i=0;i<3;i++) printf("%u ", CHU_Temp[i]);

    printf("\nHall:\n");
    for(int i=0;i<3;i++) printf("%u ", CHU_Hall[i]);

    printf("\n");
}

// main

int main()
{
    uint8_t buffer[64] = {0};
    uint8_t frames = 0;

    build_frames(buffer, &frames);
    simulate_rx(buffer, frames);
    decode_CHU();
    print_results();

    return 0;
}