const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function main() {
    console.log("\n🔍 Testing Simple Dispute Contract\n");
    
    const [deployer, buyer] = await ethers.getSigners();
    
    // Deploy simple contract
    const SimpleDispute = await ethers.getContractFactory("SimpleDisputeTest");
    const simple = await SimpleDispute.deploy();
    await simple.waitForDeployment();
    console.log("Simple contract deployed at:", await simple.getAddress());
    
    // Test
    const escrowId = ethers.id("test-escrow-1");
    const amount = ethers.parseEther("1");
    
    console.log("\n1. Creating escrow...");
    await simple.connect(buyer).createEscrow(escrowId, { value: amount });
    
    console.log("2. Raising dispute...");
    await simple.raiseDispute(escrowId);
    
    console.log("3. Fast forwarding 7+ days...");
    await time.increase(7 * 24 * 60 * 60 + 1);
    
    console.log("4. Returning funds...");
    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    
    const tx = await simple.returnFundsAfterTimeout(escrowId);
    await tx.wait();
    
    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const refund = buyerBalanceAfter - buyerBalanceBefore;
    
    console.log("✅ Success! Refunded:", ethers.formatEther(refund), "ETH");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });