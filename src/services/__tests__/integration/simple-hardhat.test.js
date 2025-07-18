/**
 * Simple test to verify Hardhat integration works
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Simple Hardhat Test', () => {
    let provider;
    let signer;
    let testToken;

    beforeAll(async () => {
        console.log('🚀 Connecting to Hardhat...');
        
        // Connect to Hardhat
        provider = new ethers.JsonRpcProvider('http://localhost:8545');
        
        // Wait for connection
        let connected = false;
        for (let i = 0; i < 5; i++) {
            try {
                await provider.getNetwork();
                connected = true;
                break;
            } catch {
                console.log(`Waiting for Hardhat... (${i + 1}/5)`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        if (!connected) {
            throw new Error('Failed to connect to Hardhat');
        }
        
        // Get signer
        signer = new ethers.Wallet(
            '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
            provider
        );
        
        console.log('✅ Connected to Hardhat');
        console.log(`Signer address: ${await signer.getAddress()}`);
        console.log(`Balance: ${ethers.formatEther(await provider.getBalance(await signer.getAddress()))} ETH`);
    });

    it('should deploy a test token', async () => {
        // Load token artifact
        const tokenArtifact = JSON.parse(
            fs.readFileSync(
                path.join(__dirname, '../../../contract/artifacts/contracts/mocks/TestToken.sol/TestToken.json'),
                'utf8'
            )
        );
        
        // Deploy token
        const TokenFactory = new ethers.ContractFactory(
            tokenArtifact.abi,
            tokenArtifact.bytecode,
            signer
        );
        
        testToken = await TokenFactory.deploy();
        await testToken.waitForDeployment();
        
        const tokenAddress = await testToken.getAddress();
        console.log(`Deployed TestToken at: ${tokenAddress}`);
        
        expect(tokenAddress).toBeDefined();
        expect(tokenAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
        
        // Check token details
        const name = await testToken.name();
        const symbol = await testToken.symbol();
        const totalSupply = await testToken.totalSupply();
        
        expect(name).toBe('Test Token');
        expect(symbol).toBe('TEST');
        expect(totalSupply).toBe(ethers.parseUnits('1000000', 18));
    });

    it('should interact with the token', async () => {
        // Mint tokens
        const recipient = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
        const amount = ethers.parseUnits('100', 18);
        
        const tx = await testToken.mint(recipient, amount);
        await tx.wait();
        
        const balance = await testToken.balanceOf(recipient);
        expect(balance).toBe(amount);
    });
});