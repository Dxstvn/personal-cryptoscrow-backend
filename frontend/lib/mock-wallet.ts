import { create } from "zustand"

// Mock wallet addresses
const MOCK_ADDRESSES = [
  "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
  "0x2546BcD3c84621e976D8185a91A922aE77ECEc30",
  "0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE",
]

// Mock ETH balances (in ETH)
const MOCK_BALANCES = {
  [MOCK_ADDRESSES[0]]: "5.234",
  [MOCK_ADDRESSES[1]]: "12.871",
  [MOCK_ADDRESSES[2]]: "0.542",
}

// Generate a random transaction hash
export const generateTxHash = () => {
  return `0x${Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("")}`
}

// Wallet connection state
interface WalletState {
  isConnected: boolean
  isConnecting: boolean
  address: string | null
  chainId: number | null
  balance: string | null
  error: string | null
  walletProvider: "metamask" | "coinbase" | null

  // Methods
  connect: (provider: "metamask" | "coinbase") => Promise<void>
  disconnect: () => void
  switchChain: (chainId: number) => Promise<void>
  addToken: (address: string, symbol: string, decimals: number, image?: string) => Promise<void>
  sendTransaction: (to: string, value: string) => Promise<string>
}

export const useWalletStore = create<WalletState>((set, get) => ({
  isConnected: false,
  isConnecting: false,
  address: null,
  chainId: null,
  balance: null,
  error: null,
  walletProvider: null,

  connect: async (provider: "metamask" | "coinbase") => {
    try {
      set({ isConnecting: true, error: null })

      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Randomly select an address
      const randomIndex = Math.floor(Math.random() * MOCK_ADDRESSES.length)
      const address = MOCK_ADDRESSES[randomIndex]
      const balance = MOCK_BALANCES[address] || "0.0"

      set({
        isConnected: true,
        isConnecting: false,
        address,
        chainId: 1, // Ethereum Mainnet
        balance,
        walletProvider: provider,
      })

      // Store in localStorage to persist across refreshes
      localStorage.setItem("walletConnected", "true")
      localStorage.setItem("walletAddress", address)
      localStorage.setItem("walletChainId", "1")
      localStorage.setItem("walletBalance", balance)
      localStorage.setItem("walletProvider", provider)
    } catch (error) {
      set({
        isConnecting: false,
        error: (error as Error).message || `Failed to connect ${provider} wallet`,
      })
    }
  },

  disconnect: () => {
    set({
      isConnected: false,
      address: null,
      chainId: null,
      balance: null,
      walletProvider: null,
    })

    // Clear localStorage
    localStorage.removeItem("walletConnected")
    localStorage.removeItem("walletAddress")
    localStorage.removeItem("walletChainId")
    localStorage.removeItem("walletBalance")
    localStorage.removeItem("walletProvider")
  },

  switchChain: async (chainId: number) => {
    try {
      set({ error: null })

      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 500))

      set({ chainId })
      localStorage.setItem("walletChainId", chainId.toString())

      return Promise.resolve()
    } catch (error) {
      set({ error: (error as Error).message || "Failed to switch chain" })
      return Promise.reject(error)
    }
  },

  addToken: async (address: string, symbol: string, decimals: number, image?: string) => {
    try {
      set({ error: null })

      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 500))

      console.log(`Added token: ${symbol} (${address})`)

      return Promise.resolve()
    } catch (error) {
      set({ error: (error as Error).message || "Failed to add token" })
      return Promise.reject(error)
    }
  },

  sendTransaction: async (to: string, value: string) => {
    try {
      set({ error: null })

      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 1500))

      // Generate a random transaction hash
      const txHash = generateTxHash()

      console.log(`Transaction sent: ${value} ETH to ${to}`)
      console.log(`Transaction hash: ${txHash}`)

      return txHash
    } catch (error) {
      set({ error: (error as Error).message || "Failed to send transaction" })
      throw error
    }
  },
}))

// Initialize from localStorage if available
if (typeof window !== "undefined") {
  const isConnected = localStorage.getItem("walletConnected") === "true"
  const address = localStorage.getItem("walletAddress")
  const chainId = localStorage.getItem("walletChainId")
  const balance = localStorage.getItem("walletBalance")
  const walletProvider = localStorage.getItem("walletProvider") as "metamask" | "coinbase" | null

  if (isConnected && address) {
    useWalletStore.setState({
      isConnected,
      address,
      chainId: chainId ? Number.parseInt(chainId) : 1,
      balance,
      walletProvider,
    })
  }
}

// Network information
export const NETWORKS = {
  1: {
    name: "Ethereum Mainnet",
    symbol: "ETH",
    explorer: "https://etherscan.io",
    rpcUrl: "https://mainnet.infura.io/v3/",
  },
  5: {
    name: "Goerli Testnet",
    symbol: "ETH",
    explorer: "https://goerli.etherscan.io",
    rpcUrl: "https://goerli.infura.io/v3/",
  },
  137: {
    name: "Polygon Mainnet",
    symbol: "MATIC",
    explorer: "https://polygonscan.com",
    rpcUrl: "https://polygon-rpc.com",
  },
  80001: {
    name: "Mumbai Testnet",
    symbol: "MATIC",
    explorer: "https://mumbai.polygonscan.com",
    rpcUrl: "https://rpc-mumbai.maticvigil.com",
  },
}

// Get network info by chain ID
export const getNetworkInfo = (chainId: number | null) => {
  if (!chainId) return null
  return NETWORKS[chainId as keyof typeof NETWORKS] || null
}

// Format address for display
export const formatAddress = (address: string | null) => {
  if (!address) return ""
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

// Format ETH value with commas
export const formatEth = (value: string | null) => {
  if (!value) return "0.0"
  return Number.parseFloat(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })
}
