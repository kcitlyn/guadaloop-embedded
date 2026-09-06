/**
 * Serial Monitor
 *
 * Simple serial monitor to view raw data from STM32 in real-time.
 * Similar to Arduino Serial Monitor.
 *
 * Usage:
 *   node serial-monitor.js [port] [baudrate]
 *
 * Examples:
 *   node serial-monitor.js /dev/tty.usbmodem102 115200
 *   node serial-monitor.js /dev/ttyACM0 115200
 *   node serial-monitor.js  (uses defaults)
 */

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

// Parse command line arguments
const args = process.argv.slice(2);
const SERIAL_PORT = args[0] || '/dev/tty.usbmodem102';
const BAUD_RATE = parseInt(args[1]) || 115200;

let lineCount = 0;

console.log('');
console.log('╔════════════════════════════════════════════════════════╗');
console.log('║       📡 Serial Monitor - STM32                       ║');
console.log('╚════════════════════════════════════════════════════════╝');
console.log('');
console.log('Configuration:');
console.log(`  Port:      ${SERIAL_PORT}`);
console.log(`  Baud Rate: ${BAUD_RATE}`);
console.log('');
console.log('Press Ctrl+C to exit');
console.log('─────────────────────────────────────────────────────────');
console.log('');

// Create serial port connection
const port = new SerialPort({
  path: SERIAL_PORT,
  baudRate: BAUD_RATE,
});

// Create parser for line-by-line reading
const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

// Handle incoming data
parser.on('data', (line) => {
  lineCount++;
  const timestamp = new Date().toLocaleTimeString();
  const trimmed = line.trim();

  // Color code based on content
  let prefix = '📥';

  // Check if it matches expected packet format
  if (trimmed.match(/^\d+:\s*\d+,\d+,\d+,/)) {
    prefix = '✅'; // Valid packet
  } else if (trimmed.startsWith('{')) {
    prefix = '📋'; // JSON format
  } else if (trimmed.length === 0) {
    return; // Skip empty lines
  }

  console.log(`[${timestamp}] ${prefix} ${trimmed}`);
});

// Handle port open
port.on('open', () => {
  console.log('✅ Serial port opened successfully!');
  console.log('   Listening for data...');
  console.log('');
});

// Handle errors
port.on('error', (err) => {
  console.error('');
  console.error('❌ Serial Port Error:', err.message);
  console.error('');
  console.error('💡 Troubleshooting:');
  console.error('  1. Check the port path is correct');
  console.error('  2. Run: node serial-port-list.js');
  console.error('  3. Close other programs using the port');
  console.error('  4. Reconnect the STM32 USB cable');
  console.error('');
  process.exit(1);
});

// Handle port close
port.on('close', () => {
  console.log('');
  console.log(`⚠️  Serial port closed after ${lineCount} lines received`);
  process.exit(0);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('');
  console.log(`🛑 Exiting... (Received ${lineCount} lines total)`);
  port.close(() => {
    console.log('✅ Serial port closed cleanly');
    process.exit(0);
  });
});

// Display packet format help
setTimeout(() => {
  console.log('Expected Packet Format:');
  console.log('  packetType: stateID,stateCode,healthStatus,value1,value2,...');
  console.log('');
  console.log('Example:');
  console.log('  1: 123,3,1,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9');
  console.log('');
  console.log('Packet Types:');
  console.log('  1 = IMU Gyroscope (9 values)');
  console.log('  2 = IMU Accelerometer (9 values)');
  console.log('  3 = Gap Height Sensors (8 values)');
  console.log('  4 = Temperature Sensors (10 values)');
  console.log('  5 = Hall Effect Sensors (12 values)');
  console.log('  6 = Battery Voltages (144 values)');
  console.log('');
  console.log('─────────────────────────────────────────────────────────');
  console.log('');
}, 100);
