"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Shield, Info, CheckCircle, X, ArrowRight } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useDatabaseStore } from "@/lib/mock-database"
import { useRouter } from "next/navigation"
import type { ContractRequirements } from "@/components/role-based-requirements"

interface SellerConfirmationProps {
  transactionId: string
  propertyAddress: string
  amount: string
  buyerName: string
  buyerConditions: ContractRequirements
  onConfirmationComplete?: () => void
}

export default function SellerConfirmation({
  transactionId,
  propertyAddress,
  amount,
  buyerName,
  buyerConditions,
  onConfirmationComplete,
}: SellerConfirmationProps) {
  const { addToast } = useToast()
  const { updateTransaction } = useDatabaseStore()
  const router = useRouter()
  const [confirmed, setConfirmed] = useState(false)

  const handleConfirm = () => {
    // Update transaction status after seller confirmation
    updateTransaction(transactionId, {
      status: "in_escrow",
      sellerAccepted: true,
      progress: 70,
      timeline: [
        {
          id: `t${Date.now()}-1`,
          date: new Date().toISOString().split("T")[0],
          event: "Seller confirmed conditions",
          status: "completed",
        },
        {
          id: `t${Date.now()}-2`,
          date: new Date().toISOString().split("T")[0],
          event: "Smart contract deployed",
          status: "completed",
        },
        {
          id: `t${Date.now()}-3`,
          date: new Date().toISOString().split("T")[0],
          event: "Transaction in escrow",
          status: "in_progress",
        },
      ],
    })

    addToast({
      title: "Conditions Confirmed",
      description: "You have confirmed the buyer's conditions. The transaction is now in escrow.",
    })

    setConfirmed(true)
    if (onConfirmationComplete) {
      onConfirmationComplete()
    }

    // Redirect to transaction details page
    setTimeout(() => {
      router.push(`/transactions/${transactionId}`)
    }, 2000)
  }

  const handleReject = () => {
    // Update transaction status after seller rejection
    updateTransaction(transactionId, {
      status: "disputed",
      sellerAccepted: false,
      progress: 30,
      timeline: [
        {
          id: `t${Date.now()}-1`,
          date: new Date().toISOString().split("T")[0],
          event: "Seller rejected conditions",
          status: "completed",
        },
        {
          id: `t${Date.now()}-2`,
          date: new Date().toISOString().split("T")[0],
          event: "Transaction disputed",
          status: "in_progress",
        },
      ],
    })

    addToast({
      title: "Conditions Rejected",
      description: "You have rejected the buyer's conditions. The transaction is now in dispute status.",
      variant: "destructive",
    })

    // Redirect to transaction details page
    setTimeout(() => {
      router.push(`/transactions/${transactionId}`)
    }, 2000)
  }

  if (confirmed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Conditions Confirmed</CardTitle>
          <CardDescription>You have successfully confirmed the buyer's conditions.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-6 bg-green-50 rounded-lg">
            <div className="text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-green-700">Transaction In Escrow</h3>
              <p className="text-green-600 mt-2">
                The transaction is now in escrow. You will need to fulfill the buyer's conditions to complete the
                transaction.
              </p>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button
            onClick={() => router.push(`/transactions/${transactionId}`)}
            className="w-full bg-teal-900 hover:bg-teal-800 text-white"
          >
            View Transaction Details <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Confirm Buyer's Conditions</CardTitle>
        <CardDescription>
          {buyerName} has funded the escrow for {propertyAddress}. Please review and confirm the conditions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert className="bg-blue-50 border-blue-200">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertTitle>Buyer Has Funded Escrow</AlertTitle>
          <AlertDescription>
            The buyer has deposited {amount} into escrow. You need to confirm the conditions before the transaction can
            proceed.
          </AlertDescription>
        </Alert>

        <div className="bg-neutral-50 p-4 rounded-lg border border-neutral-200">
          <h3 className="font-medium mb-4">Buyer's Conditions</h3>
          <ul className="space-y-2">
            {buyerConditions.titleVerification && (
              <li className="flex items-center">
                <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                <span>Title Deeds Submission Required</span>
              </li>
            )}
            {buyerConditions.inspectionReport && (
              <li className="flex items-center">
                <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                <span>Inspection Report Required</span>
              </li>
            )}
            {buyerConditions.appraisalService && (
              <li className="flex items-center">
                <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                <span>Property Appraisal Required</span>
              </li>
            )}
            <li className="flex items-center">
              <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
              <span>Escrow Period: {buyerConditions.escrowPeriod} days</span>
            </li>
            {buyerConditions.automaticRelease && (
              <li className="flex items-center">
                <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                <span>Automatic Release When Verified</span>
              </li>
            )}
            {buyerConditions.disputeResolution && (
              <li className="flex items-center">
                <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                <span>Dispute Resolution Mechanism</span>
              </li>
            )}
          </ul>
        </div>

        <Alert className="bg-amber-50 border-amber-200">
          <Shield className="h-4 w-4 text-amber-600" />
          <AlertTitle>Important</AlertTitle>
          <AlertDescription>
            By confirming these conditions, you agree to provide all required documentation and fulfill the buyer's
            conditions within the specified escrow period.
          </AlertDescription>
        </Alert>
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row gap-4">
        <Button
          variant="outline"
          onClick={handleReject}
          className="w-full sm:w-auto border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
        >
          <X className="mr-2 h-4 w-4" /> Reject Conditions
        </Button>
        <Button onClick={handleConfirm} className="w-full sm:w-auto bg-teal-900 hover:bg-teal-800 text-white">
          <CheckCircle className="mr-2 h-4 w-4" /> Confirm Conditions
        </Button>
      </CardFooter>
    </Card>
  )
}
