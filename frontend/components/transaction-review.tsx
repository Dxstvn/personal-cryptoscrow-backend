"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Shield, Info, ArrowRight, CheckCircle } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import RoleBasedRequirements, { type ContractRequirements } from "@/components/role-based-requirements"
import { useDatabaseStore } from "@/lib/mock-database"
import TransactionConfirmationModal from "@/components/transaction-confirmation-modal"
import { useRouter } from "next/navigation"

interface TransactionReviewProps {
  transactionId: string
  propertyAddress: string
  propertyDescription?: string
  amount: string
  counterpartyName: string
  counterpartyWallet: string
  onReviewComplete?: () => void
}

export default function TransactionReview({
  transactionId,
  propertyAddress,
  propertyDescription,
  amount,
  counterpartyName,
  counterpartyWallet,
  onReviewComplete,
}: TransactionReviewProps) {
  const { addToast } = useToast()
  const { updateTransaction } = useDatabaseStore()
  const router = useRouter()

  const [step, setStep] = useState(1)
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [reviewComplete, setReviewComplete] = useState(false)

  // Extract currency from amount (e.g., "2.5 ETH" -> "ETH")
  const currency = amount.split(" ").length > 1 ? amount.split(" ")[1] : ""
  const amountValue = amount.split(" ")[0]

  // Contract requirements based on role
  const [contractRequirements, setContractRequirements] = useState<ContractRequirements>({
    // Seller requirements
    titleVerification: true,
    inspectionReport: true,
    appraisalService: false,

    // Buyer requirements
    fundingRequired: true,

    // Common requirements
    escrowPeriod: 30,
    automaticRelease: true,
    disputeResolution: true,
  })

  const handleNextStep = () => {
    setStep(step + 1)
  }

  const handlePrevStep = () => {
    setStep(step - 1)
  }

  const handleSubmitReview = () => {
    // Update transaction with buyer's conditions
    updateTransaction(transactionId, {
      status: "awaiting_funds",
      buyerConditions: contractRequirements,
      progress: 30,
      timeline: [
        {
          id: `t${Date.now()}-1`,
          date: new Date().toISOString().split("T")[0],
          event: "Buyer reviewed transaction",
          status: "completed",
        },
        {
          id: `t${Date.now()}-2`,
          date: new Date().toISOString().split("T")[0],
          event: "Buyer added conditions",
          status: "completed",
        },
        {
          id: `t${Date.now()}-3`,
          date: new Date().toISOString().split("T")[0],
          event: "Awaiting funds deposit",
          status: "in_progress",
        },
      ],
    })

    addToast({
      title: "Review Complete",
      description:
        "You have successfully reviewed the transaction and added conditions. Please proceed to fund the escrow.",
    })

    setReviewComplete(true)
    if (onReviewComplete) {
      onReviewComplete()
    }
  }

  const handleFundEscrow = () => {
    setConfirmationOpen(true)
  }

  const handleTransactionSuccess = (txHash: string) => {
    // Update transaction status after funding
    updateTransaction(transactionId, {
      status: "awaiting_seller_confirmation",
      escrowAddress: txHash,
      progress: 60,
      timeline: [
        {
          id: `t${Date.now()}-4`,
          date: new Date().toISOString().split("T")[0],
          event: "Funds deposited to escrow",
          status: "completed",
        },
        {
          id: `t${Date.now()}-5`,
          date: new Date().toISOString().split("T")[0],
          event: "Awaiting seller confirmation",
          status: "in_progress",
        },
      ],
    })

    addToast({
      title: "Funds Deposited",
      description:
        "You have successfully deposited funds into escrow. The seller will be notified to review and confirm the conditions.",
    })

    // Redirect to transaction details page
    setTimeout(() => {
      router.push(`/transactions/${transactionId}`)
    }, 2000)
  }

  if (reviewComplete) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Review Complete</CardTitle>
          <CardDescription>You have successfully reviewed the transaction and added conditions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-center p-6 bg-green-50 rounded-lg">
            <div className="text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-green-700">Transaction Conditions Set</h3>
              <p className="text-green-600 mt-2">
                Your conditions have been added to the transaction. Please proceed to fund the escrow.
              </p>
            </div>
          </div>

          <Alert className="bg-teal-50 border-teal-200">
            <Shield className="h-4 w-4 text-teal-600" />
            <AlertTitle>Next Step: Fund the Escrow</AlertTitle>
            <AlertDescription>
              To proceed with this transaction, you need to deposit {amount} into the escrow smart contract.
            </AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter>
          <Button onClick={handleFundEscrow} className="w-full bg-teal-900 hover:bg-teal-800 text-white">
            Fund Escrow Now <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review Seller's Transaction</CardTitle>
        <CardDescription>
          {counterpartyName} has initiated a transaction for {propertyAddress}. Please review and add your conditions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {step === 1 && (
          <>
            <Alert className="bg-blue-50 border-blue-200">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertTitle>Seller-Initiated Transaction</AlertTitle>
              <AlertDescription>
                This transaction was initiated by the seller. You need to review the details and add your conditions
                before funding the escrow.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground">Property Address</h3>
                  <p className="font-medium">{propertyAddress}</p>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground">Amount</h3>
                  <p className="font-medium">{amount}</p>
                </div>
              </div>

              {propertyDescription && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground">Description</h3>
                  <p>{propertyDescription}</p>
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold text-muted-foreground">Seller</h3>
                <p className="font-medium">{counterpartyName}</p>
                <p className="text-sm text-muted-foreground">
                  Wallet: {counterpartyWallet.slice(0, 6)}...{counterpartyWallet.slice(-4)}
                </p>
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <RoleBasedRequirements
            transactionType="purchase"
            onChange={setContractRequirements}
            initialOptions={contractRequirements}
          />
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        {step === 1 ? (
          <Button onClick={handleNextStep} className="ml-auto bg-teal-900 hover:bg-teal-800 text-white">
            Add Conditions <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              onClick={handlePrevStep}
              className="border-teal-200 text-teal-700 hover:bg-teal-50"
            >
              Back to Details
            </Button>
            <Button onClick={handleSubmitReview} className="bg-teal-900 hover:bg-teal-800 text-white">
              Submit Review
            </Button>
          </>
        )}
      </CardFooter>

      <TransactionConfirmationModal
        open={confirmationOpen}
        onOpenChange={setConfirmationOpen}
        title="Fund Escrow Contract"
        description="Please confirm to place your funds in escrow. Funds will be held securely until all contract conditions are met."
        amount={amountValue}
        recipient={counterpartyWallet}
        onSuccess={handleTransactionSuccess}
      />
    </Card>
  )
}
