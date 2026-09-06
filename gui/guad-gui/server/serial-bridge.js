const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const axios = require('axios');

// Configuration
const SERIAL_PORT = '/dev/tty.usbmodem102'; // STM32 Nucleo-F446RE
const BAUD_RATE = 115200;
const API_URL = process.env.API_URL || 'http://localhost:5001/api/sensor-data';

// Create serial port connection
const port = new SerialPort({
  path: SERIAL_PORT,
  baudRate: BAUD_RATE,
});

// Create parser to read line by line
const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

// Pod state names
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

// Handle incoming data from STM32
parser.on('data', async (line) => {
  try {
    const trimmed = line.trim();
    console.log('📥 Received from STM32:', trimmed);

    // Skip empty lines
    if (!trimmed || trimmed.length === 0) {
      return;
    }

    // Parse CSV protocol: packetType: stateID,stateCode,healthStatus,value1,value2,...
    if (!trimmed.includes(':')) {
      console.log('   ℹ️  Non-packet message, skipping');
      return;
    }

    const [packetInfo, data] = trimmed.split(':');
    if (!packetInfo || !data) {
      console.warn('⚠️  Invalid packet format, skipping');
      return;
    }

    const packetType = parseInt(packetInfo.trim(), 10);
    const values = data.split(',').map(Number);

    // Validate packet type
    if (isNaN(packetType) || packetType < 1 || packetType > 6) {
      console.warn(`⚠️  Invalid packet type: ${packetType}, skipping`);
      return;
    }

    // Parse common fields
    const stateID = values[0];
    const stateCode = values[1];
    const healthStatus = values[2] === 1;
    const sensorValues = values.slice(3);

    // Get pod state name
    const podState = POD_STATES[stateCode] || 'Unknown';

    // Format payload for backend API
    const payload = {
      packetType,
      podState,
      podHealth: healthStatus,
      sensorData: {
        packetType,
        stateCode,
        healthStatus,
        values: sensorValues
      },
      rawData: trimmed
    };

    // Send to backend API
    const response = await axios.post(API_URL, payload);

    if (response.data.success) {
      console.log(`✅ Packet Type ${packetType} sent successfully | State: ${podState}`);
      console.log(`   📊 ${sensorValues.length} sensor values`);
    } else {
      console.error('❌ Backend returned error:', response.data);
    }

  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('❌ Cannot connect to backend. Is the server running?');
    } else {
      console.error('❌ Error processing data:', error.message);
      console.error('   Raw data:', line.trim());
    }
  }
});

// Handle port open event
port.on('open', () => {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║       🚀 STM32 Serial Bridge Started                  ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('📡 Serial Port:', SERIAL_PORT);
  console.log('⚡ Baud Rate:', BAUD_RATE);
  console.log('📤 Backend API:', API_URL);
  console.log('');
  console.log('Waiting for data from STM32...');
  console.log('─────────────────────────────────────────────────────────');
});

// Handle port errors
port.on('error', (err) => {
  console.error('');
  console.error('╔════════════════════════════════════════════════════════╗');
  console.error('║       ❌ Serial Port Error                            ║');
  console.error('╚════════════════════════════════════════════════════════╝');
  console.error('');
  console.error('Error:', err.message);
  console.error('');
  console.error('💡 Troubleshooting Tips:');
  console.error('');
  console.error('1. Check if STM32 Nucleo board is connected via USB');
  console.error('');
  console.error('2. Find the correct serial port:');
  console.error('   Run: ls /dev/tty.usbmodem*');
  console.error('   Or:  ls /dev/tty.usb*');
  console.error('');
  console.error('3. Update SERIAL_PORT in serial-bridge.js');
  console.error('   Example: const SERIAL_PORT = "/dev/tty.usbmodem14203";');
  console.error('');
  console.error('4. Check if another program is using the port:');
  console.error('   (Close any serial monitor, Arduino IDE, screen, etc.)');
  console.error('');
  console.error('5. Test raw serial output first:');
  console.error('   screen /dev/tty.usbmodem14203 115200');
  console.error('   (Press Ctrl+A then K then Y to exit)');
  console.error('');
  process.exit(1);
});

// Handle port close event
port.on('close', () => {
  console.log('');
  console.log('⚠️  Serial port closed');
  process.exit(0);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('');
  console.log('🛑 Shutting down serial bridge...');
  port.close(() => {
    console.log('✅ Serial port closed');
    process.exit(0);
  });
});
