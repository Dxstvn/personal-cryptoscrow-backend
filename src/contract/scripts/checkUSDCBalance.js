#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const hre = require('hardhat');
const chalk = require('chalk');

async function main() {
  const address = '0x28f9F5e0Ec9C6B8cdF1F3ad73847A094570c927D';
  const usdcAddress = '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590';
  
  const usdc = await hre.ethers.getContractAt('IERC20', usdcAddress);
  
  // Get raw balance
  const balance = await usdc.balanceOf(address);
  console.log('Raw balance:', balance.toString());
  console.log('Formatted (6 decimals):', hre.ethers.formatUnits(balance, 6));
  
  // Double check with different formatting
  const balanceNumber = Number(balance) / 1e6;
  console.log('As number:', balanceNumber.toLocaleString());
  
  // Check decimals
  try {
    const decimals = await usdc.decimals();
    console.log('Token decimals:', decimals);
  } catch (e) {
    console.log('Could not read decimals');
  }
}

main().catch(console.error);