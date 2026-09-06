/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : main.c
  * @brief          : Main program body — Contactor FSM with SDC + Lev Control
  ******************************************************************************
  * @attention
  *
  * Copyright (c) 2026 STMicroelectronics.
  * All rights reserved.
  *
  * This software is licensed under terms that can be found in the LICENSE file
  * in the root directory of this software component.
  * If no LICENSE file comes with this software, it is provided AS-IS.
  *
  ******************************************************************************
  */
/* USER CODE END Header */

/* Includes ------------------------------------------------------------------*/
#include "main.h"
#include "gpio.h"

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */
#include <stdbool.h>
#include <stdint.h>
#include <assert.h>
/* USER CODE END Includes */

/* Private typedef -----------------------------------------------------------*/
/* USER CODE BEGIN PTD */
/* USER CODE END PTD */

/* Private define ------------------------------------------------------------*/
/* USER CODE BEGIN PD */

/* ===========================
   IMPORTANT TEST SWITCH
   ===========================
   0 = run FSM normally
   1 = force relay pin to toggle (simple click test)
*/
#define SIMPLE_RELAY_TEST   0

/* ===========================
   CONTACTOR OUTPUT PINS
   (CubeMX user labels — defined in main.h by CubeMX)
   ===========================
   These use CubeMX labels if available, otherwise fall back to raw GPIO.
*/

/* MAIN contactor */
#if defined(MAIN_Pin) && defined(MAIN_GPIO_Port)
  #define MAIN_P    MAIN_GPIO_Port
  #define MAIN_PIN  MAIN_Pin
#else
  #define MAIN_P    GPIOA
  #define MAIN_PIN  GPIO_PIN_6   // fallback
#endif

/* PRECHARGE contactor */
#if defined(PRECHARGE_Pin) && defined(PRECHARGE_GPIO_Port)
  #define PRE_P     PRECHARGE_GPIO_Port
  #define PRE_PIN   PRECHARGE_Pin
#else
  #define PRE_P     GPIOA
  #define PRE_PIN   GPIO_PIN_7   // fallback
#endif

/* DISCHARGE contactor */
#if defined(DISCHARGE_Pin) && defined(DISCHARGE_GPIO_Port)
  #define DIS_P     DISCHARGE_GPIO_Port
  #define DIS_PIN   DISCHARGE_Pin
#else
  #define DIS_P     GPIOB
  #define DIS_PIN   GPIO_PIN_0   // fallback
#endif

/* ===========================
   SDC (Shutdown Circuit) INPUT PIN
   ===========================
   All 4 emergency buttons are wired in series.
   When ANY button is pressed the line goes LOW.
   Configured in CubeMX as: GPIO Input, Pull-Up.
*/
#if defined(SDC_Pin) && defined(SDC_GPIO_Port)
  #define SDC_PORT  SDC_GPIO_Port
  #define SDC_PIN   SDC_Pin
#else
  #define SDC_PORT  GPIOB
  #define SDC_PIN   GPIO_PIN_1   // fallback
#endif

/* ===========================
   LEV CONTROL BOARD SIGNAL OUTPUT PIN
   ===========================
   HIGH = power the yokes (normal run)
   LOW  = remove power from yokes (shutdown / safe state)
   Configured in CubeMX as: GPIO Output, initially LOW.
*/
#if defined(LEV_Pin) && defined(LEV_GPIO_Port)
  #define LEV_PORT  LEV_GPIO_Port
  #define LEV_PIN   LEV_Pin
#else
  #define LEV_PORT  GPIOB
  #define LEV_PIN   GPIO_PIN_2   // fallback
#endif

/* ===========================
   TIMING
   =========================== */
#define PRECHARGE_TIME_MS   5570U   // RC time constant = 16.87s → caps are fully charged after this
#define MAIN_SETTLE_MS       1000U   // hold MAIN+PRECHARGE closed for >=1s before opening PRECHARGE
#define WAIT_START_MS         200U   // short dwell in ST_WAIT_START to ensure discharge is engaged

/* ===========================
   START / STOP COMMANDS
   ===========================
   Set g_start_cmd = true  to begin the startup sequence.
   Set g_stop_cmd  = true  to trigger a normal shutdown.
   In your final system these will come from your higher-level controller.
*/
static volatile bool g_start_cmd = true;   // set true to begin startup
static volatile bool g_stop_cmd  = false;  // set true to initiate shutdown

/* USER CODE END PD */

/* Private macro -------------------------------------------------------------*/
/* USER CODE BEGIN PM */
/* USER CODE END PM */

/* Private variables ---------------------------------------------------------*/
/* USER CODE BEGIN PV */
/* USER CODE END PV */

/* Private function prototypes -----------------------------------------------*/
void SystemClock_Config(void);

/* USER CODE BEGIN PFP */
/* USER CODE END PFP */

/* Private user code ---------------------------------------------------------*/
/* USER CODE BEGIN 0 */

/* ===========================================================================
   OUTPUT HELPERS
   Inverted logic: LOW = contactor open, HIGH = contactor closed.
   =========================================================================== */

/* MAIN contactor */
static inline void main_open(void)  { HAL_GPIO_WritePin(MAIN_P, MAIN_PIN, GPIO_PIN_RESET); }
static inline void main_close(void) { HAL_GPIO_WritePin(MAIN_P, MAIN_PIN, GPIO_PIN_SET);   }

/* PRECHARGE contactor */
static inline void pre_open(void)   { HAL_GPIO_WritePin(PRE_P,  PRE_PIN,  GPIO_PIN_RESET); }
static inline void pre_close(void)  { HAL_GPIO_WritePin(PRE_P,  PRE_PIN,  GPIO_PIN_SET);   }

/* DISCHARGE contactor */
static inline void dis_open(void)   { HAL_GPIO_WritePin(DIS_P,  DIS_PIN,  GPIO_PIN_RESET); }
static inline void dis_close(void)  { HAL_GPIO_WritePin(DIS_P,  DIS_PIN,  GPIO_PIN_SET);   }

/* LEV control board signal */
static inline void lev_power_on(void)  { HAL_GPIO_WritePin(LEV_PORT, LEV_PIN, GPIO_PIN_SET);   } // HIGH = power yokes
static inline void lev_power_off(void) { HAL_GPIO_WritePin(LEV_PORT, LEV_PIN, GPIO_PIN_RESET); } // LOW  = remove power

/* ===========================================================================
   SAFETY INTERLOCK COMBO HELPER
   Pass 1=close / 0=open for each contactor.
   Hard assert: MAIN and DISCHARGE must never be closed at the same time.
   =========================================================================== */
static inline void set_contactors(uint8_t mainC, uint8_t preC, uint8_t disC)
{
    assert(!(mainC && disC));
    if (mainC) main_close(); else main_open();
    if (preC)  pre_close();  else pre_open();
    if (disC)  dis_close();  else dis_open();
}

/* ===========================================================================
   SDC (SHUTDOWN CIRCUIT) INPUT READER
   Returns true if the SDC has been tripped (any button pressed = line LOW).
   =========================================================================== */
static inline bool sdc_tripped(void)
{
    return (HAL_GPIO_ReadPin(SDC_PORT, SDC_PIN) == GPIO_PIN_RESET);
}

/* ===========================================================================
   FSM STATE DEFINITIONS
   ===========================================================================
   ST_START      — Power-on safe state: all open except DISCHARGE closed.
                   Ensures capacitors are discharged before anything happens.
   ST_WAIT_START — Short 200ms dwell to confirm DISCHARGE is fully engaged.
   ST_PRECHARGE  — Open DISCHARGE, close PRECHARGE. Wait for RC time constant
                   (11.83463s) to elapse — caps are fully charged after this.
   ST_MAIN_ON    — Time elapsed: close MAIN while keeping PRECHARGE closed.
                   Hold for ≥ 1 second to let things settle.
   ST_RUN        — Normal operation: open PRECHARGE, MAIN stays closed.
                   Lev control board powered (yokes active).
   ST_SHUTDOWN   — Open MAIN, close DISCHARGE. Lev board unpowered.
                   Entered from any state on: stop command OR SDC trip.
   =========================================================================== */
typedef enum {
    ST_START = 0,
    ST_WAIT_START,
    ST_PRECHARGE,
    ST_MAIN_ON,
    ST_RUN,
    ST_SHUTDOWN
} state_t;

static state_t  g_state        = ST_START;
static uint32_t g_t_stateStart = 0;

/* ===========================================================================
   FSM STATE ENTRY — sets outputs immediately on entering each state
   =========================================================================== */
static void fsm_enter(state_t s)
{
    g_state        = s;
    g_t_stateStart = HAL_GetTick();

    switch (s)
    {
    case ST_START:
        /* All open except DISCHARGE closed → caps discharge safely */
        set_contactors(0, 0, 1);
        lev_power_off();
        break;

    case ST_WAIT_START:
        /* Keep DISCHARGE closed, short dwell */
        set_contactors(0, 0, 1);
        lev_power_off();
        break;

    case ST_PRECHARGE:
        /* Open DISCHARGE, close PRECHARGE → caps begin charging */
        set_contactors(0, 1, 0);
        lev_power_off();
        break;

    case ST_MAIN_ON:
        /* Close MAIN, keep PRECHARGE closed → settle for 1 second */
        set_contactors(1, 1, 0);
        lev_power_off();
        break;

    case ST_RUN:
        /* Open PRECHARGE, MAIN stays closed → normal operation, yokes on */
        set_contactors(1, 0, 0);
        lev_power_on();
        break;

    case ST_SHUTDOWN:
        /* Open MAIN, close DISCHARGE → safe state, yokes off */
        set_contactors(0, 0, 1);
        lev_power_off();
        break;

    default:
        set_contactors(0, 0, 1);
        lev_power_off();
        break;
    }
}

/* ===========================================================================
   FSM STEP — called every loop iteration
   =========================================================================== */
static void fsm_step(void)
{
    const uint32_t now = HAL_GetTick();

    /* SDC CHECK — highest priority, fires from any state */
    if (sdc_tripped())
    {
        if (g_state != ST_SHUTDOWN)
            fsm_enter(ST_SHUTDOWN);
        return;
    }

    /* State transitions */
    switch (g_state)
    {
    case ST_START:
        if (g_start_cmd)
            fsm_enter(ST_WAIT_START);
        break;

    case ST_WAIT_START:
        if ((now - g_t_stateStart) >= WAIT_START_MS)
            fsm_enter(ST_PRECHARGE);
        break;

    case ST_PRECHARGE:
        /* Wait for RC time constant to elapse → caps are fully charged */
        if ((now - g_t_stateStart) >= PRECHARGE_TIME_MS)
            fsm_enter(ST_MAIN_ON);
        break;

    case ST_MAIN_ON:
        /* Hold MAIN + PRECHARGE closed for 1 second before opening PRECHARGE */
        if ((now - g_t_stateStart) >= MAIN_SETTLE_MS)
            fsm_enter(ST_RUN);
        break;

    case ST_RUN:
        if (g_stop_cmd)
            fsm_enter(ST_SHUTDOWN);
        break;

    case ST_SHUTDOWN:
        /* Stay here safely until power cycle */
        break;

    default:
        fsm_enter(ST_SHUTDOWN);
        break;
    }
}

/* USER CODE END 0 */

/**
  * @brief  The application entry point.
  * @retval int
  */
int main(void)
{
  /* USER CODE BEGIN 1 */
  /* USER CODE END 1 */

  /* MCU Configuration--------------------------------------------------------*/
  HAL_Init();

  /* USER CODE BEGIN Init */
  /* USER CODE END Init */

  /* Configure the system clock */
  SystemClock_Config();

  /* USER CODE BEGIN SysInit */
  /* USER CODE END SysInit */

  /* Initialize all configured peripherals */
  MX_GPIO_Init();

  /* USER CODE BEGIN 2 */
  /* Drive all outputs to safe state immediately on boot */
  lev_power_off();
  fsm_enter(ST_START);
  /* USER CODE END 2 */

  /* Infinite loop */
  /* USER CODE BEGIN WHILE */
  while (1)
  {
    /* USER CODE END WHILE */

    /* USER CODE BEGIN 3 */
#if SIMPLE_RELAY_TEST
      /* Simple relay click test — toggles MAIN pin every 1 second */
      main_close();
      HAL_Delay(1000);
      main_open();
      HAL_Delay(1000);
#else
      fsm_step();
#endif
  }
  /* USER CODE END 3 */
}

/**
  * @brief System Clock Configuration
  * @retval None
  */
void SystemClock_Config(void)
{
  RCC_OscInitTypeDef RCC_OscInitStruct = {0};
  RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

  __HAL_RCC_PWR_CLK_ENABLE();
  __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE3);

  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSI;
  RCC_OscInitStruct.HSIState = RCC_HSI_ON;
  RCC_OscInitStruct.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;
  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_NONE;
  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK)
  {
    Error_Handler();
  }

  RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK|RCC_CLOCKTYPE_SYSCLK
                              |RCC_CLOCKTYPE_PCLK1|RCC_CLOCKTYPE_PCLK2;
  RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_HSI;
  RCC_ClkInitStruct.AHBCLKDivider = RCC_SYSCLK_DIV1;
  RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV1;
  RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV1;
  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_0) != HAL_OK)
  {
    Error_Handler();
  }
}

/* USER CODE BEGIN 4 */
/* USER CODE END 4 */

/**
  * @brief  This function is executed in case of error occurrence.
  * @retval None
  */
void Error_Handler(void)
{
  /* USER CODE BEGIN Error_Handler_Debug */
  __disable_irq();
  while (1) { }
  /* USER CODE END Error_Handler_Debug */
}

#ifdef USE_FULL_ASSERT
void assert_failed(uint8_t *file, uint32_t line)
{
  /* USER CODE BEGIN 6 */
  (void)file; (void)line;
  /* USER CODE END 6 */
}
#endif /* USE_FULL_ASSERT */
