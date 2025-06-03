"use client"

import { useState, useEffect } from "react"
import { auth, googleProvider } from "@/lib/firebase-client"

export function useFirebaseAuth() {
  const [firebaseAuth, setFirebaseAuth] = useState<{ auth: any; googleProvider: any } | null>(null)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") {
      console.log("Skipping Firebase init: not in browser")
      return
    }

    // Check if Firebase Auth is available
    if (auth && googleProvider) {
      console.log("Firebase Auth is available")
      setFirebaseAuth({ auth, googleProvider })
      setInitialized(true)
    } else {
      console.log("Firebase Auth is not available yet")

      // Poll for Firebase Auth availability
      const checkInterval = setInterval(() => {
        if (auth && googleProvider) {
          console.log("Firebase Auth is now available")
          setFirebaseAuth({ auth, googleProvider })
          setInitialized(true)
          clearInterval(checkInterval)
        }
      }, 100)

      return () => clearInterval(checkInterval)
    }
  }, [])

  return firebaseAuth
}
