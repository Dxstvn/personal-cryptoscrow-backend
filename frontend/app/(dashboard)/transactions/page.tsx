"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, SlidersHorizontal, PlusCircle } from "lucide-react"
import Link from "next/link"
import TransactionCard from "@/components/transaction-card"
import { useTransaction } from "@/context/transaction-context"
import { useEffect } from "react"

export default function TransactionsPage() {
  const { transactions, fetchTransactions, loading } = useTransaction()

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [sortOrder, setSortOrder] = useState("newest")

  // Filter and sort transactions
  const filteredTransactions = transactions
    .filter((transaction) => {
      const matchesSearch =
        transaction.propertyAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
        transaction.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        transaction.counterparty.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = statusFilter === "all" || transaction.status === statusFilter
      return matchesSearch && matchesStatus
    })
    .sort((a, b) => {
      const getTime = (date: string) => new Date(date).getTime()

      switch (sortOrder) {
        case "newest":
          return getTime(b.date) - getTime(a.date)
        case "oldest":
          return getTime(a.date) - getTime(b.date)
        case "amount_high":
          // Extract numeric value from amount string (e.g., "2.5 ETH" -> 2.5)
          const aAmount = Number.parseFloat(a.amount.split(" ")[0]) || 0
          const bAmount = Number.parseFloat(b.amount.split(" ")[0]) || 0
          return bAmount - aAmount
        case "amount_low":
          const aAmt = Number.parseFloat(a.amount.split(" ")[0]) || 0
          const bAmt = Number.parseFloat(b.amount.split(" ")[0]) || 0
          return aAmt - bAmt
        default:
          return 0
      }
    })

  return (
    <div className="container px-4 md:px-6 py-10">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground">Manage your escrow transactions</p>
        </div>
        <Button asChild className="mt-4 md:mt-0 bg-teal-900 hover:bg-teal-800 text-white">
          <Link href="/transactions/new" className="flex items-center">
            <PlusCircle className="mr-2 h-5 w-5" /> New Transaction
          </Link>
        </Button>
      </div>

      <Card className="mb-8 shadow-soft border-0">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search transactions..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="verification">Verification</SelectItem>
                  <SelectItem value="awaiting_funds">Awaiting Funds</SelectItem>
                  <SelectItem value="in_escrow">In Escrow</SelectItem>
                  <SelectItem value="pending_approval">Pending Approval</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortOrder} onValueChange={setSortOrder}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                  <SelectItem value="amount_high">Amount (High to Low)</SelectItem>
                  <SelectItem value="amount_low">Amount (Low to High)</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                className="text-brand-700 hover:bg-brand-50 hover:text-brand-800 border-brand-200"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-700"></div>
        </div>
      ) : filteredTransactions.length > 0 ? (
        <div className="space-y-6">
          {filteredTransactions.map((transaction) => (
            <TransactionCard key={transaction.id} transaction={transaction} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 border rounded-lg bg-gray-50">
          <h3 className="text-lg font-medium mb-2">No Transactions Yet</h3>
          <p className="text-muted-foreground mb-6">
            You haven't created any transactions yet. Start by creating a new transaction.
          </p>
          <Button asChild className="bg-teal-900 hover:bg-teal-800 text-white">
            <Link href="/transactions/new">
              <PlusCircle className="mr-2 h-5 w-5" /> Create Your First Transaction
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}
