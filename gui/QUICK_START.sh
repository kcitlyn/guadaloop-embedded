#!/bin/bash

# Quick Start Script for Testing GUAD Pod System
# This script helps you start all components easily

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║       GUAD Pod Telemetry System - Quick Start         ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Function to check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
if ! command_exists node; then
  echo "❌ Node.js is not installed!"
  echo "   Install from: https://nodejs.org"
  exit 1
fi

if ! command_exists npm; then
  echo "❌ npm is not installed!"
  exit 1
fi

echo "✅ Node.js and npm are installed"
echo ""

# Check if we're in the right directory
if [ ! -d "guad-gui" ]; then
  echo "❌ Please run this script from the GUI project root directory"
  echo "   Current directory: $(pwd)"
  exit 1
fi

echo "Choose testing mode:"
echo ""
echo "  1) Simulator Mode (No hardware needed)"
echo "  2) STM32 Hardware Mode"
echo "  3) Just start Backend"
echo "  4) Just start Frontend"
echo ""
read -p "Enter choice (1-4): " choice

case $choice in
  1)
    echo ""
    echo "🎲 Starting Simulator Mode..."
    echo ""
    echo "This will start:"
    echo "  - Backend API server (port 5001)"
    echo "  - Data simulator (generates test packets)"
    echo "  - Frontend (port 3000)"
    echo ""
    echo "Press Ctrl+C in each terminal to stop"
    echo ""

    # Check if dependencies are installed
    if [ ! -d "guad-gui/node_modules" ]; then
      echo "📦 Installing frontend dependencies..."
      cd guad-gui && npm install && cd ..
    fi

    if [ ! -d "guad-gui/server/node_modules" ]; then
      echo "📦 Installing backend dependencies..."
      cd guad-gui/server && npm install && cd ../..
    fi

    echo ""
    echo "Opening terminals..."
    echo ""

    # macOS
    if [[ "$OSTYPE" == "darwin"* ]]; then
      osascript -e 'tell app "Terminal" to do script "cd \"'"$(pwd)"'/guad-gui/server\" && echo \"🔧 Starting Backend Server...\" && npm start"'
      sleep 2
      osascript -e 'tell app "Terminal" to do script "cd \"'"$(pwd)"'/guad-gui/server\" && echo \"🎲 Starting Data Simulator...\" && echo \"\" && echo \"Waiting for backend to start...\" && sleep 3 && node testing/serial-simulator.js 500"'
      sleep 2
      osascript -e 'tell app "Terminal" to do script "cd \"'"$(pwd)"'/guad-gui\" && echo \"🌐 Starting Frontend...\" && echo \"\" && echo \"Waiting for backend to start...\" && sleep 3 && npm start"'

      echo "✅ Three terminal windows opened!"
      echo ""
      echo "Wait ~10 seconds, then open: http://localhost:3000"

    # Linux with gnome-terminal
    elif command_exists gnome-terminal; then
      gnome-terminal -- bash -c "cd guad-gui/server && echo '🔧 Starting Backend Server...' && npm start; exec bash"
      sleep 2
      gnome-terminal -- bash -c "cd guad-gui/server && echo '🎲 Starting Data Simulator...' && sleep 3 && node testing/serial-simulator.js 500; exec bash"
      sleep 2
      gnome-terminal -- bash -c "cd guad-gui && echo '🌐 Starting Frontend...' && sleep 3 && npm start; exec bash"

      echo "✅ Three terminal windows opened!"
      echo ""
      echo "Wait ~10 seconds, then open: http://localhost:3000"

    else
      echo "⚠️  Could not auto-open terminals on this system"
      echo ""
      echo "Please open 3 terminal windows manually and run:"
      echo ""
      echo "Terminal 1:"
      echo "  cd guad-gui/server"
      echo "  npm start"
      echo ""
      echo "Terminal 2:"
      echo "  cd guad-gui/server"
      echo "  node testing/serial-simulator.js 500"
      echo ""
      echo "Terminal 3:"
      echo "  cd guad-gui"
      echo "  npm start"
      echo ""
      echo "Then open: http://localhost:3000"
    fi
    ;;

  2)
    echo ""
    echo "🔌 STM32 Hardware Mode"
    echo ""
    echo "Step 1: Find your STM32 serial port"
    cd guad-gui/server
    node testing/serial-port-list.js
    echo ""
    echo "Step 2: Copy the port path (e.g., /dev/tty.usbmodem14203)"
    read -p "Enter serial port path: " serial_port

    if [ -z "$serial_port" ]; then
      echo "❌ No port entered. Exiting."
      exit 1
    fi

    echo ""
    echo "Step 3: Testing serial connection..."
    echo "Press Ctrl+C after you see data packets"
    echo ""
    sleep 2

    node testing/serial-monitor.js "$serial_port" 115200

    echo ""
    read -p "Did you see data packets? (y/n): " saw_data

    if [ "$saw_data" != "y" ]; then
      echo ""
      echo "⚠️  Troubleshooting:"
      echo "  1. Check STM32 is connected via USB"
      echo "  2. Check STM32 firmware is running"
      echo "  3. Verify baud rate is 115200"
      echo "  4. Try a different USB cable"
      exit 1
    fi

    echo ""
    echo "✅ Serial connection working!"
    echo ""
    echo "Step 4: Update serial-bridge.js with your port"
    echo ""

    # Update the serial port in serial-bridge.js
    sed -i.bak "s|const SERIAL_PORT = '.*';|const SERIAL_PORT = '$serial_port';|" serial-bridge.js

    echo "Updated serial-bridge.js to use: $serial_port"
    echo ""
    echo "Step 5: Starting full system..."
    echo ""

    cd ../..

    # Open terminals based on OS
    if [[ "$OSTYPE" == "darwin"* ]]; then
      osascript -e 'tell app "Terminal" to do script "cd \"'"$(pwd)"'/guad-gui/server\" && echo \"🔧 Starting Backend Server...\" && npm start"'
      sleep 2
      osascript -e 'tell app "Terminal" to do script "cd \"'"$(pwd)"'/guad-gui/server\" && echo \"🔌 Starting Serial Bridge...\" && sleep 3 && node serial-bridge.js"'
      sleep 2
      osascript -e 'tell app "Terminal" to do script "cd \"'"$(pwd)"'/guad-gui\" && echo \"🌐 Starting Frontend...\" && sleep 3 && npm start"'

      echo "✅ Three terminal windows opened!"

    elif command_exists gnome-terminal; then
      gnome-terminal -- bash -c "cd guad-gui/server && npm start; exec bash"
      sleep 2
      gnome-terminal -- bash -c "cd guad-gui/server && sleep 3 && node serial-bridge.js; exec bash"
      sleep 2
      gnome-terminal -- bash -c "cd guad-gui && sleep 3 && npm start; exec bash"

      echo "✅ Three terminal windows opened!"

    else
      echo "Please open 3 terminals and run:"
      echo ""
      echo "Terminal 1: cd guad-gui/server && npm start"
      echo "Terminal 2: cd guad-gui/server && node serial-bridge.js"
      echo "Terminal 3: cd guad-gui && npm start"
    fi

    echo ""
    echo "Wait ~10 seconds, then open: http://localhost:3000"
    echo ""
    echo "You should see LIVE data from your STM32!"
    ;;

  3)
    echo ""
    echo "🔧 Starting Backend only..."
    cd guad-gui/server
    npm start
    ;;

  4)
    echo ""
    echo "🌐 Starting Frontend only..."
    cd guad-gui
    npm start
    ;;

  *)
    echo "❌ Invalid choice"
    exit 1
    ;;
esac
