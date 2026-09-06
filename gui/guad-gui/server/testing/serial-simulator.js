/**
 * Serial Data Simulator
 *
 * Generates realistic test data matching the STM32 packet protocol.
 * Sends data to the backend API to test the system without hardware.
 *
 * Usage:
 *   node serial-simulator.js [interval_ms] [api_url]
 *
 * Examples:
 *   node serial-simulator.js 1000 http://localhost:5001/api/sensor-data
 *   node serial-simulator.js 500  (uses default API URL)
 *   node serial-simulator.js      (uses defaults: 1000ms interval)
 */

const axios = require('axios');

// Parse command line arguments
const args = process.argv.slice(2);
const INTERVAL_MS = parseInt(args[0]) || 1000;
const API_URL = args[1] || process.env.API_URL || 'http://localhost:5001/api/sensor-data';

console.log('');
console.log('╔════════════════════════════════════════════════════════╗');
console.log('║       🎲 Serial Data Simulator                        ║');
console.log('╚════════════════════════════════════════════════════════╝');
console.log('');
console.log('Configuration:');
console.log(`  Interval:  ${INTERVAL_MS}ms`);
console.log(`  API URL:   ${API_URL}`);
console.log('');
console.log('Press Ctrl+C to stop');
console.log('─────────────────────────────────────────────────────────');
console.log('');

// Pod state machine
const POD_STATES = [
  'Initialization',
  'Health Check',
  'Ready',
  'Levitation',
  'Propulsion',
  'Coasting',
  'Braking',
  'Stopped'
];

let currentStateIndex = 0;
let stateID = 0;
let packetCount = 0;
let errorCount = 0;

// Helper function to generate random value in range
const random = (min, max) => Math.random() * (max - min) + min;

// Helper function to generate random integer
const randomInt = (min, max) => Math.floor(random(min, max + 1));

/**
 * Generate IMU Gyroscope data (Packet Type 1)
 * Format: 1: stateID,stateCode,healthStatus,rearX,rearY,rearZ,centerX,centerY,centerZ,frontX,frontY,frontZ
 */
const generateIMUGyroscope = () => {
  const values = [];
  // Rear IMU (x, y, z angular velocity in deg/s)
  values.push(random(-10, 10).toFixed(2));
  values.push(random(-10, 10).toFixed(2));
  values.push(random(-5, 5).toFixed(2));
  // Center IMU
  values.push(random(-10, 10).toFixed(2));
  values.push(random(-10, 10).toFixed(2));
  values.push(random(-5, 5).toFixed(2));
  // Front IMU
  values.push(random(-10, 10).toFixed(2));
  values.push(random(-10, 10).toFixed(2));
  values.push(random(-5, 5).toFixed(2));

  return `1: ${stateID},${currentStateIndex},1,${values.join(',')}`;
};

/**
 * Generate IMU Accelerometer data (Packet Type 2)
 * Format: 2: stateID,stateCode,healthStatus,rearX,rearY,rearZ,centerX,centerY,centerZ,frontX,frontY,frontZ
 */
const generateIMUAccelerometer = () => {
  const values = [];
  // Simulate acceleration based on pod state
  let baseAccel = 0;
  if (POD_STATES[currentStateIndex] === 'Propulsion') {
    baseAccel = random(0.5, 2.0); // Accelerating
  } else if (POD_STATES[currentStateIndex] === 'Braking') {
    baseAccel = random(-3.0, -1.0); // Decelerating
  } else if (POD_STATES[currentStateIndex] === 'Coasting') {
    baseAccel = random(-0.1, 0.1); // Minimal acceleration
  }

  // Rear IMU (x, y, z acceleration in m/s²)
  values.push((baseAccel + random(-0.2, 0.2)).toFixed(3));
  values.push(random(-0.5, 0.5).toFixed(3));
  values.push(random(9.7, 9.9).toFixed(3)); // ~9.8 m/s² gravity on z-axis
  // Center IMU
  values.push((baseAccel + random(-0.2, 0.2)).toFixed(3));
  values.push(random(-0.5, 0.5).toFixed(3));
  values.push(random(9.7, 9.9).toFixed(3));
  // Front IMU
  values.push((baseAccel + random(-0.2, 0.2)).toFixed(3));
  values.push(random(-0.5, 0.5).toFixed(3));
  values.push(random(9.7, 9.9).toFixed(3));

  return `2: ${stateID},${currentStateIndex},1,${values.join(',')}`;
};

/**
 * Generate Gap Height Sensor data (Packet Type 3)
 * Format: 3: stateID,stateCode,healthStatus,lat1,lat2,lat3,lat4,vert1,vert2,vert3,vert4
 */
const generateGapHeight = () => {
  const values = [];
  const targetGap = POD_STATES[currentStateIndex] === 'Levitation' ?
    random(8, 12) : // Levitating: 8-12mm gap
    random(0, 2);   // Not levitating: 0-2mm gap

  // 4 Lateral sensors (mm)
  for (let i = 0; i < 4; i++) {
    values.push((targetGap + random(-0.5, 0.5)).toFixed(2));
  }
  // 4 Vertical sensors (mm)
  for (let i = 0; i < 4; i++) {
    values.push((targetGap + random(-0.5, 0.5)).toFixed(2));
  }

  return `3: ${stateID},${currentStateIndex},1,${values.join(',')}`;
};

/**
 * Generate Temperature Sensor data (Packet Type 4)
 * Format: 4: stateID,stateCode,healthStatus,fh1,fh2,fh3,fh4,ch1,ch2,rh1,rh2,rh3,rh4
 */
const generateTemperature = () => {
  const values = [];
  // Base temperature increases with activity
  let baseTemp = 25; // Celsius
  if (['Levitation', 'Propulsion'].includes(POD_STATES[currentStateIndex])) {
    baseTemp = random(30, 45);
  } else if (POD_STATES[currentStateIndex] === 'Braking') {
    baseTemp = random(40, 60);
  }

  // Front Hub: 4 sensors
  for (let i = 0; i < 4; i++) {
    values.push((baseTemp + random(-3, 3)).toFixed(1));
  }
  // Center Hub: 2 sensors
  for (let i = 0; i < 2; i++) {
    values.push((baseTemp + random(-3, 3)).toFixed(1));
  }
  // Rear Hub: 4 sensors
  for (let i = 0; i < 4; i++) {
    values.push((baseTemp + random(-3, 3)).toFixed(1));
  }

  return `4: ${stateID},${currentStateIndex},1,${values.join(',')}`;
};

/**
 * Generate Hall Effect Sensor data (Packet Type 5)
 * Format: 5: stateID,stateCode,healthStatus,fh1,fh2,fh3,fh4,fh5,ch1,ch2,rh1,rh2,rh3,rh4,rh5
 */
const generateHallEffect = () => {
  const values = [];
  // Hall effect values typically 0-1023 (10-bit ADC) or scaled to current (A)
  // Using amperage values: 0-50A
  const baseCurrent = ['Levitation', 'Propulsion'].includes(POD_STATES[currentStateIndex]) ?
    random(20, 40) : // Active states
    random(0, 5);    // Idle states

  // Front Hub: 5 sensors
  for (let i = 0; i < 5; i++) {
    values.push((baseCurrent + random(-2, 2)).toFixed(1));
  }
  // Center Hub: 2 sensors
  for (let i = 0; i < 2; i++) {
    values.push((baseCurrent + random(-2, 2)).toFixed(1));
  }
  // Rear Hub: 5 sensors
  for (let i = 0; i < 5; i++) {
    values.push((baseCurrent + random(-2, 2)).toFixed(1));
  }

  return `5: ${stateID},${currentStateIndex},1,${values.join(',')}`;
};

/**
 * Generate Battery Voltage data (Packet Type 6)
 * Format: 6: stateID,stateCode,healthStatus,cell1,cell2,...,cell144
 */
const generateBatteryVoltages = () => {
  const values = [];
  // Lithium battery cells: typically 3.0-4.2V
  const baseVoltage = 3.7; // Nominal voltage
  const variance = 0.3;

  // 144 cells (18 rows × 8 columns)
  for (let i = 0; i < 144; i++) {
    // Simulate some cells being slightly higher/lower
    const cellVoltage = baseVoltage + random(-variance, variance);
    values.push(cellVoltage.toFixed(2));
  }

  return `6: ${stateID},${currentStateIndex},1,${values.join(',')}`;
};

// Packet generators array
const packetGenerators = [
  generateIMUGyroscope,
  generateIMUAccelerometer,
  generateGapHeight,
  generateTemperature,
  generateHallEffect,
  generateBatteryVoltages
];

/**
 * Send packet to backend API
 */
const sendPacket = async (rawData) => {
  try {
    // Parse the packet to send structured data
    const [packetInfo, data] = rawData.split(':');
    const packetType = parseInt(packetInfo.trim(), 10);
    const values = data.split(',').map(Number);

    const payload = {
      packetType,
      podState: POD_STATES[currentStateIndex],
      podHealth: true,
      sensorData: {
        packetType,
        stateCode: values[1],
        healthStatus: values[2] === 1,
        values: values.slice(3)
      },
      rawData: rawData.trim()
    };

    const response = await axios.post(API_URL, payload);

    if (response.data.success) {
      packetCount++;
      const timestamp = new Date().toLocaleTimeString();
      console.log(`[${timestamp}] ✅ Packet ${packetCount} | Type ${packetType} | State: ${POD_STATES[currentStateIndex]}`);
    } else {
      console.error(`❌ Backend error:`, response.data);
      errorCount++;
    }
  } catch (error) {
    errorCount++;
    if (error.code === 'ECONNREFUSED') {
      console.error('❌ Cannot connect to backend. Is the server running?');
      console.error(`   Expected: ${API_URL}`);
    } else {
      console.error('❌ Error sending packet:', error.message);
    }
  }
};

/**
 * Simulate state transitions
 */
const simulateStateChange = () => {
  // Randomly transition to next state (simulate pod operation)
  if (Math.random() > 0.8) { // 20% chance per cycle
    currentStateIndex = (currentStateIndex + 1) % POD_STATES.length;
    console.log(`\n🔄 State changed to: ${POD_STATES[currentStateIndex]}\n`);
  }
};

/**
 * Main simulation loop
 */
let intervalId;
const runSimulation = () => {
  // Generate and send all packet types in sequence
  let packetIndex = 0;

  intervalId = setInterval(async () => {
    stateID++;

    // Send one packet type per interval (cycle through all types)
    const generator = packetGenerators[packetIndex];
    const packet = generator();
    await sendPacket(packet);

    // Move to next packet type
    packetIndex = (packetIndex + 1) % packetGenerators.length;

    // Occasionally change state (only on packet type 0 to avoid spam)
    if (packetIndex === 0) {
      simulateStateChange();
    }
  }, INTERVAL_MS);
};

// Start simulation
console.log('🚀 Starting simulation...\n');
runSimulation();

// Graceful shutdown
process.on('SIGINT', () => {
  clearInterval(intervalId);
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║       🛑 Simulation Stopped                           ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`📊 Statistics:`);
  console.log(`   Total packets sent: ${packetCount}`);
  console.log(`   Errors:            ${errorCount}`);
  console.log(`   Success rate:      ${packetCount > 0 ? ((packetCount / (packetCount + errorCount)) * 100).toFixed(1) : 0}%`);
  console.log('');
  process.exit(0);
});
