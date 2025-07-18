/**
 * Hardhat test helpers for integration testing
 */

import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Contract ABIs
const CONTRACT_DIR = path.join(__dirname, '../../src/contract/artifacts/contracts');

export async function loadContractABI(contractPath) {
    const fullPath = path.join(CONTRACT_DIR, contractPath);
    const artifact = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    return artifact;
}

export async function getHardhatProvider() {
    return new ethers.JsonRpcProvider('http://localhost:8545');
}

export async function getSigners(provider) {
    // Hardhat default accounts
    const privateKeys = [
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
        '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
        '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
        '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
        '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e',
        '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356',
        '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97',
        '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6'
    ];
    
    return privateKeys.map(pk => new ethers.Wallet(pk, provider));
}

export async function deployMockTokens(signer) {
    const { abi, bytecode } = await loadContractABI('mocks/MockERC20.sol/MockERC20.json');
    
    const factory = new ethers.ContractFactory(abi, bytecode, signer);
    
    // Deploy USDC mock
    const usdc = await factory.deploy('USD Coin', 'USDC', 6);
    await usdc.waitForDeployment();
    
    // Deploy DAI mock
    const dai = await factory.deploy('Dai Stablecoin', 'DAI', 18);
    await dai.waitForDeployment();
    
    return { usdc, dai };
}

export async function deployMockWETH(signer) {
    const { abi, bytecode } = await loadContractABI('mocks/MockWETH.sol/MockWETH.json');
    const factory = new ethers.ContractFactory(abi, bytecode, signer);
    const weth = await factory.deploy();
    await weth.waitForDeployment();
    return weth;
}

export async function deployMockRouter(signer, wethAddress) {
    const { abi, bytecode } = await loadContractABI('mocks/MockUniswapV2Router.sol/MockUniswapV2Router.json');
    const factory = new ethers.ContractFactory(abi, bytecode, signer);
    const router = await factory.deploy(wethAddress);
    await router.waitForDeployment();
    return router;
}

export async function deployEscrowV3(signer, serviceWallet, wethAddress, routerAddress) {
    const { abi, bytecode } = await loadContractABI('UniversalEscrowServiceV3Disputes.sol/UniversalEscrowServiceV3Disputes.json');
    const factory = new ethers.ContractFactory(abi, bytecode, signer);
    
    const escrow = await factory.deploy(
        serviceWallet,
        wethAddress,
        routerAddress,
        ethers.ZeroAddress, // Stargate router (not needed for test)
        200 // 2% fee
    );
    await escrow.waitForDeployment();
    return escrow;
}

export async function createTestEscrow(escrowContract, buyer, seller, token, amount, conditions = []) {
    // Approve token spending
    await token.connect(buyer).approve(await escrowContract.getAddress(), amount);
    
    // Create escrow
    const tx = await escrowContract.connect(buyer).createEscrow(
        await seller.getAddress(),
        await token.getAddress(),
        amount,
        conditions,
        7 * 24 * 60 * 60, // 7 days deadline
        true // isTokenEscrow
    );
    
    const receipt = await tx.wait();
    
    // Get escrow ID from events
    const event = receipt.logs.find(log => {
        try {
            const parsed = escrowContract.interface.parseLog(log);
            return parsed.name === 'EscrowCreated';
        } catch {
            return false;
        }
    });
    
    if (!event) throw new Error('EscrowCreated event not found');
    
    const parsedEvent = escrowContract.interface.parseLog(event);
    return parsedEvent.args.escrowId;
}

export async function fundAccount(signer, token, amount) {
    // Mint tokens to account (assumes MockERC20 with mint function)
    await token.mint(await signer.getAddress(), amount);
}

// Time manipulation helpers
export async function increaseTime(provider, seconds) {
    await provider.send('evm_increaseTime', [seconds]);
    await provider.send('evm_mine');
}

export async function getLatestBlockTimestamp(provider) {
    const block = await provider.getBlock('latest');
    return block.timestamp;
}

// Event helpers
export async function waitForEvent(contract, eventName, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Timeout waiting for event ${eventName}`));
        }, timeout);
        
        contract.once(eventName, (...args) => {
            clearTimeout(timer);
            resolve(args);
        });
    });
}

export async function getTransactionEvents(contract, txReceipt, eventName) {
    const events = [];
    
    for (const log of txReceipt.logs) {
        try {
            const parsed = contract.interface.parseLog(log);
            if (parsed.name === eventName) {
                events.push(parsed);
            }
        } catch {
            // Skip logs that don't match this contract
        }
    }
    
    return events;
}