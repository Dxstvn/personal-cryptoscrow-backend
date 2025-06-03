"use client"

import type React from "react"
import { AuthProvider } from "@/context/auth-context"
import AppShell from "@/components/app-shell"
import { useWalletAuthIntegration } from '@/hooks/use-wallet-auth-integration'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Add wallet auth integration
  useWalletAuthIntegration()

  return (
    <AuthProvider>
      <AppShell>{children}</AppShell>
    </AuthProvider>
  )
}
