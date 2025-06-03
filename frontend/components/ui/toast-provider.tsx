"use client"

import type React from "react"
import { createContext, useContext, useState } from "react"

type ToastProps = {
  title?: string
  description?: string
  action?: React.ReactNode
  duration?: number
  variant?: "default" | "destructive"
}

type Toast = ToastProps & {
  id: string
}

type ToastContextType = {
  toasts: Toast[]
  addToast: (props: ToastProps) => void
  dismissToast: (id: string) => void
}

export const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = (props: ToastProps) => {
    const id = Math.random().toString(36).substring(2, 9)
    const newToast = { ...props, id }
    setToasts((prev) => [...prev, newToast])

    // Auto-dismiss after duration (default: 5000ms)
    if (props.duration !== 0) {
      setTimeout(() => {
        dismissToast(id)
      }, props.duration || 5000)
    }
  }

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }

  // Add toast function to window for global access
  if (typeof window !== "undefined") {
    window.toast = addToast
  }

  return <ToastContext.Provider value={{ toasts, addToast, dismissToast }}>{children}</ToastContext.Provider>
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider")
  }
  return context
}

// Add the toast function to the window object
declare global {
  interface Window {
    toast?: (props: ToastProps) => void
  }
}

// Export a simple toast function for convenience
export const toast = (props: ToastProps) => {
  if (typeof window !== "undefined" && window.toast) {
    window.toast(props)
  } else {
    console.warn("Toast handler not set. Make sure ToastProvider is mounted.")
  }
}
