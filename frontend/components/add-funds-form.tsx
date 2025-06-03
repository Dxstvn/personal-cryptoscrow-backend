"use client"

import { useState } from "react"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useWalletStore } from "@/lib/mock-wallet"
import { AlertCircle, ArrowRight } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import ConnectWalletButton from "./connect-wallet-button"

interface AddFundsFormProps {
  onAddFunds: (amount: string) => void
  contractAddress?: string
}

export default function AddFundsForm({ onAddFunds, contractAddress }: AddFundsFormProps) {
  const { isConnected, balance } = useWalletStore()
  const [amount, setAmount] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)

  const handleAddFunds = async () => {
    // Validate amount
    if (!amount || Number.parseFloat(amount) <= 0) {
      setError("Please enter a valid amount")
      return
    }

    if (Number.parseFloat(amount) > Number.parseFloat(balance || "0")) {
      setError("Insufficient balance")
      return
    }

    setError(null)
    setIsAdding(true)

    try {
      // Simulate transaction delay
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Call the callback
      onAddFunds(amount)

      // Reset form
      setAmount("")
    } catch (err) {
      console.error("Error adding funds:", err)
      setError("Failed to add funds. Please try again.")
    } finally {
      setIsAdding(false)
    }
  }

  if (!isConnected) {
    return (
      <Card className="border-teal-100">
        <CardContent className="pt-6 text-center">
          <p className="text-neutral-600 mb-4">Connect your wallet to add funds to the escrow contract</p>
          <ConnectWalletButton />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-teal-100">
      <CardContent className="pt-6">
        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="amount" className="font-medium text-teal-900">
              Amount (ETH)
            </Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-right"
            />
            <p className="text-sm text-neutral-500">Available balance: {balance} ETH</p>
          </div>

          {contractAddress && (
            <div className="space-y-2">
              <Label className="font-medium text-teal-900">Contract Address</Label>
              <div className="p-2 bg-neutral-50 rounded border border-neutral-200 text-sm font-mono text-neutral-700 break-all">
                {contractAddress}
              </div>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Button
          onClick={handleAddFunds}
          disabled={
            isAdding ||
            !amount ||
            Number.parseFloat(amount) <= 0 ||
            Number.parseFloat(amount) > Number.parseFloat(balance || "0")
          }
          className="w-full bg-teal-900 hover:bg-teal-800 text-white"
        >
          {isAdding ? "Processing..." : "Add Funds to Escrow"}
          {!isAdding && <ArrowRight className="ml-2 h-4 w-4" />}
        </Button>
      </CardFooter>
    </Card>
  )
}
