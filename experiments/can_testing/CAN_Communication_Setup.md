# CAN Board-to-Board Communication Setup

## Overview
This project implements CAN communication between two STM32F446RE boards:
- **CAN_TESTING_A**: Sender (transmits messages)
- **CAN_TESTING_2025_B**: Receiver (receives and displays messages)

## Hardware Setup
1. Connect CAN_H and CAN_L between the two boards
2. Ensure both boards share a common ground
3. Connect 120Ω termination resistors at both ends of the CAN bus
4. Connect UART2 (PA2/PA3) to a serial terminal for debugging output

## CAN Configuration
Both boards use identical CAN settings:
- **CAN Controller**: CAN1
- **Baud Rate**: 500 kbps (calculated from: Prescaler=18, BS1=2TQ, BS2=2TQ, SJW=1TQ)
- **Mode**: Normal mode
- **Frame Type**: Standard CAN frames (11-bit ID)

## Code Implementation

### Sender (CAN_TESTING_A)
- Sends 4 different types of test messages every second:
  1. Counter message (4 bytes)
  2. Text message "Hello!" (6 bytes)
  3. Mixed data pattern (6 bytes)
  4. Sequential pattern (8 bytes)
- Message ID: 0x123
- LED toggles on each successful transmission
- UART debug output shows sent message details

### Receiver (CAN_TESTING_2025_B)
- Configures CAN filter to accept all messages (0x0000 mask)
- Uses interrupt-driven reception (CAN1_RX0_IRQHandler)
- LED toggles on each received message
- UART debug output shows:
  - Message count
  - CAN ID and DLC
  - Data in hexadecimal format
  - Data as ASCII (if printable)

## Key Features
- **Interrupt-based reception** for real-time message handling
- **UART debugging** with printf redirection for monitoring
- **LED feedback** for visual confirmation of communication
- **Multiple message types** for comprehensive testing
- **Error handling** with proper HAL error checking

## Testing Procedure
1. Flash both projects to their respective boards
2. Connect UART2 of both boards to serial terminals (115200 baud)
3. Power on both boards
4. Observe:
   - Sender terminal: Shows messages being sent
   - Receiver terminal: Shows messages being received
   - LEDs: Should blink alternately when communication is working

## Expected Output

### Sender Terminal:
```
CAN Sender initialized successfully!
Starting to send test messages...
Message #1 sent successfully!
ID: 0x123, DLC: 4, Data: 00 00 00 01
Message #2 sent successfully!
ID: 0x123, DLC: 8, Data: 48 65 6C 6C 6F 21 00 00
```

### Receiver Terminal:
```
CAN Receiver initialized successfully!
Waiting for messages...
Message #1 received!
ID: 0x123, DLC: 4, Data: 00 00 00 01
ASCII: ....

Message #2 received!
ID: 0x123, DLC: 8, Data: 48 65 6C 6C 6F 21 00 00
ASCII: Hello!..
```

## Troubleshooting
- **No messages received**: Check CAN bus wiring and termination resistors
- **Compilation errors**: Ensure STM32 HAL libraries are properly included
- **UART not working**: Verify UART2 connections and baud rate settings
- **LEDs not blinking**: Check if messages are being sent/received successfully

## CAN Bus Wiring
```
Board A (Sender)    Board B (Receiver)
CAN1_TX (PA12) ──── CAN1_RX (PA11)
CAN1_RX (PA11) ──── CAN1_TX (PA12)
GND            ──── GND
```

**Important**: Connect PA12 (TX) of Board A to PA11 (RX) of Board B, and vice versa. Make sure to connect through a CAN transceiver (like MCP2551 or similar) that provides the actual CAN_H and CAN_L differential signals.
