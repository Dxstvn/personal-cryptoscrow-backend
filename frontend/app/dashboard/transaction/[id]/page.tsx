import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  ArrowLeft,
  Building2,
  CheckCircle,
  Clock,
  Download,
  ExternalLink,
  FileText,
  LockKeyhole,
  MessageSquare,
  UserCheck,
  DollarSign,
  XCircle,
} from "lucide-react"
import Link from "next/link"
import { Progress } from "@/components/ui/progress"
import TransactionTimeline from "@/components/transaction-timeline"
import TransactionParties from "@/components/transaction-parties"
import { Input } from "@/components/ui/input"

export default function TransactionDetailsPage({ params }: { params: { id: string } }) {
  // This would normally be fetched from an API
  const transaction = {
    id: params.id,
    propertyAddress: "123 Blockchain Ave, Crypto City",
    propertyType: "Residential",
    amount: "2.5 ETH",
    status: "verification",
    counterparty: "John Smith",
    date: "2023-04-15",
    progress: 40,
    description: "3 bedroom, 2 bathroom single-family home with modern amenities and a spacious backyard.",
    escrowAddress: "0x1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t",
    documents: [
      { name: "Purchase Agreement", date: "2023-04-15", status: "signed", reviewStatus: "approved" },
      { name: "Property Inspection Report", date: "2023-04-18", status: "pending", reviewStatus: "pending" },
      { name: "Title Transfer Documents", date: "2023-04-20", status: "pending", reviewStatus: "declined" },
    ],
    timeline: [
      { date: "2023-04-15", event: "Transaction created", status: "completed" },
      { date: "2023-04-15", event: "KYC verification initiated", status: "completed" },
      { date: "2023-04-16", event: "Smart contract deployed", status: "completed" },
      { date: "2023-04-18", event: "Awaiting property inspection", status: "in_progress" },
      { date: "2023-04-25", event: "Title transfer", status: "pending" },
      { date: "2023-05-01", event: "Funds release", status: "pending" },
    ],
  }

  const getStatusInfo = (status: string) => {
    switch (status) {
      case "verification":
        return {
          label: "Verification in Progress",
          color: "bg-yellow-100 text-yellow-800",
          icon: <UserCheck className="h-4 w-4 mr-1" />,
        }
      case "awaiting_funds":
        return {
          label: "Awaiting Funds",
          color: "bg-blue-100 text-blue-800",
          icon: <DollarSign className="h-4 w-4 mr-1" />,
        }
      case "in_escrow":
        return {
          label: "In Escrow",
          color: "bg-purple-100 text-purple-800",
          icon: <LockKeyhole className="h-4 w-4 mr-1" />,
        }
      case "pending_approval":
        return {
          label: "Pending Approval",
          color: "bg-orange-100 text-orange-800",
          icon: <FileText className="h-4 w-4 mr-1" />,
        }
      case "completed":
        return {
          label: "Completed",
          color: "bg-green-100 text-green-800",
          icon: <CheckCircle className="h-4 w-4 mr-1" />,
        }
      default:
        return {
          label: "Unknown Status",
          color: "bg-gray-100 text-gray-800",
          icon: <Clock className="h-4 w-4 mr-1" />,
        }
    }
  }

  const statusInfo = getStatusInfo(transaction.status)

  return (
    <div className="container px-4 md:px-6 py-10">
      <div className="mb-8">
        <Link href="/dashboard" className="flex items-center text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
        </Link>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{transaction.propertyAddress}</h1>
            <p className="text-muted-foreground">Transaction ID: {transaction.id}</p>
          </div>
          <Badge className={`${statusInfo.color} flex items-center self-start`}>
            {statusInfo.icon} {statusInfo.label}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Transaction Progress</CardTitle>
              <CardDescription>Current status of your real estate transaction</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Overall Progress</span>
                  <span>{transaction.progress}%</span>
                </div>
                <Progress value={transaction.progress} className="h-2" />
              </div>

              <div className="mt-6">
                <TransactionTimeline timeline={transaction.timeline} />
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="details">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="smart-contract">Smart Contract</TabsTrigger>
              <TabsTrigger value="messages">Messages</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Property Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-muted-foreground">Property Address</h3>
                      <p>{transaction.propertyAddress}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-muted-foreground">Property Type</h3>
                      <p>{transaction.propertyType}</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground">Description</h3>
                    <p>{transaction.description}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-muted-foreground">Transaction Amount</h3>
                      <p>{transaction.amount}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-muted-foreground">Date Created</h3>
                      <p>{new Date(transaction.date).toLocaleDateString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documents" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Transaction Documents</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {transaction.documents?.map((doc, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded-md">
                        <div className="flex items-center">
                          <FileText className="h-5 w-5 text-muted-foreground mr-3" />
                          <div>
                            <p className="font-medium">{doc.name}</p>
                            <p className="text-sm text-muted-foreground">{new Date(doc.date).toLocaleDateString()}</p>
                            {doc.reviewStatus === "approved" && (
                              <p className="text-xs text-green-600 flex items-center">
                                <CheckCircle className="h-3 w-3 mr-1" /> Approved
                              </p>
                            )}
                            {doc.reviewStatus === "declined" && (
                              <p className="text-xs text-red-600 flex items-center">
                                <XCircle className="h-3 w-3 mr-1" /> Declined
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center">
                          <Badge
                            className={
                              doc.status === "signed" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                            }
                          >
                            {doc.status === "signed" ? "Signed" : "Pending"}
                          </Badge>
                          <Button variant="ghost" size="icon" className="ml-2">
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6">
                    <Button variant="outline" className="w-full">
                      <FileText className="mr-2 h-4 w-4" /> Upload New Document
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="smart-contract" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Smart Contract Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground">Escrow Contract Address</h3>
                    <div className="flex items-center mt-1">
                      <code className="bg-gray-100 p-2 rounded text-sm flex-1 overflow-x-auto">
                        {transaction.escrowAddress}
                      </code>
                      <Button variant="ghost" size="icon" className="ml-2">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground">Release Conditions</h3>
                    <ul className="list-disc list-inside mt-1 space-y-1">
                      <li>Property title transfer completed</li>
                      <li>Property inspection passed</li>
                      <li>All legal documents signed by both parties</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground">Contract Status</h3>
                    <Badge className="bg-yellow-100 text-yellow-800 mt-1">
                      <Clock className="h-4 w-4 mr-1" /> Awaiting Conditions
                    </Badge>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button variant="outline" className="w-full">
                    <ExternalLink className="mr-2 h-4 w-4" /> View on Blockchain Explorer
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="messages" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Transaction Messages</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="bg-gray-50 p-3 rounded-md">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-800 font-semibold mr-2">
                            CE
                          </div>
                          <div>
                            <p className="font-medium">CryptoEscrow Team</p>
                            <p className="text-xs text-muted-foreground">Apr 16, 2023 at 10:23 AM</p>
                          </div>
                        </div>
                      </div>
                      <p className="text-sm">
                        Your transaction has been created successfully. The smart contract has been deployed to the
                        blockchain. Please complete the KYC verification to proceed.
                      </p>
                    </div>

                    <div className="bg-gray-50 p-3 rounded-md">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-800 font-semibold mr-2">
                            JS
                          </div>
                          <div>
                            <p className="font-medium">John Smith</p>
                            <p className="text-xs text-muted-foreground">Apr 17, 2023 at 3:45 PM</p>
                          </div>
                        </div>
                      </div>
                      <p className="text-sm">
                        I've scheduled the property inspection for April 18th at 2:00 PM. Please let me know if this
                        works for you.
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 flex gap-2">
                    <Input placeholder="Type your message..." className="flex-1" />
                    <Button>Send</Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Transaction Parties</CardTitle>
            </CardHeader>
            <CardContent>
              <TransactionParties buyer="You" seller={transaction.counterparty} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full">
                <CheckCircle className="mr-2 h-4 w-4" /> Confirm Conditions Met
              </Button>
              <Button variant="outline" className="w-full">
                <MessageSquare className="mr-2 h-4 w-4" /> Contact Support
              </Button>
              <Button variant="outline" className="w-full">
                <Building2 className="mr-2 h-4 w-4" /> View Property Details
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Escrow Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Created</span>
                  <span className="text-sm">{new Date(transaction.date).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Estimated Completion</span>
                  <span className="text-sm">May 15, 2023</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Time Remaining</span>
                  <span className="text-sm">21 days</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
