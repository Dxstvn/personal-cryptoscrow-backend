import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Complete OFT Adapter Setup Check ===\n");
    
    const [signer] = await ethers.getSigners();
    console.log("Checking with account:", signer.address);
    
    // Hardcode addresses
    const adapterAddress = "0x90653738e66A0fa93BF20b087e6A39A704FA39e1";
    const polygonEid = 40267;
    
    // Get adapter contract
    const adapter = await ethers.getContractAt(
        "PropertyOFTAdapter",
        adapterAddress
    );
    
    console.log("Standard OFT Adapter:", adapter.target);
    
    // 1. Check basic configuration
    console.log("\n1. Basic Configuration:");
    const token = await adapter.token();
    const endpoint = await adapter.endpoint();
    const owner = await adapter.owner();
    
    console.log("   Token:", token);
    console.log("   Endpoint:", endpoint);
    console.log("   Owner:", owner);
    
    // 2. Check peers
    console.log("\n2. Peer Configuration:");
    const polygonPeer = await adapter.peers(polygonEid);
    console.log("   Polygon peer:", polygonPeer);
    console.log("   Is set:", polygonPeer !== ethers.ZeroAddress);
    
    // 3. Check enforced options
    console.log("\n3. Enforced Options:");
    const options = await adapter.enforcedOptions(polygonEid, 1);
    console.log("   Options:", options);
    
    // 4. Check endpoint configuration
    console.log("\n4. Endpoint Configuration:");
    const endpointContract = await ethers.getContractAt(
        ["function delegates(address) view returns (address)",
         "function defaultSendLibrary(uint32) view returns (address)",
         "function getSendLibrary(address,uint32) view returns (address)",
         "function defaultReceiveLibrary(uint32) view returns (address)",
         "function getReceiveLibrary(address,uint32) view returns (address)"],
        endpoint
    );
    
    const delegate = await endpointContract.delegates(adapter.target);
    console.log("   Delegate:", delegate);
    
    try {
        const defaultSendLib = await endpointContract.defaultSendLibrary(polygonEid);
        console.log("   Default Send Library:", defaultSendLib);
        
        const sendLib = await endpointContract.getSendLibrary(adapter.target, polygonEid);
        console.log("   Adapter Send Library:", sendLib);
        console.log("   Using default:", sendLib === defaultSendLib);
    } catch (e) {
        console.log("   Library check error:", e.message);
    }
    
    // 5. Try a manual quote
    console.log("\n5. Manual Quote Test:");
    try {
        // Build message for OFT transfer
        const toAddress = ethers.zeroPadValue(signer.address, 32);
        const amountLD = ethers.parseEther("0.0001");
        const minAmountLD = amountLD;
        
        // Encode OFT message - this should match what OFTAdapter expects
        const composeMsg = "0x";
        
        // Try getting quote using endpoint directly
        const endpointQuoteABI = [
            "function quote(tuple(uint32 dstEid, bytes32 receiver, bytes message, bytes options, bool payInLzToken) params, address sender) view returns (tuple(uint256 nativeFee, uint256 lzTokenFee) fee)"
        ];
        
        const endpointQuote = new ethers.Contract(endpoint, endpointQuoteABI, signer);
        
        // Build OFT message format
        const message = ethers.AbiCoder.defaultAbiCoder().encode(
            ["bytes32", "uint256", "bytes"],
            [toAddress, amountLD, composeMsg]
        );
        
        const quoteParams = {
            dstEid: polygonEid,
            receiver: polygonPeer,
            message: message,
            options: options || "0x",
            payInLzToken: false
        };
        
        const fee = await endpointQuote.quote(quoteParams, adapter.target);
        console.log("   ✅ Endpoint quote success!");
        console.log("   Native fee:", ethers.formatEther(fee.nativeFee), "ETH");
    } catch (e) {
        console.log("   ❌ Quote failed:", e.message);
        if (e.data) {
            console.log("   Error data:", e.data);
        }
    }
    
    // 6. Check if adapter is registered with endpoint
    console.log("\n6. Additional Checks:");
    
    // Check if we need to register the OApp
    try {
        const isRegistered = await endpointContract.isOApp(adapter.target);
        console.log("   Is registered OApp:", isRegistered);
    } catch (e) {
        // Method might not exist
        console.log("   OApp registration check not available");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    });