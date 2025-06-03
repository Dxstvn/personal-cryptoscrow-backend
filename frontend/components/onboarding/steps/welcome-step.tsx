"use client"

import { useAuth } from "@/context/auth-context"
import { Home, Shield, Clock, Coins } from "lucide-react"

export default function WelcomeStep() {
  const { user } = useAuth()

  // Get user's first name from email
  const firstName = user?.email
    ? user.email.split("@")[0].split(".")[0].charAt(0).toUpperCase() + user.email.split("@")[0].split(".")[0].slice(1)
    : "there"

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="w-20 h-20 rounded-full bg-teal-100 flex items-center justify-center text-teal-800 mx-auto mb-6">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="40"
            height="40"
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
        <h2 className="text-3xl font-bold text-teal-900 mb-4 font-display">Welcome to CryptoEscrow, {firstName}!</h2>
        <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
          We're excited to have you on board. Let's take a quick tour to help you get started with secure real estate
          transactions using cryptocurrency.
        </p>
      </div>

      {/* Key features */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-teal-50 rounded-lg p-6 border border-teal-100">
          <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 mb-4">
            <Shield className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold text-teal-900 mb-2">Secure Transactions</h3>
          <p className="text-neutral-600">
            Our smart contract-based escrow ensures your funds are secure and only released when all conditions are met.
          </p>
        </div>

        <div className="bg-gold-50 rounded-lg p-6 border border-gold-100">
          <div className="w-12 h-12 rounded-full bg-gold-100 flex items-center justify-center text-gold-700 mb-4">
            <Home className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold text-teal-900 mb-2">Real Estate Focus</h3>
          <p className="text-neutral-600">
            Specifically designed for real estate transactions with all the tools you need for property deals.
          </p>
        </div>

        <div className="bg-teal-50 rounded-lg p-6 border border-teal-100">
          <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 mb-4">
            <Clock className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold text-teal-900 mb-2">Time Efficient</h3>
          <p className="text-neutral-600">
            Reduce closing time from weeks to days with our streamlined process and automated verification.
          </p>
        </div>

        <div className="bg-gold-50 rounded-lg p-6 border border-gold-100">
          <div className="w-12 h-12 rounded-full bg-gold-100 flex items-center justify-center text-gold-700 mb-4">
            <Coins className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold text-teal-900 mb-2">Cryptocurrency Powered</h3>
          <p className="text-neutral-600">
            Use digital currencies for faster, more secure transactions with lower fees and global accessibility.
          </p>
        </div>
      </div>
    </div>
  )
}
