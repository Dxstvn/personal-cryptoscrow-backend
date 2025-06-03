import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ArrowRight, FileText, HelpCircle, MessageSquare, Phone } from "lucide-react"

export default function SupportPage() {
  // Sample FAQ data
  const faqs = [
    {
      question: "How does the escrow process work?",
      answer:
        "Our escrow process uses smart contracts to securely hold funds until all conditions of the transaction are met. When you create a transaction, a smart contract is deployed to the blockchain. The buyer deposits funds into this contract, and they are only released to the seller when all parties confirm that the conditions have been satisfied.",
    },
    {
      question: "What cryptocurrencies do you support?",
      answer:
        "We currently support Ethereum (ETH), Bitcoin (BTC), USD Coin (USDC), and Tether (USDT). We plan to add support for more cryptocurrencies in the future.",
    },
    {
      question: "How are transaction fees calculated?",
      answer:
        "Our platform charges a fee of 1.5% of the transaction amount. This fee covers the cost of deploying the smart contract, verifying the transaction, and providing customer support. Additionally, there may be network fees (gas fees) for blockchain transactions, which vary depending on network congestion.",
    },
    {
      question: "How long does a typical real estate transaction take?",
      answer:
        "The duration of a transaction depends on various factors, including the complexity of the deal, the responsiveness of all parties, and the time required for property inspections and title transfers. On average, transactions are completed within 30-45 days, which is significantly faster than traditional real estate transactions.",
    },
  ]

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Help & Support</h1>
        <p className="text-gray-500">Get help with your transactions and account</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <Card>
          <CardContent className="p-6 flex flex-col items-center text-center h-full">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-4">
              <MessageSquare className="h-6 w-6 text-blue-700" />
            </div>
            <h3 className="text-lg font-medium mb-2">Chat Support</h3>
            <p className="text-gray-500 mb-4 flex-grow">Chat with our support team for immediate assistance</p>
            <Button className="w-full bg-teal-900 hover:bg-teal-800 text-white hover:text-gold-300">Start Chat</Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 flex flex-col items-center text-center h-full">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <Phone className="h-6 w-6 text-green-700" />
            </div>
            <h3 className="text-lg font-medium mb-2">Phone Support</h3>
            <p className="text-gray-500 mb-4 flex-grow">Call our dedicated support line for complex issues</p>
            <Button className="w-full bg-teal-900 hover:bg-teal-800 text-white hover:text-gold-300">
              +1 (800) 123-4567
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 flex flex-col items-center text-center h-full">
            <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center mb-4">
              <FileText className="h-6 w-6 text-purple-700" />
            </div>
            <h3 className="text-lg font-medium mb-2">Knowledge Base</h3>
            <p className="text-gray-500 mb-4 flex-grow">Browse our comprehensive guides and tutorials</p>
            <Button className="w-full bg-teal-900 hover:bg-teal-800 text-white hover:text-gold-300">
              View Articles
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Frequently Asked Questions</CardTitle>
              <CardDescription>Find answers to common questions about our platform</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {faqs.map((faq, index) => (
                <div key={index} className="space-y-2">
                  <h3 className="font-medium flex items-center gap-2">
                    <HelpCircle className="h-5 w-5 text-teal-600" />
                    {faq.question}
                  </h3>
                  <p className="text-gray-500 pl-7">{faq.answer}</p>
                  {index < faqs.length - 1 && <div className="border-b my-4"></div>}
                </div>
              ))}
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full">
                View All FAQs <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Contact Support</CardTitle>
              <CardDescription>Send us a message and we'll get back to you</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <select id="subject" className="w-full p-2 border rounded-md">
                  <option value="">Select a subject</option>
                  <option value="transaction">Transaction Issue</option>
                  <option value="account">Account Problem</option>
                  <option value="wallet">Wallet Connectivity</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea id="message" placeholder="Describe your issue in detail..." className="min-h-[120px]" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="attachment">Attachment (optional)</Label>
                <Input id="attachment" type="file" />
              </div>
            </CardContent>
            <CardFooter>
              <Button className="w-full bg-black hover:bg-gray-800 text-white">Submit Ticket</Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  )
}
