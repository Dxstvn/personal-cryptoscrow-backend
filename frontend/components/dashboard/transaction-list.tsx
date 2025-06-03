"use client"

import { useState } from "react"
import TransactionCard from "@/components/dashboard/transaction-card"
import { Building, FileCheck, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function TransactionList() {
  const [activeTab, setActiveTab] = useState("active")

  // Sample transaction data
  const activeTransactions = [
    {
      id: "TX123456",
      propertyAddress: "123 Blockchain Ave, Crypto City",
      amount: "2.5 ETH",
      status: "verification",
      counterparty: "John Smith",
      date: "2023-04-15",
      progress: 40,
    },
    {
      id: "TX789012",
      propertyAddress: "456 Smart Contract St, Token Town",
      amount: "150,000 USDC",
      status: "awaiting_funds",
      counterparty: "Sarah Johnson",
      date: "2023-04-10",
      progress: 20,
    },
  ]

  return (
    <div className="bg-white rounded-lg">
      <div className="border-b border-gray-200">
        <div className="flex">
          <button
            className={`px-4 py-3 text-sm font-medium border-b-2 ${
              activeTab === "active"
                ? "border-black text-black"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("active")}
          >
            Active Transactions
          </button>
          <button
            className={`px-4 py-3 text-sm font-medium border-b-2 ${
              activeTab === "completed"
                ? "border-black text-black"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("completed")}
          >
            Completed
          </button>
          <button
            className={`px-4 py-3 text-sm font-medium border-b-2 ${
              activeTab === "all" ? "border-black text-black" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("all")}
          >
            All Transactions
          </button>
        </div>
      </div>
      <div className="p-6">
        {activeTab === "active" && (
          <div className="space-y-4">
            {activeTransactions.length > 0 ? (
              activeTransactions.map((transaction) => (
                <TransactionCard key={transaction.id} transaction={transaction} />
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="rounded-full bg-teal-100 p-3 mb-4">
                  <Building className="h-6 w-6 text-teal-700" />
                </div>
                <h3 className="text-xl font-semibold mb-2">No active transactions</h3>
                <p className="text-gray-500 max-w-md mb-6">
                  You don't have any active real estate transactions. Start a new transaction to begin the escrow
                  process.
                </p>
                <Button asChild className="bg-black hover:bg-gray-800 text-white">
                  <Link href="/transactions/new" className="flex items-center">
                    <Plus className="mr-2 h-4 w-4" /> New Transaction
                  </Link>
                </Button>
              </div>
            )}
          </div>
        )}

        {activeTab === "completed" && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="rounded-full bg-teal-100 p-3 mb-4">
              <FileCheck className="h-6 w-6 text-teal-700" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No completed transactions</h3>
            <p className="text-gray-500 max-w-md mb-6">You don't have any completed real estate transactions yet.</p>
          </div>
        )}

        {activeTab === "all" && (
          <div className="space-y-4">
            {activeTransactions.map((transaction) => (
              <TransactionCard key={transaction.id} transaction={transaction} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
