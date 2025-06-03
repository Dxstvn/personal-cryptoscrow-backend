import type { 
  WalletDetectionResult, 
  WalletProvider, 
  SolanaWallet, 
  BitcoinWallet, 
  BlockchainNetwork,
  EIP6963ProviderDetail 
} from '@/types/wallet'

/**
 * Comprehensive wallet detection service for multiple blockchain networks
 */
export class WalletDetectionService {
  private detectedProviders: WalletProvider[] = []
  private evmProviders: EIP6963ProviderDetail[] = []
  private solanaWallets: SolanaWallet[] = []
  private bitcoinWallets: BitcoinWallet[] = []

  /**
   * Detect all available wallets across different blockchain networks
   */
  async detectAllWallets(): Promise<WalletDetectionResult> {
    console.log('🔍 Starting comprehensive wallet detection...')
    
    // Detect EVM wallets (Ethereum, Polygon, BSC, etc.)
    const evmWallets = await this.detectEVMWallets()
    
    // Detect Solana wallets
    const solanaWallets = await this.detectSolanaWallets()
    
    // Detect Bitcoin wallets
    const bitcoinWallets = await this.detectBitcoinWallets()

    console.log(`✅ Wallet detection complete:`, {
      evm: evmWallets.length,
      solana: solanaWallets.length,
      bitcoin: bitcoinWallets.length
    })

    return {
      evmWallets,
      solanaWallets,
      bitcoinWallets
    }
  }

  /**
   * Detect EVM-compatible wallets using EIP-6963 and window injection
   */
  private async detectEVMWallets(): Promise<WalletProvider[]> {
    const providers: WalletProvider[] = []

    // Listen for EIP-6963 announcements
    const eip6963Providers = await this.detectEIP6963Providers()
    
    // Convert EIP-6963 providers to WalletProvider format
    eip6963Providers.forEach(detail => {
      providers.push({
        name: detail.info.name,
        icon: detail.info.icon,
        rdns: detail.info.rdns,
        network: 'ethereum' as BlockchainNetwork,
        provider: detail.provider,
        uuid: detail.info.uuid
      })
    })

    // Check for legacy window.ethereum
    if (window.ethereum && !providers.some(p => p.provider === window.ethereum)) {
      const legacyProvider: WalletProvider = {
        name: this.getEthereumWalletName(window.ethereum),
        network: 'ethereum',
        provider: window.ethereum,
        uuid: 'legacy-ethereum'
      }
      providers.push(legacyProvider)
    }

    // Check for specific EVM wallet injections
    const evmWalletChecks = [
      { key: 'ethereum', name: 'MetaMask', rdns: 'io.metamask' },
      { key: 'web3', name: 'Web3 Browser', rdns: 'browser.web3' },
    ]

    evmWalletChecks.forEach(({ key, name, rdns }) => {
      const walletProvider = (window as any)[key]
      if (walletProvider && !providers.some(p => p.provider === walletProvider)) {
        providers.push({
          name,
          rdns,
          network: 'ethereum',
          provider: walletProvider,
          uuid: `${rdns}-${Date.now()}`
        })
      }
    })

    return providers
  }

  /**
   * Detect EIP-6963 compatible wallets
   */
  private async detectEIP6963Providers(): Promise<EIP6963ProviderDetail[]> {
    return new Promise((resolve) => {
      const providers: EIP6963ProviderDetail[] = []
      
      const handleAnnouncement = (event: any) => {
        const providerDetail = event.detail
        console.log('EIP-6963 provider announced:', providerDetail)

        // Check if this provider is already in the list
        const exists = providers.some(p => p.info.uuid === providerDetail.info.uuid)
        if (!exists) {
          providers.push(providerDetail)
        }
      }

      // Listen for wallet announcements
      window.addEventListener('eip6963:announceProvider', handleAnnouncement)

      // Request providers to announce themselves
      window.dispatchEvent(new Event('eip6963:requestProvider'))

      // Give providers time to announce
      setTimeout(() => {
        window.removeEventListener('eip6963:announceProvider', handleAnnouncement)
        resolve(providers)
      }, 1000)
    })
  }

  /**
   * Detect Solana wallets
   */
  private async detectSolanaWallets(): Promise<SolanaWallet[]> {
    const wallets: SolanaWallet[] = []

    // Common Solana wallet providers
    const solanaWalletProviders = [
      {
        name: 'Phantom',
        key: 'phantom',
        subKey: 'solana',
        url: 'https://phantom.app/',
        icon: 'https://www.phantom.app/img/logo.png'
      },
      {
        name: 'Solflare',
        key: 'solflare',
        url: 'https://solflare.com/',
        icon: 'https://solflare.com/assets/logo.png'
      },
      {
        name: 'Slope',
        key: 'slope',
        url: 'https://slope.finance/',
        icon: 'https://slope.finance/favicon.ico'
      },
      {
        name: 'Torus',
        key: 'torus',
        url: 'https://tor.us/',
        icon: 'https://tor.us/favicon.ico'
      },
      {
        name: 'Coin98',
        key: 'coin98',
        subKey: 'sol',
        url: 'https://coin98.com/',
        icon: 'https://coin98.com/favicon.ico'
      },
      {
        name: 'Clover',
        key: 'clover',
        subKey: 'solana',
        url: 'https://clover.finance/',
        icon: 'https://clover.finance/favicon.ico'
      }
    ]

    for (const walletInfo of solanaWalletProviders) {
      try {
        let provider = (window as any)[walletInfo.key]
        
        // Handle nested providers (e.g., window.phantom.solana)
        if (walletInfo.subKey && provider) {
          provider = provider[walletInfo.subKey]
        }

        if (provider) {
          const readyState = provider.isConnected ? 'Installed' : 'NotDetected'
          
          wallets.push({
            adapter: {
              name: walletInfo.name,
              icon: walletInfo.icon,
              url: walletInfo.url,
              readyState: readyState as any,
              publicKey: provider.publicKey,
              connect: async () => {
                try {
                  const response = await provider.connect()
                  return response
                } catch (error) {
                  console.error(`Error connecting to ${walletInfo.name}:`, error)
                  throw error
                }
              },
              disconnect: async () => {
                try {
                  await provider.disconnect()
                } catch (error) {
                  console.error(`Error disconnecting from ${walletInfo.name}:`, error)
                  throw error
                }
              },
              signTransaction: provider.signTransaction,
              signAllTransactions: provider.signAllTransactions
            }
          })
          
          console.log(`✅ Detected Solana wallet: ${walletInfo.name}`)
        }
      } catch (error) {
        console.warn(`Failed to detect ${walletInfo.name}:`, error)
      }
    }

    // Check for generic Solana provider
    if (window.solana && !wallets.find(w => w.adapter.name === 'Solana')) {
      wallets.push({
        adapter: {
          name: 'Solana Wallet',
          icon: '',
          url: '',
          readyState: 'Installed',
          publicKey: window.solana.publicKey,
          connect: () => window.solana.connect(),
          disconnect: () => window.solana.disconnect(),
          signTransaction: window.solana.signTransaction,
          signAllTransactions: window.solana.signAllTransactions
        }
      })
    }

    return wallets
  }

  /**
   * Detect Bitcoin wallets
   */
  private async detectBitcoinWallets(): Promise<BitcoinWallet[]> {
    const wallets: BitcoinWallet[] = []

    // Common Bitcoin wallet providers
    const bitcoinWalletProviders = [
      {
        name: 'Unisat',
        key: 'unisat',
        icon: 'https://unisat.io/favicon.ico'
      },
      {
        name: 'Xverse',
        key: 'xverse',
        subKey: 'BitcoinProvider',
        icon: 'https://www.xverse.app/favicon.ico'
      },
      {
        name: 'Hiro Wallet',
        key: 'hiro',
        subKey: 'bitcoin',
        icon: 'https://wallet.hiro.so/favicon.ico'
      },
      {
        name: 'Leather',
        key: 'leather',
        icon: 'https://leather.io/favicon.ico'
      },
      {
        name: 'OKX Wallet',
        key: 'okxwallet',
        subKey: 'bitcoin',
        icon: 'https://www.okx.com/favicon.ico'
      }
    ]

    for (const walletInfo of bitcoinWalletProviders) {
      try {
        let provider = (window as any)[walletInfo.key]
        
        // Handle nested providers
        if (walletInfo.subKey && provider) {
          provider = provider[walletInfo.subKey]
        }

        if (provider) {
          wallets.push({
            name: walletInfo.name,
            icon: walletInfo.icon,
            provider,
            getAddresses: async () => {
              try {
                if (provider.getAddresses) {
                  return await provider.getAddresses()
                } else if (provider.requestAccounts) {
                  return await provider.requestAccounts()
                } else if (provider.connect) {
                  const result = await provider.connect()
                  return result.addresses || [result.address]
                }
                return []
              } catch (error) {
                console.error(`Error getting addresses from ${walletInfo.name}:`, error)
                return []
              }
            },
            signMessage: provider.signMessage,
            signPSBT: provider.signPSBT
          })
          
          console.log(`✅ Detected Bitcoin wallet: ${walletInfo.name}`)
        }
      } catch (error) {
        console.warn(`Failed to detect ${walletInfo.name}:`, error)
      }
    }

    return wallets
  }

  /**
   * Determine wallet name from ethereum provider
   */
  private getEthereumWalletName(provider: any): string {
    if (provider.isMetaMask) return 'MetaMask'
    if (provider.isCoinbaseWallet) return 'Coinbase Wallet'
    if (provider.isBraveWallet) return 'Brave Wallet'
    if (provider.isFrame) return 'Frame'
    if (provider.isOpera) return 'Opera Wallet'
    if (provider.isTrust) return 'Trust Wallet'
    if (provider.isStatus) return 'Status'
    if (provider.isToshi) return 'Coinbase Wallet'
    if (provider.isImToken) return 'imToken'
    if (provider.isTokenary) return 'Tokenary'
    if (provider.isMathWallet) return 'MathWallet'
    if (provider.isAlphaWallet) return 'AlphaWallet'
    if (provider.is1inch) return '1inch Wallet'
    if (provider.isExodus) return 'Exodus'
    return 'Unknown Wallet'
  }

  /**
   * Get all detected providers
   */
  getDetectedProviders(): WalletProvider[] {
    return this.detectedProviders
  }

  /**
   * Check if a specific wallet is available
   */
  isWalletAvailable(walletName: string, network: BlockchainNetwork): boolean {
    return this.detectedProviders.some(
      provider => provider.name.toLowerCase().includes(walletName.toLowerCase()) && 
                  provider.network === network
    )
  }

  /**
   * Get wallet by name and network
   */
  getWallet(walletName: string, network: BlockchainNetwork): WalletProvider | undefined {
    return this.detectedProviders.find(
      provider => provider.name.toLowerCase().includes(walletName.toLowerCase()) && 
                  provider.network === network
    )
  }
}

// Create singleton instance
export const walletDetectionService = new WalletDetectionService()
