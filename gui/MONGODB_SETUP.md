# MongoDB Integration for GUAD Pod

This project includes MongoDB integration to store all sensor data from the serial port.

## Setup Instructions

### Backend Server Setup

1. Navigate to the server directory:
```bash
cd guad-gui/server
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the `server` directory:
```bash
cp .env.example .env
```

4. Edit the `.env` file and add your MongoDB connection string:
```env
MONGODB_URI=your_mongodb_connection_string_here
DB_NAME=guad_pod
PORT=5000
```

5. Start the backend server:
```bash
npm start
```

Or for development with auto-restart:
```bash
npm run dev
```

### Frontend Setup

1. Navigate to the guad-gui directory:
```bash
cd guad-gui
```

2. Install axios (if not already installed):
```bash
npm install axios
```

3. Create a `.env` file in the `guad-gui` directory:
```bash
cp .env.example .env
```

4. Start the React app:
```bash
npm start
```

## MongoDB Data Structure

The sensor data is stored with the following structure:

```json
{
  "_id": "ObjectId",
  "timestamp": "ISODate",
  "packetType": "Number",
  "podState": "String",
  "podHealth": "Boolean",
  "sensorData": {
    "packetType": "Number",
    "stateCode": "Number",
    "healthStatus": "Boolean",
    "values": "Array"
  },
  "rawData": "String"
}
```

## API Endpoints

### POST /api/sensor-data
Save sensor data to MongoDB

### GET /api/sensor-data?limit=100&packetType=1
Get recent sensor data (optional filters: limit, packetType)

### GET /api/sensor-data/range?startDate=2024-01-01&endDate=2024-01-31
Get data by date range

### GET /api/health
Check backend and MongoDB connection status

## Features

- Automatic data persistence to MongoDB
- Real-time sensor data streaming
- Query historical data by date range or packet type
- Connection status monitoring
- Toggle to enable/disable MongoDB saving

## Troubleshooting

- Make sure both the backend server (port 5000) and React app (port 3000) are running
- Check that your MongoDB connection string is correct in the `.env` file
- Verify firewall settings allow connections to MongoDB
- Check console logs for connection errors
