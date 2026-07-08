#!/bin/bash

# Backend Setup & Run
echo "Checking Budgiebudget Backend..."
cd backend

# Build backend if it doesn't exist
if [ ! -f "build/budgie_backend" ]; then
  echo "Backend executable not found or build corrupted. Doing a clean build..."
  rm -rf build
  mkdir -p build
  cd build
  cmake ..
  make
  cd ..
fi

echo "Starting Budgiebudget Backend..."
chmod +x run_backend_raw.sh
./run_backend_raw.sh &
BACKEND_PID=$!
cd ..

# Frontend Setup & Run
echo "Checking Budgiebudget Frontend..."
cd frontend

# Always ensure modules are fully installed to catch missing packages like react-scripts
echo "Ensuring frontend dependencies are installed..."
npm install

echo "Starting Budgiebudget Frontend..."
npm start &
FRONTEND_PID=$!
cd ..

echo "======================================"
echo "Both services are running in the background."
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo "Press Ctrl+C to stop both services."
echo "======================================"

# Handle shutdown gracefully
trap "echo -e '\nShutting down services...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM

# Wait for both background processes to finish
wait
