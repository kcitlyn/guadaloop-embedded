# GUAD Pod Telemetry System

Real-time telemetry and control interface for hyperloop pod development with full-stack data persistence.

## 🚀 Features

- **Real-time Sensor Monitoring**: Live visualization of temperature, hall effect, IMU, and gap height sensors
- **Web Serial API Integration**: Direct Arduino/STM32 communication via browser
- **MongoDB Integration**: Persistent storage of all sensor data with timestamp indexing
- **RESTful Backend API**: Express.js server with CRUD operations for historical data retrieval
- **State Machine Visualization**: Real-time FSM state tracking and transition history
- **File Export**: CSV/TXT export functionality for offline analysis
- **Responsive UI**: Material-UI components with custom visualizations

## 🏗️ Architecture

```
Arduino/STM32 → Web Serial → React Frontend → REST API → MongoDB Atlas
                                    ↓
                            Real-time Visualization
```

### Tech Stack

**Frontend:**
- React with Hooks (useState, useEffect, useReducer)
- Material-UI & Recharts for visualization
- Web Serial API for hardware communication
- Axios for HTTP requests

**Backend:**
- Node.js with Express.js
- MongoDB Node Driver
- CORS & environment-based configuration
- RESTful API design

**Database:**
- MongoDB Atlas (Cloud NoSQL)
- Time-series optimized with indexes
- Document-based sensor data storage

**Embedded:**
- Arduino/STM32 firmware (C++)
- Serial communication protocol
- Sensor integration (I2C, analog)

## 📦 Installation

### Prerequisites
- Node.js 16+ and npm
- MongoDB Atlas account (free tier works)
- Arduino IDE (for embedded firmware)
- Chrome/Edge browser (for Web Serial API)

### Backend Setup

```bash
# Navigate to server directory
cd guad-gui/server

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env with your MongoDB connection string
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/
DB_NAME=guad_pod
PORT=5001

# Start backend server
npm start
```

### Frontend Setup

```bash
# Navigate to React app directory
cd guad-gui

# Install dependencies
npm install --legacy-peer-deps

# Create .env file
cp .env.example .env

# Configure API endpoint
REACT_APP_API_URL=http://localhost:5001/api

# Start React app
npm start
```

### Quick Start (Both Servers)

```bash
# From GUI root directory
./start.sh
```

## 🔌 Hardware Setup

1. Upload Arduino sketch (`GUI.ino`) to your microcontroller
2. Connect sensors according to pin definitions in sketch
3. Connect board via USB
4. Open web app and click "Connect to Pod"
5. Select serial port from browser dialog

## 📡 API Endpoints

### Health Check
```
GET /api/health
Response: {"status": "ok", "mongodb": "connected"}
```

### Save Sensor Data
```
POST /api/sensor-data
Body: {
  "packetType": 1,
  "podState": "Ready",
  "podHealth": true,
  "sensorData": {...},
  "rawData": "..."
}
```

### Get Recent Data
```
GET /api/sensor-data?limit=100&packetType=1
Response: {"success": true, "data": [...]}
```

### Get Data by Date Range
```
GET /api/sensor-data/range?startDate=2026-01-01&endDate=2026-01-31
Response: {"success": true, "data": [...]}
```

## 📊 Data Structure

Sensor data is stored in MongoDB with the following schema:

```json
{
  "_id": "ObjectId",
  "timestamp": "ISODate",
  "packetType": 1,
  "podState": "Levitation",
  "podHealth": true,
  "sensorData": {
    "packetType": 1,
    "stateCode": 3,
    "healthStatus": true,
    "values": [...]
  },
  "rawData": "1: 123,3,1,0.1,0.2,..."
}
```

## 🎯 Project Structure

```
GUI/
├── guad-gui/                 # React frontend
│   ├── src/
│   │   ├── App.js           # Main application component
│   │   ├── components/      # UI components
│   │   └── services/        # API service layer
│   ├── server/              # Express backend
│   │   ├── server.js        # REST API server
│   │   └── package.json     # Backend dependencies
│   └── package.json         # Frontend dependencies
├── libraries/               # Arduino libraries
│   ├── LoRa/               # LoRa communication
│   └── SparkFun_VL6180_Sensor/  # Distance sensor
├── GUI.ino                 # Arduino firmware
├── MONGODB_SETUP.md        # Detailed MongoDB setup guide
└── start.sh                # Convenience startup script
```

## 🚢 Deployment

See [MONGODB_SETUP.md](MONGODB_SETUP.md) for detailed deployment instructions.

**Deployment Options:**
- **Render.com**: Free tier with auto-deploys
- **AWS ECS/Fargate**: Scalable container orchestration
- **Vercel + Backend**: Hybrid deployment
- **Docker**: Full containerization support (see Docker setup below)

## 🐳 Docker Support (Coming Soon)

Containerization setup with Docker Compose for easy deployment to any cloud platform.

## 🛠️ Development

### Serial Protocol Format

```
packetType: stateID,stateCode,healthStatus,value1,value2,...
Example: 1: 123,3,1,0.1,0.2,0.3,45.6
```

**Packet Types:**
- `1`: IMU Angular Velocity (9 values)
- `2`: IMU Acceleration (9 values)
- `3`: Gap Sensors (8 values)
- `4`: Temperature Sensors (10 values)
- `5`: Hall Effect Sensors (12 values)

### Pod States
1. Initialization
2. Health Check
3. Ready
4. Levitation
5. Propulsion
6. Coasting
7. Braking
8. Stopped

## 📝 Configuration

### MongoDB Atlas Setup
1. Create free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Create database user
3. Whitelist IP (0.0.0.0/0 for development)
4. Copy connection string to `.env`

### Environment Variables

**Backend** (`.env`):
```env
MONGODB_URI=your_connection_string
DB_NAME=guad_pod
PORT=5001
```

**Frontend** (`.env`):
```env
REACT_APP_API_URL=http://localhost:5001/api
```

## 🤝 Contributing

1. Create feature branch
2. Make changes
3. Test thoroughly (both serial and API)
4. Submit pull request

## 📄 License

[Add your license here]

## 👥 Team

Texas Guadaloop - Software & Communications

## 📞 Support

For issues or questions, please open a GitHub issue.
