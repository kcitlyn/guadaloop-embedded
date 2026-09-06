# GUAD Pod Telemetry System - Architecture Reference

## Project Overview

**Full-stack IoT telemetry system** for Texas Guadaloop hyperloop pod monitoring. Real-time sensor data visualization with MongoDB persistence.

**Stack:** React 18 + Material-UI + Express + MongoDB + Docker + Web Serial API

**Purpose:** Monitor and visualize pod sensors (IMU, temperature, Hall effect, gap height, battery) in real-time via serial communication with STM32 microcontroller.

---

## Architecture Summary

### Three-Tier Architecture

```
STM32 Hardware → Serial Port → React Frontend/Node Bridge → Express API → MongoDB Atlas
```

1. **Frontend** ([guad-gui/src/](guad-gui/src/))
   - React 18.2 with hooks (useState, useEffect, useReducer)
   - Material-UI 5.11 components, Recharts for visualization
   - Web Serial API for direct STM32 communication
   - Axios for backend API calls
   - Tailwind CSS + Emotion for styling

2. **Backend** ([guad-gui/server/](guad-gui/server/))
   - Express 4.18 REST API (port 5001/5000)
   - MongoDB native driver 6.3
   - SerialPort 13.0 for hardware bridge
   - CORS enabled for cross-origin requests

3. **Database** (MongoDB Atlas)
   - Collection: `sensor_data`
   - Indexed on `timestamp` and `packetType`
   - Stores 5 packet types (IMU angular/linear, gap, temp, Hall effect)

4. **Infrastructure**
   - Docker multi-stage builds (frontend: Nginx Alpine, backend: Node 18 Alpine)
   - Docker Compose for orchestration
   - GitHub Actions CI/CD → GHCR image registry
   - Nginx reverse proxy for production

---

## Key File Locations

### Core Application Files

- **Frontend Entry:** [guad-gui/src/index.js](guad-gui/src/index.js) - React DOM root
- **Main Component:** [guad-gui/src/App.js](guad-gui/src/App.js) - 1,110 lines, central state & logic
- **Backend Entry:** [guad-gui/server/server.js](guad-gui/server/server.js) - Express server & MongoDB
- **Serial Bridge:** [guad-gui/server/serial-bridge.js](guad-gui/server/serial-bridge.js) - Standalone serial reader (new)
- **Hardware Firmware:** [GUI.ino](GUI.ino) - Arduino/STM32 sensor code

### Components & Services

- [guad-gui/src/components/FileWriter.js](guad-gui/src/components/FileWriter.js) - File System API for CSV/TXT export
- [guad-gui/src/components/LiveGraph.js](guad-gui/src/components/LiveGraph.js) - Real-time Recharts visualization
- [guad-gui/src/services/mongoDBService.js](guad-gui/src/services/mongoDBService.js) - API client (save, query, health)

### Configuration

- **Frontend Package:** [guad-gui/package.json](guad-gui/package.json) - React dependencies
- **Backend Package:** [guad-gui/server/package.json](guad-gui/server/package.json) - Express dependencies
- **Frontend Env:** [guad-gui/.env](guad-gui/.env) - `REACT_APP_API_URL`
- **Backend Env:** [guad-gui/server/.env](guad-gui/server/.env) - `MONGODB_URI`, `DB_NAME`, `PORT`
- **Tailwind:** [guad-gui/tailwind.config.js](guad-gui/tailwind.config.js) - Custom colors (accent-green, accent-red)

### Docker & CI/CD

- **Frontend Docker:** [guad-gui/Dockerfile](guad-gui/Dockerfile) - Multi-stage build with Nginx
- **Backend Docker:** [guad-gui/server/Dockerfile](guad-gui/server/Dockerfile) - Node Alpine with health checks
- **Dev Compose:** [docker-compose.yml](docker-compose.yml) - Local development setup
- **Prod Compose:** [docker-compose.prod.yml](docker-compose.prod.yml) - GHCR images for deployment
- **CI/CD Pipeline:** [.github/workflows/build-deploy.yml](.github/workflows/build-deploy.yml) - Build & push to registry

---

## Coding Conventions & Patterns

### React/JavaScript Style

1. **State Management**
   - Use `useReducer` for complex state (sensor data in [App.js](guad-gui/src/App.js))
   - Use `useState` for simple component state
   - `useCallback` for memoized functions (prevent re-renders)
   - `useRef` for mutable values and DOM references

2. **Component Structure**
   - Functional components with hooks (no class components)
   - Material-UI components: `<Box>`, `<Card>`, `<Typography>`, `<Button>`, etc.
   - Inline styles via MUI's `sx` prop
   - Tailwind classes for utility styling

3. **Naming Conventions**
   - React components: PascalCase ([FileWriter.js](guad-gui/src/components/FileWriter.js))
   - Functions/variables: camelCase (`handleSerialData`, `sensorData`)
   - Constants: SCREAMING_SNAKE_CASE (in sensor parsing)
   - CSS classes: kebab-case with Tailwind

4. **Error Handling**
   - Try-catch blocks with console.error logging
   - User-friendly error messages via console output
   - Graceful degradation (MongoDB toggle, serial reconnect)

### Backend/Express Style

1. **API Design**
   - RESTful endpoints (`/api/sensor-data`, `/api/health`)
   - JSON request/response bodies
   - HTTP status codes: 200 (success), 500 (error)
   - Consistent response format: `{ success: boolean, data/error: ... }`

2. **Middleware Chain**
   - CORS → JSON body parser → Route handlers
   - Error handling in async/await blocks
   - Environment variables via `dotenv`

3. **Database Patterns**
   - Native MongoDB driver (not Mongoose)
   - Connection pooling with MongoClient
   - Graceful shutdown on SIGINT/SIGTERM
   - Indexes on query fields (timestamp, packetType)

---

## Data Flow & Communication

### Serial Protocol (STM32 → Frontend/Bridge)

**Format:** `packetType: stateID,stateCode,healthStatus,value1,value2,...`

**Example:** `1: 123,3,1,0.1,0.2,0.3,45.6,78.9,12.3,-5.4,-8.7,9.1`

**Packet Types:**
- **1:** IMU Angular Velocity (9 values: rear x/y/z, center x/y/z, front x/y/z)
- **2:** IMU Acceleration (9 values: rear x/y/z, center x/y/z, front x/y/z)
- **3:** Gap Height (8 values: 4 lateral + 4 vertical sensors)
- **4:** Temperature (10 values: front hub 4, center hub 2, rear hub 4)
- **5:** Hall Effect (12 values: front 5, center 2, rear 5)

**Serial Config:**
- Port: `/dev/tty.usbmodem102` (STM32 Nucleo-F446RE)
- Baud: 115200
- Parser: Readline (newline-delimited)

### API Endpoints

**POST /api/sensor-data** - Save sensor data
```json
{
  "packetType": 1,
  "podState": "Levitation",
  "podHealth": true,
  "sensorData": { "packetType": 1, "stateCode": 3, "healthStatus": true, "values": [...] },
  "rawData": "1: 123,3,1,0.1,0.2,..."
}
```

**GET /api/sensor-data?limit=100&packetType=1** - Query recent data

**GET /api/sensor-data/range?startDate=2026-01-01&endDate=2026-02-01** - Date range query

**GET /api/health** - Health check (MongoDB connection status)

---

## State Machine (Pod States)

Managed in [App.js](guad-gui/src/App.js) with finite state machine:

**States:**
- Idle
- Low Levitation
- Levitation
- Braking
- Crawl
- Fault
- E-Stop
- Acceleration

**State Transitions:** Defined in `getPossibleTransitions()` function

**State Display:** Material-UI Chips showing current state + available transitions

---

## Development Workflow

### Local Development

**Frontend:**
```bash
cd guad-gui
npm install
npm start  # Runs on port 3000
```

**Backend:**
```bash
cd guad-gui/server
npm install
npm run dev  # Nodemon auto-restart on port 5000
```

**Serial Bridge (Optional):**
```bash
cd guad-gui/server
node serial-bridge.js  # Bridges hardware to API
```

### Docker Development

```bash
docker-compose up --build  # Builds & runs both services
# Frontend: http://localhost (port 80)
# Backend: http://localhost:5001
```

### Production Deployment

```bash
docker-compose -f docker-compose.prod.yml up -d
```

Uses pre-built images from GHCR:
- `ghcr.io/texasguadaloop-softwarecomms/guad-backend:latest`
- `ghcr.io/texasguadaloop-softwarecomms/guad-frontend:latest`

---

## Environment Variables

### Frontend ([guad-gui/.env](guad-gui/.env))
```env
REACT_APP_API_URL=http://localhost:5001/api
```

### Backend ([guad-gui/server/.env](guad-gui/server/.env))
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/
DB_NAME=guad_pod
PORT=5000
```

### Docker ([.env.docker.example](.env.docker.example))
```env
MONGODB_URI=mongodb+srv://...
NODE_ENV=production
```

---

## Key Features & Special Capabilities

### Web Serial API Integration
- Direct browser-to-hardware communication (no backend needed for real-time)
- `navigator.serial.requestPort()` for user port selection
- Bidirectional: Read sensor data, send commands to STM32
- Emergency stop on triple-space press (keyboard shortcut)

### MongoDB Toggle
- Optional database saving (toggle in UI)
- Real-time connection status indicator
- Health check via `/api/health` endpoint
- Graceful handling if MongoDB unavailable

### File Export System
- Browser File System API in [FileWriter.js](guad-gui/src/components/FileWriter.js)
- Export sensor data to CSV or TXT
- User selects save location via native file picker
- Append mode for continuous logging

### Real-time Visualization
- Recharts line graphs for time-series data
- Semi-circle progress bars for acceleration (MUI)
- Color-coded health status (green/red)
- Console output with timestamps (scrollable)

### Emergency Protocols
- Triple-space keypress triggers emergency stop
- Sends `EMERGENCY_STOP` command via serial
- Console logging for all safety events

---

## Code Modification Guidelines

### When Making Changes

1. **Always read files first** - Use Read tool before editing
2. **Provide diffs, not full rewrites** - Use Edit tool with old_string/new_string
3. **Follow existing patterns:**
   - React: Hooks, functional components, MUI components
   - Backend: async/await, try-catch, RESTful design
   - Naming: camelCase functions, PascalCase components
4. **Preserve styling:**
   - Material-UI `sx` prop for inline styles
   - Tailwind classes for utilities
   - Custom colors: `#4ade80` (green), `#f87171` (red)
5. **Error handling:** All async operations need try-catch
6. **Documentation:** Add JSDoc comments for complex functions
7. **No emojis** unless user explicitly requests

### Testing Changes

1. **Frontend:** Run `npm start` and test in browser with Web Serial
2. **Backend:** Run `npm run dev` and test API with curl/Postman
3. **Docker:** Run `docker-compose up --build` to test containerization
4. **Serial:** Connect STM32 via USB and verify data parsing

---

## MongoDB Schema Reference

**Collection:** `sensor_data` (in database `guad_pod`)

```javascript
{
  _id: ObjectId,
  timestamp: ISODate,           // Auto-generated on insert
  packetType: Number,           // 1-5
  podState: String,             // "Idle", "Levitation", etc.
  podHealth: Boolean,           // true/false
  sensorData: {
    packetType: Number,
    stateCode: Number,          // Pod state as integer
    healthStatus: Boolean,
    values: [Number]            // Sensor readings array
  },
  rawData: String               // Original serial string
}
```

**Indexes:**
- `{ timestamp: -1 }` - Descending for recent data queries
- `{ packetType: 1 }` - Filtering by sensor type

---

## Common Tasks & Patterns

### Adding a New Sensor Type

1. **Define packet type** - Add to STM32 firmware ([GUI.ino](GUI.ino))
2. **Update parser** - Add case in [App.js](guad-gui/src/App.js) `parseSerialData()`
3. **Add to state** - Extend `sensorDataReducer` initial state
4. **Update UI** - Add visualization component in [App.js](guad-gui/src/App.js)
5. **Document** - Update packet type comments

### Adding a New API Endpoint

1. **Define route** - Add to [server.js](guad-gui/server/server.js)
2. **Handle request** - Parse body, validate input
3. **MongoDB query** - Use `db.collection('sensor_data').find/insertOne/...`
4. **Return response** - `res.json({ success: true, data: ... })`
5. **Update service** - Add method to [mongoDBService.js](guad-gui/src/services/mongoDBService.js)

### Modifying Docker Configuration

1. **Update Dockerfile** - Change [guad-gui/Dockerfile](guad-gui/Dockerfile) or [server/Dockerfile](guad-gui/server/Dockerfile)
2. **Test build** - `docker build -t test-image .`
3. **Update compose** - Modify [docker-compose.yml](docker-compose.yml)
4. **Rebuild** - `docker-compose up --build`
5. **Verify** - Check health endpoints and logs

---

## Known Issues & Troubleshooting

### Serial Port Access
- **Issue:** "Port not found" or "Access denied"
- **Fix:** Check `/dev/tty.usbmodem*` permissions, reconnect USB, grant browser permissions

### MongoDB Connection
- **Issue:** "MongoError: connection timed out"
- **Fix:** Verify `MONGODB_URI` in `.env`, check network, confirm Atlas IP whitelist

### Docker Build Warnings
- **Issue:** ESLint warnings fail build
- **Fix:** Already resolved with `CI=false` in [Dockerfile](guad-gui/Dockerfile) (commit ebe366d)

### OpenSSL Legacy Provider
- **Issue:** React build fails with OpenSSL error
- **Fix:** Already handled with `--openssl-legacy-provider` flag in [package.json](guad-gui/package.json)

---

## Dependencies Reference

### Frontend Core
- **react** 18.2.0 - UI library
- **@mui/material** 5.11.15 - Component library
- **recharts** 2.5.0 - Charts
- **axios** 1.13.2 - HTTP client
- **@emotion/react** 11.10.6 - CSS-in-JS

### Backend Core
- **express** 4.18.2 - Web framework
- **mongodb** 6.3.0 - Database driver
- **serialport** 13.0.0 - Serial communication
- **cors** 2.8.5 - CORS middleware

### Dev Tools
- **react-scripts** 3.0.1 - CRA tooling
- **nodemon** 3.0.2 - Auto-restart
- **tailwindcss** 4.1.16 - Utility CSS

---

## Git Workflow

**Current Branch:** `Nikhil-GUI-Undockerized`
**Main Branch:** `main`

**Recent Changes:**
- Added MongoDB integration (777a798)
- Docker containerization (2f61a55)
- CI/CD pipeline (2f61a55)
- Serial bridge service (untracked)

**Commit Style:**
- Prefix: `feat:`, `fix:`, `docs:`, `chore:`
- Example: `feat: Add MongoDB integration with RESTful API backend`

---

## Contact & Resources

**Repository:** [GitHub - TexasGuadaloop/SoftwareComms](https://github.com/TexasGuadaloop-SoftwareComms/GUI)
**Documentation:** [MONGODB_SETUP.md](MONGODB_SETUP.md), [README.md](README.md)
**CI/CD:** GitHub Actions → GHCR
**Team:** Texas Guadaloop Software & Communications

---

## Quick Command Reference

```bash
# Local Development
npm start                          # Frontend (port 3000)
cd server && npm run dev           # Backend (port 5000)
node server/serial-bridge.js       # Serial bridge

# Docker
docker-compose up --build          # Dev build & run
docker-compose -f docker-compose.prod.yml up -d  # Prod run

# Testing
curl http://localhost:5001/api/health  # Backend health
curl http://localhost:5001/api/sensor-data?limit=10  # Query data

# Build
npm run build                      # Frontend production build
docker build -t guad-frontend ./guad-gui  # Frontend image
docker build -t guad-backend ./guad-gui/server  # Backend image
```

---

## Summary for AI Assistants

When assisting with this project:

1. **Read before editing** - Always use Read tool on files before modifications
2. **Follow conventions** - React hooks, async/await, RESTful design, camelCase/PascalCase
3. **Provide diffs** - Use Edit tool, not Write, for existing files
4. **Respect architecture** - Frontend (React) ↔ Backend (Express) ↔ Database (MongoDB)
5. **Test thoroughly** - Verify serial communication, API responses, Docker builds
6. **Document changes** - Update this file if adding major features
7. **Ask before applying** - Get user confirmation for significant changes

**Key Files to Know:**
- [App.js](guad-gui/src/App.js) - Main React component (1,110 lines)
- [server.js](guad-gui/server/server.js) - Express API server
- [mongoDBService.js](guad-gui/src/services/mongoDBService.js) - API client
- [docker-compose.yml](docker-compose.yml) - Container orchestration

This is a **production-grade IoT system** with real hardware integration. Handle with care and always verify serial protocol changes with hardware team.
