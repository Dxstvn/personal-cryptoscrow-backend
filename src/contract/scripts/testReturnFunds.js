const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function main() {
    console.log("\n🔍 Testing Return Funds After Dispute Timeout\n");
    
    const [deployer, buyer, seller] = await ethers.getSigners();
    
    // Deploy minimal setup
    const MockWETH = await ethers.getContractFactory("contracts/mocks/MockWETH.sol:MockWETH");
    const weth = await MockWETH.deploy();
    await weth.waitForDeployment();
    
    const MockRouter = await ethers.getContractFactory("contracts/mocks/MockUniswapV2Router.sol:MockUniswapV2Router");
    const uniswapRouter = await MockRouter.deploy(await weth.getAddress());
    await uniswapRouter.waitForDeployment();
    
    // Deploy V3 contract
    console.log("Deploying V3 contract...");
    const Escrow = await ethers.getContractFactory("UniversalEscrowServiceV3Disputes");
    const escrow = await Escrow.deploy(
        deployer.address,
        await weth.getAddress(),
        await uniswapRouter.getAddress()
    );
    await escrow.waitForDeployment();
    console.log("✅ Contract deployed at:", await escrow.getAddress());
    
    // Test 1: Simple ETH escrow with dispute timeout
    console.log("\nTest 1: ETH Escrow with Dispute Timeout");
    console.log("========================================");
    
    const amount = ethers.parseEther("1");
    
    // Create escrow
    console.log("1. Creating ETH escrow...");
    const tx1 = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress,
        amount,
        ethers.ZeroAddress,
        31337,
        { value: amount }
    );
    const receipt1 = await tx1.wait();
    
    let escrowId;
    for (const log of receipt1.logs) {
        try {
            const parsed = escrow.interface.parseLog(log);
            if (parsed && parsed.name === "EscrowCreated") {
                escrowId = parsed.args[0];
                break;
            }
        } catch (e) {}
    }
    console.log("✅ Escrow created:", escrowId);
    
    // Update condition
    console.log("\n2. Marking conditions met...");
    await escrow.connect(deployer).updateConditionWithDispute(escrowId, true);
    
    // Raise dispute
    console.log("3. Raising dispute...");
    await escrow.connect(buyer).raiseDispute(escrowId, "Test dispute");
    
    // Fast forward
    console.log("4. Fast forwarding 7+ days...");
    await time.increase(7 * 24 * 60 * 60 + 1);
    
    // Check escrow data before
    const escrowBefore = await escrow.escrows(escrowId);
    console.log("\nEscrow state before:");
    console.log("- Released:", escrowBefore.released);
    console.log("- Deposit amount:", ethers.formatEther(escrowBefore.depositAmount));
    
    // Try to return funds
    console.log("\n5. Calling returnFundsAfterDisputeTimeout...");
    
    // Let's first check what functions exist on the contract
    const contractInterface = escrow.interface;
    const returnFundsFunction = contractInterface.getFunction("returnFundsAfterDisputeTimeout");
    console.log("Function selector:", returnFundsFunction.selector);
    
    try {
        const gasEstimate = await escrow.returnFundsAfterDisputeTimeout.estimateGas(escrowId);
        console.log("Gas estimate:", gasEstimate.toString());
        
        const tx2 = await escrow.returnFundsAfterDisputeTimeout(escrowId, { gasLimit: gasEstimate * 2n });
        console.log("Transaction hash:", tx2.hash);
        const receipt2 = await tx2.wait();
        console.log("✅ Funds returned successfully!");
        
        // Check escrow after
        const escrowAfter = await escrow.escrows(escrowId);
        console.log("\nEscrow state after:");
        console.log("- Released:", escrowAfter.released);
    } catch (error) {
        console.error("❌ Error:", error.message);
        
        // Try to decode the error
        if (error.data) {
            try {
                const decodedError = contractInterface.parseError(error.data);
                console.log("Decoded error:", decodedError);
            } catch (e) {
                console.log("Could not decode error");
            }
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });