"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useState, useEffect } from "react"
import { useWallet } from "@/context/wallet-context"
import { useToast } from "@/components/ui/use-toast"
import { Wallet, RefreshCw, Copy, ExternalLink } from "lucide-react"
import WalletConnectModal from "@/components/wallet-connect-modal"
import Image from "next/image"

export default function WalletPage() {
  const { currentAddress, isConnected, connectedWallets, getBalance, getTransactions } = useWallet()
  const { toast } = useToast()
  const [balance, setBalance] = useState("0")
  const [assets, setAssets] = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [copiedAddress, setCopiedAddress] = useState(false)
  const [activeTab, setActiveTab] = useState("assets")
  const [showConnectModal, setShowConnectModal] = useState(false)

  // Find the current wallet
  const currentWallet = connectedWallets.find((wallet) => wallet.address === currentAddress)

  // Fetch wallet data when address changes or on refresh
  useEffect(() => {
    if (currentAddress) {
      fetchWalletData()
    }
  }, [currentAddress])

  // Fetch wallet data from the wallet provider
  const fetchWalletData = async () => {
    if (!currentAddress) return

    setLoading(true)

    try {
      // Get balance from wallet provider
      const walletBalance = await getBalance(currentAddress)
      setBalance(walletBalance)

      // Get transactions from wallet provider
      const transactions = await getTransactions(currentAddress)

      // Format transactions as activities
      const formattedActivities = transactions.map((tx, index) => ({
        id: index + 1,
        type: tx.type === "sent" ? "payment_sent" : "payment_received",
        title: tx.type === "sent" ? "Payment Sent" : "Payment Received",
        description:
          tx.type === "sent"
            ? `To ${tx.to.slice(0, 6)}...${tx.to.slice(-4)}`
            : `From ${tx.from.slice(0, 6)}...${tx.from.slice(-4)}`,
        date: new Date(tx.timestamp).toISOString(),
        time: new Date(tx.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        value: tx.value,
        hash: tx.hash,
      }))

      setActivities(formattedActivities)

      // For demo purposes, create some mock assets based on the balance
      const ethBalance = Number.parseFloat(walletBalance)
      const mockAssets = [
        {
          id: 1,
          name: "Ethereum",
          symbol: "ETH",
          amount: ethBalance,
          price: "2000",
          value: ethBalance * 2000,
          change: "+1.2%",
          trend: "up",
        },
        {
          id: 2,
          name: "USD Coin",
          symbol: "USDC",
          amount: ethBalance * 500,
          price: "1",
          value: ethBalance * 500,
          change: "0.0%",
          trend: "neutral",
        },
      ]

      setAssets(mockAssets)
    } catch (error) {
      console.error("Error fetching wallet data:", error)
      toast({
        title: "Error",
        description: "Failed to fetch wallet data. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  // Handle refresh
  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchWalletData()
    setRefreshing(false)
  }

  // Handle copy address
  const handleCopyAddress = () => {
    if (currentAddress) {
      navigator.clipboard.writeText(currentAddress)
      setCopiedAddress(true)
      toast({
        title: "Address Copied",
        description: "Wallet address copied to clipboard",
      })
      setTimeout(() => setCopiedAddress(false), 2000)
    }
  }

  // Handle view on explorer
  const handleViewOnExplorer = () => {
    if (currentAddress) {
      window.open(`https://etherscan.io/address/${currentAddress}`, "_blank")
    }
  }

  // Calculate total balance
  const totalBalance = assets.reduce((sum, asset) => sum + asset.value, 0)

  // Format address
  const formatAddress = (addr: string | null) => {
    if (!addr) return ""
    return `${addr.slice(0, 8)}...${addr.slice(-6)}`
  }

  // If not connected, show wallet connection UI
  if (!isConnected) {
    return (
      <div className="p-6 space-y-8">
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-teal-900 font-display">Connect Your Wallet</h1>
              <p className="text-neutral-600">Connect your wallet to manage your cryptocurrency</p>
            </div>
          </div>
        </div>

        <Card className="shadow-md border-0 max-w-2xl mx-auto">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl">Connect a Wallet</CardTitle>
            <CardDescription>Connect your wallet to view your balance and transaction history</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="text-center">
              <Button
                onClick={() => setShowConnectModal(true)}
                className="bg-teal-900 hover:bg-teal-800 text-white px-8 py-6 text-lg"
              >
                <div className="mr-3 h-6 w-6 relative">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
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
            </div>
          </CardContent>
        </Card>
        <WalletConnectModal open={showConnectModal} onOpenChange={setShowConnectModal} />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-8">
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-teal-900 font-display">Wallet</h1>
            <p className="text-neutral-600">Manage your cryptocurrency assets and transactions</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="text-teal-700 border-teal-200 hover:bg-teal-50"
            >
              {refreshing ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Refreshing...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" /> Refresh
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyAddress}
              className="text-teal-700 border-teal-200 hover:bg-teal-50"
            >
              {copiedAddress ? (
                <>
                  <Copy className="mr-2 h-4 w-4" /> Copied
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" /> Copy Address
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleViewOnExplorer}
              className="text-teal-700 border-teal-200 hover:bg-teal-50"
            >
              <ExternalLink className="mr-2 h-4 w-4" /> View on Explorer
            </Button>
          </div>
        </div>
      </div>

      <Card className="shadow-md border-0">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center text-teal-800">
                {currentWallet?.icon ? (
                  <div className="relative w-12 h-12">
                    <Image
                      src={currentWallet.icon || "/placeholder.svg"}
                      alt={currentWallet.name}
                      width={48}
                      height={48}
                    />
                  </div>
                ) : (
                  <Wallet className="h-10 w-10" />
                )}
              </div>
              <div>
                <h2 className="text-xl font-semibold text-teal-900 font-display">
                  {currentWallet?.name || "Connected Wallet"}
                </h2>
                <p className="text-sm text-neutral-500 font-mono">
                  {currentAddress ? formatAddress(currentAddress) : ""}
                </p>
              </div>
            </div>
            <div className="text-center md:text-right">
              <p className="text-sm text-neutral-500">ETH Balance</p>
              <p className="text-3xl font-bold text-teal-900 font-display">{balance} ETH</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="border-b border-neutral-200">
        <nav className="flex space-x-8" aria-label="Wallet tabs">
          <button
            className={`border-b-2 py-4 px-1 text-sm font-medium transition-colors ${
              activeTab === "assets"
                ? "border-teal-900 text-teal-900"
                : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700"
            }`}
            onClick={() => setActiveTab("assets")}
          >
            Assets
          </button>
          <button
            className={`border-b-2 py-4 px-1 text-sm font-medium transition-colors ${
              activeTab === "activity"
                ? "border-teal-900 text-teal-900"
                : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700"
            }`}
            onClick={() => setActiveTab("activity")}
          >
            Activity
          </button>
        </nav>
      </div>

      {activeTab === "assets" && (
        <div className="space-y-4">
          {loading
            ? // Loading skeleton for assets
              Array(4)
                .fill(0)
                .map((_, i) => (
                  <div key={i} className="bg-white border border-neutral-100 rounded-lg p-5 animate-pulse">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-neutral-200 rounded-full"></div>
                        <div>
                          <div className="h-5 bg-neutral-200 rounded w-24 mb-1"></div>
                          <div className="h-4 bg-neutral-200 rounded w-16"></div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="h-5 bg-neutral-200 rounded w-20 mb-1"></div>
                        <div className="h-4 bg-neutral-200 rounded w-16"></div>
                      </div>
                    </div>
                  </div>
                ))
            : assets.map((asset) => (
                <div
                  key={asset.id}
                  className="bg-white border border-neutral-100 rounded-lg p-5 hover:shadow-md transition-all duration-300"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          asset.symbol === "BTC"
                            ? "bg-amber-100 text-amber-700"
                            : asset.symbol === "ETH"
                              ? "bg-blue-100 text-blue-700"
                              : asset.symbol === "USDC"
                                ? "bg-teal-100 text-teal-700"
                                : "bg-purple-100 text-purple-700"
                        }`}
                      >
                        {asset.symbol.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-teal-900">{asset.name}</p>
                        <p className="text-sm text-neutral-500">
                          {asset.amount} {asset.symbol}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-teal-900">
                        ${asset.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p
                        className={`text-sm ${
                          asset.trend === "up"
                            ? "text-green-600"
                            : asset.trend === "down"
                              ? "text-red-600"
                              : "text-neutral-500"
                        }`}
                      >
                        {asset.change}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
        </div>
      )}

      {activeTab === "activity" && (
        <div className="space-y-4">
          {loading ? (
            // Loading skeleton for activity
            Array(4)
              .fill(0)
              .map((_, i) => (
                <div key={i} className="bg-white border border-neutral-100 rounded-lg p-5 animate-pulse">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-neutral-200 rounded-full"></div>
                      <div>
                        <div className="h-5 bg-neutral-200 rounded w-32 mb-1"></div>
                        <div className="h-4 bg-neutral-200 rounded w-48"></div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="h-5 bg-neutral-200 rounded w-20 mb-1"></div>
                      <div className="h-4 bg-neutral-200 rounded w-16"></div>
                    </div>
                  </div>
                </div>
              ))
          ) : activities.length > 0 ? (
            activities.map((activity) => (
              <div
                key={activity.id}
                className="bg-white border border-neutral-100 rounded-lg p-5 hover:shadow-md transition-all duration-300"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        activity.type === "payment_sent" ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"
                      }`}
                    >
                      {activity.type === "payment_sent" ? "↑" : "↓"}
                    </div>
                    <div>
                      <p className="font-medium text-teal-900">{activity.title}</p>
                      <p className="text-sm text-neutral-500">{activity.description}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-teal-900">{new Date(activity.date).toLocaleDateString()}</p>
                    <p className="text-sm text-neutral-500">{activity.time}</p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500">No transaction activity found.</p>
            </div>
          )}
        </div>
      )}
      <WalletConnectModal open={showConnectModal} onOpenChange={setShowConnectModal} />
    </div>
  )
}
