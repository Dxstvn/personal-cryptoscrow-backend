"use client"

import { useWallet } from "@/context/wallet-context"
import { Button } from "@/components/ui/button"
import { Copy, ExternalLink, LogOut } from "lucide-react"
import { useState } from "react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { BlockchainNetwork } from "@/types/wallet"

// Network-specific styling
const NETWORK_STYLES = {
  ethereum: {
    bg: 'bg-teal-50',
    border: 'border-teal-100',
    text: 'text-teal-900',
    badge: 'bg-teal-100 text-teal-700',
    link: 'text-teal-600 hover:text-teal-800',
    balance: 'text-teal-700'
  },
  polygon: {
    bg: 'bg-purple-50',
    border: 'border-purple-100',
    text: 'text-purple-900',
    badge: 'bg-purple-100 text-purple-700',
    link: 'text-purple-600 hover:text-purple-800',
    balance: 'text-purple-700'
  },
  bsc: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-100',
    text: 'text-yellow-900',
    badge: 'bg-yellow-100 text-yellow-700',
    link: 'text-yellow-600 hover:text-yellow-800',
    balance: 'text-yellow-700'
  },
  arbitrum: {
    bg: 'bg-blue-50',
    border: 'border-blue-100',
    text: 'text-blue-900',
    badge: 'bg-blue-100 text-blue-700',
    link: 'text-blue-600 hover:text-blue-800',
    balance: 'text-blue-700'
  },
  optimism: {
    bg: 'bg-red-50',
    border: 'border-red-100',
    text: 'text-red-900',
    badge: 'bg-red-100 text-red-700',
    link: 'text-red-600 hover:text-red-800',
    balance: 'text-red-700'
  },
  solana: {
    bg: 'bg-green-50',
    border: 'border-green-100',
    text: 'text-green-900',
    badge: 'bg-green-100 text-green-700',
    link: 'text-green-600 hover:text-green-800',
    balance: 'text-green-700'
  },
  bitcoin: {
    bg: 'bg-orange-50',
    border: 'border-orange-100',
    text: 'text-orange-900',
    badge: 'bg-orange-100 text-orange-700',
    link: 'text-orange-600 hover:text-orange-800',
    balance: 'text-orange-700'
  }
}

export default function WalletInfo() {
  const { currentAddress, currentNetwork, connectedWallets, disconnectWallet } = useWallet()
  const [copied, setCopied] = useState(false)

  if (!currentAddress || !currentNetwork) return null

  // Get current wallet data
  const currentWallet = connectedWallets.find(
    wallet => wallet.address.toLowerCase() === currentAddress.toLowerCase() && 
              wallet.network === currentNetwork
  )

  // Format address for display
  const formatAddress = (addr: string) => {
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`
  }

  // Copy address to clipboard
  const copyAddress = () => {
    navigator.clipboard.writeText(currentAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Handle wallet disconnection
  const handleDisconnect = () => {
    disconnectWallet(currentAddress, currentNetwork)
  }

  // Get explorer URL based on network
  const getExplorerUrl = () => {
    switch (currentNetwork) {
      case 'ethereum':
        return `https://etherscan.io/address/${currentAddress}`
      case 'polygon':
        return `https://polygonscan.com/address/${currentAddress}`
      case 'bsc':
        return `https://bscscan.com/address/${currentAddress}`
      case 'arbitrum':
        return `https://arbiscan.io/address/${currentAddress}`
      case 'optimism':
        return `https://optimistic.etherscan.io/address/${currentAddress}`
      case 'solana':
        return `https://explorer.solana.com/address/${currentAddress}`
      case 'bitcoin':
        return `https://blockchair.com/bitcoin/address/${currentAddress}`
      default:
        return `https://etherscan.io/address/${currentAddress}`
    }
  }

  // Get currency symbol based on network
  const getCurrencySymbol = () => {
    switch (currentNetwork) {
      case 'ethereum':
        return 'ETH'
      case 'polygon':
        return 'MATIC'
      case 'bsc':
        return 'BNB'
      case 'arbitrum':
      case 'optimism':
        return 'ETH'
      case 'solana':
        return 'SOL'
      case 'bitcoin':
        return 'BTC'
      default:
        return 'ETH'
    }
  }

  const styles = NETWORK_STYLES[currentNetwork as keyof typeof NETWORK_STYLES] || NETWORK_STYLES.ethereum
  const currencySymbol = getCurrencySymbol()
  const balance = currentWallet?.balance || '0'

  return (
    <div className={`flex items-center gap-2 ${styles.bg} rounded-lg p-2 border ${styles.border}`}>
      <div className="flex flex-col">
        <div className="flex items-center gap-1">
          <span className={`text-sm font-medium ${styles.text}`}>
            {formatAddress(currentAddress)}
          </span>
          <span className={`text-xs px-1.5 py-0.5 ${styles.badge} rounded uppercase font-medium`}>
            {currentNetwork}
          </span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={copyAddress} className={`${styles.link}`}>
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{copied ? "Copied!" : "Copy address"}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={getExplorerUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${styles.link}`}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </TooltipTrigger>
              <TooltipContent>View on Explorer</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <span className={`text-xs ${styles.balance}`}>
          {balance} {currencySymbol}
        </span>
        {currentWallet?.name && (
          <span className={`text-xs ${styles.balance}`}>
            {currentWallet.name}
          </span>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDisconnect}
        className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
      >
        <LogOut className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
