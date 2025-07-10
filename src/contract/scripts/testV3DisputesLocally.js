const hre = require("hardhat");

async function main() {
    console.log("\n🧪 Running UniversalEscrowServiceV3Disputes tests...\n");
    
    try {
        // Run the test suite
        await hre.run("test", {
            testFiles: ["test/UniversalEscrowServiceV3Disputes.test.js"]
        });
        
        console.log("\n✅ All tests passed!");
        
    } catch (error) {
        console.error("\n❌ Tests failed:");
        console.error(error);
        process.exit(1);
    }
}

// Execute
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });