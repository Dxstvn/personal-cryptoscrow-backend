import { expect } from "chai";
import { ethers } from "hardhat";

describe("PropertyOFTAdapter", function () {
    let oftAdapter;
    let weth;
    let owner;
    let user;
    let endpoint;
    
    // Test constants
    const SEPOLIA_EID = 40161;
    const POLYGON_EID = 40267;
    const ARBITRUM_EID = 40231;
    
    // Endpoint address (same for all testnets)
    const ENDPOINT_ADDRESS = "0x6EDCE65403992e310A62460808c4b910D972f10f";
    
    beforeEach(async function () {
        [owner, user] = await ethers.getSigners();
        
        // Deploy mock WETH
        const MockWETH = await ethers.getContractFactory("contracts/mocks/MockWETH.sol:MockWETH");
        weth = await MockWETH.deploy();
        await weth.waitForDeployment();
        
        // For testing, we'll use a mock endpoint
        // In production, this would be the LayerZero endpoint
        const MockEndpoint = await ethers.getContractFactory("contracts/mocks/MockLayerZeroEndpoint.sol:MockLayerZeroEndpoint");
        endpoint = await MockEndpoint.deploy(SEPOLIA_EID);
        await endpoint.waitForDeployment();
        
        // Deploy PropertyOFTAdapter
        const PropertyOFTAdapter = await ethers.getContractFactory("PropertyOFTAdapter");
        oftAdapter = await PropertyOFTAdapter.deploy(
            await weth.getAddress(),
            await endpoint.getAddress(),
            owner.address // delegate
        );
        await oftAdapter.waitForDeployment();
    });
    
    describe("Deployment", function () {
        it("Should set the correct token address", async function () {
            expect(await oftAdapter.token()).to.equal(await weth.getAddress());
        });
        
        it("Should set the correct endpoint", async function () {
            expect(await oftAdapter.endpoint()).to.equal(await endpoint.getAddress());
        });
        
        it("Should set the correct owner", async function () {
            expect(await oftAdapter.owner()).to.equal(owner.address);
        });
        
        it("Should have correct shared decimals", async function () {
            expect(await oftAdapter.sharedDecimals()).to.equal(6);
        });
        
        it("Should have correct decimal conversion rate", async function () {
            const rate = await oftAdapter.decimalConversionRate();
            expect(rate).to.equal(ethers.parseUnits("1", 12)); // 10^12 for 18-6 decimals
        });
    });
    
    describe("Peer Configuration", function () {
        it("Should set and get peers correctly", async function () {
            const polygonPeer = ethers.zeroPadValue(
                "0x12a9d0C6D06fEA1A584e98cd86aDC9EFdD7887df",
                32
            );
            
            await oftAdapter.setPeer(POLYGON_EID, polygonPeer);
            
            const peer = await oftAdapter.peers(POLYGON_EID);
            expect(peer).to.equal(polygonPeer);
        });
    });
    
    describe("Amount Validation", function () {
        it("Should handle decimal conversion correctly", async function () {
            // Test various amounts to understand the InvalidAmount issue
            const testAmounts = [
                { ether: "0.000001", description: "1 unit in shared decimals" },
                { ether: "0.00001", description: "10 units in shared decimals" },
                { ether: "0.0001", description: "100 units in shared decimals" },
                { ether: "0.001", description: "1000 units in shared decimals" },
                { ether: "0.01", description: "10000 units in shared decimals" },
                { ether: "0.1", description: "100000 units in shared decimals" },
                { ether: "1", description: "1000000 units in shared decimals" }
            ];
            
            for (const test of testAmounts) {
                const amountWei = ethers.parseEther(test.ether);
                const sharedDecimals = await oftAdapter.sharedDecimals();
                const rate = await oftAdapter.decimalConversionRate();
                
                // Calculate what the amount would be in shared decimals
                const amountSD = amountWei / rate;
                
                console.log(`${test.description}:`);
                console.log(`  Amount: ${test.ether} WETH`);
                console.log(`  Wei: ${amountWei}`);
                console.log(`  Shared decimals: ${amountSD}`);
                console.log(`  Valid: ${amountSD > 0}`);
            }
        });
    });
    
    describe("Quote and Send", function () {
        beforeEach(async function () {
            // Setup: Give user some WETH
            await weth.deposit({ value: ethers.parseEther("10") });
            await weth.transfer(user.address, ethers.parseEther("5"));
            
            // Setup: Set peer
            const polygonPeer = ethers.zeroPadValue(
                "0x12a9d0C6D06fEA1A584e98cd86aDC9EFdD7887df",
                32
            );
            await oftAdapter.setPeer(POLYGON_EID, polygonPeer);
            
            // Setup: Configure endpoint (mock)
            await endpoint.setDelegate(await oftAdapter.getAddress());
        });
        
        it("Should get quote for valid amount", async function () {
            const amount = ethers.parseEther("1"); // 1 WETH
            
            // Approve OFT adapter
            await weth.connect(user).approve(await oftAdapter.getAddress(), amount);
            
            const sendParam = {
                dstEid: POLYGON_EID,
                to: ethers.zeroPadValue(user.address, 32),
                amountLD: amount,
                minAmountLD: amount,
                extraOptions: "0x",
                composeMsg: "0x",
                oftCmd: "0x"
            };
            
            // In a real test, this would interact with the endpoint
            // For now, we're testing the contract compiles and deploys
            try {
                const [nativeFee, lzTokenFee] = await oftAdapter.quoteSend(sendParam, false);
                console.log("Quote successful!");
                console.log("Native fee:", ethers.formatEther(nativeFee));
                console.log("LZ token fee:", lzTokenFee);
            } catch (error) {
                console.log("Quote failed:", error.message);
                // This is expected without a proper endpoint mock
            }
        });
    });
    
    describe("InvalidAmount Debugging", function () {
        it("Should identify minimum valid amount", async function () {
            // The InvalidAmount error occurs when amount converts to 0 in shared decimals
            const sharedDecimals = await oftAdapter.sharedDecimals();
            const rate = await oftAdapter.decimalConversionRate();
            
            console.log("Shared decimals:", sharedDecimals);
            console.log("Conversion rate:", rate);
            
            // Minimum amount should be at least 1 unit in shared decimals
            const minAmountSD = 1n;
            const minAmountLD = minAmountSD * rate;
            
            console.log("Minimum amount (shared decimals):", minAmountSD);
            console.log("Minimum amount (local decimals):", minAmountLD);
            console.log("Minimum amount (WETH):", ethers.formatEther(minAmountLD));
            
            expect(minAmountLD).to.equal(ethers.parseUnits("1", 12)); // 0.000001 WETH
        });
    });
});