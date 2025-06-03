"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { useWallet } from "@/context/wallet-context"
import { useToast } from "@/hooks/use-toast"
import { Loader2, ExternalLink, RefreshCw } from "lucide-react"
import { MetamaskFox } from "@/components/icons/metamask-fox"
import { CoinbaseIcon } from "@/components/icons/coinbase-icon"
import Image from "next/image"
import type { BlockchainNetwork } from "@/types/wallet"

interface WalletConnectModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function WalletConnectModal({ open, onOpenChange }: WalletConnectModalProps) {
  const { 
    evmProviders, 
    solanaWallets, 
    bitcoinWallets, 
    connectWallet, 
    connectSolanaWallet, 
    connectBitcoinWallet,
    isConnecting,
    refreshWalletDetection 
  } = useWallet()
  const { toast } = useToast()
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("evm")

  const handleConnectEVM = async (provider: any, providerName: string, network: BlockchainNetwork = 'ethereum') => {
    try {
      setConnectingProvider(providerName)
      await connectWallet(provider, network, providerName)
      toast({
        title: "Wallet Connected",
        description: `${providerName} has been connected successfully.`,
      })
      onOpenChange(false)
    } catch (error) {
      toast({
        title: "Connection Failed",
        description: (error as Error).message || "Failed to connect wallet. Please try again.",
        variant: "destructive",
      })
    } finally {
      setConnectingProvider(null)
    }
  }

  const handleConnectSolana = async (wallet: any, walletName: string) => {
    try {
      setConnectingProvider(walletName)
      await connectSolanaWallet(wallet)
      toast({
        title: "Solana Wallet Connected",
        description: `${walletName} has been connected successfully.`,
      })
      onOpenChange(false)
    } catch (error) {
      toast({
        title: "Connection Failed",
        description: (error as Error).message || "Failed to connect Solana wallet. Please try again.",
        variant: "destructive",
      })
    } finally {
      setConnectingProvider(null)
    }
  }

  const handleConnectBitcoin = async (wallet: any, walletName: string) => {
    try {
      setConnectingProvider(walletName)
      await connectBitcoinWallet(wallet)
      toast({
        title: "Bitcoin Wallet Connected",
        description: `${walletName} has been connected successfully.`,
      })
      onOpenChange(false)
    } catch (error) {
      toast({
        title: "Connection Failed",
        description: (error as Error).message || "Failed to connect Bitcoin wallet. Please try again.",
        variant: "destructive",
      })
    } finally {
      setConnectingProvider(null)
    }
  }

  const handleRefreshDetection = async () => {
    await refreshWalletDetection()
    toast({
      title: "Detection Refreshed",
      description: "Wallet detection has been refreshed.",
    })
  }

  const getWalletIcon = (name: string, icon?: string) => {
    if (name === "MetaMask" || name.toLowerCase().includes("metamask")) {
      return <MetamaskFox className="h-8 w-8" />
    }
    if (name === "Coinbase Wallet" || name.toLowerCase().includes("coinbase")) {
      return <CoinbaseIcon className="h-8 w-8" />
    }
    if (icon) {
      return (
        <Image
          src={icon}
          alt={name}
          width={32}
          height={32}
          className="rounded-full"
          onError={(e) => {
            // Fallback to text if image fails to load
            e.currentTarget.style.display = 'none'
          }}
        />
      )
    }
    return (
      <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
        <span className="text-sm font-medium">{name.charAt(0).toUpperCase()}</span>
      </div>
    )
  }

  const totalWallets = evmProviders.length + solanaWallets.length + bitcoinWallets.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Connect Wallet</DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefreshDetection}
              className="h-8 w-8 p-0"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          {totalWallets > 0 && (
            <p className="text-sm text-muted-foreground">
              {totalWallets} wallet{totalWallets !== 1 ? 's' : ''} detected
            </p>
          )}
        </DialogHeader>

        {totalWallets === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <p className="text-center text-sm text-muted-foreground mb-4">
              No wallet providers detected. Please install a supported wallet extension.
            </p>
            <div className="grid grid-cols-2 gap-4 w-full">
              <Button
                variant="outline"
                onClick={() => window.open("https://metamask.io/download/", "_blank")}
                className="flex items-center gap-2"
              >
                <MetamaskFox className="h-5 w-5" />
                MetaMask
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open("https://www.coinbase.com/wallet/downloads", "_blank")}
                className="flex items-center gap-2"
              >
                <CoinbaseIcon className="h-5 w-5" />
                Coinbase
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open("https://phantom.app/", "_blank")}
                className="flex items-center gap-2"
              >
                <span className="text-purple-600">👻</span>
                Phantom
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open("https://unisat.io/", "_blank")}
                className="flex items-center gap-2"
              >
                <span className="text-orange-600">₿</span>
                UniSat
              </Button>
            </div>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="evm" className="relative">
                EVM
                {evmProviders.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1 text-xs">
                    {evmProviders.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="solana" className="relative">
                Solana
                {solanaWallets.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1 text-xs">
                    {solanaWallets.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="bitcoin" className="relative">
                Bitcoin
                {bitcoinWallets.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1 text-xs">
                    {bitcoinWallets.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="evm" className="space-y-3 mt-4">
              {evmProviders.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground mb-4">
                    No EVM wallets detected. Install MetaMask or Coinbase Wallet.
                  </p>
                  <div className="flex gap-2 justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open("https://metamask.io/download/", "_blank")}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Get MetaMask
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open("https://www.coinbase.com/wallet/downloads", "_blank")}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Get Coinbase
                    </Button>
                  </div>
                </div>
              ) : (
                evmProviders.map((provider) => (
                  <Button
                    key={provider.uuid}
                    variant="outline"
                    className="flex justify-start items-center gap-3 h-14 px-4 w-full"
                    disabled={isConnecting && connectingProvider === provider.name}
                    onClick={() => handleConnectEVM(provider.provider, provider.name, provider.network)}
                  >
                    <div className="h-8 w-8 flex-shrink-0">
                      {getWalletIcon(provider.name, provider.icon)}
                    </div>
                    <div className="flex-grow text-left">
                      <p className="font-medium">{provider.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {provider.rdns || "EVM Compatible"}
                      </p>
                    </div>
                    {isConnecting && connectingProvider === provider.name && (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    )}
                  </Button>
                ))
              )}
            </TabsContent>

            <TabsContent value="solana" className="space-y-3 mt-4">
              {solanaWallets.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground mb-4">
                    No Solana wallets detected. Install Phantom or Solflare.
                  </p>
                  <div className="flex gap-2 justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open("https://phantom.app/", "_blank")}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Get Phantom
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open("https://solflare.com/", "_blank")}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Get Solflare
                    </Button>
                  </div>
                </div>
              ) : (
                solanaWallets.map((wallet, index) => (
                  <Button
                    key={`${wallet.adapter.name}-${index}`}
                    variant="outline"
                    className="flex justify-start items-center gap-3 h-14 px-4 w-full"
                    disabled={isConnecting && connectingProvider === wallet.adapter.name}
                    onClick={() => handleConnectSolana(wallet, wallet.adapter.name)}
                  >
                    <div className="h-8 w-8 flex-shrink-0">
                      {getWalletIcon(wallet.adapter.name, wallet.adapter.icon)}
                    </div>
                    <div className="flex-grow text-left">
                      <p className="font-medium">{wallet.adapter.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Solana Network • {wallet.adapter.readyState}
                      </p>
                    </div>
                    {isConnecting && connectingProvider === wallet.adapter.name && (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    )}
                  </Button>
                ))
              )}
            </TabsContent>

            <TabsContent value="bitcoin" className="space-y-3 mt-4">
              {bitcoinWallets.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground mb-4">
                    No Bitcoin wallets detected. Install UniSat or Xverse.
                  </p>
                  <div className="flex gap-2 justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open("https://unisat.io/", "_blank")}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Get UniSat
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open("https://www.xverse.app/", "_blank")}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Get Xverse
                    </Button>
                  </div>
                </div>
              ) : (
                bitcoinWallets.map((wallet, index) => (
                  <Button
                    key={`${wallet.name}-${index}`}
                    variant="outline"
                    className="flex justify-start items-center gap-3 h-14 px-4 w-full"
                    disabled={isConnecting && connectingProvider === wallet.name}
                    onClick={() => handleConnectBitcoin(wallet, wallet.name)}
                  >
                    <div className="h-8 w-8 flex-shrink-0">
                      {getWalletIcon(wallet.name, wallet.icon)}
                    </div>
                    <div className="flex-grow text-left">
                      <p className="font-medium">{wallet.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Bitcoin Network
                      </p>
                    </div>
                    {isConnecting && connectingProvider === wallet.name && (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    )}
                  </Button>
                ))
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}
