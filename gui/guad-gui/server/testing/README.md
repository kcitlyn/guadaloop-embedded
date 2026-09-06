# STM32 Serial Testing Utilities

Comprehensive testing tools for the GUAD Pod STM32 F446RE microcontroller serial communication.

## 📋 Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Available Tools](#available-tools)
- [Quick Start](#quick-start)
- [Packet Protocol](#packet-protocol)
- [Troubleshooting](#troubleshooting)

---

## Overview

This directory contains utilities to test serial communication with the STM32 Nucleo-F446RE microcontroller:

1. **serial-port-list.js** - Detect and list all available serial ports
2. **serial-monitor.js** - View raw serial data in real-time
3. **serial-simulator.js** - Generate test data without hardware

---

## Prerequisites

Ensure the backend dependencies are installed:

```bash
cd guad-gui/server
npm install
```

Required packages (already in `package.json`):
- `serialport` - Serial port communication
- `@serialport/parser-readline` - Line-based parsing
- `axios` - HTTP requests

---

## Available Tools

### 1. Serial Port Lister

**Purpose:** Find your STM32 device port path

**Usage:**
```bash
node testing/serial-port-list.js
```

**Example Output:**
```
✅ Found 2 serial port(s):

Port 1:
  Path:         /dev/tty.usbmodem14203
  Manufacturer: STMicroelectronics
  Serial #:     066DFF485150897267192636
  Vendor ID:    0483
  Product ID:   374b
  ⭐ STM32 Device Detected!
```

**What to do:**
- Copy the "Path" value (e.g., `/dev/tty.usbmodem14203`)
- Use this path in other tools and configuration files

---

### 2. Serial Monitor

**Purpose:** View raw serial data from STM32 in real-time

**Usage:**
```bash
# Default port and baud rate
node testing/serial-monitor.js

# Custom port
node testing/serial-monitor.js /dev/tty.usbmodem14203 115200

# Linux
node testing/serial-monitor.js /dev/ttyACM0 115200
```

**Example Output:**
```
[10:23:45] ✅ 1: 123,3,1,0.12,0.34,-0.56,0.78,0.91,-0.23,0.45,0.67,0.89
[10:23:46] ✅ 2: 124,3,1,0.512,0.034,-9.812,0.523,0.045,-9.801,0.534,0.056,-9.789
[10:23:47] ✅ 3: 125,3,1,10.23,10.45,10.12,10.34,10.56,10.23,10.45,10.67
```

**Features:**
- Real-time display with timestamps
- Color-coded packet types (✅ = valid packet)
- Shows packet format help on startup
- Press Ctrl+C to exit

**When to use:**
- Verify STM32 is sending data correctly
- Debug packet format issues
- Check baud rate and connection

---

### 3. Serial Simulator

**Purpose:** Generate realistic test data without hardware

**Usage:**
```bash
# Default settings (1000ms interval, localhost:5001)
node testing/serial-simulator.js

# Custom interval (500ms)
node testing/serial-simulator.js 500

# Custom API URL
node testing/serial-simulator.js 1000 http://localhost:5001/api/sensor-data
```

**Example Output:**
```
[10:25:12] ✅ Packet 1 | Type 1 | State: Levitation
[10:25:13] ✅ Packet 2 | Type 2 | State: Levitation
[10:25:14] ✅ Packet 3 | Type 3 | State: Levitation

🔄 State changed to: Propulsion

[10:25:15] ✅ Packet 4 | Type 4 | State: Propulsion
```

**Features:**
- Generates all 6 packet types in rotation
- Simulates pod state transitions (Initialization → Levitation → Propulsion → etc.)
- Realistic sensor values based on pod state
- Sends data directly to backend API
- Statistics on Ctrl+C exit

**When to use:**
- Test frontend without STM32 hardware
- Verify backend API endpoints
- Load testing with rapid data generation
- Demo the system without physical pod

**What it simulates:**
- **Type 1:** IMU gyroscope data (angular velocity)
- **Type 2:** IMU accelerometer data (varies with pod state)
- **Type 3:** Gap height sensors (8-12mm when levitating)
- **Type 4:** Temperature sensors (rises during propulsion/braking)
- **Type 5:** Hall effect sensors (current varies with state)
- **Type 6:** Battery voltages (144 cells, 3.0-4.2V each)

---

## Packet Protocol

All packets follow this format:

```
packetType: stateID,stateCode,healthStatus,value1,value2,...
```

### Packet Structure

| Field | Index | Description | Example |
|-------|-------|-------------|---------|
| `packetType` | Before `:` | Packet type identifier (1-6) | `1` |
| `stateID` | values[0] | Incrementing packet counter | `123` |
| `stateCode` | values[1] | Pod state (0-7) | `3` |
| `healthStatus` | values[2] | Health flag (0=fault, 1=ok) | `1` |
| `values` | values[3+] | Sensor data (varies by type) | `0.1,0.2,0.3,...` |

### Pod States (stateCode)

| Code | State Name |
|------|------------|
| 0 | Initialization |
| 1 | Health Check |
| 2 | Ready |
| 3 | Levitation |
| 4 | Propulsion |
| 5 | Coasting |
| 6 | Braking |
| 7 | Stopped |

### Packet Types

#### Type 1: IMU Gyroscope (9 values)
Angular velocity in deg/s

```
1: 123,3,1,rearX,rearY,rearZ,centerX,centerY,centerZ,frontX,frontY,frontZ
```

**Example:**
```
1: 123,3,1,0.12,0.34,-0.56,0.78,0.91,-0.23,0.45,0.67,0.89
```

#### Type 2: IMU Accelerometer (9 values)
Linear acceleration in m/s²

```
2: 124,3,1,rearX,rearY,rearZ,centerX,centerY,centerZ,frontX,frontY,frontZ
```

**Example:**
```
2: 124,3,1,0.512,0.034,-9.812,0.523,0.045,-9.801,0.534,0.056,-9.789
```

#### Type 3: Gap Height Sensors (8 values)
Gap measurements in mm (4 vertical + 4 lateral)

```
3: 125,3,1,vert1,vert2,vert3,vert4,lat1,lat2,lat3,lat4
```

**Example:**
```
3: 125,3,1,10.23,10.45,10.12,10.34,10.56,10.23,10.45,10.67
```

#### Type 4: Temperature Sensors (10 values)
Temperature in °C

- Front Hub: 4 sensors
- Center Hub: 2 sensors
- Rear Hub: 4 sensors

```
4: 126,3,1,fh1,fh2,fh3,fh4,ch1,ch2,rh1,rh2,rh3,rh4
```

**Example:**
```
4: 126,3,1,32.5,33.1,31.8,32.9,34.2,33.7,32.1,32.6,33.4,32.8
```

#### Type 5: Hall Effect Sensors (12 values)
Current in Amperes

- Front Hub: 5 sensors
- Center Hub: 2 sensors
- Rear Hub: 5 sensors

```
5: 127,3,1,fh1,fh2,fh3,fh4,fh5,ch1,ch2,rh1,rh2,rh3,rh4,rh5
```

**Example:**
```
5: 127,3,1,22.3,23.1,21.8,22.9,23.5,24.2,23.7,22.1,22.6,23.4,22.8,23.2
```

#### Type 6: Battery Voltages (144 values)
Cell voltages in Volts (18 rows × 8 columns)

```
6: 128,3,1,cell1,cell2,cell3,...,cell144
```

**Example:**
```
6: 128,3,1,3.72,3.68,3.75,3.71,3.69,3.73,3.70,3.74,...(144 total)
```

---

## Testing Workflows

### Test with Real Hardware

1. **Find your port:**
   ```bash
   node testing/serial-port-list.js
   ```

2. **Monitor raw serial output:**
   ```bash
   node testing/serial-monitor.js /dev/tty.usbmodem14203 115200
   ```

3. **Bridge to backend (optional):**
   ```bash
   # In one terminal: start backend
   cd guad-gui/server
   npm start

   # In another terminal: start serial bridge
   node serial-bridge.js
   ```

4. **View in frontend:**
   ```bash
   # In another terminal: start frontend
   cd guad-gui
   npm start
   ```

### Test without Hardware

1. **Start backend:**
   ```bash
   cd guad-gui/server
   npm start
   ```

2. **Run simulator:**
   ```bash
   node testing/serial-simulator.js 500
   ```

3. **View in frontend:**
   ```bash
   cd guad-gui
   npm start
   ```

The simulator will send data to the backend API, which the frontend will fetch and display.

---

## Troubleshooting

### Port Not Found

**Error:** `Error: Error: No such file or directory`

**Solutions:**
1. Run `node testing/serial-port-list.js` to find correct port
2. Check USB cable is connected (must support data transfer)
3. On macOS: `ls /dev/tty.*`
4. On Linux: `ls /dev/ttyACM* /dev/ttyUSB*`

### Permission Denied

**Error:** `Error: Opening /dev/ttyACM0: Permission denied`

**Solutions (Linux):**
```bash
# Add your user to dialout group
sudo usermod -a -G dialout $USER

# Then logout and login
```

**Or run with sudo (not recommended):**
```bash
sudo node testing/serial-monitor.js /dev/ttyACM0 115200
```

### Backend Connection Refused

**Error:** `❌ Cannot connect to backend. Is the server running?`

**Solutions:**
1. Start the backend server:
   ```bash
   cd guad-gui/server
   npm start
   ```
2. Check `API_URL` in simulator or bridge
3. Verify port 5001 is not blocked by firewall

### Port Already in Use

**Error:** `Error: Port is opening`

**Solutions:**
1. Close other programs using the port:
   - Arduino IDE Serial Monitor
   - screen sessions
   - Other serial-monitor instances
2. Find and kill the process:
   ```bash
   # macOS/Linux
   lsof | grep usbmodem
   kill -9 <PID>
   ```

### Invalid Packet Format

**Warning:** `⚠️ Invalid packet format, skipping`

**Solutions:**
1. Check STM32 firmware is sending correct format
2. Verify baud rate matches (115200)
3. Use serial-monitor to see raw output
4. Ensure newline delimiter is `\n`

### MongoDB Not Connected

**Error:** Frontend shows "MongoDB Disconnected"

**Solutions:**
1. Start backend server
2. Check `.env` has valid `MONGODB_URI`
3. Verify MongoDB Atlas IP whitelist
4. Toggle "Save to MongoDB" off to continue without DB

---

## Advanced Usage

### Custom Serial Port in Bridge

Edit `serial-bridge.js`:
```javascript
const SERIAL_PORT = '/dev/tty.usbmodem14203'; // Your port here
```

### Change Simulator Interval

```bash
# Send packets every 100ms (fast)
node testing/serial-simulator.js 100

# Send packets every 5000ms (slow)
node testing/serial-simulator.js 5000
```

### Run Simulator in Background

```bash
# macOS/Linux
node testing/serial-simulator.js > sim.log 2>&1 &

# View logs
tail -f sim.log

# Stop
killall node
```

### Test Specific Packet Types

Modify `serial-simulator.js` to only send certain types:
```javascript
// Only send IMU data (types 1 and 2)
const packetGenerators = [
  generateIMUGyroscope,
  generateIMUAccelerometer,
];
```

---

## Files Reference

| File | Purpose | Needs Hardware |
|------|---------|----------------|
| `serial-port-list.js` | List available ports | Yes |
| `serial-monitor.js` | View raw serial data | Yes |
| `serial-simulator.js` | Generate test data | No |
| `../serial-bridge.js` | Bridge STM32 to API | Yes |

---

## Next Steps

1. ✅ Test with simulator first (no hardware needed)
2. ✅ Connect STM32 and use serial-port-list
3. ✅ Monitor raw data with serial-monitor
4. ✅ Run serial-bridge to send to backend
5. ✅ Verify frontend displays data correctly

For more information, see the main project [ARCHITECTURE.md](../../../ARCHITECTURE.md).
