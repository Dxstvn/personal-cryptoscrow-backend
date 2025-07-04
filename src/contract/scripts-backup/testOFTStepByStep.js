import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Testing OFT Step by Step ===\n");
    
    const [signer] = await ethers.getSigners();
    console.log("Testing with account:", signer.address);
    
    // Step 1: Get contracts
    console.log("Step 1: Getting contracts...");
    const adapterAddress = "0x90653738e66A0fa93BF20b087e6A39A704FA39e1";
    const adapter = await ethers.getContractAt(
        "PropertyOFTAdapter",
        adapterAddress
    );
    
    const weth = await ethers.getContractAt(
        ["function deposit() payable",
         "function balanceOf(address) view returns (uint256)",
         "function approve(address, uint256) returns (bool)",
         "function allowance(address, address) view returns (uint256)",
         "function decimals() view returns (uint8)"],
        await adapter.token()
    );
    
    console.log("✅ Adapter:", adapter.target);
    console.log("✅ Token:", await weth.getAddress());
    
    // Step 2: Check configuration
    console.log("\nStep 2: Checking configuration...");
    const polygonEid = 40267;
    const peer = await adapter.peers(polygonEid);
    const enforcedOptions = await adapter.enforcedOptions(polygonEid, 1);
    
    console.log("✅ Peer set:", peer !== ethers.ZeroAddress);
    console.log("✅ Enforced options set:", enforcedOptions !== "0x");
    
    // Step 3: Prepare tokens
    console.log("\nStep 3: Preparing tokens...");
    const amount = ethers.parseEther("0.1");
    
    const balance = await weth.balanceOf(signer.address);
    if (balance < amount) {
        console.log("Wrapping ETH...");
        const tx = await weth.deposit({ value: amount });
        await tx.wait();
    }
    
    const allowance = await weth.allowance(signer.address, adapter.target);
    if (allowance < amount) {
        console.log("Approving tokens...");
        const tx = await weth.approve(adapter.target, amount);
        await tx.wait();
    }
    
    console.log("✅ Balance:", ethers.formatEther(await weth.balanceOf(signer.address)));
    console.log("✅ Allowance:", ethers.formatEther(await weth.allowance(signer.address, adapter.target)));
    
    // Step 4: Try different quoteSend approaches
    console.log("\nStep 4: Testing quoteSend...");
    
    // Test A: Basic parameters
    console.log("\nTest A: Basic send parameters");
    const basicParams = {
        dstEid: polygonEid,
        to: ethers.zeroPadValue(signer.address, 32),
        amountLD: amount,
        minAmountLD: amount,
        extraOptions: "0x",
        composeMsg: "0x",
        oftCmd: "0x"
    };
    
    try {
        const result = await adapter.quoteSend.staticCall(basicParams, false);
        console.log("✅ Quote successful! Fee:", ethers.formatEther(result[0]));
        return; // Success!
    } catch (e) {
        console.log("❌ Failed:", e.message.substring(0, 50) + "...");
        if (e.data) {
            console.log("   Error code:", e.data.substring(0, 10));
        }
    }
    
    // Test B: Try with enforced options
    console.log("\nTest B: With enforced options as extraOptions");
    const paramsWithOptions = {
        ...basicParams,
        extraOptions: enforcedOptions
    };
    
    try {
        const result = await adapter.quoteSend.staticCall(paramsWithOptions, false);
        console.log("✅ Quote successful! Fee:", ethers.formatEther(result[0]));
        return; // Success!
    } catch (e) {
        console.log("❌ Failed:", e.message.substring(0, 50) + "...");
    }
    
    // Test C: Check if it's an endpoint issue
    console.log("\nTest C: Checking endpoint directly");
    const endpoint = await ethers.getContractAt(
        ["function quote(tuple(uint32 dstEid, bytes32 receiver, bytes message, bytes options, bool payInLzToken) params, address sender) view returns (tuple(uint256 nativeFee, uint256 lzTokenFee) fee)"],
        await adapter.endpoint()
    );
    
    // Build a simple message
    const message = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "uint256"],
        [ethers.zeroPadValue(signer.address, 32), amount]
    );
    
    const endpointParams = {
        dstEid: polygonEid,
        receiver: peer,
        message: message,
        options: enforcedOptions || "0x",
        payInLzToken: false
    };
    
    try {
        const result = await endpoint.quote(endpointParams, adapter.target);
        console.log("✅ Endpoint quote works! Fee:", ethers.formatEther(result.nativeFee));
        console.log("\nThis suggests the issue is in the OFT adapter's quoteSend implementation");
    } catch (e) {
        console.log("❌ Endpoint quote also failed:", e.message.substring(0, 50) + "...");
    }
    
    // Step 5: Analysis
    console.log("\n=== Analysis ===");
    console.log("Error code 0x6592671c might indicate:");
    console.log("1. Missing configuration in the OFT adapter");
    console.log("2. Issue with message encoding");
    console.log("3. Problem with the adapter's internal state");
    
    // Try to get more info
    console.log("\nChecking adapter state:");
    try {
        // Check if there's an approvalRequired flag
        const approvalRequired = await adapter.approvalRequired();
        console.log("Approval required:", approvalRequired);
    } catch {
        console.log("No approvalRequired function");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    });