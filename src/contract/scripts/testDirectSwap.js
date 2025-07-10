const { ethers } = require("hardhat");

async function main() {
    console.log("\n🔍 Testing Direct Swap\n");
    
    const [deployer] = await ethers.getSigners();
    
    // Deploy tokens
    const MockWETH = await ethers.getContractFactory("contracts/mocks/MockWETH.sol:MockWETH");
    const weth = await MockWETH.deploy();
    await weth.waitForDeployment();
    
    const MockERC20 = await ethers.getContractFactory("contracts/mocks/MockERC20.sol:MockERC20");
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
    await usdc.waitForDeployment();
    
    // Deploy router
    const MockRouter = await ethers.getContractFactory("contracts/mocks/MockUniswapV2Router.sol:MockUniswapV2Router");
    const uniswapRouter = await MockRouter.deploy(await weth.getAddress());
    await uniswapRouter.waitForDeployment();
    
    // Add liquidity
    const routerAddress = await uniswapRouter.getAddress();
    // Deposit ETH to get WETH for the router
    await weth.deposit({ value: ethers.parseEther("1000") });
    await weth.transfer(routerAddress, ethers.parseEther("1000"));
    await usdc.mint(routerAddress, ethers.parseUnits("1000000", 6));
    
    // Send ETH to router for swaps
    await deployer.sendTransaction({
        to: routerAddress,
        value: ethers.parseEther("100")
    });
    
    console.log("Router deployed at:", routerAddress);
    console.log("WETH:", await weth.getAddress());
    console.log("USDC:", await usdc.getAddress());
    
    // Check router balances
    const routerETH = await ethers.provider.getBalance(routerAddress);
    const routerUSDC = await usdc.balanceOf(routerAddress);
    console.log("Router ETH balance:", ethers.formatEther(routerETH));
    console.log("Router USDC balance:", ethers.formatUnits(routerUSDC, 6));
    
    // Test direct swap
    console.log("\nTesting direct ETH -> USDC swap...");
    const swapAmount = ethers.parseEther("1");
    
    try {
        // Get expected output
        const path = [await weth.getAddress(), await usdc.getAddress()];
        const amounts = await uniswapRouter.getAmountsOut(swapAmount, path);
        console.log("Expected USDC output:", ethers.formatUnits(amounts[1], 6));
        
        // Perform swap
        const tx = await uniswapRouter.swapExactETHForTokens(
            0, // min amount out
            path,
            deployer.address,
            Math.floor(Date.now() / 1000) + 300,
            { value: swapAmount }
        );
        await tx.wait();
        
        const usdcBalance = await usdc.balanceOf(deployer.address);
        console.log("✅ Swap successful! Received:", ethers.formatUnits(usdcBalance, 6), "USDC");
    } catch (error) {
        console.log("❌ Swap failed:", error.message);
    }
    
    // Now test from a simple contract
    console.log("\nDeploying test contract...");
    const TestSwap = await ethers.getContractFactory("contracts/mocks/TestSwap.sol:TestSwap");
    const testSwap = await TestSwap.deploy(
        await weth.getAddress(),
        routerAddress
    );
    await testSwap.waitForDeployment();
    
    console.log("Test contract deployed at:", await testSwap.getAddress());
    
    try {
        console.log("\nTesting swap from contract...");
        const tx2 = await testSwap.testSwapETHForTokens(
            await usdc.getAddress(),
            { value: swapAmount }
        );
        await tx2.wait();
        
        const contractUSDC = await usdc.balanceOf(await testSwap.getAddress());
        console.log("✅ Contract swap successful! Received:", ethers.formatUnits(contractUSDC, 6), "USDC");
    } catch (error) {
        console.log("❌ Contract swap failed:", error.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });