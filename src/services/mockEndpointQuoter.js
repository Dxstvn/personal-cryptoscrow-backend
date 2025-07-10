/**
 * Mock LayerZero Endpoint Quoter
 * This provides a working quote function for development and testing
 * when the actual LayerZero endpoint isn't fully configured
 */

import { formatEther, parseEther } from 'ethers';

export class MockEndpointQuoter {
  constructor() {
    // Base fees per chain (in ETH)
    this.baseFees = {
      // Mainnet
      1: 0.05,          // Ethereum
      137: 0.01,        // Polygon
      42161: 0.005,     // Arbitrum
      10: 0.003,        // Optimism
      
      // Testnets
      11155111: 0.001,  // Sepolia
      421614: 0.001,    // Arbitrum Sepolia
      80002: 0.001,     // Polygon Amoy
      84532: 0.001,     // Base Sepolia
    };
    
    // Gas prices per chain (in gwei)
    this.gasPrices = {
      1: 30,
      137: 100,
      42161: 0.1,
      10: 0.01,
      11155111: 5,
      421614: 0.1,
      80002: 30,
      84532: 0.01,
    };
    
    // Cross-chain execution gas estimates
    this.executionGas = {
      base: 200000,      // Base gas for cross-chain execution
      withSwap: 350000,  // Additional gas if swap is needed
      compose: 150000,   // Additional gas for compose operations
    };
  }

  /**
   * Calculate mock cross-chain fee
   * This mimics LayerZero's fee calculation logic
   */
  calculateFee(sourceChainId, destChainId, amountInEth, options = {}) {
    const {
      includeSwap = false,
      includeCompose = false,
      urgency = 'normal' // 'slow', 'normal', 'fast'
    } = options;
    
    // Get base fees
    const sourceFee = this.baseFees[sourceChainId] || 0.001;
    const destFee = this.baseFees[destChainId] || 0.001;
    
    // Calculate gas costs
    let totalGas = this.executionGas.base;
    if (includeSwap) totalGas += this.executionGas.withSwap;
    if (includeCompose) totalGas += this.executionGas.compose;
    
    // Get gas prices
    const sourceGasPrice = this.gasPrices[sourceChainId] || 5;
    const destGasPrice = this.gasPrices[destChainId] || 5;
    
    // Calculate gas cost in ETH
    const sourceGasCost = (totalGas * sourceGasPrice) / 1e9; // Convert gwei to ETH
    const destGasCost = (totalGas * destGasPrice) / 1e9;
    
    // Add verification costs (DVN fees)
    const verificationFee = 0.0001; // Fixed fee per DVN
    const requiredDVNs = 1; // Testnet typically requires 1 DVN
    const totalVerificationFee = verificationFee * requiredDVNs;
    
    // Calculate total native fee
    let nativeFee = sourceFee + destFee + sourceGasCost + destGasCost + totalVerificationFee;
    
    // Add urgency multiplier
    const urgencyMultipliers = {
      slow: 0.8,
      normal: 1.0,
      fast: 1.5
    };
    nativeFee *= urgencyMultipliers[urgency] || 1.0;
    
    // Add amount-based fee (0.1% of transfer amount)
    const amountFee = parseFloat(amountInEth) * 0.001;
    nativeFee += amountFee;
    
    return {
      nativeFee: nativeFee.toFixed(6),
      lzTokenFee: '0', // No LZ token fees on testnet
      breakdown: {
        sourceFee: sourceFee.toFixed(6),
        destFee: destFee.toFixed(6),
        gasFeee: (sourceGasCost + destGasCost).toFixed(6),
        verificationFee: totalVerificationFee.toFixed(6),
        amountFee: amountFee.toFixed(6)
      }
    };
  }

  /**
   * Quote function that matches LayerZero endpoint interface
   */
  async quote(params, sender) {
    const { dstEid, receiver, message, options, payInLzToken } = params;
    
    // Map endpoint IDs to chain IDs
    const endpointToChain = {
      40161: 11155111,  // Sepolia
      40231: 421614,    // Arbitrum Sepolia
      40267: 80002,     // Polygon Amoy
    };
    
    // Determine source chain from sender address
    // This is a simplification - in reality, you'd check which chain the call is from
    const sourceChainId = 11155111; // Default to Sepolia
    const destChainId = endpointToChain[dstEid] || 11155111;
    
    // Parse options to determine gas limits and features
    const includeSwap = options && options.length > 100; // Rough heuristic
    const includeCompose = message && message !== '0x' && message.length > 2;
    
    // Calculate fee
    const fee = this.calculateFee(sourceChainId, destChainId, '1', {
      includeSwap,
      includeCompose,
      urgency: 'normal'
    });
    
    return {
      nativeFee: parseEther(fee.nativeFee),
      lzTokenFee: 0n
    };
  }
  
  /**
   * Get a static quote for testing
   */
  getStaticQuote(sourceChainId, destChainId, amount) {
    const fee = this.calculateFee(sourceChainId, destChainId, amount);
    return {
      nativeFee: fee.nativeFee,
      zroFee: '0',
      recommended: (parseFloat(fee.nativeFee) * 3).toFixed(6), // 3x safety buffer
      method: 'Mock Endpoint Quote',
      breakdown: fee.breakdown
    };
  }
}

// Export singleton instance
export default new MockEndpointQuoter();