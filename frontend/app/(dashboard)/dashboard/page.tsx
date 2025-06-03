"use client"

import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import Link from "next/link"
import TransactionCard from "@/components/dashboard/transaction-card"
import DashboardStats from "@/components/dashboard/stats"
import RecentActivity from "@/components/dashboard/recent-activity"
import UpcomingDeadlines from "@/components/dashboard/upcoming-deadlines"
import MarketOverview from "@/components/dashboard/market-overview"
import { useDatabaseStore } from "@/lib/mock-database"
import { useState, useEffect } from "react"
import { Building, BarChart, FileText } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/context/auth-context"

export default function DashboardPage() {
  const { getTransactions } = useDatabaseStore()
  const [transactions, setTransactions] = useState<any[]>([])
  const [completedTransactions, setCompletedTransactions] = useState<any[]>([])
  const [allTransactions, setAllTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("overview")
  const [transactionsTab, setTransactionsTab] = useState("active")
  const { isDemoAccount } = useAuth() // Get the demo account status

  useEffect(() => {
    // Simulate loading
    const timer = setTimeout(() => {
      const allTx = getTransactions()
      setAllTransactions(allTx)
      setTransactions(allTx.filter((t) => t.status !== "completed").slice(0, 2))
      setCompletedTransactions(allTx.filter((t) => t.status === "completed").slice(0, 2))
      setLoading(false)
    }, 1000)

    return () => clearTimeout(timer)
  }, [getTransactions])

  // Function to render the active tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case "overview":
        return (
          <>
            <DashboardStats />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <div className="bg-white rounded-lg shadow-md border border-neutral-100">
                  <div className="border-b border-neutral-100">
                    <div className="flex">
                      <button
                        className={`px-4 py-3 text-sm font-medium border-b-2 ${
                          transactionsTab === "active"
                            ? "border-teal-900 text-teal-900"
                            : "border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300"
                        }`}
                        onClick={() => setTransactionsTab("active")}
                      >
                        Active Transactions
                      </button>
                      <button
                        className={`px-4 py-3 text-sm font-medium border-b-2 ${
                          transactionsTab === "completed"
                            ? "border-teal-900 text-teal-900"
                            : "border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300"
                        }`}
                        onClick={() => setTransactionsTab("completed")}
                      >
                        Completed
                      </button>
                      <button
                        className={`px-4 py-3 text-sm font-medium border-b-2 ${
                          transactionsTab === "all"
                            ? "border-teal-900 text-teal-900"
                            : "border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300"
                        }`}
                        onClick={() => setTransactionsTab("all")}
                      >
                        All Transactions
                      </button>
                    </div>
                  </div>
                  <div className="p-6">
                    {loading ? (
                      <div className="space-y-4">
                        {[1, 2].map((i) => (
                          <div key={i} className="bg-white border border-neutral-200 rounded-lg p-5 animate-pulse">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                              <div className="flex-1">
                                <div className="h-5 bg-neutral-200 rounded w-3/4 mb-2"></div>
                                <div className="h-4 bg-neutral-200 rounded w-1/2"></div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="h-6 bg-neutral-200 rounded w-20"></div>
                                <div className="h-8 bg-neutral-200 rounded w-32"></div>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <div className="h-4 bg-neutral-200 rounded w-24"></div>
                                <div className="h-4 bg-neutral-200 rounded w-12"></div>
                              </div>
                              <div className="h-2 bg-neutral-200 rounded"></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <>
                        {transactionsTab === "active" && (
                          <>
                            {transactions.length > 0 ? (
                              <div className="space-y-4">
                                {transactions.map((transaction) => (
                                  <TransactionCard key={transaction.id} transaction={transaction} />
                                ))}
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center py-10 text-center">
                                <div className="rounded-full bg-teal-100 p-3 mb-4">
                                  <Building className="h-6 w-6 text-teal-900" />
                                </div>
                                <h3 className="text-xl font-semibold mb-2 text-teal-900 font-display">
                                  No active transactions
                                </h3>
                                <p className="text-neutral-500 max-w-md mb-6">
                                  {isDemoAccount
                                    ? "You don't have any active real estate transactions. Start a new transaction to begin the escrow process."
                                    : "Welcome to CryptoEscrow! Start your first transaction to begin the escrow process."}
                                </p>
                                <Button asChild className="bg-teal-900 hover:text-gold-300 text-white">
                                  <Link href="/transactions/new" className="flex items-center">
                                    <Plus className="mr-2 h-4 w-4" /> New Transaction
                                  </Link>
                                </Button>
                              </div>
                            )}
                          </>
                        )}

                        {transactionsTab === "completed" && (
                          <>
                            {completedTransactions.length > 0 ? (
                              <div className="space-y-4">
                                {completedTransactions.map((transaction) => (
                                  <TransactionCard key={transaction.id} transaction={transaction} />
                                ))}
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center py-10 text-center">
                                <div className="rounded-full bg-green-100 p-3 mb-4">
                                  <FileText className="h-6 w-6 text-green-700" />
                                </div>
                                <h3 className="text-xl font-semibold mb-2 text-teal-900 font-display">
                                  No completed transactions
                                </h3>
                                <p className="text-neutral-500 max-w-md mb-6">
                                  {isDemoAccount
                                    ? "You don't have any completed real estate transactions yet."
                                    : "Your completed transactions will appear here once you've finished your first escrow process."}
                                </p>
                              </div>
                            )}
                          </>
                        )}

                        {transactionsTab === "all" && (
                          <>
                            {allTransactions.length > 0 ? (
                              <div className="space-y-4">
                                {allTransactions.slice(0, 3).map((transaction) => (
                                  <TransactionCard key={transaction.id} transaction={transaction} />
                                ))}
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center py-10 text-center">
                                <div className="rounded-full bg-teal-100 p-3 mb-4">
                                  <Building className="h-6 w-6 text-teal-900" />
                                </div>
                                <h3 className="text-xl font-semibold mb-2 text-teal-900 font-display">
                                  No transactions found
                                </h3>
                                <p className="text-neutral-500 max-w-md mb-6">
                                  {isDemoAccount
                                    ? "Start your first transaction to begin the escrow process."
                                    : "Welcome to CryptoEscrow! Create your first transaction to get started."}
                                </p>
                                <Button asChild className="bg-teal-900 hover:text-gold-300 text-white">
                                  <Link href="/transactions/new" className="flex items-center">
                                    <Plus className="mr-2 h-4 w-4" /> New Transaction
                                  </Link>
                                </Button>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow-md border border-neutral-100">
                  <div className="px-6 py-4 border-b border-neutral-100">
                    <h2 className="font-medium text-teal-900 font-display">Recent Activity</h2>
                  </div>
                  <div className="p-6">
                    <RecentActivity />
                  </div>
                </div>
              </div>

              <div className="space-y-8">
                <div className="bg-teal-900 rounded-lg shadow-md text-white">
                  <div className="px-6 py-4 border-b border-teal-800">
                    <h2 className="font-medium font-display">Upcoming Deadlines</h2>
                  </div>
                  <div className="p-6">
                    <UpcomingDeadlines />
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow-md border border-neutral-100">
                  <div className="px-6 py-4 border-b border-neutral-100">
                    <h2 className="font-medium text-teal-900 font-display">Market Overview</h2>
                  </div>
                  <div className="p-6">
                    <MarketOverview />
                  </div>
                </div>
              </div>
            </div>
          </>
        )
      case "analytics":
        return (
          <div className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle>Transaction Analytics</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                <div className="rounded-full bg-teal-100 p-3 mb-4">
                  <BarChart className="h-6 w-6 text-teal-900" />
                </div>
                <h3 className="text-xl font-semibold mb-2 text-teal-900 font-display">Analytics Dashboard</h3>
                <p className="text-neutral-500 max-w-md mb-6">
                  Track your transaction metrics, performance, and trends over time.
                </p>
                <div className="w-full max-w-3xl h-64 bg-neutral-100 rounded-lg flex items-center justify-center">
                  <p className="text-neutral-500">Analytics charts will appear here as you complete transactions</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )
      case "reports":
        return (
          <div className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle>Transaction Reports</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                <div className="rounded-full bg-teal-100 p-3 mb-4">
                  <FileText className="h-6 w-6 text-teal-900" />
                </div>
                <h3 className="text-xl font-semibold mb-2 text-teal-900 font-display">Reports Dashboard</h3>
                <p className="text-neutral-500 max-w-md mb-6">
                  Generate and download reports for your transactions and financial activity.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-3xl">
                  <Button variant="outline" className="h-16 justify-start px-4">
                    <FileText className="mr-2 h-5 w-5 text-teal-900" />
                    <div className="text-left">
                      <p className="font-medium">Transaction Summary</p>
                      <p className="text-xs text-neutral-500">Last 30 days</p>
                    </div>
                  </Button>
                  <Button variant="outline" className="h-16 justify-start px-4">
                    <FileText className="mr-2 h-5 w-5 text-teal-900" />
                    <div className="text-left">
                      <p className="font-medium">Financial Report</p>
                      <p className="text-xs text-neutral-500">Year to date</p>
                    </div>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="p-6 space-y-8">
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-teal-900 font-display">Your CryptoEscrow Dashboard</h1>
            <p className="text-neutral-600">Manage your real estate transactions securely with cryptocurrency</p>
          </div>
        </div>

        <div className="border-b border-neutral-200">
          <nav className="flex space-x-8" aria-label="Dashboard tabs">
            <button
              className={`border-b-2 py-4 px-1 text-sm font-medium transition-colors ${
                activeTab === "overview"
                  ? "border-teal-900 text-teal-900"
                  : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700"
              }`}
              onClick={() => setActiveTab("overview")}
            >
              Overview
            </button>
            <button
              className={`border-b-2 py-4 px-1 text-sm font-medium transition-colors ${
                activeTab === "analytics"
                  ? "border-teal-900 text-teal-900"
                  : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700"
              }`}
              onClick={() => setActiveTab("analytics")}
            >
              Analytics
            </button>
            <button
              className={`border-b-2 py-4 px-1 text-sm font-medium transition-colors ${
                activeTab === "reports"
                  ? "border-teal-900 text-teal-900"
                  : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700"
              }`}
              onClick={() => setActiveTab("reports")}
            >
              Reports
            </button>
          </nav>
        </div>
      </div>

      {renderTabContent()}
    </div>
  )
}
