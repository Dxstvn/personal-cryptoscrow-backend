"use client"

import { CheckCircle, FileText, LockKeyhole, UserCheck, DollarSign, AlertCircle, Eye, ListChecks } from "lucide-react"
import { cn } from "@/lib/utils"

export type TransactionStage =
  | "verification"
  | "awaiting_funds"
  | "in_escrow"
  | "pending_approval"
  | "completed"
  | "cancelled"
  | "disputed"
  | "pending_buyer_review"
  | "pending_conditions"
  | "awaiting_seller_confirmation"

interface TransactionStageIndicatorProps {
  stage: TransactionStage
  className?: string
  showLabel?: boolean
  size?: "sm" | "md" | "lg"
}

export default function TransactionStageIndicator({
  stage,
  className,
  showLabel = true,
  size = "md",
}: TransactionStageIndicatorProps) {
  // Define stage configurations
  const stageConfig = {
    verification: {
      icon: UserCheck,
      label: "Verification",
      color: "bg-blue-50 text-blue-700 border-blue-200",
    },
    awaiting_funds: {
      icon: DollarSign,
      label: "Awaiting Funds",
      color: "bg-amber-50 text-amber-700 border-amber-200",
    },
    in_escrow: {
      icon: LockKeyhole,
      label: "In Escrow",
      color: "bg-purple-50 text-purple-700 border-purple-200",
    },
    pending_approval: {
      icon: FileText,
      label: "Pending Approval",
      color: "bg-orange-50 text-orange-700 border-orange-200",
    },
    completed: {
      icon: CheckCircle,
      label: "Completed",
      color: "bg-green-50 text-green-700 border-green-200",
    },
    cancelled: {
      icon: AlertCircle,
      label: "Cancelled",
      color: "bg-red-50 text-red-700 border-red-200",
    },
    disputed: {
      icon: AlertCircle,
      label: "Disputed",
      color: "bg-red-50 text-red-700 border-red-200",
    },
    pending_buyer_review: {
      icon: Eye,
      label: "Pending Buyer Review",
      color: "bg-indigo-50 text-indigo-700 border-indigo-200",
    },
    pending_conditions: {
      icon: ListChecks,
      label: "Pending Conditions",
      color: "bg-cyan-50 text-cyan-700 border-cyan-200",
    },
    awaiting_seller_confirmation: {
      icon: UserCheck,
      label: "Awaiting Seller Confirmation",
      color: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
  }

  const config = stageConfig[stage] || stageConfig.verification
  const Icon = config.icon

  // Size classes
  const sizeClasses = {
    sm: "text-xs py-0.5 px-1.5",
    md: "text-sm py-1 px-2",
    lg: "text-base py-1.5 px-3",
  }

  const iconSizes = {
    sm: "h-3 w-3 mr-0.5",
    md: "h-4 w-4 mr-1",
    lg: "h-5 w-5 mr-1.5",
  }

  return (
    <div className={cn("inline-flex items-center rounded-full border", config.color, sizeClasses[size], className)}>
      <Icon className={iconSizes[size]} />
      {showLabel && <span>{config.label}</span>}
    </div>
  )
}
