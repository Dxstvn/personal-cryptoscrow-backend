"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useWalletStore, formatAddress } from "@/lib/mock-wallet"
import { Loader2, AlertTriangle, LockKeyhole, Shield } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { useToast } from "@/components/ui/use-toast"

interface TransactionConfirmationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (txHash: string) => void
  onError?: (error: Error) => void
  title: string
  description: string
  amount: string
  recipient: string
}

export default function TransactionConfirmationModal({
  open,
  onOpenChange,
  onSuccess,
  onError,
  title,
  description,
  amount,
  recipient,
}: TransactionConfirmationModalProps) {
  const { address, sendTransaction } = useWalletStore()
  const { addToast } = useToast()
  const [status, setStatus] = useState<"idle" | "pending" | "success" | "error">("idle")
  const [progress, setProgress] = useState(0)
  const [txHash, setTxHash] = useState("")
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async () => {
    try {
      setStatus("pending")
      setProgress(10)

      // Simulate progress updates
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(interval)
            return 90
          }
          return prev + 10
        })
      }, 500)

      // Send transaction
      const hash = await sendTransaction(recipient, amount)
      setTxHash(hash)
      setProgress(100)
      setStatus("success")

      addToast({
        title: "Funds Placed in Escrow",
        description: `Your funds are now securely held in escrow. Transaction hash: ${hash.slice(0, 10)}...${hash.slice(-8)}`,
      })

      if (onSuccess) {
        onSuccess(hash)
      }

      // Clear interval
      clearInterval(interval)
    } catch (err) {
      setStatus("error")
      setError((err as Error).message || "Transaction failed")

      addToast({
        title: "Transaction Failed",
        description: (err as Error).message || "Transaction failed",
        variant: "destructive",
      })

      if (onError) {
        onError(err as Error)
      }
    }
  }

  const handleClose = () => {
    if (status !== "pending") {
      onOpenChange(false)

      // Reset state after closing
      setTimeout(() => {
        setStatus("idle")
        setProgress(0)
        setTxHash("")
        setError(null)
      }, 300)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">From</span>
              <span className="font-medium">{formatAddress(address)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">To Escrow Contract</span>
              <span className="font-medium text-teal-700">
                <LockKeyhole className="h-4 w-4 inline mr-1" />
                Secure Escrow
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Final Recipient</span>
              <span className="font-medium">{formatAddress(recipient)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-medium">{amount} ETH</span>
            </div>
          </div>

          {status === "pending" && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <div className="flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
              </div>
              <p className="text-center text-sm text-muted-foreground">Creating escrow contract... Please wait.</p>
            </div>
          )}

          {status === "success" && (
            <div className="space-y-2 bg-teal-50 p-4 rounded-md">
              <div className="flex justify-center">
                <Shield className="h-8 w-8 text-teal-600" />
              </div>
              <p className="text-center font-medium text-teal-800">Funds Securely Placed in Escrow!</p>
              <p className="text-center text-sm text-teal-600">
                Transaction Hash: {txHash.slice(0, 10)}...{txHash.slice(-8)}
              </p>
              <p className="text-center text-xs text-teal-600 mt-2">
                Your funds will be held securely until all contract conditions are met.
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-2 bg-red-50 p-4 rounded-md">
              <div className="flex justify-center">
                <AlertTriangle className="h-8 w-8 text-red-600" />
              </div>
              <p className="text-center font-medium text-red-800">Transaction Failed</p>
              <p className="text-center text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
          {status === "idle" && (
            <>
              <Button variant="outline" onClick={handleClose} className="mt-3 sm:mt-0">
                Cancel
              </Button>
              <Button onClick={handleConfirm} className="bg-teal-900 hover:bg-teal-800 text-white">
                Create Escrow
              </Button>
            </>
          )}

          {status === "pending" && (
            <Button disabled className="w-full">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...
            </Button>
          )}

          {(status === "success" || status === "error") && (
            <Button onClick={handleClose} className="w-full">
              Close
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
