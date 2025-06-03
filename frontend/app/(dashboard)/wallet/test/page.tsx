"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useWallet } from "@/context/wallet-context"
import { useWalletAuthIntegration } from "@/hooks/use-wallet-auth-integration"
import { useToast } from "@/hooks/use-toast"
import { 
  RefreshCw, 
  Wallet, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  ExternalLink,
  Copy
} from "lucide-react"
import ConnectWalletButton from "@/components/connect-wallet-button"
import type { BlockchainNetwork } from "@/types/wallet"

export default function WalletTestPage() {
  const {
    connectedWallets,
    currentAddress,
    currentNetwork,
    isConnected,
    evmProviders,
    solanaWallets,
    bitcoinWallets,
    refreshWalletDetection,
    getBalance,
    disconnectWallet
  } = useWallet()
  
  const { manualSync, hasWallets, isAuthenticated } = useWalletAuthIntegration()
  const { toast } = useToast()
  
  const [detectionRefreshing, setDetectionRefreshing] = useState(false)
  const [walletBalances, setWalletBalances] = useState<Record<string, string>>({})

  useEffect(() => {
    // Fetch balances for all connected wallets
    const fetchBalances = async () => {
      const balances: Record<string, string> = {}
      
      for (const wallet of connectedWallets) {
        try {
          const balance = await getBalance(wallet.address, wallet.network)
          balances[`${wallet.address}-${wallet.network}`] = balance
        } catch (error) {
          console.warn(`Failed to fetch balance for ${wallet.address}:`, error)
          balances[`${wallet.address}-${wallet.network}`] = "Error"
        }
      }
      
      setWalletBalances(balances)
    }

    if (connectedWallets.length > 0) {
      fetchBalances()
    }
  }, [connectedWallets, getBalance])

  const handleRefreshDetection = async () => {
    setDetectionRefreshing(true)
    try {
      await refreshWalletDetection()
      toast({
        title: "Detection Refreshed",
        description: "Wallet detection has been refreshed successfully.",
      })
    } catch (error) {
      toast({
        title: "Detection Failed",
        description: "Failed to refresh wallet detection.",
        variant: "destructive"
      })
    } finally {
      setDetectionRefreshing(false)
    }
  }

  const handleManualSync = async () => {
    try {
      await manualSync()
      toast({
        title: "Sync Successful",
        description: "Wallet data has been synced with your profile.",
      })
    } catch (error) {
      toast({
        title: "Sync Failed",
        description: (error as Error).message || "Failed to sync wallet data.",
        variant: "destructive"
      })
    }
  }

  const handleDisconnectWallet = async (address: string, network: BlockchainNetwork) => {
    try {
      await disconnectWallet(address, network)
      toast({
        title: "Wallet Disconnected",
        description: `Wallet ${address.slice(0, 6)}...${address.slice(-4)} has been disconnected.`,
      })
    } catch (error) {
      toast({
        title: "Disconnection Failed",
        description: "Failed to disconnect wallet.",
        variant: "destructive"
      })
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({
      title: "Copied",
      description: "Address copied to clipboard.",
    })
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

  const totalDetectedWallets = evmProviders.length + solanaWallets.length + bitcoinWallets.length

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Wallet Detection Test</h1>
          <p className="text-muted-foreground">
            Comprehensive testing interface for multi-network wallet detection
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleRefreshDetection}
            disabled={detectionRefreshing}
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${detectionRefreshing ? 'animate-spin' : ''}`} />
            Refresh Detection
          </Button>
          <ConnectWalletButton />
        </div>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <Wallet className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium">Detected Wallets</p>
                <p className="text-2xl font-bold">{totalDetectedWallets}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-medium">Connected Wallets</p>
                <p className="text-2xl font-bold">{connectedWallets.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              {isConnected ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              <div>
                <p className="text-sm font-medium">Connection Status</p>
                <p className="text-2xl font-bold">{isConnected ? "Connected" : "Disconnected"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              {isAuthenticated ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-yellow-600" />
              )}
              <div>
                <p className="text-sm font-medium">Auth Status</p>
                <p className="text-2xl font-bold">{isAuthenticated ? "Authenticated" : "Guest"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Current Connection */}
      {isConnected && currentAddress && currentNetwork && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="flex items-center justify-between">
              <div>
                Currently connected to <strong>{currentAddress.slice(0, 6)}...{currentAddress.slice(-4)}</strong> on{" "}
                <Badge className={getNetworkColor(currentNetwork)}>
                  {currentNetwork.toUpperCase()}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(currentAddress)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Auth Integration */}
      {isAuthenticated && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Authentication Integration
            </CardTitle>
            <CardDescription>
              Wallet addresses are automatically synced with your user profile
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {hasWallets 
                  ? `${connectedWallets.length} wallet(s) synced with your profile`
                  : "No wallets connected to sync"
                }
              </div>
              <Button
                onClick={handleManualSync}
                disabled={!hasWallets}
                variant="outline"
                size="sm"
              >
                Manual Sync
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Connected Wallets */}
      {connectedWallets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Connected Wallets</CardTitle>
            <CardDescription>
              Manage your connected wallets across different networks
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {connectedWallets.map((wallet) => (
                <div
                  key={`${wallet.address}-${wallet.network}`}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center space-x-4">
                    <Wallet className="h-8 w-8 text-gray-500" />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{wallet.name}</p>
                        <Badge className={getNetworkColor(wallet.network)}>
                          {wallet.network.toUpperCase()}
                        </Badge>
                        {wallet.isPrimary && (
                          <Badge variant="secondary">Primary</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                      </p>
                      <p className="text-sm text-green-600">
                        {walletBalances[`${wallet.address}-${wallet.network}`] || 'Loading...'} {getNetworkSymbol(wallet.network)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(wallet.address)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDisconnectWallet(wallet.address, wallet.network)}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Wallet Detection Results */}
      <Card>
        <CardHeader>
          <CardTitle>Wallet Detection Results</CardTitle>
          <CardDescription>
            Available wallet providers detected on this device
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="evm" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="evm">
                EVM ({evmProviders.length})
              </TabsTrigger>
              <TabsTrigger value="solana">
                Solana ({solanaWallets.length})
              </TabsTrigger>
              <TabsTrigger value="bitcoin">
                Bitcoin ({bitcoinWallets.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="evm" className="space-y-4">
              {evmProviders.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No EVM wallets detected. Install MetaMask, Coinbase Wallet, or another EVM-compatible wallet.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="grid gap-4">
                  {evmProviders.map((provider) => (
                    <div
                      key={provider.uuid}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{provider.name}</p>
                        <p className="text-sm text-muted-foreground">{provider.rdns}</p>
                        <Badge className={getNetworkColor(provider.network)}>
                          {provider.network.toUpperCase()}
                        </Badge>
                      </div>
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="solana" className="space-y-4">
              {solanaWallets.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No Solana wallets detected. Install Phantom, Solflare, or another Solana-compatible wallet.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="grid gap-4">
                  {solanaWallets.map((wallet, index) => (
                    <div
                      key={`${wallet.adapter.name}-${index}`}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{wallet.adapter.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Status: {wallet.adapter.readyState}
                        </p>
                        <Badge className={getNetworkColor('solana')}>
                          SOLANA
                        </Badge>
                      </div>
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="bitcoin" className="space-y-4">
              {bitcoinWallets.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No Bitcoin wallets detected. Install UniSat, Xverse, or another Bitcoin-compatible wallet.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="grid gap-4">
                  {bitcoinWallets.map((wallet, index) => (
                    <div
                      key={`${wallet.name}-${index}`}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{wallet.name}</p>
                        <p className="text-sm text-muted-foreground">Bitcoin Network</p>
                        <Badge className={getNetworkColor('bitcoin')}>
                          BITCOIN
                        </Badge>
                      </div>
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Installation Links */}
      <Card>
        <CardHeader>
          <CardTitle>Install Wallet Extensions</CardTitle>
          <CardDescription>
            Popular wallet extensions for testing multi-network functionality
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Button
              variant="outline"
              onClick={() => window.open("https://metamask.io/download/", "_blank")}
              className="h-auto p-4 flex-col"
            >
              <div className="text-blue-600 text-2xl mb-2">🦊</div>
              <span className="font-medium">MetaMask</span>
              <span className="text-xs text-muted-foreground">EVM Networks</span>
              <ExternalLink className="h-4 w-4 mt-2" />
            </Button>
            
            <Button
              variant="outline"
              onClick={() => window.open("https://phantom.app/", "_blank")}
              className="h-auto p-4 flex-col"
            >
              <div className="text-purple-600 text-2xl mb-2">👻</div>
              <span className="font-medium">Phantom</span>
              <span className="text-xs text-muted-foreground">Solana & EVM</span>
              <ExternalLink className="h-4 w-4 mt-2" />
            </Button>
            
            <Button
              variant="outline"
              onClick={() => window.open("https://unisat.io/", "_blank")}
              className="h-auto p-4 flex-col"
            >
              <div className="text-orange-600 text-2xl mb-2">₿</div>
              <span className="font-medium">UniSat</span>
              <span className="text-xs text-muted-foreground">Bitcoin</span>
              <ExternalLink className="h-4 w-4 mt-2" />
            </Button>
            
            <Button
              variant="outline"
              onClick={() => window.open("https://www.coinbase.com/wallet/downloads", "_blank")}
              className="h-auto p-4 flex-col"
            >
              <div className="text-blue-600 text-2xl mb-2">🌐</div>
              <span className="font-medium">Coinbase Wallet</span>
              <span className="text-xs text-muted-foreground">Multi-chain</span>
              <ExternalLink className="h-4 w-4 mt-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
