"use client"

import type React from "react"
import { createContext, useContext, useState } from "react"
import { useToast } from "@/components/ui/toast-provider"
import { useAuth } from "./auth-context"
import * as transactionApi from "@/services/transaction-api"

type TransactionContextType = {
  loading: boolean
  error: string | null
  transactions: any[]
  currentTransaction: any | null
  fetchTransactions: () => Promise<void>
  fetchTransaction: (id: string) => Promise<void>
  createTransaction: (data: any) => Promise<any>
  updateConditionStatus: (
    transactionId: string,
    conditionId: string,
    newStatus: string,
    comment: string,
  ) => Promise<void>
  syncTransactionStatus: (
    transactionId: string,
    newStatus: string,
    eventMessage: string,
    finalApprovalDeadline?: string,
    disputeResolutionDeadline?: string,
  ) => Promise<void>
  startFinalApproval: (transactionId: string, finalApprovalDeadline: string) => Promise<void>
  raiseDispute: (transactionId: string, disputeResolutionDeadline: string, conditionId?: string) => Promise<void>
}

const TransactionContext = createContext<TransactionContextType | undefined>(undefined)

export function TransactionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const { addToast } = useToast() // Use addToast directly from the context
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transactions, setTransactions] = useState<any[]>([])
  const [currentTransaction, setCurrentTransaction] = useState<any | null>(null)

  const fetchTransactions = async () => {
    if (!user) {
      setError("User not authenticated")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const token = await user.getIdToken()
      const data = await transactionApi.getTransactions(token)
      setTransactions(data)
    } catch (err: any) {
      setError(err.message || "Failed to fetch transactions")
      addToast({
        title: "Error",
        description: err.message || "Failed to fetch transactions",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchTransaction = async (id: string) => {
    if (!user) {
      setError("User not authenticated")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const token = await user.getIdToken()
      const data = await transactionApi.getTransaction(id, token)
      setCurrentTransaction(data)
    } catch (err: any) {
      setError(err.message || "Failed to fetch transaction")
      addToast({
        title: "Error",
        description: err.message || "Failed to fetch transaction",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const createTransaction = async (data: any) => {
    if (!user) {
      setError("User not authenticated")
      throw new Error("User not authenticated")
    }

    setLoading(true)
    setError(null)

    try {
      const token = await user.getIdToken()
      const result = await transactionApi.createTransaction(data, token)

      // Update transactions list
      await fetchTransactions()

      addToast({
        title: "Success",
        description: "Transaction created successfully",
      })

      return result
    } catch (err: any) {
      setError(err.message || "Failed to create transaction")
      addToast({
        title: "Error",
        description: err.message || "Failed to create transaction",
        variant: "destructive",
      })
      throw err
    } finally {
      setLoading(false)
    }
  }

  const updateConditionStatus = async (
    transactionId: string,
    conditionId: string,
    newStatus: string,
    comment: string,
  ) => {
    if (!user) {
      setError("User not authenticated")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const token = await user.getIdToken()
      await transactionApi.updateConditionStatus(transactionId, conditionId, newStatus, comment, token)

      // Refresh the current transaction
      await fetchTransaction(transactionId)

      addToast({
        title: "Success",
        description: "Condition status updated successfully",
      })
    } catch (err: any) {
      setError(err.message || "Failed to update condition status")
      addToast({
        title: "Error",
        description: err.message || "Failed to update condition status",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const syncTransactionStatus = async (
    transactionId: string,
    newStatus: string,
    eventMessage: string,
    finalApprovalDeadline?: string,
    disputeResolutionDeadline?: string,
  ) => {
    if (!user) {
      setError("User not authenticated")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const token = await user.getIdToken()
      await transactionApi.syncTransactionStatus(
        transactionId,
        newStatus,
        eventMessage,
        token,
        finalApprovalDeadline,
        disputeResolutionDeadline,
      )

      // Refresh the current transaction
      await fetchTransaction(transactionId)

      addToast({
        title: "Success",
        description: "Transaction status synced successfully",
      })
    } catch (err: any) {
      setError(err.message || "Failed to sync transaction status")
      addToast({
        title: "Error",
        description: err.message || "Failed to sync transaction status",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const startFinalApproval = async (transactionId: string, finalApprovalDeadline: string) => {
    if (!user) {
      setError("User not authenticated")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const token = await user.getIdToken()
      await transactionApi.startFinalApproval(transactionId, finalApprovalDeadline, token)

      // Refresh the current transaction
      await fetchTransaction(transactionId)

      addToast({
        title: "Success",
        description: "Final approval period started successfully",
      })
    } catch (err: any) {
      setError(err.message || "Failed to start final approval period")
      addToast({
        title: "Error",
        description: err.message || "Failed to start final approval period",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const raiseDispute = async (transactionId: string, disputeResolutionDeadline: string, conditionId?: string) => {
    if (!user) {
      setError("User not authenticated")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const token = await user.getIdToken()
      await transactionApi.raiseDispute(transactionId, disputeResolutionDeadline, token, conditionId)

      // Refresh the current transaction
      await fetchTransaction(transactionId)

      addToast({
        title: "Success",
        description: "Dispute raised successfully",
      })
    } catch (err: any) {
      setError(err.message || "Failed to raise dispute")
      addToast({
        title: "Error",
        description: err.message || "Failed to raise dispute",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <TransactionContext.Provider
      value={{
        loading,
        error,
        transactions,
        currentTransaction,
        fetchTransactions,
        fetchTransaction,
        createTransaction,
        updateConditionStatus,
        syncTransactionStatus,
        startFinalApproval,
        raiseDispute,
      }}
    >
      {children}
    </TransactionContext.Provider>
  )
}

export function useTransaction() {
  const context = useContext(TransactionContext)
  if (context === undefined) {
    throw new Error("useTransaction must be used within a TransactionProvider")
  }
  return context
}
