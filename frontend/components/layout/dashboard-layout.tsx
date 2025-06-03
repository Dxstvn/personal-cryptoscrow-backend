"use client"

import type React from "react"

import { useAuth } from "@/context/auth-context"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import LoadingScreen from "@/components/loading-screen"
import Sidebar from "@/components/sidebar"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    // Only redirect to home page if user is not authenticated at all
    if (!loading && !user) {
      router.push("/")
    }
  }, [user, loading, router])

  if (loading) {
    return <LoadingScreen />
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="container mx-auto py-8 px-4 md:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  )
}
