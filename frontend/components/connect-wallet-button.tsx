"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { LogOut, ExternalLink, Copy, Check, Wallet, ChevronDown } from "lucide-react"
import { useWallet } from "@/context/wallet-context"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"
import WalletConnectModal from "./wallet-connect-modal"
import { MetamaskFox } from "@/components/icons/metamask-fox"
import { CoinbaseIcon } from "@/components/icons/coinbase-icon"
import { Badge } from "@/components/ui/badge"
import Image from "next/image"
import type { BlockchainNetwork } from "@/types/wallet"

interface ConnectWalletButtonProps {
  variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "primary"
  size?: "default" | "sm" | "lg" | "icon"
  className?: string
}

export default function ConnectWalletButton({
  variant = "primary",
  size = "default",
  className = "",
}: ConnectWalletButtonProps) {
  const { 
    currentAddress, 
    currentNetwork,
    isConnected, 
    connectedWallets, 
    disconnectWallet, 
    setPrimaryWallet, 
    getBalance 
  } = useWallet()
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)
  const [balance, setBalance] = useState("0")
  const [showConnectModal, setShowConnectModal] = useState(false)

  // Find the current wallet
  const currentWallet = connectedWallets.find(
    (wallet) => wallet.address === currentAddress && wallet.network === currentNetwork
  )

  // Fetch balance when address or network changes
  useEffect(() => {
    if (currentAddress && currentNetwork) {
      fetchBalance()
    }
  }, [currentAddress, currentNetwork])

  // Fetch balance from wallet provider
  const fetchBalance = async () => {
    if (!currentAddress || !currentNetwork) return

    try {
      const walletBalance = await getBalance(currentAddress, currentNetwork)
      setBalance(walletBalance)
    } catch (error) {
      console.error("Error fetching balance:", error)
    }
  }

  const handleDisconnect = async () => {
    if (!currentAddress || !currentNetwork) return

    try {
      await disconnectWallet(currentAddress, currentNetwork)
      toast({
        title: "Wallet Disconnected",
        description: "Your wallet has been disconnected.",
      })
    } catch (error) {
      toast({
        title: "Disconnection Failed",
        description: (error as Error).message || "Failed to disconnect wallet. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleSetPrimary = async (address: string, network: BlockchainNetwork) => {
    try {
      await setPrimaryWallet(address, network)
      toast({
        title: "Primary Wallet Updated",
        description: "Your primary wallet has been updated.",
      })
    } catch (error) {
      toast({
        title: "Update Failed",
        description: (error as Error).message || "Failed to update primary wallet.",
        variant: "destructive",
      })
    }
  }

  const copyAddress = () => {
    if (currentAddress) {
      navigator.clipboard.writeText(currentAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast({
        title: "Address Copied",
        description: "Wallet address copied to clipboard",
      })
    }
  }

  const openExplorer = () => {
    if (currentAddress && currentNetwork) {
      const explorerUrls = {
        ethereum: `https://etherscan.io/address/${currentAddress}`,
        polygon: `https://polygonscan.com/address/${currentAddress}`,
        bsc: `https://bscscan.com/address/${currentAddress}`,
        arbitrum: `https://arbiscan.io/address/${currentAddress}`,
        optimism: `https://optimistic.etherscan.io/address/${currentAddress}`,
        solana: `https://explorer.solana.com/address/${currentAddress}`,
        bitcoin: `https://blockstream.info/address/${currentAddress}`
      }
      window.open(explorerUrls[currentNetwork], "_blank")
    }
  }

  const formatAddress = (addr: string | null) => {
    if (!addr) return ""
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  const getNetworkSymbol = (network: BlockchainNetwork) => {
    const symbols = {
      ethereum: 'ETH',
      polygon: 'MATIC',
      bsc: 'BNB',
      arbitrum: 'ETH',
      optimism: 'ETH',
      solana: 'SOL',
      bitcoin: 'BTC'
    }
    return symbols[network]
  }

  const getNetworkColor = (network: BlockchainNetwork) => {
    const colors = {
      ethereum: 'bg-blue-100 text-blue-800',
      polygon: 'bg-purple-100 text-purple-800',
      bsc: 'bg-yellow-100 text-yellow-800',
      arbitrum: 'bg-blue-100 text-blue-800',
      optimism: 'bg-red-100 text-red-800',
      solana: 'bg-purple-100 text-purple-800',
      bitcoin: 'bg-orange-100 text-orange-800'
    }
    return colors[network]
  }

  if (!isConnected) {
    return (
      <>
        <Button
          variant={variant}
          size={size}
          onClick={() => setShowConnectModal(true)}
          className={`connect-wallet-btn flex items-center ${className}`}
        >
          <div className="mr-2 h-5 w-5 relative">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          Connect Wallet
        </Button>
        <WalletConnectModal open={showConnectModal} onOpenChange={setShowConnectModal} />
      </>
    )
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={variant === "primary" ? "ghost" : variant}
            size={size}
            className={`connect-wallet-btn ${className} ${variant === "primary" ? "hover:bg-transparent" : ""}`}
          >
            <div className="relative h-6 w-6">
              {currentWallet?.name === "MetaMask" ? (
                <MetamaskFox className="h-6 w-6" />
              ) : currentWallet?.name === "Coinbase Wallet" ? (
                <CoinbaseIcon className="h-6 w-6" />
              ) : currentWallet?.icon ? (
                <Image
                  src={currentWallet.icon || "/placeholder.svg"}
                  alt={currentWallet.name}
                  width={24}
                  height={24}
                  className="rounded-full"
                />
              ) : (
                <Wallet className="h-5 w-5" />
              )}
              {isConnected && (
                <span className="absolute -bottom-1 -right-1 flex h-3 w-3">
                  <span className="animate-none relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                </span>
              )}
            </div>
            {variant !== "ghost" && (
              <>
                <span className="hidden sm:inline ml-2 mr-1">
                  {balance} {currentNetwork ? getNetworkSymbol(currentNetwork) : 'ETH'}
                </span>
                <span>{formatAddress(currentAddress)}</span>
                <ChevronDown className="ml-1 h-4 w-4" />
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold">{currentWallet?.name || "Connected Wallet"}</span>
                {currentNetwork && (
                  <Badge variant="secondary" className={`text-xs ${getNetworkColor(currentNetwork)}`}>
                    {currentNetwork.toUpperCase()}
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground">{formatAddress(currentAddress)}</span>
              <span className="text-xs font-medium text-green-600 mt-1">
                {balance} {currentNetwork ? getNetworkSymbol(currentNetwork) : 'ETH'}
              </span>
            </div>
          </DropdownMenuLabel>

          {connectedWallets.length > 1 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Other Connected Wallets</DropdownMenuLabel>
              {connectedWallets
                .filter((wallet) => !(wallet.address === currentAddress && wallet.network === currentNetwork))
                .map((wallet) => (
                  <DropdownMenuItem 
                    key={`${wallet.address}-${wallet.network}`} 
                    onClick={() => handleSetPrimary(wallet.address, wallet.network)}
                  >
                    <div className="mr-2 h-4 w-4">
                      {wallet.name === "MetaMask" ? (
                        <MetamaskFox className="h-4 w-4" />
                      ) : wallet.name === "Coinbase Wallet" ? (
                        <CoinbaseIcon className="h-4 w-4" />
                      ) : wallet.icon ? (
                        <Image
                          src={wallet.icon || "/placeholder.svg"}
                          alt={wallet.name}
                          width={16}
                          height={16}
                          className="rounded-full"
                        />
                      ) : (
                        <Wallet className="h-4 w-4" />
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm">{formatAddress(wallet.address)}</span>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className={`text-xs ${getNetworkColor(wallet.network)}`}>
                          {wallet.network.toUpperCase()}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {wallet.balance || '0'} {getNetworkSymbol(wallet.network)}
                        </span>
                      </div>
                    </div>
                  </DropdownMenuItem>
                ))}
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowConnectModal(true)}>
            <Wallet className="mr-2 h-4 w-4" />
            <span>Connect Another Wallet</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={copyAddress}>
            {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            <span>Copy Address</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={openExplorer}>
            <ExternalLink className="mr-2 h-4 w-4" />
            <span>View on Explorer</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleDisconnect} className="text-red-600 focus:text-red-600">
            <LogOut className="mr-2 h-4 w-4" />
            <span>Disconnect</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <WalletConnectModal open={showConnectModal} onOpenChange={setShowConnectModal} />
    </>
  )
}
