"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, ArrowRight, Building2, CheckCircle, Coins, FileText, Info } from "lucide-react"
import Link from "next/link"

export default function NewTransactionPage() {
  const [step, setStep] = useState(1)
  const [transactionType, setTransactionType] = useState("purchase")

  const nextStep = () => {
    setStep(step + 1)
  }

  const prevStep = () => {
    setStep(step - 1)
  }

  return (
    <div className="container px-4 md:px-6 py-10">
      <div className="mb-8">
        <Link href="/dashboard" className="flex items-center text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Create New Transaction</h1>
        <p className="text-muted-foreground">Set up a new escrow for your real estate transaction.</p>
      </div>

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
            <span className="text-sm mt-2">Payment Details</span>
          </div>
          <div className={`flex-1 h-1 mx-2 ${step >= 3 ? "bg-teal-600" : "bg-muted"}`}></div>
          <div className={`flex flex-col items-center ${step >= 3 ? "text-teal-600" : "text-muted-foreground"}`}>
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${step >= 3 ? "border-teal-600 bg-teal-50" : "border-muted"}`}
            >
              <FileText className="h-5 w-5" />
            </div>
            <span className="text-sm mt-2">Terms & Conditions</span>
          </div>
          <div className={`flex-1 h-1 mx-2 ${step >= 4 ? "bg-teal-600" : "bg-muted"}`}></div>
          <div className={`flex flex-col items-center ${step >= 4 ? "text-teal-600" : "text-muted-foreground"}`}>
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${step >= 4 ? "border-teal-600 bg-teal-50" : "border-muted"}`}
            >
              <CheckCircle className="h-5 w-5" />
            </div>
            <span className="text-sm mt-2">Confirmation</span>
          </div>
        </div>
      </div>

      <Card className="max-w-3xl mx-auto">
        {step === 1 && (
          <>
            <CardHeader>
              <CardTitle>Property Details</CardTitle>
              <CardDescription>Enter information about the property being transacted.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="property-address">Property Address</Label>
                <Input id="property-address" placeholder="Enter the full property address" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="property-type">Property Type</Label>
                  <Select>
                    <SelectTrigger id="property-type">
                      <SelectValue placeholder="Select property type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="residential">Residential</SelectItem>
                      <SelectItem value="commercial">Commercial</SelectItem>
                      <SelectItem value="industrial">Industrial</SelectItem>
                      <SelectItem value="land">Land</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="property-id">Property ID/Reference</Label>
                  <Input id="property-id" placeholder="Legal property identifier" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="property-description">Property Description</Label>
                <Textarea id="property-description" placeholder="Brief description of the property" />
              </div>

              <div className="space-y-2">
                <Label>Transaction Type</Label>
                <div className="space-y-2 mt-1">
                  <div
                    className={`flex items-center space-x-2 p-2 rounded-md border cursor-pointer ${
                      transactionType === "purchase" ? "bg-teal-50 border-teal-600" : "hover:bg-gray-50"
                    }`}
                    onClick={() => setTransactionType("purchase")}
                  >
                    <div className="flex h-4 w-4 items-center justify-center rounded-full border border-primary">
                      {transactionType === "purchase" && <div className="h-2 w-2 rounded-full bg-primary"></div>}
                    </div>
                    <Label className="cursor-pointer">Purchase</Label>
                  </div>
                  <div
                    className={`flex items-center space-x-2 p-2 rounded-md border cursor-pointer ${
                      transactionType === "sale" ? "bg-teal-50 border-teal-600" : "hover:bg-gray-50"
                    }`}
                    onClick={() => setTransactionType("sale")}
                  >
                    <div className="flex h-4 w-4 items-center justify-center rounded-full border border-primary">
                      {transactionType === "sale" && <div className="h-2 w-2 rounded-full bg-primary"></div>}
                    </div>
                    <Label className="cursor-pointer">Sale</Label>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button onClick={nextStep} variant="primary">
                Next Step <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </>
        )}

        {step === 2 && (
          <>
            <CardHeader>
              <CardTitle>Payment Details</CardTitle>
              <CardDescription>Configure the cryptocurrency payment for this transaction.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="currency">Cryptocurrency</Label>
                  <Select>
                    <SelectTrigger id="currency">
                      <SelectValue placeholder="Select cryptocurrency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eth">Ethereum (ETH)</SelectItem>
                      <SelectItem value="btc">Bitcoin (BTC)</SelectItem>
                      <SelectItem value="usdc">USD Coin (USDC)</SelectItem>
                      <SelectItem value="usdt">Tether (USDT)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount</Label>
                  <Input id="amount" placeholder="Enter amount" type="number" step="0.01" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="wallet-address">Recipient Wallet Address</Label>
                <Input id="wallet-address" placeholder="Enter the recipient's wallet address" />
                <p className="text-sm text-muted-foreground flex items-center mt-1">
                  <Info className="h-4 w-4 mr-1" /> Double-check this address carefully
                </p>
              </div>

              <div className="space-y-2">
                <Label>Escrow Release Conditions</Label>
                <div className="grid grid-cols-1 gap-2">
                  <div className="flex items-start space-x-2">
                    <input type="checkbox" id="condition-title" className="mt-1" />
                    <Label htmlFor="condition-title" className="font-normal">
                      Property title transfer completed
                    </Label>
                  </div>
                  <div className="flex items-start space-x-2">
                    <input type="checkbox" id="condition-inspection" className="mt-1" />
                    <Label htmlFor="condition-inspection" className="font-normal">
                      Property inspection passed
                    </Label>
                  </div>
                  <div className="flex items-start space-x-2">
                    <input type="checkbox" id="condition-documents" className="mt-1" />
                    <Label htmlFor="condition-documents" className="font-normal">
                      All legal documents signed
                    </Label>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={prevStep}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Previous
              </Button>
              <Button onClick={nextStep} variant="primary">
                Next Step <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </>
        )}

        {step === 3 && (
          <>
            <CardHeader>
              <CardTitle>Terms & Conditions</CardTitle>
              <CardDescription>Review and accept the terms of the escrow service.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-gray-50 p-4 rounded-md max-h-60 overflow-y-auto text-sm">
                <h3 className="font-semibold mb-2">Escrow Service Agreement</h3>
                <p className="mb-2">
                  This Escrow Agreement (the "Agreement") is entered into between the Buyer, the Seller, and
                  CryptoEscrow (the "Escrow Agent").
                </p>
                <p className="mb-2">
                  1. <strong>Services:</strong> The Escrow Agent agrees to hold the cryptocurrency funds in escrow until
                  the specified conditions are met.
                </p>
                <p className="mb-2">
                  2. <strong>Release of Funds:</strong> Funds will only be released when all parties confirm that the
                  conditions have been satisfied or as otherwise provided in this Agreement.
                </p>
                <p className="mb-2">
                  3. <strong>Fees:</strong> A fee of 1.5% of the transaction amount will be charged for the escrow
                  service.
                </p>
                <p className="mb-2">
                  4. <strong>Disputes:</strong> In case of a dispute, the Escrow Agent will hold the funds until the
                  dispute is resolved by the parties or through arbitration.
                </p>
                <p className="mb-2">
                  5. <strong>Compliance:</strong> All parties must comply with applicable laws and regulations,
                  including KYC/AML requirements.
                </p>
                <p>
                  6. <strong>Termination:</strong> This Agreement may be terminated if the transaction is not completed
                  within 90 days, in which case the funds will be returned to the Buyer minus applicable fees.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-start space-x-2">
                  <input type="checkbox" id="terms-accept" className="mt-1" />
                  <Label htmlFor="terms-accept" className="font-normal">
                    I have read and agree to the Terms and Conditions
                  </Label>
                </div>
                <div className="flex items-start space-x-2">
                  <input type="checkbox" id="privacy-accept" className="mt-1" />
                  <Label htmlFor="privacy-accept" className="font-normal">
                    I consent to the Privacy Policy and data processing
                  </Label>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={prevStep}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Previous
              </Button>
              <Button onClick={nextStep} variant="primary">
                Next Step <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </>
        )}

        {step === 4 && (
          <>
            <CardHeader>
              <CardTitle>Confirmation</CardTitle>
              <CardDescription>Review your transaction details before finalizing.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-teal-50 border border-teal-100 rounded-md p-4 flex items-center">
                <CheckCircle className="h-5 w-5 text-teal-600 mr-2" />
                <p className="text-teal-800">
                  Your transaction is ready to be created. Please review the details below.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground">Property Details</h3>
                  <p className="font-medium">123 Blockchain Ave, Crypto City</p>
                  <p className="text-sm text-muted-foreground">Residential Property</p>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground">Payment Details</h3>
                  <p className="font-medium">2.5 ETH</p>
                  <p className="text-sm text-muted-foreground">To: 0x1a2b...3c4d</p>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground">Release Conditions</h3>
                  <ul className="text-sm list-disc list-inside">
                    <li>Property title transfer completed</li>
                    <li>All legal documents signed</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground">Escrow Fee</h3>
                  <p className="font-medium">0.0375 ETH (1.5%)</p>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col sm:flex-row justify-between gap-4">
              <Button variant="outline" onClick={prevStep} className="w-full sm:w-auto">
                <ArrowLeft className="mr-2 h-4 w-4" /> Previous
              </Button>
              <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                <Button variant="outline" className="w-full sm:w-auto">
                  Save as Draft
                </Button>
                <Button variant="primary" asChild className="w-full sm:w-auto">
                  <Link href="/dashboard">Create Transaction</Link>
                </Button>
              </div>
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  )
}
