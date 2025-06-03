"use client"

import { useEffect, useState } from "react"
import { auth } from "@/lib/firebase-client"

export default function FirebaseInitCheck() {
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    // Check if Firebase Auth is initialized
    if (auth) {
      console.log("Firebase Auth is initialized")
      setIsInitialized(true)
    } else {
      console.error("Firebase Auth is not initialized")
    }
  }, [])

  // This component doesn't render anything visible
  return null
}
