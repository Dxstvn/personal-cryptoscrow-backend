import { parseEther } from 'ethers';

class MockEscrowServiceV3 {
  constructor() {
    this.initialized = false;
    this.chainConfigs = null;
    this.providers = new Map();
    this.wallets = new Map();
    this.abi = [];
    this.contractVersion = 'Mock';
  }

  async initialize() {
    if (this.initialized) return;
    
    // Mock chain configs
    this.chainConfigs = {
      11155111: { // Sepolia
        name: 'Sepolia',
        contractAddress: '0x1234567890123456789012345678901234567890',
        rpcUrl: 'https://sepolia.infura.io/v3/test',
        oftAdapter: '0x2234567890123456789012345678901234567890',
        composer: '0x3234567890123456789012345678901234567890',
        lzEndpointId: 40161,
        explorerUrl: 'https://sepolia.etherscan.io'
      },
      421614: { // Arbitrum Sepolia
        name: 'Arbitrum Sepolia',
        contractAddress: '0x4234567890123456789012345678901234567890',
        rpcUrl: 'https://arbitrum-sepolia.infura.io/v3/test',
        oftAdapter: '0x5234567890123456789012345678901234567890',
        composer: null,
        lzEndpointId: 40231,
        explorerUrl: 'https://sepolia.arbiscan.io'
      },
      80002: { // Polygon Amoy
        name: 'Polygon Amoy',
        contractAddress: '0x6234567890123456789012345678901234567890',
        rpcUrl: 'https://polygon-amoy.infura.io/v3/test',
        oftAdapter: '0x7234567890123456789012345678901234567890',
        composer: null,
        lzEndpointId: 40267,
        explorerUrl: 'https://amoy.polygonscan.com'
      }
    };
    
    this.initialized = true;
  }

  async initializeChainConfigs() {
    await this.initialize();
  }

  async getProvider(chainId) {
    const config = this.chainConfigs?.[chainId];
    if (!config) {
      throw new Error(`Chain ${chainId} not supported`);
    }
    if (!config.rpcUrl) {
      throw new Error(`RPC URL not configured for chain ${chainId}`);
    }
    return { getBlockNumber: async () => 12345 };
  }

  async getWallet(chainId, privateKey = null) {
    if (!privateKey && !process.env.BACKEND_WALLET_PRIVATE_KEY) {
      throw new Error('No private key provided');
    }
    return { address: '0x1234567890123456789012345678901234567890' };
  }

  async getContract(chainId, signerPrivateKey = null) {
    await this.initialize();
    const config = this.chainConfigs[chainId];
    if (!config) {
      throw new Error(`Chain ${chainId} not supported`);
    }
    return {
      target: config.contractAddress,
      interface: {
        parseLog: () => ({ name: 'EscrowCreated', args: { escrowId: 1 } })
      },
      createEscrow: async () => ({ 
        wait: async () => ({ 
          hash: '0xmocktxhash', 
          logs: [{}] 
        }) 
      }),
      updateCondition: async () => ({ wait: async () => ({ hash: '0xmocktxhash' }) }),
      releaseEscrow: async () => ({ wait: async () => ({ hash: '0xmocktxhash' }) }),
      getEscrowDetails: async () => [
        '0x1234567890123456789012345678901234567890', // buyer
        '0x2234567890123456789012345678901234567890', // seller
        '0x0000000000000000000000000000000000000000', // depositToken
        parseEther('1'), // depositAmount
        '0x0000000000000000000000000000000000000000', // targetToken
        11155111, // targetChainId
        false, // isDisputed
        false, // isCompleted
        false, // isReleased
        0 // conditionMetTimestamp
      ],
      estimateTotalFees: async (srcChainId, dstChainId, tokenAddress, amount, isCrossChain) => {
        const serviceFee = (amount * 200n) / 10000n;
        const messagingFee = isCrossChain ? parseEther('0.001') : 0n;
        const targetChainGasFee = isCrossChain ? parseEther('0.002') : 0n;
        return [serviceFee, messagingFee, targetChainGasFee];
      }
    };
  }

  async deployContract() {
    throw new Error('V3 contracts are deployed once per chain, not per transaction');
  }

  calculateServiceFee(amount) {
    return (BigInt(amount) * 200n) / 10000n;
  }

  getChainConfig(chainId) {
    return this.chainConfigs?.[chainId] || null;
  }

  getOFTAdapter(chainId) {
    return this.chainConfigs?.[chainId]?.oftAdapter || null;
  }

  getComposer(chainId) {
    return this.chainConfigs?.[chainId]?.composer || null;
  }

  getLayerZeroEndpointId(chainId) {
    return this.chainConfigs?.[chainId]?.lzEndpointId || null;
  }

  getTokenInfo(tokenAddress) {
    if (tokenAddress === '0x0000000000000000000000000000000000000000') {
      return { symbol: 'ETH', decimals: 18 };
    }
    return null;
  }

  getSupportedTokens(chainId) {
    return ['0x0000000000000000000000000000000000000000'];
  }

  getExplorerUrl(chainId, txHash) {
    const config = this.chainConfigs?.[chainId];
    if (!config) return null;
    return `${config.explorerUrl}/tx/${txHash}`;
  }

  getSupportedChains() {
    return Object.keys(this.chainConfigs || {}).map(Number);
  }

  async trackLayerZeroTransfer(txHash, srcChainId, dstChainId) {
    return { tracked: true };
  }

  async estimateTotalFees(params) {
    const { amount = '1', isCrossChain = false } = params;
    const amountBigInt = parseEther(amount.toString());
    const serviceFee = (amountBigInt * 200n) / 10000n;
    const messagingFee = isCrossChain ? parseEther('0.001') : 0n;
    const targetChainGasFee = isCrossChain ? parseEther('0.002') : 0n;
    
    return {
      serviceFee: serviceFee.toString(),
      messagingFee: messagingFee.toString(),
      targetChainGasFee: targetChainGasFee.toString()
    };
  }
}

export default new MockEscrowServiceV3();