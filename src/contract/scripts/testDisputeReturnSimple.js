const { ethers } = require("hardhat");

async function main() {
    console.log("Testing returnFundsAfterDisputeTimeout with minimal setup...\n");
    
    // First compile and get the artifacts
    await hre.run("compile");
    
    const [deployer, buyer, seller] = await ethers.getSigners();
    
    // Deploy a simple test contract that inherits from Disputes
    const testContractCode = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "./contracts/UniversalEscrowServiceV3Disputes.sol";

contract TestDisputes is UniversalEscrowServiceV3Disputes {
    constructor(address _serviceWallet, address _weth, address _uniswapRouter) 
        UniversalEscrowServiceV3Disputes(_serviceWallet, _weth, _uniswapRouter) {}
    
    // Add a simple test function to create an escrow for testing
    function createTestEscrow(address seller) external payable returns (bytes32) {
        bytes32 escrowId = keccak256(abi.encodePacked(msg.sender, seller, block.timestamp));
        
        escrows[escrowId] = EscrowDeposit({
            buyer: msg.sender,
            seller: seller,
            depositAmount: msg.value,
            depositToken: address(0),
            targetChainId: block.chainid,
            targetSeller: seller,
            targetToken: address(0),
            conditionMet: false,
            released: false,
            description: "Test escrow"
        });
        
        return escrowId;
    }
    
    // Function to directly test the transfer
    function testDirectTransfer(address recipient, uint256 amount) external {
        payable(recipient).transfer(amount);
    }
}
    `;
    
    // Write the test contract
    const fs = require("fs");
    fs.writeFileSync("./contracts/TestDisputes.sol", testContractCode);
    
    console.log("Compiling test contract...");
    await hre.run("compile");
    
    // Deploy mock dependencies
    const MockWETH = await ethers.getContractFactory("MockWETH");
    const weth = await MockWETH.deploy();
    await weth.waitForDeployment();
    
    const MockRouter = await ethers.getContractFactory("MockUniswapV2Router");
    const router = await MockRouter.deploy(await weth.getAddress());
    await router.waitForDeployment();
    
    // Deploy test contract
    const TestContract = await ethers.getContractFactory("TestDisputes");
    const testContract = await TestContract.deploy(
        deployer.address,
        await weth.getAddress(),
        await router.getAddress()
    );
    await testContract.waitForDeployment();
    
    console.log("Test contract deployed to:", await testContract.getAddress());
    
    // Test 1: Direct transfer test
    console.log("\nTest 1: Testing direct transfer...");
    try {
        await testContract.testDirectTransfer(buyer.address, 0, { value: ethers.parseEther("1") });
        console.log("✅ Direct transfer works");
    } catch (error) {
        console.error("❌ Direct transfer failed:", error.message);
    }
    
    // Test 2: Create escrow and test dispute return
    console.log("\nTest 2: Creating test escrow...");
    const depositAmount = ethers.parseEther("1.0");
    const createTx = await testContract.connect(buyer).createTestEscrow(seller.address, { value: depositAmount });
    const createReceipt = await createTx.wait();
    
    // Get escrow ID from logs or calculate it
    const escrowId = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "address", "uint256"],
            [buyer.address, seller.address, createReceipt.blockNumber]
        )
    );
    
    console.log("Escrow ID:", escrowId);
    
    // Set up dispute
    console.log("\nSetting up dispute...");
    // First mark condition as met (required for dispute)
    await testContract.updateConditionWithDispute(escrowId, true);
    
    // Raise dispute
    await testContract.connect(buyer).raiseDispute(escrowId, "Test dispute");
    
    // Fast forward time
    await ethers.provider.send("evm_increaseTime", [8 * 24 * 60 * 60]);
    await ethers.provider.send("evm_mine");
    
    // Get buyer balance before
    const balanceBefore = await ethers.provider.getBalance(buyer.address);
    console.log("Buyer balance before:", ethers.formatEther(balanceBefore));
    
    // Try to return funds
    console.log("\nAttempting returnFundsAfterDisputeTimeout...");
    try {
        const returnTx = await testContract.connect(buyer).returnFundsAfterDisputeTimeout(escrowId);
        const receipt = await returnTx.wait();
        
        console.log("✅ Transaction successful!");
        console.log("Gas used:", receipt.gasUsed.toString());
        
        const balanceAfter = await ethers.provider.getBalance(buyer.address);
        console.log("Buyer balance after:", ethers.formatEther(balanceAfter));
        
        // Check events
        console.log("\nEvents emitted:");
        for (const log of receipt.logs) {
            try {
                const parsed = testContract.interface.parseLog(log);
                console.log(`- ${parsed.name}:`, parsed.args);
            } catch (e) {
                // Skip unparseable logs
            }
        }
    } catch (error) {
        console.error("❌ returnFundsAfterDisputeTimeout failed!");
        console.error("Error:", error.message);
        
        if (error.data) {
            console.error("Error data:", error.data);
        }
    }
    
    // Clean up
    fs.unlinkSync("./contracts/TestDisputes.sol");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });