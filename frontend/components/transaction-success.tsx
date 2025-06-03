"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { CheckCircle } from "lucide-react"
import { useRouter } from "next/navigation"

interface TransactionSuccessProps {
  transactionId: string
  propertyAddress: string
  counterpartyName: string
  amount: string
  currency: string
  transactionType: "purchase" | "sale"
  contractRequirements: {
    titleVerification: boolean
    inspectionReport: boolean
    appraisalService: boolean
    fundingRequired: boolean
    escrowPeriod: number
    automaticRelease: boolean
    disputeResolution: boolean
  }
}

// Update the TransactionSuccess component to show different messages based on transaction type
export default function TransactionSuccess({
  transactionId,
  propertyAddress,
  counterpartyName,
  amount,
  currency,
  transactionType,
  contractRequirements,
}: TransactionSuccessProps) {
  const router = useRouter()

  return (
    <div className="max-w-3xl mx-auto">
      <Card className="border-teal-100">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 bg-teal-50 p-3 rounded-full w-16 h-16 flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-teal-600" />
          </div>
          <CardTitle className="text-2xl">Transaction Created Successfully!</CardTitle>
          <CardDescription>
            {transactionType === "purchase"
              ? "Your transaction has been created and funds have been placed in escrow."
              : "Your transaction has been created and sent to the buyer for review."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="bg-teal-50 p-4 rounded-lg border border-teal-100">
            <h3 className="font-medium text-teal-800 mb-2">Transaction Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-teal-600">Transaction ID</p>
                <p className="font-medium">{transactionId}</p>
              </div>
              <div>
                <p className="text-teal-600">Property</p>
                <p className="font-medium">{propertyAddress}</p>
              </div>
              <div>
                <p className="text-teal-600">{transactionType === "purchase" ? "Seller" : "Buyer"}</p>
                <p className="font-medium">{counterpartyName}</p>
              </div>
              <div>
                <p className="text-teal-600">Amount</p>
                <p className="font-medium">
                  {amount} {currency.toUpperCase()}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium">Next Steps</h3>
            {transactionType === "purchase" ? (
              <ul className="space-y-2">
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-teal-600 mr-2 mt-0.5 shrink-0" />
                  <span>
                    Your funds have been securely placed in escrow and will be released to the seller once all
                    conditions are met.
                  </span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-teal-600 mr-2 mt-0.5 shrink-0" />
                  <span>
                    The seller has been notified and will need to provide the required documentation to fulfill the
                    contract conditions.
                  </span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-teal-600 mr-2 mt-0.5 shrink-0" />
                  <span>
                    You'll receive notifications as the transaction progresses. You can also check the status anytime in
                    your transactions dashboard.
                  </span>
                </li>
              </ul>
            ) : (
              <ul className="space-y-2">
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-teal-600 mr-2 mt-0.5 shrink-0" />
                  <span>Your transaction has been created and sent to {counterpartyName} for review.</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-teal-600 mr-2 mt-0.5 shrink-0" />
                  <span>
                    The buyer will review the transaction details, add conditions, and deposit funds into escrow.
                  </span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-teal-600 mr-2 mt-0.5 shrink-0" />
                  <span>
                    You'll be notified when the buyer has reviewed the transaction and deposited funds. You'll then need
                    to confirm the conditions.
                  </span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-teal-600 mr-2 mt-0.5 shrink-0" />
                  <span>
                    You'll receive notifications as the transaction progresses. You can also check the status anytime in
                    your transactions dashboard.
                  </span>
                </li>
              </ul>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row gap-4">
          <Button
            variant="outline"
            onClick={() => router.push("/dashboard")}
            className="w-full sm:w-auto border-teal-200 text-teal-700 hover:bg-teal-50"
          >
            Go to Dashboard
          </Button>
          <Button
            onClick={() => router.push("/transactions")}
            className="w-full sm:w-auto bg-teal-900 hover:bg-teal-800 text-white"
          >
            View All Transactions
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
