# STM32 Testing Setup - Changes Summary

## ✅ What Was Done

### 1. **Created Testing Utilities** (in `guad-gui/server/testing/`)

Three new testing tools to help you test STM32 serial communication:

- **serial-port-list.js** - Finds your STM32 device
- **serial-monitor.js** - Views raw serial data in real-time
- **serial-simulator.js** - Generates test data without hardware
- **README.md** - Complete documentation for all tools

### 2. **Fixed serial-bridge.js**

✅ **Changed:** Updated from JSON protocol to CSV protocol
✅ **Changed:** Now parses format: `packetType: stateID,stateCode,healthStatus,value1,value2,...`
✅ **Changed:** Matches the protocol used by your STM32 firmware and frontend

**Diff:**
```diff
- // Parse JSON data from STM32
- const data = JSON.parse(trimmed);
+ // Parse CSV protocol: packetType: stateID,stateCode,healthStatus,value1,value2,...
+ const [packetInfo, data] = trimmed.split(':');
+ const packetType = parseInt(packetInfo.trim(), 10);
+ const values = data.split(',').map(Number);
```

### 3. **Fixed App.js Bugs**

#### Bug #1: Missing Reducer Cases
✅ **Fixed:** Added `UPDATE_GAP_HEIGHT_SENSORS` case
✅ **Fixed:** Added `UPDATE_BATTERY_VOLTAGES` case

**Diff:**
```diff
case 'UPDATE_TEMP_SENSORS':
  return { ...state, tempSensors: { ...state.tempSensors, ...action.payload } };
+ case 'UPDATE_GAP_HEIGHT_SENSORS':
+   return { ...state, gapHeightSensors: action.payload };
+ case 'UPDATE_BATTERY_VOLTAGES':
+   return { ...state, batteryVoltages: action.payload };
default:
  return state;
```

#### Bug #2: Gap Height Data Structure Mismatch
✅ **Fixed:** Changed from object to array format

**Diff:**
```diff
3: (values) => { // Lateral and Vertical Gap Sensors
-   dispatch({ type: 'UPDATE_GAP_HEIGHT_SENSORS', payload: {
-     lateral: { frontRight: values[0], ... },
-     vertical: { frontRight: values[4], ... }
-   }});
+   // Array format: [vert1, vert2, vert3, vert4, lat1, lat2, lat3, lat4]
+   dispatch({ type: 'UPDATE_GAP_HEIGHT_SENSORS', payload: values.slice(0, 8) });
},
```

#### Bug #3: Missing Battery Voltage Packet Handler
✅ **Added:** Packet Type 6 handler for 144 battery cells

**Diff:**
```diff
5: (values) => { // Hall Effect sensors
  dispatch({ type: 'UPDATE_HALL_EFFECT_SENSORS', payload: { ... }});
-}
+},
+6: (values) => { // Battery Voltages: 144 cells (18 rows × 8 columns)
+  dispatch({ type: 'UPDATE_BATTERY_VOLTAGES', payload: values.slice(0, 144) });
+}
```

---

## 🚀 Quick Start Guide

### Option 1: Test Without Hardware (Simulator)

**Perfect for testing the frontend and backend without STM32 connected.**

```bash
# Terminal 1: Start backend
cd guad-gui/server
npm start

# Terminal 2: Run simulator
cd guad-gui/server
node testing/serial-simulator.js 500

# Terminal 3: Start frontend
cd guad-gui
npm start
```

Open browser to `http://localhost:3000` and watch live data!

### Option 2: Test With STM32 Hardware

**Connect your STM32 Nucleo-F446RE and view real sensor data.**

#### Step 1: Find Your Serial Port

```bash
cd guad-gui/server
node testing/serial-port-list.js
```

**Example Output:**
```
✅ Found 1 serial port(s):

Port 1:
  Path:         /dev/tty.usbmodem14203
  ⭐ STM32 Device Detected!
```

Copy the `Path` value.

#### Step 2: Monitor Raw Serial Data

```bash
node testing/serial-monitor.js /dev/tty.usbmodem14203 115200
```

You should see packets like:
```
[10:23:45] ✅ 1: 123,3,1,0.12,0.34,-0.56,0.78,0.91,-0.23,0.45,0.67,0.89
```

If you see this, your STM32 is working correctly!

#### Step 3: Update serial-bridge.js Port

Edit `guad-gui/server/serial-bridge.js` line 6:

```javascript
const SERIAL_PORT = '/dev/tty.usbmodem14203'; // Use YOUR port from Step 1
```

#### Step 4: Run Full System

```bash
# Terminal 1: Start backend
cd guad-gui/server
npm start

# Terminal 2: Start serial bridge
cd guad-gui/server
node serial-bridge.js

# Terminal 3: Start frontend
cd guad-gui
npm start
```

Open browser to `http://localhost:3000` and see live STM32 data!

---

## 📊 Packet Format Reference

All packets follow this format:
```
packetType: stateID,stateCode,healthStatus,value1,value2,...
```

### Packet Types

| Type | Name | Values | Example |
|------|------|--------|---------|
| 1 | IMU Gyroscope | 9 | `1: 123,3,1,0.12,0.34,-0.56,...` |
| 2 | IMU Accelerometer | 9 | `2: 124,3,1,0.512,0.034,-9.812,...` |
| 3 | Gap Height | 8 | `3: 125,3,1,10.23,10.45,10.12,...` |
| 4 | Temperature | 10 | `4: 126,3,1,32.5,33.1,31.8,...` |
| 5 | Hall Effect | 12 | `5: 127,3,1,22.3,23.1,21.8,...` |
| 6 | Battery Voltages | 144 | `6: 128,3,1,3.72,3.68,3.75,...` |

### Pod States (stateCode)

| Code | State |
|------|-------|
| 0 | Initialization |
| 1 | Health Check |
| 2 | Ready |
| 3 | Levitation |
| 4 | Propulsion |
| 5 | Coasting |
| 6 | Braking |
| 7 | Stopped |

---

## 🐛 Troubleshooting

### "No serial ports found"

- Connect STM32 via USB
- Try a different USB cable (must support data transfer)
- On macOS: `ls /dev/tty.*`
- On Linux: `ls /dev/ttyACM*`

### "Cannot connect to backend"

- Make sure backend is running: `cd guad-gui/server && npm start`
- Check port 5001 is not blocked
- Verify `API_URL` in simulator/bridge

### "Port already in use"

- Close Arduino IDE Serial Monitor
- Kill any screen sessions
- Run: `lsof | grep usbmodem` and kill the process

### Frontend shows "MongoDB Disconnected"

- This is OK! You can still use the system
- Toggle "Save to MongoDB" OFF in the frontend
- Or start MongoDB backend properly

---

## 📁 New Files Created

```
guad-gui/server/testing/
├── README.md               # Complete testing documentation
├── serial-port-list.js     # Port detection utility
├── serial-monitor.js       # Raw serial data viewer
└── serial-simulator.js     # Test data generator
```

---

## 🔧 Modified Files

### guad-gui/server/serial-bridge.js
- ✅ Changed JSON protocol to CSV protocol
- ✅ Added pod state name mapping
- ✅ Improved error handling

### guad-gui/src/App.js
- ✅ Added `UPDATE_GAP_HEIGHT_SENSORS` reducer case
- ✅ Added `UPDATE_BATTERY_VOLTAGES` reducer case
- ✅ Fixed gap height packet handler (object → array)
- ✅ Added battery voltage packet handler (Type 6)

---

## ✨ What You Can Do Now

1. ✅ **Test without hardware** using the simulator
2. ✅ **Find your STM32 port** with serial-port-list.js
3. ✅ **Monitor raw serial data** with serial-monitor.js
4. ✅ **Send STM32 data to backend** with serial-bridge.js
5. ✅ **View all 6 packet types** in the frontend
6. ✅ **See battery voltages** (144 cells) in the Battery tab
7. ✅ **See gap height sensors** working correctly

---

## 📖 Next Steps

1. **Test the simulator first:**
   ```bash
   cd guad-gui/server
   node testing/serial-simulator.js
   ```

2. **Review the testing README:**
   ```bash
   cat guad-gui/server/testing/README.md
   ```

3. **When you connect STM32:**
   - Use `serial-port-list.js` to find the port
   - Use `serial-monitor.js` to verify data format
   - Update `serial-bridge.js` with correct port
   - Run the full system!

4. **Verify STM32 firmware** sends data in this format:
   ```
   1: 123,3,1,0.12,0.34,-0.56,0.78,0.91,-0.23,0.45,0.67,0.89
   ```

---

## 🎯 Summary

You now have a complete testing suite that allows you to:

- ✅ Test the entire system without hardware (simulator)
- ✅ Debug serial communication issues (monitor)
- ✅ Detect STM32 devices automatically (port list)
- ✅ View all sensor data in the frontend (bug fixes)
- ✅ See battery voltages and gap heights (new features)

**All packet types (1-6) are now fully supported end-to-end!**

For detailed documentation, see:
- [guad-gui/server/testing/README.md](guad-gui/server/testing/README.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
