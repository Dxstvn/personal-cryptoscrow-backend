"use client"

import { useEffect } from "react"
import { useAuth } from "@/context/auth-context"

export default function UserEmailTracker() {
  const { user, isDemoAccount } = useAuth()

  useEffect(() => {
    if (user && user.email) {
      // Store the current user's email in localStorage
      localStorage.setItem("current-user-email", user.email)
    }
  }, [user])

  // This is a utility component that doesn't render anything
  return null
}
