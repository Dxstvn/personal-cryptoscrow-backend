"use client"

import { useState, useEffect } from "react"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/context/auth-context"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useSearchParams } from "next/navigation"
import Link from "next/link"

export default function Home() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [showUnauthorizedError, setShowUnauthorizedError] = useState(false)
  const searchParams = useSearchParams()

  // Get auth context
  const { signInWithGoogle } = useAuth()

  // Check for error parameter in URL
  useEffect(() => {
    const errorParam = searchParams.get("error")
    if (errorParam === "unauthorized") {
      setShowUnauthorizedError(true)
      setTimeout(() => setShowUnauthorizedError(false), 5000)
    }
  }, [searchParams])

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle()
      // No need to set error to null or handle redirection here
      // The auth context will handle redirection if the user is an admin
    } catch (err) {
      setError("Failed to sign in. Only authorized emails are allowed.")
      setTimeout(() => setError(null), 5000)
    }
  }

  const handleNotifyMe = () => {
    console.log("Notify me clicked for:", email)
    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address")
      setTimeout(() => setError(null), 3000)
      return
    }
    setError("Thanks! We'll notify you when we launch.")
    setTimeout(() => setError(null), 3000)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-between bg-neutral-50">
      {/* Gradient header */}
      <div className="w-full bg-gradient-to-b from-teal-900 to-transparent h-32 absolute top-0 left-0 z-0"></div>

      <div className="w-full max-w-6xl mx-auto px-4 py-8 flex-1 flex flex-col items-center justify-center relative z-10">
        {/* Admin lock button at top */}
        <Link
          href="/login"
          className="mb-12 bg-white p-4 rounded-full hover:bg-neutral-50 transition-colors shadow-md flex items-center justify-center"
          aria-label="Login"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-gold-500"
          >
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </Link>

        {showUnauthorizedError && (
          <Alert variant="destructive" className="mb-6 max-w-md">
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              You are not authorized to access the dashboard. Please contact the administrator for access.
            </AlertDescription>
          </Alert>
        )}

        {/* Logo */}
        <div className="mb-8">
          <h1 className="text-4xl md:text-5xl font-display font-semibold text-teal-900">
            Crypto<span className="text-gold-500">Escrow</span>
          </h1>
        </div>

        {/* Main content */}
        <div className="text-center max-w-2xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-bold mb-2 text-teal-900 font-display">Secure Real Estate</h1>
          <h2 className="text-4xl md:text-5xl font-bold mb-8 text-teal-900 font-display">Transactions with Crypto</h2>

          <p className="text-lg mb-12 text-neutral-700">
            Our escrow service provides a secure, transparent platform for real estate transactions using
            cryptocurrency, eliminating fraud and ensuring safe transfers.
          </p>

          {/* Email subscription */}
          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            <div className="flex-1">
              <Input
                type="email"
                placeholder="Enter your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-12 bg-white text-neutral-800 border-neutral-200"
              />
            </div>
            <Button
              onClick={handleNotifyMe}
              className="h-12 bg-gradient-to-r from-gold-400 to-gold-500 text-teal-900 font-medium px-6"
            >
              Notify Me <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          {error && (
            <div className={`mb-6 text-center ${error.includes("Thanks") ? "text-teal-600" : "text-red-500"}`}>
              {error}
            </div>
          )}
        </div>

        {/* Feature cards - reduced margin-top from mt-8 to mt-4 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl mt-4">
          {/* Card 1 */}
          <div className="glass-card p-8 rounded-xl text-center hover:shadow-lg transition-all duration-300 hover:border-gold-200">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center text-teal-900">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
            </div>
            <h3 className="text-xl font-semibold mb-3 text-teal-900 font-display">Secure Transactions</h3>
            <p className="text-neutral-600 text-sm">
              Smart contract-based escrow ensures funds are only released when all conditions are met.
            </p>
          </div>

          {/* Card 2 */}
          <div className="glass-card p-8 rounded-xl text-center hover:shadow-lg transition-all duration-300 hover:border-gold-200">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-gold-100 flex items-center justify-center text-gold-600">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
            </div>
            <h3 className="text-xl font-semibold mb-3 text-teal-900 font-display">Time Efficient</h3>
            <p className="text-neutral-600 text-sm">
              Reduce closing time from weeks to days with our streamlined process.
            </p>
          </div>

          {/* Card 3 */}
          <div className="glass-card p-8 rounded-xl text-center hover:shadow-lg transition-all duration-300 hover:border-gold-200">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center text-teal-900">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
            </div>
            <h3 className="text-xl font-semibold mb-3 text-teal-900 font-display">Trustless System</h3>
            <p className="text-neutral-600 text-sm">
              Eliminate intermediaries while maintaining compliance with regulations.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full py-6 text-center text-neutral-500 text-sm border-t border-neutral-200 bg-white">
        <div className="container mx-auto px-4">
          <div className="flex justify-center items-center mb-4">
            <span className="text-2xl font-display font-semibold text-teal-900">
              Crypto<span className="text-gold-500">Escrow</span>
            </span>
          </div>
          <p>© {new Date().getFullYear()} CryptoEscrow. All rights reserved.</p>
          <p className="mt-2 text-xs">Cryptocurrency transactions are subject to applicable laws and regulations.</p>
        </div>
      </footer>
    </div>
  )
}
