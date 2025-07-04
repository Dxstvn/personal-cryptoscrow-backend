import fs from "fs";
import path from "path";

const mainPath = path.join(process.cwd(), "..", "..", "deployments", "testnet-deployments.json");
const contractPath = path.join(process.cwd(), "deployments", "testnet-deployments.json");

// Read both files
const mainDeployments = JSON.parse(fs.readFileSync(mainPath, 'utf8'));
const contractDeployments = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

// Merge deployments
for (const network in contractDeployments) {
    if (!mainDeployments[network]) {
        mainDeployments[network] = {};
    }
    
    // Merge properties
    Object.assign(mainDeployments[network], contractDeployments[network]);
}

// Update timestamp
mainDeployments.lastUpdated = new Date().toISOString();

// Write back to main file
fs.writeFileSync(mainPath, JSON.stringify(mainDeployments, null, 2));

console.log("✅ Deployments merged successfully!");