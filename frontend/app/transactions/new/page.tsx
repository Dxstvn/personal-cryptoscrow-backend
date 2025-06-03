"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, ArrowRight, Building2, Coins, FileText, AlertCircle, Shield, LockKeyhole } from "lucide-react"
import Link from "next/link"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useWallet } from "@/context/wallet-context"
import { useToast } from "@/components/ui/use-toast"
import ConnectWalletButton from "@/components/connect-wallet-button"
import TransactionConfirmationModal from "@/components/transaction-confirmation-modal"
import TransactionSuccess from "@/components/transaction-success"
import RoleBasedRequirements, { type ContractRequirements } from "@/components/role-based-requirements"
import { CompactInfo } from "@/components/compact-info"
import { useRouter } from "next/navigation"
import { useAuth } from "@/context/auth-context"
import { useTransaction } from "@/context/transaction-context"

// Mock contacts data
const mockContacts = [
  {
    id: "C123456",
    name: "John Smith",
    email: "john.smith@example.com",
    wallet: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
  },
  {
    id: "C789012",
    name: "Sarah Johnson",
    email: "sarah.johnson@example.com",
    wallet: "0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF",
  },
  {
    id: "C345678",
    name: "Michael Chen",
    email: "michael.chen@example.com",
    wallet: "0x6813Eb9362372EEF6200f3b1dbC3f819671cBA69",
  },
]

export default function NewTransactionPage() {
  const { isConnected, connectWallet, isConnecting, error: walletError } = useWallet()
  const { user } = useAuth()
  const { addToast } = useToast()
  const { createNewTransaction } = useTransaction()
  const router = useRouter()

  const [step, setStep] = useState(1)
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [transactionCreated, setTransactionCreated] = useState(false)
  const [transactionId, setTransactionId] = useState("")
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  // Form state
  const [propertyAddress, setPropertyAddress] = useState("")
  const [propertyType, setPropertyType] = useState("")
  const [propertyId, setPropertyId] = useState("")
  const [propertyDescription, setPropertyDescription] = useState("")
  const [transactionType, setTransactionType] = useState("purchase")

  // Counterparty information
  const [selectedContact, setSelectedContact] = useState("")
  const [counterpartyName, setCounterpartyName] = useState("")
  const [counterpartyEmail, setCounterpartyEmail] = useState("")
  const [counterpartyWallet, setCounterpartyWallet] = useState("")

  const [currency, setCurrency] = useState("eth")
  const [amount, setAmount] = useState("")

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

  // Calculate fees - only base fee
  const baseFee = amount ? Number.parseFloat(amount) * 0.015 : 0 // 1.5% base fee
  const totalFees = baseFee
  const totalAmount = amount ? Number.parseFloat(amount) : 0
  const grandTotal = totalAmount + totalFees

  // Handle contact selection
  const handleContactSelect = (contactId: string) => {
    setSelectedContact(contactId)

    if (contactId) {
      const contact = mockContacts.find((c) => c.id === contactId)
      if (contact) {
        setCounterpartyName(contact.name)
        setCounterpartyEmail(contact.email)
        setCounterpartyWallet(contact.wallet)
      }
    }
  }

  const validateStep = (stepNumber: number): boolean => {
    const errors: Record<string, string> = {}

    if (stepNumber === 1) {
      if (!propertyAddress.trim()) {
        errors.propertyAddress = "Property address is required"
      }
      if (!propertyType) {
        errors.propertyType = "Property type is required"
      }
      if (!propertyId.trim()) {
        errors.propertyId = "Property ID is required"
      }
      if (!selectedContact) {
        errors.selectedContact = "Please select a contact"
      }
    }

    if (stepNumber === 2) {
      if (!currency) {
        errors.currency = "Currency is required"
      }
      if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        errors.amount = "Please enter a valid amount"
      }
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const nextStep = () => {
    // Validate current step
    if (!validateStep(step)) {
      // Show validation errors
      addToast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      })
      return
    }

    setStep(step + 1)
  }

  const prevStep = () => {
    setStep(step - 1)
  }

  const handleSubmit = () => {
    setConfirmationOpen(true)
  }

  // Update the handleTransactionSuccess function to use our API
  const handleTransactionSuccess = async (txHash: string) => {
    try {
      // Convert contract requirements to initial conditions format
      const initialConditions = []

      if (contractRequirements.titleVerification) {
        initialConditions.push({
          id: "cond-title-v1",
          type: "TITLE_DEED",
          description: "Title deed clear and verified.",
        })
      }

      if (contractRequirements.inspectionReport) {
        initialConditions.push({
          id: "cond-insp-v1",
          type: "INSPECTION",
          description: "Property inspection satisfactory.",
        })
      }

      if (contractRequirements.appraisalService) {
        initialConditions.push({
          id: "cond-appr-v1",
          type: "APPRAISAL",
          description: "Property appraisal completed and satisfactory.",
        })
      }

      // Create transaction data object
      const transactionData = {
        initiatedBy: transactionType === "purchase" ? "BUYER" : "SELLER",
        propertyAddress,
        amount: Number.parseFloat(amount),
        currency: currency.toUpperCase(),
        otherPartyEmail: counterpartyEmail,
        buyerWalletAddress: transactionType === "purchase" ? user?.walletAddress : counterpartyWallet,
        sellerWalletAddress: transactionType === "purchase" ? counterpartyWallet : user?.walletAddress,
        initialConditions,
        propertyType,
        propertyId,
        description: propertyDescription,
        escrowPeriod: contractRequirements.escrowPeriod,
        automaticRelease: contractRequirements.automaticRelease,
        disputeResolution: contractRequirements.disputeResolution,
        smartContractTxHash: txHash, // If available from wallet transaction
      }

      // Call API to create transaction
      const result = await createNewTransaction(transactionData)

      // Set the transaction ID from the API response
      setTransactionId(result.transactionId)

      // Show success message
      addToast({
        title: "Transaction Created",
        description: `Your transaction has been created successfully. Transaction ID: ${result.transactionId}`,
      })

      // Show success screen
      setTransactionCreated(true)

      // After a delay, redirect to the transactions page
      setTimeout(() => {
        router.push("/transactions")
      }, 5000)
    } catch (error: any) {
      addToast({
        title: "Error",
        description: error.message || "Failed to create transaction",
        variant: "destructive",
      })
    }
  }

  // If transaction is created, show success screen
  if (transactionCreated) {
    return (
      <TransactionSuccess
        transactionId={transactionId}
        propertyAddress={propertyAddress}
        counterpartyName={counterpartyName}
        amount={amount}
        currency={currency}
        transactionType={transactionType}
        contractRequirements={contractRequirements}
      />
    )
  }

  return (
    <div className="container px-4 md:px-6 py-10">
      <div className="mb-8">
        <Link href="/dashboard" className="flex items-center text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Create Escrow Transaction</h1>
        <p className="text-muted-foreground">Set up a new escrow for your real estate transaction.</p>
      </div>

      {!isConnected ? (
        <div className="max-w-3xl mx-auto">
          <Alert className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Wallet Not Connected</AlertTitle>
            <AlertDescription>Please connect your wallet to create a new transaction.</AlertDescription>
          </Alert>

          <Card className="text-center p-8">
            <CardHeader>
              <CardTitle>Connect Your Wallet</CardTitle>
              <CardDescription>You need to connect your wallet to create a new transaction.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-center">
                <ConnectWalletButton size="lg" />
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center w-full max-w-3xl mx-auto">
              <div className={`flex flex-col items-center ${step >= 1 ? "text-teal-600" : "text-muted-foreground"}`}>
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${step >= 1 ? "border-teal-600 bg-teal-50" : "border-muted"}`}
                >
                  <Building2 className="h-5 w-5" />
                </div>
                <span className="text-sm mt-2">Property Details</span>
              </div>
              <div className={`flex-1 h-1 mx-2 ${step >= 2 ? "bg-teal-600" : "bg-muted"}`}></div>
              <div className={`flex flex-col items-center ${step >= 2 ? "text-teal-600" : "text-muted-foreground"}`}>
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${step >= 2 ? "border-teal-600 bg-teal-50" : "border-muted"}`}
                >
                  <Coins className="h-5 w-5" />
                </div>
                <span className="text-sm mt-2">Escrow Amount</span>
              </div>
              <div className={`flex-1 h-1 mx-2 ${step >= 3 ? "bg-teal-600" : "bg-muted"}`}></div>
              <div className={`flex flex-col items-center ${step >= 3 ? "text-teal-600" : "text-muted-foreground"}`}>
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${step >= 3 ? "border-teal-600 bg-teal-50" : "border-muted"}`}
                >
                  <FileText className="h-5 w-5" />
                </div>
                <span className="text-sm mt-2">Contract Terms</span>
              </div>
              <div className={`flex-1 h-1 mx-2 ${step >= 4 ? "bg-teal-600" : "bg-muted"}`}></div>
              <div className={`flex flex-col items-center ${step >= 4 ? "text-teal-600" : "text-muted-foreground"}`}>
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${step >= 4 ? "border-teal-600 bg-teal-50" : "border-muted"}`}
                >
                  <LockKeyhole className="h-5 w-5" />
                </div>
                <span className="text-sm mt-2">Escrow Creation</span>
              </div>
            </div>
          </div>

          <Card className="max-w-3xl mx-auto">
            {step === 1 && (
              <>
                <CardHeader>
                  <CardTitle>Property & Counterparty Details</CardTitle>
                  <CardDescription>Enter information about the property and select your counterparty.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Security Notice */}
                  <Alert className="bg-teal-50 border-teal-200 text-teal-800">
                    <Shield className="h-4 w-4" />
                    <AlertTitle>Verified Transactions Only</AlertTitle>
                    <AlertDescription>
                      For security reasons, you can only transact with your verified contacts. This ensures wallet
                      addresses are pre-verified and reduces the risk of errors.
                    </AlertDescription>
                  </Alert>

                  {/* Property Details Section */}
                  <div>
                    <h3 className="text-lg font-medium mb-4">Property Information</h3>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="property-address" className="flex items-center">
                          Property Address <span className="text-red-500 ml-1">*</span>
                        </Label>
                        <Input
                          id="property-address"
                          placeholder="Enter the full property address"
                          value={propertyAddress}
                          onChange={(e) => setPropertyAddress(e.target.value)}
                          className={validationErrors.propertyAddress ? "border-red-500" : ""}
                        />
                        {validationErrors.propertyAddress && (
                          <p className="text-red-500 text-sm">{validationErrors.propertyAddress}</p>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="property-type" className="flex items-center">
                            Property Type <span className="text-red-500 ml-1">*</span>
                          </Label>
                          <Select value={propertyType} onValueChange={setPropertyType}>
                            <SelectTrigger
                              id="property-type"
                              className={validationErrors.propertyType ? "border-red-500" : ""}
                            >
                              <SelectValue placeholder="Select property type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="residential">Residential</SelectItem>
                              <SelectItem value="commercial">Commercial</SelectItem>
                              <SelectItem value="industrial">Industrial</SelectItem>
                              <SelectItem value="land">Land</SelectItem>
                            </SelectContent>
                          </Select>
                          {validationErrors.propertyType && (
                            <p className="text-red-500 text-sm">{validationErrors.propertyType}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="property-id" className="flex items-center">
                            Property ID/Reference <span className="text-red-500 ml-1">*</span>
                          </Label>
                          <Input
                            id="property-id"
                            placeholder="Legal property identifier"
                            value={propertyId}
                            onChange={(e) => setPropertyId(e.target.value)}
                            className={validationErrors.propertyId ? "border-red-500" : ""}
                          />
                          {validationErrors.propertyId && (
                            <p className="text-red-500 text-sm">{validationErrors.propertyId}</p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="property-description">Property Description</Label>
                        <Textarea
                          id="property-description"
                          placeholder="Brief description of the property"
                          value={propertyDescription}
                          onChange={(e) => setPropertyDescription(e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Transaction Type</Label>
                        <div className="space-y-2 mt-1">
                          <div className="flex items-center space-x-2">
                            <div
                              className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-gray-700 cursor-pointer"
                              onClick={() => setTransactionType("purchase")}
                            >
                              {transactionType === "purchase" && (
                                <div className="h-3 w-3 rounded-full bg-gray-700"></div>
                              )}
                            </div>
                            <Label className="cursor-pointer" onClick={() => setTransactionType("purchase")}>
                              Purchase
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div
                              className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-gray-700 cursor-pointer"
                              onClick={() => setTransactionType("sale")}
                            >
                              {transactionType === "sale" && <div className="h-3 w-3 rounded-full bg-gray-700"></div>}
                            </div>
                            <Label className="cursor-pointer" onClick={() => setTransactionType("sale")}>
                              Sale
                            </Label>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Counterparty Section */}
                  <div className="border-t pt-6">
                    <h3 className="text-lg font-medium mb-4">Select Counterparty</h3>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="contact-select" className="flex items-center">
                          Select Contact <span className="text-red-500 ml-1">*</span>
                        </Label>
                        <Select value={selectedContact} onValueChange={handleContactSelect} required>
                          <SelectTrigger
                            id="contact-select"
                            className={validationErrors.selectedContact ? "border-red-500" : ""}
                          >
                            <SelectValue placeholder="Select a contact to transact with" />
                          </SelectTrigger>
                          <SelectContent>
                            {mockContacts.map((contact) => (
                              <SelectItem key={contact.id} value={contact.id}>
                                {contact.name} ({contact.email})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {validationErrors.selectedContact && (
                          <p className="text-red-500 text-sm">{validationErrors.selectedContact}</p>
                        )}
                        <p className="text-sm text-muted-foreground mt-1">
                          Don't see your counterparty?{" "}
                          <Link href="/contacts" className="text-teal-600 hover:underline">
                            Add a new contact
                          </Link>{" "}
                          first.
                        </p>
                      </div>

                      {selectedContact && (
                        <div className="bg-neutral-50 p-4 rounded-lg border border-neutral-200">
                          <h4 className="font-medium mb-3">Contact Information</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <p className="text-sm text-neutral-500">Name</p>
                              <p className="font-medium">{counterpartyName}</p>
                            </div>
                            <div>
                              <p className="text-sm text-neutral-500">Email</p>
                              <p className="font-medium">{counterpartyEmail}</p>
                            </div>
                            <div className="col-span-1 md:col-span-2">
                              <p className="text-sm text-neutral-500">Wallet Address</p>
                              <p className="font-medium text-xs md:text-sm font-mono break-all">{counterpartyWallet}</p>
                            </div>
                            <div>
                              <p className="text-sm text-neutral-500">Role in Transaction</p>
                              <p className="font-medium">{transactionType === "purchase" ? "Seller" : "Buyer"}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end">
                  <Button onClick={nextStep} className="bg-teal-900 hover:bg-teal-800 text-white">
                    Next Step <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardFooter>
              </>
            )}

            {step === 2 && (
              <>
                <CardHeader>
                  <CardTitle>Escrow Amount</CardTitle>
                  <CardDescription>Configure the amount to be held in escrow until conditions are met.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <CompactInfo title="How Escrow Works" variant="warning" defaultOpen={true}>
                    The funds you specify will be locked in a smart contract and held in escrow. They will only be
                    released to the {transactionType === "purchase" ? "seller" : "buyer"} when all contract conditions
                    are met and verified.
                  </CompactInfo>

                  <div className="bg-neutral-50 p-4 rounded-lg border border-neutral-200 mb-4">
                    <h4 className="font-medium mb-2">Transaction With</h4>
                    <div className="flex items-center">
                      <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-800 font-semibold mr-3">
                        {counterpartyName
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </div>
                      <div>
                        <p className="font-medium">{counterpartyName}</p>
                        <p className="text-sm text-neutral-500">
                          {transactionType === "purchase" ? "Seller" : "Buyer"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="currency" className="flex items-center">
                        Cryptocurrency <span className="text-red-500 ml-1">*</span>
                      </Label>
                      <Select value={currency} onValueChange={setCurrency}>
                        <SelectTrigger id="currency" className={validationErrors.currency ? "border-red-500" : ""}>
                          <SelectValue placeholder="Select cryptocurrency" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="eth">Ethereum (ETH)</SelectItem>
                          <SelectItem value="btc">Bitcoin (BTC)</SelectItem>
                          <SelectItem value="usdc">USD Coin (USDC)</SelectItem>
                          <SelectItem value="usdt">Tether (USDT)</SelectItem>
                        </SelectContent>
                      </Select>
                      {validationErrors.currency && <p className="text-red-500 text-sm">{validationErrors.currency}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="amount" className="flex items-center">
                        Amount to Place in Escrow <span className="text-red-500 ml-1">*</span>
                      </Label>
                      <Input
                        id="amount"
                        placeholder="Enter amount"
                        type="number"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className={validationErrors.amount ? "border-red-500" : ""}
                      />
                      {validationErrors.amount && <p className="text-red-500 text-sm">{validationErrors.amount}</p>}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="wallet-address">Recipient Wallet Address</Label>
                    <div className="p-3 bg-neutral-50 rounded border border-neutral-200 text-sm font-mono break-all">
                      {counterpartyWallet}
                    </div>
                    <p className="text-sm text-muted-foreground flex items-center mt-1">
                      <Shield className="h-4 w-4 mr-1 text-teal-600" /> This wallet address has been verified for{" "}
                      {counterpartyName}
                    </p>
                  </div>

                  <div className="bg-neutral-50 p-4 rounded-lg border border-neutral-200">
                    <h3 className="font-medium mb-2">Escrow Fee Breakdown</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Base Fee (1.5%)</span>
                        <span>
                          {baseFee.toFixed(5)} {currency.toUpperCase()}
                        </span>
                      </div>
                      <div className="border-t pt-2 mt-2">
                        <div className="flex justify-between font-semibold">
                          <span>Total Fees</span>
                          <span>
                            {totalFees.toFixed(5)} {currency.toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <div className="border-t pt-2 mt-2">
                        <div className="flex justify-between font-bold">
                          <span>Total to be Held in Escrow</span>
                          <span>
                            {grandTotal.toFixed(5)} {currency.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between">
                  <Button
                    variant="outline"
                    onClick={prevStep}
                    className="border-teal-200 text-teal-700 hover:bg-teal-50"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" /> Previous
                  </Button>
                  <Button onClick={nextStep} className="bg-teal-900 hover:bg-teal-800 text-white">
                    Next Step <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardFooter>
              </>
            )}

            {step === 3 && (
              <>
                <CardHeader>
                  <CardTitle>Contract Terms & Conditions</CardTitle>
                  <CardDescription>
                    Define the conditions that must be met before funds are released from escrow.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <CompactInfo
                    title="Smart Contract Conditions"
                    variant="info"
                    icon={<LockKeyhole className="h-4 w-4" />}
                    defaultOpen={true}
                  >
                    These conditions will be encoded in the smart contract. Funds will only be released from escrow when
                    all selected conditions are verified as complete.
                  </CompactInfo>

                  <RoleBasedRequirements
                    transactionType={transactionType}
                    onChange={setContractRequirements}
                    initialOptions={contractRequirements}
                  />
                </CardContent>
                <CardFooter className="flex justify-between">
                  <Button
                    variant="outline"
                    onClick={prevStep}
                    className="border-teal-200 text-teal-700 hover:bg-teal-50"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" /> Previous
                  </Button>
                  <Button onClick={nextStep} className="bg-teal-900 hover:bg-teal-800 text-white">
                    Next Step <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardFooter>
              </>
            )}

            {step === 4 && (
              <>
                <CardHeader>
                  <CardTitle>Escrow Creation</CardTitle>
                  <CardDescription>Review details before placing funds in escrow.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="bg-teal-50 border border-teal-100 rounded-md p-4 flex items-center">
                    <LockKeyhole className="h-5 w-5 text-teal-600 mr-2" />
                    <p className="text-teal-800">
                      Your transaction is ready to be created. Once confirmed, your funds will be securely held in
                      escrow until all conditions are met.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-muted-foreground">Property Details</h3>
                      <p className="font-medium">{propertyAddress || "123 Blockchain Ave, Crypto City"}</p>
                      <p className="text-sm text-muted-foreground">{propertyType || "Residential"} Property</p>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-muted-foreground">Counterparty</h3>
                      <p className="font-medium">{counterpartyName}</p>
                      <p className="text-sm text-muted-foreground">{counterpartyEmail}</p>
                      <p className="text-sm text-muted-foreground">
                        Wallet: {counterpartyWallet.slice(0, 6)}...{counterpartyWallet.slice(-4)}
                      </p>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-muted-foreground">Escrow Amount</h3>
                      <p className="font-medium">
                        {amount} {currency.toUpperCase()}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        To be released to: {counterpartyWallet.slice(0, 6)}...{counterpartyWallet.slice(-4)}
                      </p>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-muted-foreground">Required Conditions for Release</h3>
                      <ul className="text-sm list-disc list-inside">
                        {transactionType === "purchase" ? (
                          // Buyer's view - seller requirements
                          <>
                            <li>You have deposited funds into escrow</li>
                            <li>Seller must provide required documentation:</li>
                            <ul className="ml-6 list-circle">
                              {contractRequirements.titleVerification && <li>Title deeds submission</li>}
                              {contractRequirements.inspectionReport && <li>Inspection report</li>}
                              {contractRequirements.appraisalService && <li>Property appraisal</li>}
                            </ul>
                          </>
                        ) : (
                          // Seller's view - buyer requirements and seller responsibilities
                          <>
                            <li>Buyer must deposit funds into escrow</li>
                            <li>You must provide required documentation:</li>
                            <ul className="ml-6 list-circle">
                              {contractRequirements.titleVerification && <li>Title deeds submission</li>}
                              {contractRequirements.inspectionReport && <li>Property appraisal</li>}
                            </ul>
                          </>
                        )}
                        {contractRequirements.automaticRelease && <li>Automatic release when all conditions met</li>}
                        {contractRequirements.disputeResolution && <li>Dispute resolution mechanism included</li>}
                        <li>Escrow period: {contractRequirements.escrowPeriod} days</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-muted-foreground">Escrow Fee</h3>
                      <p className="font-medium">
                        {totalFees.toFixed(5)} {currency.toUpperCase()} (1.5% base fee)
                      </p>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-muted-foreground">Total Amount</h3>
                      <p className="font-bold text-lg">
                        {grandTotal.toFixed(5)} {currency.toUpperCase()}
                      </p>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col sm:flex-row sm:justify-between gap-4">
                  <Button
                    variant="outline"
                    onClick={prevStep}
                    className="w-full sm:w-auto border-teal-200 text-teal-700 hover:bg-teal-50"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" /> Previous
                  </Button>
                  <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto sm:ml-auto">
                    <Button
                      variant="outline"
                      className="w-full sm:w-auto border-teal-200 text-teal-700 hover:bg-teal-50"
                    >
                      Save as Draft
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      className="w-full sm:w-auto bg-teal-900 hover:bg-teal-800 text-white"
                    >
                      Create Escrow Contract
                    </Button>
                  </div>
                </CardFooter>
              </>
            )}
          </Card>

          <TransactionConfirmationModal
            open={confirmationOpen}
            onOpenChange={setConfirmationOpen}
            title="Create Escrow Contract"
            description="Please confirm to place your funds in escrow. Funds will be held securely until all contract conditions are met."
            amount={amount}
            recipient={counterpartyWallet}
            onSuccess={handleTransactionSuccess}
          />
        </>
      )}
    </div>
  )
}
