/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : main.c
  * @brief          : Main program body
  ******************************************************************************
  * @attention
  *
  * Copyright (c) 2025 STMicroelectronics.
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
#include <stdbool.h>
#include "main.h"
#include "stm32f4xx_hal_adc.h"
#include "stm32f4xx_hal_can.h"
#include "stm32f4xx_hal_tim.h"
#include "stm32f4xx_hal_gpio.h"
#include "stm32f4xx_hal.h"

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */
/* Includes ------------------------------------------------------------------*/
#include "VCU_Tasks.h"
#include "Initialization_Helper.h"
#include "CAN_Helper.h"
/* Private includes ----------------------------------------------------------*/
/* USER CODE END Includes */

/* Private typedef -----------------------------------------------------------*/
/* USER CODE BEGIN PTD */
/* USER CODE END PTD */

/* Private define ------------------------------------------------------------*/
/* USER CODE BEGIN PD */
/* USER CODE END PD */

/* Private macro -------------------------------------------------------------*/
/* USER CODE BEGIN PM */
/* USER CODE END PM */

/* Private variables ---------------------------------------------------------*/
ADC_HandleTypeDef hadc1;
CAN_HandleTypeDef hcan1;
CAN_HandleTypeDef hcan2;
/* ===== STM32F446RE: alias CAN2 to CAN1 (F446 has only CAN1) ===== */
#if defined(STM32F446xx) && !defined(CAN2)
  #define CAN2 CAN1
  #define hcan2 hcan1
#endif


/* USER CODE BEGIN PV & Helpers */
TIM_HandleTypeDef htim3;


/* ------ Additional control outputs per propulsion spec ------ */
/* NOTE: Map these to your actual board pins (placeholders shown). 
 * RFE_CTL: drives the "RFE" (negative logic) control line: 1 = connectors raised (coast/disable), 0 = normal.
 * RUN_EN_OUT: optional—kept ON for sanity even during coasting, per spec.
 */
#ifndef RFE_CTL_GPIO_Port
#define RFE_CTL_GPIO_Port     GPIOB
#define RFE_CTL_Pin           GPIO_PIN_2
#endif

#ifndef RUN_EN_OUT_GPIO_Port
#define RUN_EN_OUT_GPIO_Port  GPIOB
#define RUN_EN_OUT_Pin        GPIO_PIN_10
#endif

/* Track current polarity signal we drive to the inverter: 1=retain, 0=invert */
static volatile uint8_t g_polarity_out = 1;  /* default retain */

/* Helper: set polarity digital output explicitly (overrides echo behavior for scenario control) */
static inline void SetPolarityOut(uint8_t v)
{
  g_polarity_out = v ? 1 : 0;
  HAL_GPIO_WritePin(POLARITY_OUT_GPIO_Port, POLARITY_OUT_Pin, g_polarity_out ? GPIO_PIN_SET : GPIO_PIN_RESET);
}

/* Helper: set/coast RFE control line (negative logic implemented on circuit) */
static inline void SetRFE(uint8_t level)
{
  /* level: 1 => connectors raised (coast), 0 => normal */
  HAL_GPIO_WritePin(RFE_CTL_GPIO_Port, RFE_CTL_Pin, level ? GPIO_PIN_SET : GPIO_PIN_RESET);
}

/* Helper: keep RUN_EN always on for sanity per spec (even during coasting/emergency) */
static inline void KeepRunEnableOn(void)
{
  HAL_GPIO_WritePin(RUN_EN_OUT_GPIO_Port, RUN_EN_OUT_Pin, GPIO_PIN_SET);
}

/* Desired duty % interface (0..100): caller/FSM sets intended EFFECTIVE duty.
 * If digital pin (polarity) is 1 => pass duty as-is.
 * If digital pin (polarity) is 0 => inverter inverts => we drive 100 - duty.
 * We keep the same ApplyPropulsionPWM() path; it inverts based on g_polarity_out.
 */
static volatile uint8_t g_desiredDutyPercent = 0; /* intended effective duty */

static inline void PropulsionSetDesiredDuty(uint8_t duty_percent)
{
  if (duty_percent > 100) duty_percent = 100;
  g_desiredDutyPercent = duty_percent;
}

static volatile uint8_t RAMP_UP_STEP = 2;    /* increase duty by 2% each call (example) */
static volatile uint8_t RAMP_DOWN_STEP = 20; /* sharp drop—cap at target immediately if larger than delta */
/* ------ Propulsion I/O pins (adjust to your board pins) ------ */
// Inputs (from upstream logic)
#define RFE_IN_GPIO_Port      GPIOA
#define RFE_IN_Pin            GPIO_PIN_0
#define RUN_EN_IN_GPIO_Port   GPIOA
#define RUN_EN_IN_Pin         GPIO_PIN_1
#define POLARITY_REQ_GPIO_Port GPIOA
#define POLARITY_REQ_Pin      GPIO_PIN_2   // 1=retain, 0=invert (request line from propulsion)

// Outputs (to LIM / propulsion team)
#define LIM_EN_GPIO_Port      GPIOB
#define LIM_EN_Pin            GPIO_PIN_0   // drives LIM enable when safe
#define POLARITY_OUT_GPIO_Port GPIOB
#define POLARITY_OUT_Pin      GPIO_PIN_1   // echoes 1=retain, 0=invert back to propulsion

// PWM: TIM3_CH1 & TIM3_CH2 -> “two analog ports”

// Pre: 0 <= dutyPct <= 100
// Post: CCRx set to corresponding duty on 100kHz carrier
static inline void PWM_SetPercent(TIM_HandleTypeDef *htim, uint32_t channel, uint8_t dutyPct)
{
  uint32_t arr = __HAL_TIM_GET_AUTORELOAD(htim);         // 839
  uint32_t ccr = ((uint32_t)(dutyPct) * (arr + 1)) / 100;
  __HAL_TIM_SET_COMPARE(htim, channel, ccr);
}

// Returns 1 if LIM may be enabled (RFE == RUN_EN == 1), else 0; also drives the LIM_EN pin
static inline uint8_t LIM_Enable_IfSafe(void)
{
  uint8_t rfe    = (uint8_t)HAL_GPIO_ReadPin(RFE_IN_GPIO_Port, RFE_IN_Pin);
  uint8_t run_en = (uint8_t)HAL_GPIO_ReadPin(RUN_EN_IN_GPIO_Port, RUN_EN_IN_Pin);

  uint8_t ok = (rfe == run_en) && (rfe == 1);
  HAL_GPIO_WritePin(LIM_EN_GPIO_Port, LIM_EN_Pin, ok ? GPIO_PIN_SET : GPIO_PIN_RESET);
  return ok;
}

// Reads requested polarity from propulsion team and echoes it back.
// Return: 1 = retain (normal), 0 = invert
static inline uint8_t ReadAndEchoPolarity(void)
{
  uint8_t req = (uint8_t)HAL_GPIO_ReadPin(POLARITY_REQ_GPIO_Port, POLARITY_REQ_Pin);
  HAL_GPIO_WritePin(POLARITY_OUT_GPIO_Port, POLARITY_OUT_Pin, req ? GPIO_PIN_SET : GPIO_PIN_RESET);
  return req ? 1 : 0;
}

// Applies duty to both analog ports (TIM3 CH1 & CH2), inverted if polarity=0
// Pre: 0<=dutyA<=100, 0<=dutyB<=100
static inline void ApplyPropulsionPWM(uint8_t dutyA, uint8_t dutyB, uint8_t polarity /*1=retain,0=invert*/)
{
  uint8_t effA = polarity ? dutyA : (uint8_t)(100 - dutyA);
  uint8_t effB = polarity ? dutyB : (uint8_t)(100 - dutyB);

  PWM_SetPercent(&htim3, TIM_CHANNEL_1, effA);
  PWM_SetPercent(&htim3, TIM_CHANNEL_2, effB);
}

/* === Forward declarations for user functions referenced before definition === */
void fullprocess(void);
void checkAllTemp(int x);
void checkAllHallEffect(int min, int max);
void checkAllInductive(int min, int max);
void checkIMU(uint32_t maxMagnitude);
void initElectronics(void);
void healthCheck(void);
void countCheck(void);
void readyToLaunch(void);
void levOn(void);
void calibrateLev(void);
void propulsionOn(void);
void accelerate(void);
void coast(void);
void normalBrake(void);
void emergencyBrake(void);
void off(void);

/* === Enums and global state so helper functions can access them === */
typedef enum {
  PS_OFF = 0,
  PS_ON = 1,
  PS_FAIL = 2
} PowerState;
typedef enum {
  I_FAIL = 0,
  I_OP = 1,
  I_EQ = 2,
  I_RANGE = 3
} InductiveState;
typedef enum {
  HE_FAIL = 0,
  HE_OP = 1,
  HE_LEV = 2,
  HE_PROP = 3
} HallState;
typedef enum {
  T_FAIL = 0,
  T_OP = 1,
  T_LEV = 2,
  T_PROP = 3
} TempState;
typedef enum {
  IMU_FAIL = 0,
  IMU_OP = 1,
  IMU_SPEED = 2,
  IMU_TS = 3,
  IMU_DIST = 4,
  IMU_BRAKE_DIST = 5,
  IMU_STOP = 6
} IMUState;

/* global states */
PowerState PS;
InductiveState I;
HallState HE;
TempState T;
IMUState IMU;
int CC, WC, Start, HVon;
int timer1, timer2, timer3, counter;
int someLimit = 1000; //change - temp assignment

/* Inputs referenced but not defined in provided code: define as globals */
int tempVar, hallMin, hallMax, indMin, indMax, imuMax;

/* PWM duty inputs (extern in propulsionOn) */
volatile uint8_t dutyInA = 0;
volatile uint8_t dutyInB = 0;

/* USER CODE END PV & Helpers*/

//CAN communication
//Transmit
uint8_t TxData[8];
//Receive
uint8_t RxData[48][8];

int frhuMAX = 12;
int chuMAX = 7;

bool RHUDataReceived = false;
bool CHUDataReceived = false;
bool FHUDataReceived = false;
bool LCUDataReceived = false;
bool CCUDataReceived = false;

bool waitingForData = true;
uint8_t currentMCU = 0; // 0: None, 1: RHU, 2: CHU, 3: FHU, 4: LCU, 5: CCU
uint8_t messageCounter = 0; //counts how many msgs received from currentMCU
uint8_t targetMessageCount = 0; //set to how many msgs are to be received from currentMCU
uint8_t RxIndex = 0;

CAN_TxHeaderTypeDef TxHeader;
CAN_RxHeaderTypeDef RxHeader;

uint32_t RHUTempSensorData[4];
uint8_t RHUTempSensorIndex = 0;
uint32_t RHUHallEffectSensorData[6];
uint8_t RHUHallEffectSensorIndex = 0;
uint32_t RHUInductiveSensorData[2];
uint8_t RHUInductiveSensorIndex = 0;

uint32_t FHUTempSensorData[4];
uint8_t FHUTempSensorIndex = 0;
uint32_t FHUHallEffectSensorData[6];
uint8_t FHUHallEffectSensorIndex = 0;
uint32_t FHUInductiveSensorData[2];
uint8_t FHUInductiveSensorIndex = 0;

uint32_t CHUTempSensorData[4];
uint8_t CHUTempSensorIndex = 0;
uint32_t CHUHallEffectSensorData[2];
uint8_t CHUHallEffectSensorIndex = 0;
uint32_t CHUIMUSensorData;

uint32_t LCUTempSensorData[2];
uint8_t LCUTempSensorIndex = 0;
//
/* USER CODE END PV */

/* Private function prototypes -----------------------------------------------*/
void SystemClock_Config(void);
static void MX_GPIO_Init(void);
static void MX_ADC1_Init(void);
static void MX_CAN1_Init(void);
static void MX_CAN2_Init(void);
static void MX_TIM3_Init(void);

/* USER CODE BEGIN PFP */
/* USER CODE END PFP */

/* Private user code ---------------------------------------------------------*/
/* USER CODE BEGIN 0 */
// WOOO GO ADVAITH WOOOOOOOOOO
//This is called multiple times on each message received from CAN (hu determines which section to read)
void process2(int hu){ //advaith-i have an idea for something we can do, ill write it here
  uint8_t frameNum = RxData[hu][0] & 0x0F;
  uint8_t hubUnit = (RxData[hu][0] & 0xF0) >> 4;

  uint16_t i = hu * 8 + 1;//use this as overall index

  while(i <= (hu + frameNum) * 8 - 3 && RxData[i/8][i % 8] != 0){ //within number of frames and not blank
    uint8_t index1R = i/8;
    uint8_t index1C = i % 8;

    uint8_t index2R = (i+1)/8;
    uint8_t index2C = (i+1) % 8;

    uint8_t index3R = (i+2)/8;
    uint8_t index3C = (i+2) % 8;

    uint32_t fullSensorReading = ((uint32_t)(RxData[index1R][index1C]  ) << 16)
    | ((uint32_t)(RxData[index2R][index2C]) <<  8)
    | ((uint32_t)(RxData[index3R][index3C])      );

    if(hubUnit == 0){ //lets say 0 corresponds to rhu
      switch((RxData[i/8][i % 8] & 0x60)>>5){ //just get the sensor type
        case(0): //lets say 1 corresponds to temp sensor 
          RHUTempSensorData[RHUTempSensorIndex % 4] = fullSensorReading;
          RHUTempSensorIndex = (RHUTempSensorIndex + 1) % 4;
          break;
        case(1):
          RHUInductiveSensorData[RHUInductiveSensorIndex % 2] = fullSensorReading;
          RHUInductiveSensorIndex = (RHUInductiveSensorIndex + 1) % 2;
          break;
        case(2):
          RHUHallEffectSensorData[RHUHallEffectSensorIndex % 6] = fullSensorReading;
          RHUHallEffectSensorIndex = (RHUHallEffectSensorIndex + 1) % 6;
          break;
      }
    }
    else if(hubUnit == 1){ //lets say 0 corresponds to rhu
      switch((RxData[i/8][i % 8] & 0x60)>>5){ //just get the sensor type (2 bits)
        case(0): //lets say 1 corresponds to temp sensor 
          FHUTempSensorData[FHUTempSensorIndex % 4] = fullSensorReading;
          FHUTempSensorIndex = (FHUTempSensorIndex + 1) % 4;
          break;
        case(1):
          FHUInductiveSensorData[FHUInductiveSensorIndex % 2] = fullSensorReading;
          FHUInductiveSensorIndex = (FHUInductiveSensorIndex + 1) % 2;
          break;
        case(2):
          FHUHallEffectSensorData[FHUHallEffectSensorIndex % 6] = fullSensorReading;
          FHUHallEffectSensorIndex = (FHUHallEffectSensorIndex + 1) % 6;;
          break;
      }
    }
    else if(hubUnit == 2){ //lets say 2 corresponds to center hub unit
      switch((RxData[i/8][i % 8] & 0x60)>>5){ //just get the sensor type (2 bits)
        case(0): //lets say 1 corresponds to temp sensor 
          CHUTempSensorData[CHUTempSensorIndex % 4] = fullSensorReading;
          CHUTempSensorIndex = (CHUTempSensorIndex + 1) % 4;
          break;
        case(2):
          CHUHallEffectSensorData[CHUHallEffectSensorIndex % 2] = fullSensorReading;
          CHUHallEffectSensorIndex = (CHUHallEffectSensorIndex + 1) % 2;
          break;
        case(3):
          CHUIMUSensorData = fullSensorReading;
      }
    }
    else if(hubUnit == 3){ //lets say 1 corresponds to rhu
      LCUTempSensorData[LCUTempSensorIndex % 2] = fullSensorReading;
      LCUTempSensorIndex = (LCUTempSensorIndex + 1) % 2;;
    }
    
    i += 3; //next sensor
    
  }
}

void HAL_CAN_RxFifo0MsgPendingCallback(CAN_HandleTypeDef *hcan) {
  HAL_CAN_GetRxMessage(&hcan2, CAN_RX_FIFO0, &RxHeader, RxData[RxIndex]);
  messageCounter++;

  if(waitingForData){
    currentMCU = (RxData[RxIndex][0] & 0xF0) >> 4;
    targetMessageCount = RxData[RxIndex][0] & 0x0F;
    messageCounter = 1;
    waitingForData = false;
  }

  if(messageCounter == targetMessageCount){
    switch(currentMCU){
      case 1:
        RHUDataReceived = true;
        break;
      case 2:
        CHUDataReceived = true;
        break;
      case 3:
        FHUDataReceived = true;
        break;
      case 4:
        LCUDataReceived = true;
        break;
      case 5:
        CCUDataReceived = true;
        break;

    }

    waitingForData = true;

  }
  
  
  RxIndex++;

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

  /* Reset of all peripherals, Initializes the Flash interface and the Systick. */
  HAL_Init();

  /* USER CODE BEGIN Init */

  /* USER CODE END Init */

  /* Configure the system clock */
  SystemClock_Config();

  /* USER CODE BEGIN SysInit */

  /* USER CODE END SysInit */

  /* Initialize all configured peripherals */
  MX_GPIO_Init();
  MX_ADC1_Init();
  MX_CAN1_Init();
  MX_CAN2_Init();
  MX_TIM3_Init();

  /* USER CODE BEGIN 2 */
  HAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_1);
  HAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_2);
  /* USER CODE END 2 */

  /* USER CODE BEGIN 2 */
  HAL_CAN_Start(&hcan2);
  HAL_CAN_ActivateNotification(&hcan2, CAN_IT_RX_FIFO0_MSG_PENDING);

  TxHeader.DLC = 8; //data length
  TxHeader.IDE = CAN_ID_STD;
  TxHeader.RTR = CAN_RTR_DATA;
  TxHeader.StdId = 0x7E3; // my id
  
  // Vars
	typedef enum {
	  STATE_OFF,
	  STATE_INITIALIZE_ELECTRONICS,
	  STATE_HEALTH_CHECK,
	  STATE_COUNT_CHECK,
	  STATE_READY_TO_LAUNCH,
	  STATE_LEV_ON,
	  STATE_CALIBRATE_LEV,
	  STATE_PROPULSION_ON,
	  STATE_ACCELERATE,
	  STATE_COAST,
	  STATE_NORMAL_BRAKE,
	  STATE_EMERGENCY_BRAKE
	} State;

	State current_state = STATE_INITIALIZE_ELECTRONICS;
	bool running = true;
  /* USER CODE END 2 */

  /* Infinite loop */
  /* USER CODE BEGIN WHILE */
  while (running)
  {
    /* USER CODE END WHILE */

    /* USER CODE BEGIN 3 */
	  switch(current_state) {
			/*------------------------------*/
			/* State: Initialize Electronics */
			/*------------------------------*/
			case STATE_INITIALIZE_ELECTRONICS:
			  // Init_Config();
			  // Initialization_Task();
        
        initElectronics();
			  if (PS == PS_OFF)
				current_state = STATE_OFF;
			  else
				current_state = STATE_HEALTH_CHECK;
			  break;

			/*---------------------*/
			/* State: Health Check */
			/*---------------------*/
			case STATE_HEALTH_CHECK:
			  // Health_Check_Task();

        healthCheck();
			  if (PS == PS_OFF || PS == PS_FAIL)
				current_state = STATE_OFF;
			  else if (HE && IMU && I && T && CC && WC)
				current_state = STATE_READY_TO_LAUNCH;
			  else if (HE && IMU && I && T && CC && WC == 0)
				current_state = STATE_COUNT_CHECK;
			  break;

			/*--------------------*/
			/* State: Count Check */
			/*--------------------*/
			case STATE_COUNT_CHECK:
			  counter++;

        countCheck();
			  if (PS == PS_OFF || PS == PS_FAIL || counter > someLimit)
				current_state = STATE_OFF;
			  else if (PS == PS_ON)
				current_state = STATE_INITIALIZE_ELECTRONICS;
			  break;

			/*------------------------*/
			/* State: Ready to launch */
			/*------------------------*/
			case STATE_READY_TO_LAUNCH:
			  /* timer 1 runs */

        readyToLaunch();
			  if (!HE || !IMU || !I || !T || !CC || !WC)
				current_state = STATE_HEALTH_CHECK;
			  else if (Start == 1)
				current_state = STATE_LEV_ON;
			  else if (timer1 > someLimit || PS == PS_OFF)
				current_state = STATE_OFF;
			  break;

			/*---------------*/
			/* State: Lev On */
			/*---------------*/
			case STATE_LEV_ON:
			  /* lev on functionality */

        levOn();
			  if (I == I_RANGE)
				current_state = STATE_CALIBRATE_LEV;
			  else if (!I || !T || !CC || !WC || PS == PS_OFF)
				current_state = STATE_OFF;
			  break;

			/*----------------------*/
			/* State: Calibrate lev */
			/*----------------------*/
			case STATE_CALIBRATE_LEV:
			  /* calibrate lev functionality */
			  timer2++;

        calibrateLev();
			  if ((I == I_FAIL && CC == 0 && WC == 0 && HVon == 1 && PS == PS_ON) ||
				  (timer2 > someLimit && HVon == 1))
				current_state = STATE_EMERGENCY_BRAKE;
			  else if ((I && T && CC && WC && PS && HVon == 0) ||
					   (T == T_FAIL && HVon == 1))
				current_state = STATE_OFF;
			  else if (I == I_EQ)
				current_state = STATE_PROPULSION_ON;
			  else if (I == 4) // Note: This value doesn't match enum - keeping it as in your provided code
				current_state = STATE_ACCELERATE;
			  else if (I == 5) // Note: This value doesn't match enum - keeping it as in your provided code
				current_state = STATE_COAST;
			  break;

			/*----------------------*/
			/* State: Propulsion on */
			/*----------------------*/
			case STATE_PROPULSION_ON:
			  /* propulsion on functionality */

        propulsionOn();
			  if (I == I_OP || I == I_RANGE)
				current_state = STATE_CALIBRATE_LEV;
			  else if ((T == T_OP || T == T_LEV) && (HE == HE_OP || HE == HE_LEV))
				current_state = STATE_PROPULSION_ON;
			  else if (HVon == 1)
				current_state = STATE_ACCELERATE;
			  else if (T == T_FAIL || PS == PS_OFF)
				current_state = STATE_OFF;
			  else if (I == I_FAIL || CC == 0 || WC == 0)
				current_state = STATE_EMERGENCY_BRAKE;
			  break;

			/*-------------------*/
			/* State: Accelerate */
			/*-------------------*/
			case STATE_ACCELERATE:
			  /* accelerate functionality */

        accelerate();
			  if (IMU == IMU_TS)
				current_state = STATE_COAST;
			  else if (IMU == IMU_BRAKE_DIST)
				current_state = STATE_NORMAL_BRAKE;
			  else if (I == I_OP || I == I_RANGE)
				current_state = STATE_CALIBRATE_LEV;
			  else if (T == T_FAIL || PS == PS_OFF)
				current_state = STATE_OFF;
			  else if (I == I_FAIL || CC == 0 || WC == 0)
				current_state = STATE_EMERGENCY_BRAKE;
			  break;

			/*--------------*/
			/* State: Coast */
			/*--------------*/
			case STATE_COAST:

        coast();
			  if (IMU == IMU_BRAKE_DIST)
				current_state = STATE_NORMAL_BRAKE;
			  else if (I == I_OP || I == I_RANGE)
				current_state = STATE_CALIBRATE_LEV;
			  else if (T == T_FAIL || PS == PS_OFF)
				current_state = STATE_OFF;
			  else if (I == I_FAIL || CC == 0 || WC == 0)
				current_state = STATE_EMERGENCY_BRAKE;
			  break;

			/*---------------------*/
			/* State: Normal brake */
			/*---------------------*/
			case STATE_NORMAL_BRAKE:
			  timer3++;

        normalBrake();
			  if (IMU == IMU_STOP)
				current_state = STATE_OFF;
			  else if (timer3 > someLimit)
				current_state = STATE_EMERGENCY_BRAKE;
			  else if (T == T_FAIL || PS == PS_OFF)
				current_state = STATE_OFF;
			  break;

			/*------------------------*/
			/* State: Emergency brake */
			/*------------------------*/
			case STATE_EMERGENCY_BRAKE:

        emergencyBrake();
			  if (IMU == IMU_STOP || T == T_FAIL || PS == PS_OFF)
				current_state = STATE_OFF;
			  break;

			/*---------------*/
			/* State: Off */
			/*---------------*/
			case STATE_OFF:
			  // Off_Task();

        off();
			  if (PS == PS_ON)
				current_state = STATE_INITIALIZE_ELECTRONICS;
			  break;
		  }
		}

		return 0;

  /* USER CODE END 3 */
}

//Get all measurements from HUB units
void fullprocess() {
  for(int x = 0; x < 4; x++) {
    process2(x);
  }
}

u_int32_t maskedSensorData(u_int32_t fullSensorReading){
  return fullSensorReading & 0xFFFF; 
}

void checkAllTemp(int x) { // x will be some threshold value
  for(int j = 0; j < 4; j++) {
    if(maskedSensorData(RHUTempSensorData[j]) > x || maskedSensorData(FHUTempSensorData[j]) > x || maskedSensorData(CHUTempSensorData[j]) > x) {
      T = T_FAIL;
      return;
    }
  }
  for(int j = 0; j < 2; j++) {
    if(maskedSensorData(LCUTempSensorData[j]) > x) {
      T = T_FAIL;
      return;
    }
  }
  T = T_OP;
}

void checkAllHallEffect(int min, int max) {
  for(int j = 0; j < 6; j++) {
    if(maskedSensorData(RHUHallEffectSensorData[j]) < min || maskedSensorData(RHUHallEffectSensorData[j]) > max) {
      HE = HE_FAIL;
      return;
    }
    if(maskedSensorData(FHUHallEffectSensorData[j]) < min || maskedSensorData(FHUHallEffectSensorData[j]) > max) {
      HE = HE_FAIL;
      return;
    }
  }
  for(int j = 0; j < 2; j++) {
    if(maskedSensorData(CHUHallEffectSensorData[j]) < min || maskedSensorData(CHUHallEffectSensorData[j]) > max) {
      HE = HE_FAIL;
      return;
    }
  }
  HE = HE_OP;
}

void checkAllInductive(int min, int max) {
  for(int j = 0; j < 2; j++) {
    if(maskedSensorData(RHUInductiveSensorData[j]) < min || maskedSensorData(RHUInductiveSensorData[j]) > max) {
      I = I_FAIL;
      return;
    }
    if(maskedSensorData(FHUInductiveSensorData[j]) < min || maskedSensorData(FHUInductiveSensorData[j]) > max) {
      I = I_FAIL;
      return;
    }
  }
  I = I_OP;
}

void checkIMU(uint32_t maxMagnitude) {
  if(maskedSensorData(CHUIMUSensorData) > maxMagnitude) {
    IMU = IMU_FAIL;
    return;
  }
  IMU = IMU_OP;
}

void initElectronics(){
  fullprocess();
  PS = PS_ON;
}

void healthCheck(){
  fullprocess();

  checkAllTemp(tempVar);
  checkAllHallEffect(hallMin, hallMax);
  checkAllInductive(indMin, indMax);
  checkIMU(imuMax);

  CC = 1; // if comms works lwk need to implement
  WC = 1;
}

void countCheck(){
  fullprocess();

  checkAllTemp(tempVar);
  checkAllHallEffect(hallMin, hallMax);
  checkAllInductive(indMin, indMax);
  checkIMU(imuMax);
}

void readyToLaunch(){
  fullprocess();

  checkAllTemp(tempVar);
  checkAllHallEffect(hallMin, hallMax);
  checkAllInductive(indMin, indMax);
  checkIMU(imuMax);
}

void levOn(){
  fullprocess();

  checkAllTemp(tempVar);
  checkAllInductive(indMin, indMax);
}

// Pre: Sensor data freshly sampled; tempVar/hallMin/hallMax/indMin/indMax set.
// Post: If RFE==RUN_EN==1 -> LIM enabled and two 100kHz PWMs driven
//       Digital polarity line driven: 1=retain, 0=invert
void propulsionOn(){
  // keep your existing sampling & checks
  fullprocess();
  checkAllTemp(tempVar);
  checkAllHallEffect(hallMin, hallMax);
  checkAllInductive(indMin, indMax);

  /* Scenario-neutral baseline: ensure normal RFE and RUN_EN on when entering propulsion */
  SetRFE(0);
  KeepRunEnableOn();
// Decide desired input duty cycles (0..100). If you receive these over CAN, assign them here.
  // For now, demonstrate with placeholders or existing variables:
  extern volatile uint8_t dutyInA; // define & feed these from your control loop/CAN
  extern volatile uint8_t dutyInB; // define & feed these from your control loop/CAN

  // 1) Enforce RFE <-> RUN_EN equivalence and enable LIM only if both ON
  uint8_t limOK = LIM_Enable_IfSafe();

  // 2) Get polarity request, echo it digitally (0=invert, 1=retain)
  uint8_t _echo = ReadAndEchoPolarity(); /* keep echo for visibility */
  uint8_t polarity = g_polarity_out; /* we drive scenarios via SetPolarityOut() */
// 3) Drive two PWM “analog ports” at 100kHz, 0–3.3V swing
  if (limOK && (T != T_FAIL) && (HE != HE_FAIL) && (I != I_FAIL)) {
    ApplyPropulsionPWM(dutyInA, dutyInB, polarity);
  } else {
    // Safe-off: 0% duty (drive both low)
    ApplyPropulsionPWM(0, 0, /*polarity doesn't matter*/1);
  }
}

void accelerate(){
  /* Maintain sensor checks */
  fullprocess();
  checkAllTemp(tempVar);
  checkAllInductive(indMin, indMax);
  checkIMU(imuMax);

  /* Spec (no ramping): digital=1 (retain), RFE=0, RUN_EN=ON, duty = desired effective */
  SetPolarityOut(1);
  SetRFE(0);
  KeepRunEnableOn();

  dutyInA = g_desiredDutyPercent;
  dutyInB = g_desiredDutyPercent;

  ApplyPropulsionPWM(dutyInA, dutyInB, g_polarity_out);
}

void coast(){
  /* Maintain sensor checks */
  fullprocess();
  checkAllTemp(tempVar);
  checkAllInductive(indMin, indMax);
  checkIMU(imuMax);

  /* Coasting: RFE=1 (raise connectors), RUN_EN stays ON; duty = 0 */
  SetRFE(1);
  KeepRunEnableOn();
  dutyInA = 0;
  dutyInB = 0;
  ApplyPropulsionPWM(dutyInA, dutyInB, g_polarity_out);
}

void normalBrake(){
  /* Maintain sensor checks */
  fullprocess();
  checkAllTemp(tempVar);
  checkIMU(imuMax);

  /* Spec (no ramping): digital=0 (invert), intended EFFECTIVE duty = g_desiredDutyPercent.
   * ApplyPropulsionPWM will invert because polarity=0.
   */
  SetPolarityOut(0);
  SetRFE(0);
  KeepRunEnableOn();

  dutyInA = g_desiredDutyPercent;
  dutyInB = g_desiredDutyPercent;

  ApplyPropulsionPWM(dutyInA, dutyInB, g_polarity_out);
}

void emergencyBrake(){
  fullprocess();

  checkAllTemp(tempVar);
  checkIMU(imuMax);
}

void off(){
  fullprocess();

  PS = PS_OFF;
  I = I_FAIL;
  HE = HE_FAIL;
  T = T_FAIL;
  IMU = IMU_FAIL;
  CC = 0;
  WC = 0;
}

/**
  * @brief System Clock Configuration
  * @retval None
  */
void SystemClock_Config(void)
{
  RCC_OscInitTypeDef RCC_OscInitStruct = {0};
  RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

  /** Configure the main internal regulator output voltage
  */
  __HAL_RCC_PWR_CLK_ENABLE();
  __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE3);

  /** Initializes the RCC Oscillators according to the specified parameters
  * in the RCC_OscInitTypeDef structure.
  */
  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSI;
  RCC_OscInitStruct.HSIState = RCC_HSI_ON;
  RCC_OscInitStruct.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;
  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_ON;
  RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSI;
  RCC_OscInitStruct.PLL.PLLM = 16;
  RCC_OscInitStruct.PLL.PLLN = 336;
  RCC_OscInitStruct.PLL.PLLP = RCC_PLLP_DIV4;
  RCC_OscInitStruct.PLL.PLLQ = 2;
  RCC_OscInitStruct.PLL.PLLR = 2;
  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK)
  {
    Error_Handler();
  }

  /** Initializes the CPU, AHB and APB buses clocks
  */
  RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK|RCC_CLOCKTYPE_SYSCLK
                              |RCC_CLOCKTYPE_PCLK1|RCC_CLOCKTYPE_PCLK2;
  RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_PLLCLK;
  RCC_ClkInitStruct.AHBCLKDivider = RCC_SYSCLK_DIV1;
  RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV2;
  RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV1;

  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_2) != HAL_OK)
  {
    Error_Handler();
  }
}

/**
  * @brief ADC1 Initialization Function
  * @param None
  * @retval None
  */
static void MX_ADC1_Init(void)
{

  /* USER CODE BEGIN ADC1_Init 0 */

  /* USER CODE END ADC1_Init 0 */

  ADC_ChannelConfTypeDef sConfig = {0};

  /* USER CODE BEGIN ADC1_Init 1 */

  /* USER CODE END ADC1_Init 1 */

  /** Configure the global features of the ADC (Clock, Resolution, Data Alignment and number of conversion)
  */
  hadc1.Instance = ADC1;
  hadc1.Init.ClockPrescaler = ADC_CLOCK_SYNC_PCLK_DIV4;
  hadc1.Init.Resolution = ADC_RESOLUTION_12B;
  hadc1.Init.ScanConvMode = DISABLE;
  hadc1.Init.ContinuousConvMode = DISABLE;
  hadc1.Init.DiscontinuousConvMode = DISABLE;
  hadc1.Init.ExternalTrigConvEdge = ADC_EXTERNALTRIGCONVEDGE_NONE;
  hadc1.Init.ExternalTrigConv = ADC_SOFTWARE_START;
  hadc1.Init.DataAlign = ADC_DATAALIGN_RIGHT;
  hadc1.Init.NbrOfConversion = 1;
  hadc1.Init.DMAContinuousRequests = DISABLE;
  hadc1.Init.EOCSelection = ADC_EOC_SINGLE_CONV;
  if (HAL_ADC_Init(&hadc1) != HAL_OK)
  {
    Error_Handler();
  }

  /** Configure for the selected ADC regular channel its corresponding rank in the sequencer and its sample time.
  */
  sConfig.Channel = ADC_CHANNEL_0;
  sConfig.Rank = 1;
  sConfig.SamplingTime = ADC_SAMPLETIME_3CYCLES;
  if (HAL_ADC_ConfigChannel(&hadc1, &sConfig) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN ADC1_Init 2 */

  /* USER CODE END ADC1_Init 2 */

}

/**
  * @brief CAN1 Initialization Function
  * @param None
  * @retval None
  */
static void MX_CAN1_Init(void)
{

  /* USER CODE BEGIN CAN1_Init 0 */

  /* USER CODE END CAN1_Init 0 */

  /* USER CODE BEGIN CAN1_Init 1 */

  /* USER CODE END CAN1_Init 1 */
  hcan1.Instance = CAN1;
  hcan1.Init.Prescaler = 16;
  hcan1.Init.Mode = CAN_MODE_NORMAL;
  hcan1.Init.SyncJumpWidth = CAN_SJW_1TQ;
  hcan1.Init.TimeSeg1 = CAN_BS1_1TQ;
  hcan1.Init.TimeSeg2 = CAN_BS2_1TQ;
  hcan1.Init.TimeTriggeredMode = DISABLE;
  hcan1.Init.AutoBusOff = DISABLE;
  hcan1.Init.AutoWakeUp = DISABLE;
  hcan1.Init.AutoRetransmission = DISABLE;
  hcan1.Init.ReceiveFifoLocked = DISABLE;
  hcan1.Init.TransmitFifoPriority = DISABLE;
  if (HAL_CAN_Init(&hcan1) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN CAN1_Init 2 */

  /* USER CODE END CAN1_Init 2 */

}

/**
  * @brief CAN2 Initialization Function
  * @param None
  * @retval None
  */
static void MX_CAN2_Init(void)
{

  /* USER CODE BEGIN CAN2_Init 0 */

  //USE THIS INSTEAD OF DEFAULT
  hcan2.Instance = CAN2;
  hcan2.Init.Prescaler = 16;
  hcan2.Init.Mode = CAN_MODE_NORMAL;
  hcan2.Init.SyncJumpWidth = CAN_SJW_1TQ;
  hcan2.Init.TimeSeg1 = CAN_BS1_1TQ;
  hcan2.Init.TimeSeg2 = CAN_BS2_1TQ;
  hcan2.Init.TimeTriggeredMode = DISABLE;
  hcan2.Init.AutoBusOff = DISABLE;
  hcan2.Init.AutoWakeUp = DISABLE;
  hcan2.Init.AutoRetransmission = ENABLE;
  hcan2.Init.ReceiveFifoLocked = DISABLE;
  hcan2.Init.TransmitFifoPriority = ENABLE;
  if (HAL_CAN_Init(&hcan2) != HAL_OK)
  {
    Error_Handler();
  }

  /* USER CODE END CAN2_Init 0 */

  /* USER CODE BEGIN CAN2_Init 1 */

  /* USER CODE END CAN2_Init 1 */
  // hcan2.Instance = CAN2;
  // hcan2.Init.Prescaler = 16;
  // hcan2.Init.Mode = CAN_MODE_NORMAL;
  // hcan2.Init.SyncJumpWidth = CAN_SJW_1TQ;
  // hcan2.Init.TimeSeg1 = CAN_BS1_1TQ;
  // hcan2.Init.TimeSeg2 = CAN_BS2_1TQ;
  // hcan2.Init.TimeTriggeredMode = DISABLE;
  // hcan2.Init.AutoBusOff = DISABLE;
  // hcan2.Init.AutoWakeUp = DISABLE;
  // hcan2.Init.AutoRetransmission = DISABLE;
  // hcan2.Init.ReceiveFifoLocked = DISABLE;
  // hcan2.Init.TransmitFifoPriority = DISABLE;
  // if (HAL_CAN_Init(&hcan2) != HAL_OK)
  // {
  //   Error_Handler();
  // }
  /* USER CODE BEGIN CAN2_Init 2 */
  CAN_FilterTypeDef canfilterconfig;
  canfilterconfig.FilterActivation = CAN_FILTER_ENABLE;
  canfilterconfig.FilterBank = 10; // which filter bank to use from the assigned ones
  canfilterconfig.FilterFIFOAssignment = CAN_FILTER_FIFO0;
  canfilterconfig.FilterIdHigh = 0x003 << 5;
  canfilterconfig.FilterIdLow = 0;
  canfilterconfig.FilterMaskIdHigh = 0x003 << 5;
  canfilterconfig.FilterMaskIdLow = 0x0000;
  canfilterconfig.FilterMode = CAN_FILTERMODE_IDMASK;
  canfilterconfig.FilterScale = CAN_FILTERSCALE_32BIT;
  canfilterconfig.SlaveStartFilterBank = 0;  // does not matter


  HAL_CAN_ConfigFilter(&hcan2, &canfilterconfig);

  canfilterconfig.FilterActivation = CAN_FILTER_ENABLE;
  canfilterconfig.FilterBank = 11; // which filter bank to use from the assigned ones
  canfilterconfig.FilterFIFOAssignment = CAN_FILTER_FIFO0;
  canfilterconfig.FilterIdHigh = 0x7EB << 5;
  canfilterconfig.FilterIdLow = 0;
  canfilterconfig.FilterMaskIdHigh = 0x7EB << 5;
  canfilterconfig.FilterMaskIdLow = 0x0000;
  canfilterconfig.FilterMode = CAN_FILTERMODE_IDMASK;
  canfilterconfig.FilterScale = CAN_FILTERSCALE_32BIT;
  canfilterconfig.SlaveStartFilterBank = 0;  // does not matter


  HAL_CAN_ConfigFilter(&hcan2, &canfilterconfig);

  canfilterconfig.FilterActivation = CAN_FILTER_ENABLE;
  canfilterconfig.FilterBank = 12; // which filter bank to use from the assigned ones
  canfilterconfig.FilterFIFOAssignment = CAN_FILTER_FIFO0;
  canfilterconfig.FilterIdHigh = 0x002 << 5;
  canfilterconfig.FilterIdLow = 0;
  canfilterconfig.FilterMaskIdHigh = 0x002 << 5;
  canfilterconfig.FilterMaskIdLow = 0x0000;
  canfilterconfig.FilterMode = CAN_FILTERMODE_IDMASK;
  canfilterconfig.FilterScale = CAN_FILTERSCALE_32BIT;
  canfilterconfig.SlaveStartFilterBank = 0;  // does not matter


  HAL_CAN_ConfigFilter(&hcan2, &canfilterconfig);
  /* USER CODE END CAN2_Init 2 */

}

/**
  * @brief GPIO Initialization Function
  * @param None
  * @retval None
  */
static void MX_GPIO_Init(void)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  /* USER CODE BEGIN MX_GPIO_Init_1 */

  /* USER CODE END MX_GPIO_Init_1 */

  /* GPIO Ports Clock Enable */
  __HAL_RCC_GPIOC_CLK_ENABLE();
  __HAL_RCC_GPIOH_CLK_ENABLE();
  __HAL_RCC_GPIOA_CLK_ENABLE();
  __HAL_RCC_GPIOB_CLK_ENABLE();

  /*Configure GPIO pin : B1_Pin */
  GPIO_InitStruct.Pin = B1_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_IT_FALLING;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  HAL_GPIO_Init(B1_GPIO_Port, &GPIO_InitStruct);

  /*Configure GPIO pin : PB15 */
  GPIO_InitStruct.Pin = GPIO_PIN_15;
  GPIO_InitStruct.Mode = GPIO_MODE_ANALOG;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);

  
  /* USER CODE BEGIN MX_GPIO_Init_2 */
  // Inputs: RFE_IN, RUN_EN_IN, POLARITY_REQ
  GPIO_InitStruct.Pin = RFE_IN_Pin | RUN_EN_IN_Pin | POLARITY_REQ_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  HAL_GPIO_Init(RFE_IN_GPIO_Port, &GPIO_InitStruct); // all three are on GPIOA in this example

  // Outputs: LIM_EN, POLARITY_OUT
  GPIO_InitStruct.Pin = LIM_EN_Pin | POLARITY_OUT_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(LIM_EN_GPIO_Port, &GPIO_InitStruct);

  
  /* TIM3 CH1/CH2 pins: PA6/PA7 (AF2) for NUCLEO-F446RE */
  GPIO_InitStruct.Pin       = GPIO_PIN_6 | GPIO_PIN_7;
  GPIO_InitStruct.Mode      = GPIO_MODE_AF_PP;
  GPIO_InitStruct.Pull      = GPIO_NOPULL;
  GPIO_InitStruct.Speed     = GPIO_SPEED_FREQ_HIGH;
  GPIO_InitStruct.Alternate = GPIO_AF2_TIM3;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

  
  /* Additional control outputs: RFE_CTL, RUN_EN_OUT */
  GPIO_InitStruct.Pin = RFE_CTL_Pin | RUN_EN_OUT_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(RFE_CTL_GPIO_Port, &GPIO_InitStruct);

  /* USER CODE END MX_GPIO_Init_2 */
}

static void MX_TIM3_Init(void)
{
  TIM_OC_InitTypeDef sConfigOC = {0};

  // TIM3 clock on APB1 -> 84MHz effective timer clk (with your current clock tree)
  htim3.Instance = TIM3;
  htim3.Init.Prescaler = 0;        // 84 MHz / (0+1) = 84 MHz
  htim3.Init.CounterMode = TIM_COUNTERMODE_UP;
  htim3.Init.Period = 839;         // 84 MHz / (839+1) = 100 kHz
  htim3.Init.ClockDivision = TIM_CLOCKDIVISION_DIV1;
  htim3.Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_DISABLE;
  if (HAL_TIM_PWM_Init(&htim3) != HAL_OK) { Error_Handler(); }

  sConfigOC.OCMode = TIM_OCMODE_PWM1;
  sConfigOC.Pulse = 0;                         // start at 0% duty
  sConfigOC.OCPolarity = TIM_OCPOLARITY_HIGH;  // normal polarity (we invert in software by duty math)
  sConfigOC.OCFastMode = TIM_OCFAST_DISABLE;

  if (HAL_TIM_PWM_ConfigChannel(&htim3, &sConfigOC, TIM_CHANNEL_1) != HAL_OK) { Error_Handler(); }
  if (HAL_TIM_PWM_ConfigChannel(&htim3, &sConfigOC, TIM_CHANNEL_2) != HAL_OK) { Error_Handler(); }

  // Configure GPIO pins for TIM3 CH1/CH2 in CubeMX or here if desired (PA6/PA7 on many F4s)
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
  /* User can add his own implementation to report the HAL error return state */
  __disable_irq();
  while (1)
  {
  }
  /* USER CODE END Error_Handler_Debug */
}

#ifdef  USE_FULL_ASSERT
/**
  * @brief  Reports the name of the source file and the source line number
  *         where the assert_param error has occurred.
  * @param  file: pointer to the source file name
  * @param  line: assert_param error line source number
  * @retval None
  */
void assert_failed(uint8_t *file, uint32_t line)
{
  /* USER CODE BEGIN 6 */
  /* User can add his own implementation to report the file name and line number,
     ex: printf("Wrong parameters value: file %s on line %d\r\n", file, line) */
  /* USER CODE END 6 */
}
#endif /* USE_FULL_ASSERT */