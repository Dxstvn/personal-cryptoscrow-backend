"use client"

import type React from "react"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ArrowLeft, AlertCircle, Mail, CheckCircle } from "lucide-react"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!email) {
      setError("Please enter your email address")
      return
    }

    setLoading(true)

    try {
      // Mock password reset - in a real app, this would call an auth service
      console.log("Requesting password reset for:", email)

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000))

      setSuccess(true)
    } catch (err) {
      setError("Failed to send password reset email. Please try again.")
      console.error("Password reset error:", err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 px-4 py-12">
      {/* Gradient header */}
      <div className="w-full bg-gradient-to-b from-teal-900 to-transparent h-32 absolute top-0 left-0 z-0"></div>

      <Link
        href="/login"
        className="absolute top-8 left-8 z-10 flex items-center text-white hover:text-gold-300 transition-colors"
      >
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Login
      </Link>

      <div className="w-full max-w-md z-10">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-block">
            <div className="flex items-center justify-center">
              <div className="w-12 h-12 rounded-md bg-teal-900 flex items-center justify-center text-white font-bold mr-3">
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
              </div>
              <span className="text-2xl font-display font-semibold text-teal-900">
                Crypto<span className="text-gold-500">Escrow</span>
              </span>
            </div>
          </Link>
          <h1 className="mt-6 text-3xl font-bold text-teal-900 font-display">Reset Password</h1>
          <p className="mt-2 text-neutral-600">
            Enter your email address and we'll send you a link to reset your password
          </p>
        </div>

        <Card className="border-0 shadow-lg">
          <CardContent className="pt-6">
            {error && (
              <Alert variant="destructive" className="mb-6">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success ? (
              <Alert className="mb-6 bg-green-50 border-green-200 text-green-800">
                <CheckCircle className="h-4 w-4" />
                <AlertTitle>Email Sent</AlertTitle>
                <AlertDescription>
                  If an account exists with the email {email}, you will receive a password reset link shortly.
                </AlertDescription>
              </Alert>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-neutral-500" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full bg-teal-900 hover:bg-teal-800 text-white" disabled={loading}>
                  {loading ? "Sending..." : "Send Reset Link"}
                </Button>
              </form>
            )}
          </CardContent>
          <CardFooter className="flex justify-center pb-6">
            <p className="text-sm text-neutral-600">
              Remember your password?{" "}
              <Link href="/login" className="text-teal-700 hover:text-teal-900">
                Back to login
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
