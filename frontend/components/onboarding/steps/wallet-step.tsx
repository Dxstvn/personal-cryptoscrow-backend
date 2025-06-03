"use client"

import { Wallet, Shield, Key, CheckCircle } from "lucide-react"
import { MetamaskFox } from "@/components/icons/metamask-fox"
import { CoinbaseIcon } from "@/components/icons/coinbase-icon"

export default function WalletStep() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="w-20 h-20 rounded-full bg-gold-100 flex items-center justify-center text-gold-700 mx-auto mb-6">
          <Wallet className="h-10 w-10" />
        </div>
        <h2 className="text-3xl font-bold text-teal-900 mb-4 font-display">Connect Your Wallet</h2>
        <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
          Connect your cryptocurrency wallet to start using CryptoEscrow. We support popular wallets like MetaMask and
          Coinbase Wallet.
        </p>
      </div>

      {/* Wallet options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg p-6 border border-neutral-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center mb-4">
            <div className="w-12 h-12 mr-4">
              <MetamaskFox />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-teal-900">MetaMask</h3>
              <p className="text-sm text-neutral-500">Popular Ethereum Wallet</p>
            </div>
          </div>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start">
              <CheckCircle className="h-4 w-4 text-teal-600 mt-0.5 mr-2 flex-shrink-0" />
              <span>Browser extension and mobile app</span>
            </li>
            <li className="flex items-start">
              <CheckCircle className="h-4 w-4 text-teal-600 mt-0.5 mr-2 flex-shrink-0" />
              <span>Widely used in the Ethereum ecosystem</span>
            </li>
            <li className="flex items-start">
              <CheckCircle className="h-4 w-4 text-teal-600 mt-0.5 mr-2 flex-shrink-0" />
              <span>Easy to use interface</span>
            </li>
          </ul>
        </div>

        <div className="bg-white rounded-lg p-6 border border-neutral-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center mb-4">
            <div className="w-12 h-12 mr-4">
              <CoinbaseIcon />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-teal-900">Coinbase Wallet</h3>
              <p className="text-sm text-neutral-500">Coinbase's Crypto Wallet</p>
            </div>
          </div>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start">
              <CheckCircle className="h-4 w-4 text-teal-600 mt-0.5 mr-2 flex-shrink-0" />
              <span>Integrated with Coinbase exchange</span>
            </li>
            <li className="flex items-start">
              <CheckCircle className="h-4 w-4 text-teal-600 mt-0.5 mr-2 flex-shrink-0" />
              <span>User-friendly for beginners</span>
            </li>
            <li className="flex items-start">
              <CheckCircle className="h-4 w-4 text-teal-600 mt-0.5 mr-2 flex-shrink-0" />
              <span>Strong security features</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Security information */}
      <div className="bg-teal-50 rounded-lg p-6 border border-teal-100">
        <div className="flex items-start">
          <div className="mr-4">
            <Shield className="h-6 w-6 text-teal-700" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-teal-900 mb-2">Wallet Security</h3>
            <p className="text-neutral-600 mb-4">
              Your security is our priority. When you connect your wallet to CryptoEscrow:
            </p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start">
                <Key className="h-4 w-4 text-teal-600 mt-0.5 mr-2 flex-shrink-0" />
                <span>Your private keys never leave your device</span>
              </li>
              <li className="flex items-start">
                <Key className="h-4 w-4 text-teal-600 mt-0.5 mr-2 flex-shrink-0" />
                <span>You approve each transaction before it's processed</span>
              </li>
              <li className="flex items-start">
                <Key className="h-4 w-4 text-teal-600 mt-0.5 mr-2 flex-shrink-0" />
                <span>All connections are encrypted and secure</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
