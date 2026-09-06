/**
 * System Integration Test
 *
 * Tests the complete data flow:
 * Simulator → Backend API → Verification
 *
 * Usage: node test-system.js
 */

const axios = require('axios');

const PORT = process.env.PORT || 5000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const API_URL = process.env.API_URL || `${BASE_URL}/api/sensor-data`;
const HEALTH_URL = `${BASE_URL}/api/health`;

console.log('');
console.log('╔════════════════════════════════════════════════════════╗');
console.log('║       🧪 System Integration Test                      ║');
console.log('╚════════════════════════════════════════════════════════╝');
console.log('');

// Test data for each packet type
const testPackets = [
  {
    name: 'IMU Gyroscope',
    packetType: 1,
    podState: 'Levitation',
    podHealth: true,
    sensorData: {
      packetType: 1,
      stateCode: 3,
      healthStatus: true,
      values: [0.12, 0.34, -0.56, 0.78, 0.91, -0.23, 0.45, 0.67, 0.89]
    },
    rawData: '1: 123,3,1,0.12,0.34,-0.56,0.78,0.91,-0.23,0.45,0.67,0.89'
  },
  {
    name: 'IMU Accelerometer',
    packetType: 2,
    podState: 'Propulsion',
    podHealth: true,
    sensorData: {
      packetType: 2,
      stateCode: 4,
      healthStatus: true,
      values: [0.512, 0.034, -9.812, 0.523, 0.045, -9.801, 0.534, 0.056, -9.789]
    },
    rawData: '2: 124,4,1,0.512,0.034,-9.812,0.523,0.045,-9.801,0.534,0.056,-9.789'
  },
  {
    name: 'Gap Height Sensors',
    packetType: 3,
    podState: 'Levitation',
    podHealth: true,
    sensorData: {
      packetType: 3,
      stateCode: 3,
      healthStatus: true,
      values: [10.23, 10.45, 10.12, 10.34, 10.56, 10.23, 10.45, 10.67]
    },
    rawData: '3: 125,3,1,10.23,10.45,10.12,10.34,10.56,10.23,10.45,10.67'
  },
  {
    name: 'Temperature Sensors',
    packetType: 4,
    podState: 'Braking',
    podHealth: true,
    sensorData: {
      packetType: 4,
      stateCode: 6,
      healthStatus: true,
      values: [45.2, 46.1, 44.8, 45.9, 47.2, 46.7, 45.1, 45.6, 46.4, 45.8]
    },
    rawData: '4: 126,6,1,45.2,46.1,44.8,45.9,47.2,46.7,45.1,45.6,46.4,45.8'
  },
  {
    name: 'Hall Effect Sensors',
    packetType: 5,
    podState: 'Levitation',
    podHealth: true,
    sensorData: {
      packetType: 5,
      stateCode: 3,
      healthStatus: true,
      values: [22.3, 23.1, 21.8, 22.9, 23.5, 24.2, 23.7, 22.1, 22.6, 23.4, 22.8, 23.2]
    },
    rawData: '5: 127,3,1,22.3,23.1,21.8,22.9,23.5,24.2,23.7,22.1,22.6,23.4,22.8,23.2'
  },
  {
    name: 'Battery Voltages',
    packetType: 6,
    podState: 'Ready',
    podHealth: true,
    sensorData: {
      packetType: 6,
      stateCode: 2,
      healthStatus: true,
      values: Array(144).fill(0).map((_, i) => (3.7 + (Math.random() * 0.3 - 0.15)).toFixed(2)).map(Number)
    },
    rawData: '6: 128,2,1,' + Array(144).fill(0).map((_, i) => (3.7 + (Math.random() * 0.3 - 0.15)).toFixed(2)).join(',')
  }
];

let passCount = 0;
let failCount = 0;

async function runTests() {
  console.log('Step 1: Checking backend health...');
  console.log('');

  try {
    const healthResponse = await axios.get(HEALTH_URL);
    console.log('✅ Backend Health:', healthResponse.data);
    console.log(`   MongoDB: ${healthResponse.data.mongodb}`);
    console.log('');
  } catch (error) {
    console.error('❌ Backend health check failed!');
    console.error('   Error:', error.message);
    console.error('');
    console.error('💡 Make sure the backend is running:');
    console.error('   cd guad-gui/server');
    console.error('   npm start');
    console.error('');
    process.exit(1);
  }

  console.log('Step 2: Testing all packet types...');
  console.log('');

  for (const packet of testPackets) {
    try {
      console.log(`Testing Packet Type ${packet.packetType}: ${packet.name}`);
      console.log(`  Raw: ${packet.rawData.substring(0, 60)}...`);

      const response = await axios.post(API_URL, packet);

      if (response.data.success) {
        console.log(`  ✅ SUCCESS - Saved to database`);
        if (response.data.id) {
          console.log(`     Document ID: ${response.data.id}`);
        }
        passCount++;
      } else {
        console.log(`  ❌ FAILED - Backend returned error`);
        console.log(`     Error:`, response.data);
        failCount++;
      }
      console.log('');

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 200));

    } catch (error) {
      console.log(`  ❌ FAILED - Request error`);
      console.log(`     Error: ${error.message}`);
      if (error.response) {
        console.log(`     Status: ${error.response.status}`);
        console.log(`     Data:`, error.response.data);
      }
      console.log('');
      failCount++;
    }
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('📊 Test Results:');
  console.log('');
  console.log(`   ✅ Passed: ${passCount}/${testPackets.length}`);
  console.log(`   ❌ Failed: ${failCount}/${testPackets.length}`);
  console.log('');

  if (failCount === 0) {
    console.log('🎉 All tests passed!');
    console.log('');
    console.log('✅ The system is working correctly:');
    console.log('   - Backend API is accepting packets');
    console.log('   - All 6 packet types are supported');
    console.log('   - Data is being saved to MongoDB');
    console.log('');
    console.log('Next steps:');
    console.log('   1. Run the simulator: node testing/serial-simulator.js 500');
    console.log('   2. Start the frontend: cd ../.. && npm start');
    console.log('   3. Open http://localhost:3000 to see live data');
    console.log('');
  } else {
    console.log('⚠️  Some tests failed');
    console.log('');
    console.log('💡 Troubleshooting:');
    console.log('   - Check backend server logs for errors');
    console.log('   - Verify MongoDB connection is working');
    console.log('   - Check packet format matches expected structure');
    console.log('');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('');
  console.error('❌ Test suite failed:', error.message);
  console.error('');
  process.exit(1);
});
