"use client"

import type React from "react"
import { usePathname, useRouter } from "next/navigation"
import Sidebar from "@/components/sidebar"
import { useAuth } from "@/context/auth-context"
import LoadingScreen from "@/components/loading-screen"
import { useEffect } from "react"
import UserEmailTracker from "@/components/user-email-tracker"

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    // Only redirect if the user is not authenticated at all
    if (
      !loading &&
      !user &&
      (pathname?.startsWith("/dashboard") ||
        pathname?.startsWith("/transactions") ||
        pathname?.startsWith("/documents") ||
        pathname?.startsWith("/wallet") ||
        pathname?.startsWith("/contacts") ||
        pathname?.startsWith("/settings") ||
        pathname?.startsWith("/support"))
    ) {
      router.push("/")
    }
  }, [user, loading, pathname, router])

  if (loading) {
    return <LoadingScreen />
  }

  const isLandingPage = pathname === "/"

  if (isLandingPage) {
    return (
      <div className="flex flex-col min-h-screen">
        <UserEmailTracker />
        <main className="flex-1">{children}</main>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <UserEmailTracker />
      <Sidebar />
      <div className="flex flex-col flex-1 w-0 overflow-hidden">
        <main className="relative flex-1 overflow-y-auto focus:outline-none">{children}</main>
      </div>
    </div>
  )
}
