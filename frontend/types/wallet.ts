export interface EIP6963ProviderInfo {
  uuid: string
  name: string
  icon: string
  rdns: string
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo
  provider: any
}

// Blockchain network types
export type BlockchainNetwork = 'ethereum' | 'solana' | 'bitcoin' | 'polygon' | 'bsc' | 'arbitrum' | 'optimism'

// Wallet provider types for different networks
export interface WalletProvider {
  name: string
  icon?: string
  rdns?: string
  network: BlockchainNetwork
  provider: any
  uuid: string
}

// Enhanced wallet interface supporting multiple networks
export interface ConnectedWallet {
  address: string
  name: string
  icon?: string
  provider: any
  network: BlockchainNetwork
  balance?: string
  isPrimary?: boolean
  publicKey?: string // For Solana wallets
}

// Solana wallet adapter interface
export interface SolanaWallet {
  adapter: {
    name: string
    icon: string
    url: string
    readyState: 'Installed' | 'NotDetected' | 'Loadable' | 'Unsupported'
    publicKey: any
    connect(): Promise<void>
    disconnect(): Promise<void>
    signTransaction?(transaction: any): Promise<any>
    signAllTransactions?(transactions: any[]): Promise<any[]>
  }
}

// Bitcoin wallet interface
export interface BitcoinWallet {
  name: string
  icon?: string
  provider: any
  getAddresses(): Promise<string[]>
  signMessage?(message: string): Promise<string>
  signPSBT?(psbt: string): Promise<string>
}

// Wallet detection result
export interface WalletDetectionResult {
  evmWallets: WalletProvider[]
  solanaWallets: SolanaWallet[]
  bitcoinWallets: BitcoinWallet[]
}

// Extend the global Window interface for various wallet providers
declare global {
  interface Window {
    // EVM wallets
    ethereum?: any
    web3?: any
    
    // Solana wallets
    solana?: any
    phantom?: {
      solana?: any
    }
    solflare?: any
    slope?: any
    torus?: any
    coin98?: any
    clover?: any
    
    // Bitcoin wallets
    unisat?: any
    xverse?: any
    hiro?: any
    leather?: any
    okxwallet?: any
    
    // Other wallet providers
    keplr?: any
    leap?: any
    
    // Wallet events
    addEventListener(type: 'eip6963:announceProvider', listener: EventListener): void
    dispatchEvent(event: Event): boolean
  }
}

// Network configuration
export interface NetworkConfig {
  name: string
  chainId?: number | string
  rpcUrl?: string
  symbol: string
  decimals: number
  blockExplorer?: string
}

// Supported networks configuration
export const SUPPORTED_NETWORKS: Record<BlockchainNetwork, NetworkConfig> = {
  ethereum: {
    name: 'Ethereum',
    chainId: 1,
    rpcUrl: 'https://mainnet.infura.io/v3/',
    symbol: 'ETH',
    decimals: 18,
    blockExplorer: 'https://etherscan.io'
  },
  polygon: {
    name: 'Polygon',
    chainId: 137,
    rpcUrl: 'https://polygon-rpc.com/',
    symbol: 'MATIC',
    decimals: 18,
    blockExplorer: 'https://polygonscan.com'
  },
  bsc: {
    name: 'BSC',
    chainId: 56,
    rpcUrl: 'https://bsc-dataseed.binance.org/',
    symbol: 'BNB',
    decimals: 18,
    blockExplorer: 'https://bscscan.com'
  },
  arbitrum: {
    name: 'Arbitrum',
    chainId: 42161,
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    symbol: 'ETH',
    decimals: 18,
    blockExplorer: 'https://arbiscan.io'
  },
  optimism: {
    name: 'Optimism',
    chainId: 10,
    rpcUrl: 'https://mainnet.optimism.io',
    symbol: 'ETH',
    decimals: 18,
    blockExplorer: 'https://optimistic.etherscan.io'
  },
  solana: {
    name: 'Solana',
    chainId: 'mainnet-beta',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    symbol: 'SOL',
    decimals: 9,
    blockExplorer: 'https://explorer.solana.com'
  },
  bitcoin: {
    name: 'Bitcoin',
    symbol: 'BTC',
    decimals: 8,
    blockExplorer: 'https://blockstream.info'
  }
}
