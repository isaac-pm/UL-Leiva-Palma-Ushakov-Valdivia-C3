#!/bin/bash

# Define a cleanup function to prevent zombie processes and port hoarding
cleanup() {
    echo -e "\nTerminating servers..."
    kill $BACKEND_PID
    kill $FRONTEND_PID
    exit 0
}

# Trap SIGINT (Ctrl+C) and execute the cleanup function
trap cleanup SIGINT

# 1. Start the FastAPI backend
echo "Starting FastAPI backend..."
cd backend || exit 1
source venv/bin/activate
uvicorn main:app --reload &
BACKEND_PID=$!

# 2. Start the Vite React frontend
echo "Starting React frontend..."
cd ../frontend || exit 1
npm run dev &
FRONTEND_PID=$!

echo "Both servers are running. Press Ctrl+C to stop."

# Wait indefinitely for the background processes
wait