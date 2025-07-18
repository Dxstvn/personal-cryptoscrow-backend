#!/bin/bash

# Script to run tests with Hardhat node

echo "🚀 Starting Hardhat node..."

# Check if port 8545 is already in use
if lsof -Pi :8545 -sTCP:LISTEN -t >/dev/null ; then
    echo "✅ Hardhat node already running on port 8545"
else
    echo "Starting new Hardhat node..."
    cd src/contract && npx hardhat node --port 8545 > /tmp/hardhat.log 2>&1 &
    HARDHAT_PID=$!
    
    # Wait for Hardhat to start
    echo "Waiting for Hardhat to start..."
    for i in {1..30}; do
        if curl -s http://localhost:8545 > /dev/null; then
            echo "✅ Hardhat node started successfully"
            break
        fi
        if [ $i -eq 30 ]; then
            echo "❌ Failed to start Hardhat node"
            cat /tmp/hardhat.log
            exit 1
        fi
        sleep 1
    done
fi

# Run the test
echo "🧪 Running real-time sync tests..."
npm run test:realtime-sync

# Cleanup (optional - comment out if you want to keep Hardhat running)
# if [ ! -z "$HARDHAT_PID" ]; then
#     echo "🛑 Stopping Hardhat node..."
#     kill $HARDHAT_PID 2>/dev/null
# fi