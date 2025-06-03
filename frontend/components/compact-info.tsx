"use client"

import type React from "react"

import { useState } from "react"
import { Info, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface CompactInfoProps {
  title: string
  children: React.ReactNode
  variant?: "default" | "info" | "warning" | "success"
  className?: string
  icon?: React.ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
}

export function CompactInfo({
  title,
  children,
  variant = "default",
  className,
  icon,
  collapsible = true,
  defaultOpen = false,
}: CompactInfoProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [isDismissed, setIsDismissed] = useState(false)

  if (isDismissed) {
    return null
  }

  const variantStyles = {
    default: "bg-gray-50 border-gray-200 text-gray-800",
    info: "bg-teal-50 border-teal-200 text-teal-800",
    warning: "bg-amber-50 border-amber-200 text-amber-800",
    success: "bg-green-50 border-green-200 text-green-800",
  }

  return (
    <div className={cn("rounded-md border px-3 py-2 text-sm", variantStyles[variant], isOpen ? "mb-3" : "", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-medium">
          {icon || (variant === "info" ? <Info className="h-4 w-4" /> : null)}
          <span>{title}</span>
        </div>
        <div className="flex items-center gap-1">
          {collapsible && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 hover:bg-transparent"
              onClick={() => setIsOpen(!isOpen)}
            >
              <span className="sr-only">{isOpen ? "Collapse" : "Expand"}</span>
              <span className={`text-xs ${isOpen ? "rotate-90" : ""} transition-transform`}>▶</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:bg-transparent"
            onClick={() => setIsDismissed(true)}
          >
            <span className="sr-only">Dismiss</span>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {isOpen && <div className="mt-2 text-sm">{children}</div>}
    </div>
  )
}
