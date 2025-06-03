"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, FileText, Calendar, DollarSign, Clock, CheckCircle, X, Shield } from "lucide-react"
import TransactionTimeline from "@/components/transaction-timeline"
import TransactionParties from "@/components/transaction-parties"
import { useToast } from "@/components/ui/use-toast"
import { useAuth } from "@/context/auth-context"
import TransactionReview from "@/components/transaction-review"
import SellerConfirmation from "@/components/seller-confirmation"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import TransactionStageIndicator from "@/components/transaction-stage-indicator"
import { useTransaction } from "@/context/transaction-context"

export default function TransactionDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const { user } = useAuth()
  const { fetchTransactionById, updateCondition, loading } = useTransaction()
  const [transaction, setTransaction] = useState<any>(null)
  const [showDocumentModal, setShowDocumentModal] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [currentDocument, setCurrentDocument] = useState<any>(null)
  const [requiredDocuments, setRequiredDocuments] = useState([
    { id: "doc1", name: "Purchase Agreement", type: "AGREEMENT", uploaded: true },
    { id: "doc2", name: "Property Inspection", type: "INSPECTION", uploaded: false },
    { id: "doc3", name: "Title Deed", type: "TITLE", uploaded: false },
  ])

  useEffect(() => {
    const loadTransaction = async () => {
      if (id && typeof id === "string") {
        try {
          const data = await fetchTransactionById(id)
          setTransaction(data)

          // Update required documents based on transaction conditions
          if (data.conditions && Array.isArray(data.conditions)) {
            const docs = data.conditions.map((condition: any) => ({
              id: condition.id,
              name: condition.description || condition.type,
              type: condition.type,
              uploaded: condition.status === "FULFILLED_BY_BUYER",
            }))
            setRequiredDocuments(docs)
          }
        } catch (error) {
          console.error("Error loading transaction:", error)
        }
      }
    }

    loadTransaction()
  }, [id, fetchTransactionById])

  // Determine if the current user is the buyer or seller
  const isBuyer = transaction?.initiatedBy === "SELLER" || transaction?.buyerId === user?.uid
  const isSeller = transaction?.initiatedBy === "BUYER" || transaction?.sellerId === user?.uid

  // For seller-initiated transactions where the buyer needs to review
  const needsBuyerReview = transaction?.status === "PENDING_BUYER_REVIEW" && isBuyer

  // For buyer-initiated transactions where the seller needs to confirm conditions
  const needsSellerConfirmation = transaction?.status === "AWAITING_SELLER_CONFIRMATION" && isSeller

  const handleBuyerReviewComplete = async () => {
    if (id && typeof id === "string") {
      const data = await fetchTransactionById(id)
      setTransaction(data)
    }
  }

  const handleSellerConfirmationComplete = async () => {
    if (id && typeof id === "string") {
      const data = await fetchTransactionById(id)
      setTransaction(data)
    }
  }

  const handleConditionUpdate = async (conditionId: string, fulfilled: boolean) => {
    if (!transaction || !id) return

    try {
      const status = fulfilled ? "FULFILLED_BY_BUYER" : "PENDING_BUYER_ACTION"
      await updateCondition(id.toString(), conditionId, status)

      // Update local state
      setRequiredDocuments((prev) =>
        prev.map((doc) => (doc.id === conditionId ? { ...doc, uploaded: fulfilled } : doc)),
      )

      toast({
        title: fulfilled ? "Condition Fulfilled" : "Condition Pending",
        description: `Condition has been marked as ${fulfilled ? "fulfilled" : "pending"}.`,
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update condition",
        variant: "destructive",
      })
    }
  }

  if (loading && !transaction) {
    return (
      <div className="container px-4 md:px-6 py-10">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-700"></div>
        </div>
      </div>
    )
  }

  if (!transaction) {
    return (
      <div className="container px-4 md:px-6 py-10">
        <div className="text-center py-10">
          <h2 className="text-2xl font-bold">Transaction Not Found</h2>
          <p className="text-muted-foreground mt-2">
            The transaction you're looking for doesn't exist or you don't have permission to view it.
          </p>
          <Button onClick={() => router.push("/transactions")} className="mt-4">
            Back to Transactions
          </Button>
        </div>
      </div>
    )
  }

  // If the transaction needs buyer review, show the review component
  if (needsBuyerReview) {
    return (
      <div className="container px-4 md:px-6 py-10">
        <div className="mb-8">
          <Link href="/transactions" className="flex items-center text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Transactions
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Review Transaction</h1>
          <p className="text-muted-foreground">Transaction ID: {transaction.id}</p>
        </div>

        <div className="max-w-3xl mx-auto">
          <TransactionReview
            transactionId={transaction.id}
            propertyAddress={transaction.propertyAddress}
            propertyDescription={transaction.description}
            amount={`${transaction.amount} ${transaction.currency}`}
            counterpartyName={transaction.sellerName || "Seller"}
            counterpartyWallet={transaction.sellerWalletAddress}
            onReviewComplete={handleBuyerReviewComplete}
          />
        </div>
      </div>
    )
  }

  // If the transaction needs seller confirmation, show the confirmation component
  if (needsSellerConfirmation) {
    return (
      <div className="container px-4 md:px-6 py-10">
        <div className="mb-8">
          <Link href="/transactions" className="flex items-center text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Transactions
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Confirm Transaction Conditions</h1>
          <p className="text-muted-foreground">Transaction ID: {transaction.id}</p>
        </div>

        <div className="max-w-3xl mx-auto">
          <SellerConfirmation
            transactionId={transaction.id}
            propertyAddress={transaction.propertyAddress}
            amount={`${transaction.amount} ${transaction.currency}`}
            buyerName={transaction.buyerName || "Buyer"}
            buyerConditions={
              transaction.conditions || {
                titleVerification: true,
                inspectionReport: true,
                appraisalService: false,
                fundingRequired: true,
                escrowPeriod: 30,
                automaticRelease: true,
                disputeResolution: true,
              }
            }
            onConfirmationComplete={handleSellerConfirmationComplete}
          />
        </div>
      </div>
    )
  }

  // Standard transaction detail view
  return (
    <div className="container px-4 md:px-6 py-10">
      <div className="mb-8">
        <Link href="/transactions" className="flex items-center text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Transactions
        </Link>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{transaction.propertyAddress}</h1>
            <p className="text-muted-foreground">Transaction ID: {transaction.id}</p>
          </div>
          <TransactionStageIndicator stage={transaction.status.toLowerCase()} size="lg" />
        </div>
      </div>

      {/* Transaction Role Banner */}
      {transaction.initiatedBy && (
        <Alert
          className={
            transaction.initiatedBy === "SELLER" ? "bg-teal-50 border-teal-200 mb-6" : "bg-blue-50 border-blue-200 mb-6"
          }
        >
          <Shield className={`h-4 w-4 ${transaction.initiatedBy === "SELLER" ? "text-teal-600" : "text-blue-600"}`} />
          <AlertTitle>
            {transaction.initiatedBy === "SELLER" ? "Seller Initiated Transaction" : "Buyer Initiated Transaction"}
          </AlertTitle>
          <AlertDescription>
            {transaction.initiatedBy === "SELLER"
              ? "This transaction was initiated by the seller. The buyer needs to review and add conditions before funding the escrow."
              : "This transaction was initiated by the buyer. The seller will be notified once funds are placed in escrow."}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <DollarSign className="h-5 w-5 text-teal-700 mr-2" />
              <span className="text-2xl font-bold">
                {transaction.amount} {transaction.currency}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <Clock className="h-5 w-5 text-amber-500 mr-2" />
              <span className="text-lg font-medium capitalize">
                {transaction.status.replace(/_/g, " ").toLowerCase()}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Date Created</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <Calendar className="h-5 w-5 text-teal-700 mr-2" />
              <span className="text-lg font-medium">{new Date(transaction.createdAt).toLocaleDateString()}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <div className="lg:col-span-2">
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Transaction Timeline</CardTitle>
              <CardDescription>Track the progress of your transaction</CardDescription>
            </CardHeader>
            <CardContent>
              {transaction.timeline && transaction.timeline.length > 0 ? (
                <TransactionTimeline
                  events={transaction.timeline.map((event: any) => ({
                    id: event.id || `event-${event.timestamp}`,
                    date: new Date(event.timestamp).toISOString().split("T")[0],
                    event: event.event,
                    status: event.status || "completed",
                  }))}
                />
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  No timeline events available for this transaction.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Transaction Conditions</CardTitle>
                <CardDescription>Required conditions for this transaction</CardDescription>
              </div>
              {isBuyer && transaction.status === "AWAITING_FULFILLMENT" && (
                <Button onClick={() => setShowDocumentModal(true)} className="bg-teal-900 hover:bg-teal-800 text-white">
                  <FileText className="mr-2 h-4 w-4" />
                  Manage Conditions
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {transaction.conditions &&
                  transaction.conditions.map((condition: any) => (
                    <div key={condition.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center">
                        <FileText className="h-5 w-5 text-teal-700 mr-3" />
                        <div>
                          <p className="font-medium">{condition.description || condition.type}</p>
                          <p className="text-sm text-muted-foreground">Required for transaction completion</p>
                        </div>
                      </div>
                      {isBuyer && transaction.status === "AWAITING_FULFILLMENT" ? (
                        <div className="flex items-center space-x-2">
                          <Button
                            variant={condition.status === "FULFILLED_BY_BUYER" ? "default" : "outline"}
                            size="sm"
                            onClick={() => handleConditionUpdate(condition.id, true)}
                            disabled={condition.status === "FULFILLED_BY_BUYER"}
                          >
                            {condition.status === "FULFILLED_BY_BUYER" ? (
                              <CheckCircle className="h-4 w-4 mr-1" />
                            ) : null}
                            Fulfilled
                          </Button>
                          <Button
                            variant={condition.status !== "FULFILLED_BY_BUYER" ? "default" : "outline"}
                            size="sm"
                            onClick={() => handleConditionUpdate(condition.id, false)}
                            disabled={condition.status !== "FULFILLED_BY_BUYER"}
                          >
                            Pending
                          </Button>
                        </div>
                      ) : condition.status === "FULFILLED_BY_BUYER" ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <Clock className="h-5 w-5 text-amber-500" />
                      )}
                    </div>
                  ))}

                {(!transaction.conditions || transaction.conditions.length === 0) && (
                  <div className="text-center py-6 text-muted-foreground">
                    No conditions have been set for this transaction.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Transaction Parties</CardTitle>
              <CardDescription>People involved in this transaction</CardDescription>
            </CardHeader>
            <CardContent>
              <TransactionParties
                buyer={{
                  name: isBuyer ? "You" : transaction.buyerName || "Buyer",
                  email: transaction.buyerEmail || "buyer@example.com",
                }}
                seller={{
                  name: isSeller ? "You" : transaction.sellerName || "Seller",
                  email: transaction.sellerEmail || "seller@example.com",
                }}
              />
            </CardContent>
          </Card>

          {transaction.conditions && transaction.conditions.length > 0 && (
            <Card className="mb-8">
              <CardHeader>
                <CardTitle>Condition Status</CardTitle>
                <CardDescription>Current status of all conditions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {transaction.conditions.map((condition: any) => (
                    <div key={condition.id} className="flex items-center">
                      {condition.status === "FULFILLED_BY_BUYER" ? (
                        <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                      ) : (
                        <Clock className="h-4 w-4 text-amber-500 mr-2" />
                      )}
                      <span>{condition.description || condition.type}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Property Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Address</p>
                  <p className="font-medium">{transaction.propertyAddress}</p>
                </div>

                {transaction.description && (
                  <div>
                    <p className="text-sm text-muted-foreground">Description</p>
                    <p>{transaction.description}</p>
                  </div>
                )}

                {transaction.propertyType && (
                  <div>
                    <p className="text-sm text-muted-foreground">Property Type</p>
                    <p className="font-medium">{transaction.propertyType}</p>
                  </div>
                )}

                {transaction.propertyId && (
                  <div>
                    <p className="text-sm text-muted-foreground">Property ID</p>
                    <p className="font-medium">{transaction.propertyId}</p>
                  </div>
                )}

                {transaction.smartContractAddress && (
                  <div>
                    <p className="text-sm text-muted-foreground">Smart Contract Address</p>
                    <p className="font-mono text-xs break-all">{transaction.smartContractAddress}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {showDocumentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Manage Transaction Conditions</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowDocumentModal(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-3">Required Conditions</h3>
                <div className="space-y-3">
                  {transaction.conditions &&
                    transaction.conditions.map((condition: any) => (
                      <div key={condition.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center">
                          <FileText className="h-5 w-5 text-teal-700 mr-3" />
                          <div>
                            <p className="font-medium">{condition.description || condition.type}</p>
                            <p className="text-sm text-muted-foreground">Required for transaction completion</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant={condition.status === "FULFILLED_BY_BUYER" ? "default" : "outline"}
                            size="sm"
                            onClick={() => handleConditionUpdate(condition.id, true)}
                          >
                            {condition.status === "FULFILLED_BY_BUYER" ? (
                              <CheckCircle className="h-4 w-4 mr-1" />
                            ) : null}
                            Mark as Fulfilled
                          </Button>
                          <Button
                            variant={condition.status !== "FULFILLED_BY_BUYER" ? "default" : "outline"}
                            size="sm"
                            onClick={() => handleConditionUpdate(condition.id, false)}
                          >
                            Mark as Pending
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
