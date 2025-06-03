"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import type { 
  EIP6963ProviderDetail, 
  ConnectedWallet, 
  BlockchainNetwork,
  WalletDetectionResult,
  SolanaWallet,
  BitcoinWallet,
  WalletProvider
} from "@/types/wallet"
import { walletDetectionService } from "@/services/wallet-detection"
import { walletApi } from "@/services/wallet-api"
import { ethers } from "ethers"

// Define the shape of our wallet context
type WalletContextType = {
  currentAddress: string | null
  currentNetwork: BlockchainNetwork | null
  isConnected: boolean
  isConnecting: boolean
  error: string | null
  connectedWallets: ConnectedWallet[]
  
  // Multi-network wallet detection
  detectedWallets: WalletDetectionResult
  evmProviders: WalletProvider[]
  solanaWallets: SolanaWallet[]
  bitcoinWallets: BitcoinWallet[]
  
  // Wallet management functions
  connectWallet: (provider: any, network: BlockchainNetwork, walletName?: string) => Promise<ConnectedWallet>
  connectSolanaWallet: (wallet: SolanaWallet) => Promise<ConnectedWallet>
  connectBitcoinWallet: (wallet: BitcoinWallet) => Promise<ConnectedWallet>
  disconnectWallet: (address: string, network: BlockchainNetwork) => Promise<void>
  setPrimaryWallet: (address: string, network: BlockchainNetwork) => Promise<void>
  
  // Wallet utilities
  getBalance: (address: string, network: BlockchainNetwork) => Promise<string>
  getTransactions: (address: string, network: BlockchainNetwork) => Promise<any[]>
  switchNetwork: (network: BlockchainNetwork) => Promise<void>
  
  // Detection and refresh
  refreshWalletDetection: () => Promise<void>
}

// Create the context with default values
const WalletContext = createContext<WalletContextType>({
  currentAddress: null,
  currentNetwork: null,
  isConnected: false,
  isConnecting: false,
  error: null,
  connectedWallets: [],
  detectedWallets: { evmWallets: [], solanaWallets: [], bitcoinWallets: [] },
  evmProviders: [],
  solanaWallets: [],
  bitcoinWallets: [],
  connectWallet: async () => ({} as ConnectedWallet),
  connectSolanaWallet: async () => ({} as ConnectedWallet),
  connectBitcoinWallet: async () => ({} as ConnectedWallet),
  disconnectWallet: async () => {},
  setPrimaryWallet: async () => {},
  getBalance: async () => "0",
  getTransactions: async () => [],
  switchNetwork: async () => {},
  refreshWalletDetection: async () => {},
})

export function WalletProvider({ children }: { children: ReactNode }) {
  const [currentAddress, setCurrentAddress] = useState<string | null>(null)
  const [currentNetwork, setCurrentNetwork] = useState<BlockchainNetwork | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connectedWallets, setConnectedWallets] = useState<ConnectedWallet[]>([])
  
  // Multi-network wallet detection state
  const [detectedWallets, setDetectedWallets] = useState<WalletDetectionResult>({
    evmWallets: [],
    solanaWallets: [],
    bitcoinWallets: []
  })

  // Initialize wallet state from localStorage and backend
  useEffect(() => {
    initializeWallets()
  }, [])

  // Detect wallets on component mount
  useEffect(() => {
    refreshWalletDetection()
  }, [])

  const initializeWallets = async () => {
    try {
      // Try to load from localStorage first
      const savedWallets = localStorage.getItem("connectedWallets")
      if (savedWallets) {
        const parsedWallets = JSON.parse(savedWallets) as ConnectedWallet[]
        console.log("Loaded wallets from localStorage:", parsedWallets)
        setConnectedWallets(parsedWallets)

        // Set the primary wallet as current
        const primaryWallet = parsedWallets.find((wallet) => wallet.isPrimary)
        if (primaryWallet) {
          setCurrentAddress(primaryWallet.address)
          setCurrentNetwork(primaryWallet.network)
          setIsConnected(true)
        } else if (parsedWallets.length > 0) {
          // If no primary wallet, set the first one as primary
          const firstWallet = parsedWallets[0]
          setCurrentAddress(firstWallet.address)
          setCurrentNetwork(firstWallet.network)
          setIsConnected(true)

          // Update the first wallet to be primary
          const updatedWallets = parsedWallets.map((wallet, index) => ({
            ...wallet,
            isPrimary: index === 0,
          }))
          setConnectedWallets(updatedWallets)
          localStorage.setItem("connectedWallets", JSON.stringify(updatedWallets))
        }
      }

      // Try to sync with backend
      try {
        const backendWallets = await walletApi.getConnectedWallets()
        if (backendWallets.length > 0) {
          console.log("Synced wallets from backend:", backendWallets)
          setConnectedWallets(backendWallets)
          localStorage.setItem("connectedWallets", JSON.stringify(backendWallets))
        }
      } catch (error) {
        console.warn("Could not sync wallets from backend:", error)
      }
    } catch (err) {
      console.error("Error initializing wallets:", err)
      setError("Failed to initialize wallets")
    }
  }

  const refreshWalletDetection = useCallback(async () => {
    try {
      console.log("🔍 Detecting available wallets...")
      const detected = await walletDetectionService.detectAllWallets()
      setDetectedWallets(detected)
      console.log("✅ Wallet detection complete:", detected)
    } catch (err) {
      console.error("Error detecting wallets:", err)
      setError("Failed to detect wallets")
    }
  }, [])

  // Connect EVM wallet function
  const connectWallet = async (provider: any, network: BlockchainNetwork = 'ethereum', walletName?: string): Promise<ConnectedWallet> => {
    try {
      setIsConnecting(true)
      setError(null)

      // Request accounts
      const accounts = await provider.request({
        method: "eth_requestAccounts",
        params: [],
      })

      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts found. Please make sure your wallet is unlocked.")
      }

      const newAddress = accounts[0]
      console.log("Connected to address:", newAddress, "on network:", network)

      // Determine wallet name
      let finalWalletName = walletName
      if (!finalWalletName) {
        const detectedProvider = detectedWallets.evmWallets.find(p => p.provider === provider)
        finalWalletName = detectedProvider?.name || getEthereumWalletName(provider)
      }

      // Create wallet object
      const newWallet: ConnectedWallet = {
        address: newAddress,
        name: finalWalletName,
        network,
        provider: provider,
        isPrimary: connectedWallets.length === 0, // First wallet is primary
        icon: detectedWallets.evmWallets.find(p => p.provider === provider)?.icon
      }

      // Get balance
      try {
        const balance = await getBalance(newAddress, network)
        newWallet.balance = balance
      } catch (balanceError) {
        console.warn("Could not fetch balance:", balanceError)
      }

      // Update state
      const updatedWallets = updateConnectedWallets(newWallet)
      setConnectedWallets(updatedWallets)
      setCurrentAddress(newAddress)
      setCurrentNetwork(network)
      setIsConnected(true)

      // Save to localStorage
      localStorage.setItem("connectedWallets", JSON.stringify(updatedWallets))

      // Register with backend
      try {
        await walletApi.registerWallet(newWallet)
      } catch (backendError) {
        console.warn("Could not register wallet with backend:", backendError)
      }

      console.log("✅ Wallet connected successfully:", newWallet)
      return newWallet
    } catch (err) {
      console.error("Error connecting wallet:", err)
      setError((err as Error).message || "Failed to connect wallet. Please try again.")
      throw err
    } finally {
      setIsConnecting(false)
    }
  }

  // Connect Solana wallet function
  const connectSolanaWallet = async (wallet: SolanaWallet): Promise<ConnectedWallet> => {
    try {
      setIsConnecting(true)
      setError(null)

      // Connect to Solana wallet
      await wallet.adapter.connect()

      if (!wallet.adapter.publicKey) {
        throw new Error("Failed to get public key from Solana wallet")
      }

      const address = wallet.adapter.publicKey.toString()
      console.log("Connected to Solana address:", address)

      // Create wallet object
      const newWallet: ConnectedWallet = {
        address,
        name: wallet.adapter.name,
        network: 'solana',
        provider: wallet.adapter,
        publicKey: address,
        isPrimary: connectedWallets.length === 0,
        icon: wallet.adapter.icon
      }

      // Get balance
      try {
        const balance = await getBalance(address, 'solana')
        newWallet.balance = balance
      } catch (balanceError) {
        console.warn("Could not fetch Solana balance:", balanceError)
      }

      // Update state
      const updatedWallets = updateConnectedWallets(newWallet)
      setConnectedWallets(updatedWallets)
      setCurrentAddress(address)
      setCurrentNetwork('solana')
      setIsConnected(true)

      // Save to localStorage
      localStorage.setItem("connectedWallets", JSON.stringify(updatedWallets))

      // Register with backend
      try {
        await walletApi.registerWallet(newWallet)
      } catch (backendError) {
        console.warn("Could not register Solana wallet with backend:", backendError)
      }

      console.log("✅ Solana wallet connected successfully:", newWallet)
      return newWallet
    } catch (err) {
      console.error("Error connecting Solana wallet:", err)
      setError((err as Error).message || "Failed to connect Solana wallet. Please try again.")
      throw err
    } finally {
      setIsConnecting(false)
    }
  }

  // Connect Bitcoin wallet function
  const connectBitcoinWallet = async (wallet: BitcoinWallet): Promise<ConnectedWallet> => {
    try {
      setIsConnecting(true)
      setError(null)

      // Get addresses from Bitcoin wallet
      const addresses = await wallet.getAddresses()

      if (!addresses || addresses.length === 0) {
        throw new Error("No addresses found in Bitcoin wallet")
      }

      const address = addresses[0] // Use first address
      console.log("Connected to Bitcoin address:", address)

      // Create wallet object
      const newWallet: ConnectedWallet = {
        address,
        name: wallet.name,
        network: 'bitcoin',
        provider: wallet.provider,
        isPrimary: connectedWallets.length === 0,
        icon: wallet.icon
      }

      // Bitcoin balance fetching would require external API
      // For now, we'll skip it or use a mock value
      newWallet.balance = "0.00000000"

      // Update state
      const updatedWallets = updateConnectedWallets(newWallet)
      setConnectedWallets(updatedWallets)
      setCurrentAddress(address)
      setCurrentNetwork('bitcoin')
      setIsConnected(true)

      // Save to localStorage
      localStorage.setItem("connectedWallets", JSON.stringify(updatedWallets))

      // Register with backend
      try {
        await walletApi.registerWallet(newWallet)
      } catch (backendError) {
        console.warn("Could not register Bitcoin wallet with backend:", backendError)
      }

      console.log("✅ Bitcoin wallet connected successfully:", newWallet)
      return newWallet
    } catch (err) {
      console.error("Error connecting Bitcoin wallet:", err)
      setError((err as Error).message || "Failed to connect Bitcoin wallet. Please try again.")
      throw err
    } finally {
      setIsConnecting(false)
    }
  }

  // Helper function to update connected wallets array
  const updateConnectedWallets = (newWallet: ConnectedWallet): ConnectedWallet[] => {
    const existingWalletIndex = connectedWallets.findIndex(
      (wallet) => 
        wallet.address.toLowerCase() === newWallet.address.toLowerCase() &&
        wallet.network === newWallet.network
    )

    if (existingWalletIndex >= 0) {
      // Update existing wallet
      const updated = [...connectedWallets]
      updated[existingWalletIndex] = { ...updated[existingWalletIndex], ...newWallet }
      return updated
    } else {
      // Add new wallet
      return [...connectedWallets, newWallet]
    }
  }

  // Disconnect wallet function
  const disconnectWallet = async (address: string, network: BlockchainNetwork) => {
    try {
      // Find the wallet to disconnect
      const walletToDisconnect = connectedWallets.find(
        w => w.address.toLowerCase() === address.toLowerCase() && w.network === network
      )

      if (walletToDisconnect) {
        // Call wallet-specific disconnect method
        if (network === 'solana' && walletToDisconnect.provider?.disconnect) {
          try {
            await walletToDisconnect.provider.disconnect()
          } catch (err) {
            console.warn("Error disconnecting from Solana wallet:", err)
          }
        }
      }

      // Remove wallet from state
      const updatedWallets = connectedWallets.filter(
        (wallet) => 
          !(wallet.address.toLowerCase() === address.toLowerCase() && wallet.network === network)
      )

      // Update state
      setConnectedWallets(updatedWallets)

      // If we disconnected the current address, reset it
      if (currentAddress?.toLowerCase() === address.toLowerCase() && currentNetwork === network) {
        if (updatedWallets.length > 0) {
          // Set another wallet as current if available
          const primaryWallet = updatedWallets.find((wallet) => wallet.isPrimary)
          if (primaryWallet) {
            setCurrentAddress(primaryWallet.address)
            setCurrentNetwork(primaryWallet.network)
          } else {
            // Make the first wallet primary
            const firstWallet = updatedWallets[0]
            const walletsWithPrimary = updatedWallets.map((wallet, index) => ({
              ...wallet,
              isPrimary: index === 0,
            }))
            setConnectedWallets(walletsWithPrimary)
            setCurrentAddress(firstWallet.address)
            setCurrentNetwork(firstWallet.network)
            localStorage.setItem("connectedWallets", JSON.stringify(walletsWithPrimary))
          }
        } else {
          setCurrentAddress(null)
          setCurrentNetwork(null)
          setIsConnected(false)
        }
      }

      // Save to localStorage
      localStorage.setItem("connectedWallets", JSON.stringify(updatedWallets))

      // Remove from backend
      try {
        await walletApi.removeWallet(address, network)
      } catch (backendError) {
        console.warn("Could not remove wallet from backend:", backendError)
      }

      console.log("Disconnected wallet:", address, "on", network)
    } catch (err) {
      console.error("Error disconnecting wallet:", err)
      throw err
    }
  }

  // Set primary wallet
  const setPrimaryWallet = async (address: string, network: BlockchainNetwork) => {
    try {
      const updatedWallets = connectedWallets.map((wallet) => ({
        ...wallet,
        isPrimary: wallet.address.toLowerCase() === address.toLowerCase() && wallet.network === network,
      }))

      setConnectedWallets(updatedWallets)
      setCurrentAddress(address)
      setCurrentNetwork(network)

      // Save to localStorage
      localStorage.setItem("connectedWallets", JSON.stringify(updatedWallets))

      // Update backend
      try {
        await walletApi.setPrimaryWallet(address, network)
      } catch (backendError) {
        console.warn("Could not set primary wallet on backend:", backendError)
      }

      console.log("Set primary wallet:", address, "on", network)
    } catch (err) {
      console.error("Error setting primary wallet:", err)
      throw err
    }
  }

  // Get balance using the appropriate method for each network
  const getBalance = async (address: string, network: BlockchainNetwork): Promise<string> => {
    try {
      // Find the wallet with this address and network
      const wallet = connectedWallets.find(
        (w) => w.address.toLowerCase() === address.toLowerCase() && w.network === network
      )

      if (network === 'ethereum' || network === 'polygon' || network === 'bsc' || network === 'arbitrum' || network === 'optimism') {
        // EVM networks
        if (wallet?.provider) {
          const balanceHex = await wallet.provider.request({
            method: "eth_getBalance",
            params: [address, "latest"],
          })
          const balanceInWei = BigInt(balanceHex)
          const balanceInEth = ethers.formatEther(balanceInWei)
          return parseFloat(balanceInEth).toFixed(4)
        }
      } else if (network === 'solana') {
        // Solana network - would need Solana connection
        // For now, return mock data in development
        if (process.env.NODE_ENV === 'development') {
          return (Math.random() * 10).toFixed(4)
        }
      } else if (network === 'bitcoin') {
        // Bitcoin network - would need Bitcoin API
        // For now, return mock data in development
        if (process.env.NODE_ENV === 'development') {
          return (Math.random() * 1).toFixed(8)
        }
      }

      return "0"
    } catch (err) {
      console.error("Error getting balance:", err)
      
      // For development/demo, return a mock balance
      if (process.env.NODE_ENV === "development") {
        return (Math.random() * 10).toFixed(4)
      }

      return "0"
    }
  }

  // Get transactions (mock implementation for now)
  const getTransactions = async (address: string, network: BlockchainNetwork): Promise<any[]> => {
    try {
      // In a real implementation, you would use network-specific APIs
      // For now, return mock data
      return [
        {
          hash: "0x" + Math.random().toString(16).substring(2, 10) + Math.random().toString(16).substring(2, 10),
          from: address,
          to: "0x" + Math.random().toString(16).substring(2, 42),
          value: (Math.random() * 1).toFixed(4),
          timestamp: Date.now() - Math.floor(Math.random() * 86400000),
          type: "sent",
          network
        },
        {
          hash: "0x" + Math.random().toString(16).substring(2, 10) + Math.random().toString(16).substring(2, 10),
          from: "0x" + Math.random().toString(16).substring(2, 42),
          to: address,
          value: (Math.random() * 2).toFixed(4),
          timestamp: Date.now() - Math.floor(Math.random() * 86400000 * 2),
          type: "received",
          network
        },
      ]
    } catch (err) {
      console.error("Error getting transactions:", err)
      return []
    }
  }

  // Switch network (for EVM wallets)
  const switchNetwork = async (network: BlockchainNetwork) => {
    try {
      const currentWallet = connectedWallets.find(w => w.address === currentAddress)
      if (!currentWallet || !currentWallet.provider) {
        throw new Error("No wallet connected")
      }

      // This would involve switching the network in the wallet
      // Implementation depends on the specific network and wallet
      console.log("Switching to network:", network)
      setCurrentNetwork(network)
    } catch (err) {
      console.error("Error switching network:", err)
      throw err
    }
  }

  // Helper function to determine EVM wallet name
  const getEthereumWalletName = (provider: any): string => {
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

  return (
    <WalletContext.Provider
      value={{
        currentAddress,
        currentNetwork,
        isConnected,
        isConnecting,
        error,
        connectedWallets,
        detectedWallets,
        evmProviders: detectedWallets.evmWallets,
        solanaWallets: detectedWallets.solanaWallets,
        bitcoinWallets: detectedWallets.bitcoinWallets,
        connectWallet,
        connectSolanaWallet,
        connectBitcoinWallet,
        disconnectWallet,
        setPrimaryWallet,
        getBalance,
        getTransactions,
        switchNetwork,
        refreshWalletDetection,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}

// Custom hook to use the wallet context
export function useWallet() {
  const context = useContext(WalletContext)
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider")
  }
  return context
}
