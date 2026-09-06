/**
 * Serial Port Lister
 *
 * Lists all available serial ports on your system.
 * Useful for finding your STM32 Nucleo-F446RE device.
 *
 * Usage:
 *   node serial-port-list.js
 */

const { SerialPort } = require('serialport');

console.log('');
console.log('╔════════════════════════════════════════════════════════╗');
console.log('║       🔍 Serial Port Lister                           ║');
console.log('╚════════════════════════════════════════════════════════╝');
console.log('');
console.log('Scanning for available serial ports...');
console.log('');

SerialPort.list()
  .then(ports => {
    if (ports.length === 0) {
      console.log('❌ No serial ports found!');
      console.log('');
      console.log('💡 Troubleshooting:');
      console.log('  1. Connect your STM32 Nucleo board via USB');
      console.log('  2. Check that the USB cable supports data transfer');
      console.log('  3. On macOS, try: ls /dev/tty.*');
      console.log('  4. On Linux, try: ls /dev/ttyACM* /dev/ttyUSB*');
      console.log('');
    } else {
      console.log(`✅ Found ${ports.length} serial port(s):\n`);

      ports.forEach((port, index) => {
        console.log(`Port ${index + 1}:`);
        console.log(`  Path:         ${port.path}`);
        console.log(`  Manufacturer: ${port.manufacturer || 'Unknown'}`);
        console.log(`  Serial #:     ${port.serialNumber || 'N/A'}`);
        console.log(`  Vendor ID:    ${port.vendorId || 'N/A'}`);
        console.log(`  Product ID:   ${port.productId || 'N/A'}`);

        // Highlight likely STM32 devices
        if (port.manufacturer && port.manufacturer.toLowerCase().includes('stm')) {
          console.log('  ⭐ STM32 Device Detected!');
        }
        if (port.path.includes('usbmodem') || port.path.includes('ttyACM')) {
          console.log('  ⭐ Likely STM32 Nucleo!');
        }

        console.log('');
      });

      console.log('─────────────────────────────────────────────────────────');
      console.log('💡 Copy the "Path" value to use in your configuration');
      console.log('   Example: /dev/tty.usbmodem14203');
      console.log('');
    }
  })
  .catch(err => {
    console.error('❌ Error listing ports:', err.message);
  });
