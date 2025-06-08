#!/bin/bash

# run-e2e-tests.sh
# Script to run E2E tests with all necessary services

echo "🚀 Starting E2E Test Environment..."

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if a port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null ; then
        return 0
    else
        return 1
    fi
}

# Function to wait for a service to be ready
wait_for_service() {
    local port=$1
    local service=$2
    local max_attempts=30
    local attempt=0
    
    echo -e "${YELLOW}Waiting for $service on port $port...${NC}"
    
    while ! check_port $port; do
        attempt=$((attempt + 1))
        if [ $attempt -ge $max_attempts ]; then
            echo -e "${RED}❌ $service failed to start on port $port${NC}"
            return 1
        fi
        sleep 1
    done
    
    echo -e "${GREEN}✅ $service is ready on port $port${NC}"
    return 0
}

# Kill any existing processes on our ports
echo "🧹 Cleaning up existing processes..."
for port in 5173 8545 9099 5004 9199; do
    if check_port $port; then
        echo "Killing process on port $port..."
        kill-port $port 2>/dev/null || lsof -ti:$port | xargs kill -9 2>/dev/null
    fi
done

# Start Firebase Emulators
echo -e "\n${YELLOW}Starting Firebase Emulators...${NC}"
firebase emulators:start > firebase-emulator.log 2>&1 &
FIREBASE_PID=$!

# Wait for Firebase emulators to be ready
wait_for_service 9099 "Firebase Auth Emulator"
wait_for_service 5004 "Firestore Emulator"
wait_for_service 9199 "Firebase Storage Emulator"

# Start Hardhat Node
echo -e "\n${YELLOW}Starting Hardhat Node...${NC}"
cd src/contract && npx hardhat node > ../../hardhat-node.log 2>&1 &
HARDHAT_PID=$!
cd ../..

# Wait for Hardhat to be ready
wait_for_service 8545 "Hardhat Node"

# Run E2E tests
echo -e "\n${YELLOW}Running E2E Tests...${NC}"
NODE_ENV=e2e_test NODE_OPTIONS=--experimental-vm-modules FIRESTORE_EMULATOR_HOST=localhost:5004 FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 RPC_URL=http://localhost:8545 npm run test:e2e

TEST_EXIT_CODE=$?

# Cleanup
echo -e "\n🧹 Cleaning up..."
kill $FIREBASE_PID 2>/dev/null
kill $HARDHAT_PID 2>/dev/null

# Kill any remaining processes on our ports
for port in 5173 8545 9099 5004 9199; do
    if check_port $port; then
        lsof -ti:$port | xargs kill -9 2>/dev/null
    fi
done

# Show logs if tests failed
if [ $TEST_EXIT_CODE -ne 0 ]; then
    echo -e "\n${RED}❌ Tests failed! Showing recent logs:${NC}"
    echo -e "\n${YELLOW}Firebase Emulator logs:${NC}"
    tail -n 50 firebase-emulator.log
    echo -e "\n${YELLOW}Hardhat Node logs:${NC}"
    tail -n 50 hardhat-node.log
fi

# Clean up log files
rm -f firebase-emulator.log hardhat-node.log

exit $TEST_EXIT_CODE 