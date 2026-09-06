#!/bin/bash

echo "Starting GUAD Pod MongoDB Integration..."
echo ""

# Check if .env exists in server directory
if [ ! -f "guad-gui/server/.env" ]; then
    echo "⚠️  Warning: server/.env file not found!"
    echo "Please create it from .env.example and add your MongoDB connection string"
    exit 1
fi

# Start backend server in background
echo "🚀 Starting backend server..."
cd guad-gui/server
npm start &
SERVER_PID=$!
cd ../..

# Wait a bit for server to start
sleep 3

# Start React app
echo "🚀 Starting React app..."
cd guad-gui
npm start &
REACT_PID=$!
cd ..

echo ""
echo "✅ Both servers started!"
echo "Backend PID: $SERVER_PID"
echo "React PID: $REACT_PID"
echo ""
echo "Press Ctrl+C to stop both servers"

# Wait for user to press Ctrl+C
trap "kill $SERVER_PID $REACT_PID; exit" INT
wait
