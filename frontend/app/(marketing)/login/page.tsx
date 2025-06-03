"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ArrowLeft, AlertCircle, Mail, Lock, Eye, EyeOff } from "lucide-react"
import { useAuth } from "@/context/auth-context"

export default function LoginPage() {
  const router = useRouter()
  const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth()
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true)
      setError(null)
      await signInWithGoogle()
      // The router.push is handled in the auth context
    } catch (err: any) {
      setError(err.message || "Failed to sign in with Google. Please try again.")
      console.error("Google sign-in error:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Basic validation
    if (!email || !password) {
      setError("Please fill in all fields")
      return
    }

    if (!isLogin && password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }

    setLoading(true)

    try {
      if (isLogin) {
        // Sign in with email and password
        await signInWithEmail(email, password)
      } else {
        // Sign up with email and password
        await signUpWithEmail(email, password)
      }
      // The router.push is handled in the auth context
    } catch (err: any) {
      setError(err.message || `Failed to ${isLogin ? "sign in" : "sign up"}. Please try again.`)
      console.error("Auth error:", err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 px-4 py-12">
      {/* Gradient header */}
      <div className="w-full bg-gradient-to-b from-teal-900 to-transparent h-32 absolute top-0 left-0 z-0"></div>

      <Link
        href="/"
        className="absolute top-8 left-8 z-10 flex items-center text-white hover:text-gold-300 transition-colors"
      >
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
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
          <h1 className="mt-6 text-3xl font-bold text-teal-900 font-display">
            {isLogin ? "Welcome Back" : "Create Account"}
          </h1>
          <p className="mt-2 text-neutral-600">
            {isLogin ? "Sign in to access your account" : "Sign up to start using CryptoEscrow"}
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

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-neutral-500" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1 h-8 w-8 text-neutral-500"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-neutral-500" />
                    <Input
                      id="confirm-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
              )}

              {isLogin && (
                <div className="text-right">
                  <Link href="/forgot-password" className="text-sm text-teal-700 hover:text-teal-900">
                    Forgot password?
                  </Link>
                </div>
              )}

              <Button type="submit" className="w-full bg-teal-900 hover:bg-teal-800 text-white" disabled={loading}>
                {loading ? `${isLogin ? "Signing in" : "Signing up"}...` : isLogin ? "Sign In" : "Sign Up"}
              </Button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-neutral-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-2 text-neutral-500">Or continue with</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full border-neutral-200 hover:bg-neutral-50"
              onClick={handleGoogleSignIn}
              disabled={loading}
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Continue with Google
            </Button>
          </CardContent>
          <CardFooter className="flex justify-center pb-6">
            <p className="text-sm text-neutral-600">
              {isLogin ? "Don't have an account?" : "Already have an account?"}
              <Button
                variant="link"
                className="text-teal-700 hover:text-teal-900 p-0 h-auto ml-1"
                onClick={() => setIsLogin(!isLogin)}
              >
                {isLogin ? "Sign up" : "Sign in"}
              </Button>
            </p>
          </CardFooter>
        </Card>

        <p className="mt-6 text-center text-sm text-neutral-500">
          By continuing, you agree to our{" "}
          <Link href="/terms" className="text-teal-700 hover:text-teal-900">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-teal-700 hover:text-teal-900">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
