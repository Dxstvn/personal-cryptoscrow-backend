#!/bin/bash

echo "🚀 Deploying EscrowSwapComposer on all networks..."
echo ""

# Deploy on Sepolia
echo "1️⃣ Deploying on Sepolia..."
npx hardhat run scripts/deployEscrowComposer.js --network sepolia
echo ""

# Deploy on Polygon Amoy
echo "2️⃣ Deploying on Polygon Amoy..."
npx hardhat run scripts/deployEscrowComposer.js --network polygon-amoy
echo ""

# Deploy on Arbitrum Sepolia
echo "3️⃣ Deploying on Arbitrum Sepolia..."
npx hardhat run scripts/deployEscrowComposer.js --network arbitrum-sepolia
echo ""

echo "✅ All composers deployed!"
echo ""
echo "📝 Next steps:"
echo "1. If UniversalEscrowService is not deployed on Polygon/Arbitrum, deploy it first"
echo "2. Manually configure composers in escrow services if needed"
echo "3. Run the enhanced test: npx hardhat run scripts/testUniversalEscrowEnhanced.js --network sepolia"