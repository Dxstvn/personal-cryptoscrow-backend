"use client"

import { Building2, LockKeyhole, FileCheck, Clock, CheckCircle, ArrowRight } from "lucide-react"

export default function TransactionsStep() {
  return (
    <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
      {/* Header - Made more compact */}
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 mx-auto mb-4">
          <Building2 className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-bold text-teal-900 mb-2 font-display">Create Transactions</h2>
        <p className="text-neutral-600 max-w-2xl mx-auto text-sm">
          Set up secure escrow transactions for your real estate deals. Our smart contracts ensure funds are only
          released when all conditions are met.
        </p>
      </div>

      {/* Transaction flow - More compact with smaller spacing */}
      <div className="bg-white rounded-lg p-4 border border-neutral-200 shadow-sm">
        <h3 className="text-lg font-semibold text-teal-900 mb-3 text-center">How It Works</h3>

        <div className="relative">
          {/* Vertical line connecting steps */}
          <div className="absolute left-5 top-6 bottom-6 w-0.5 bg-teal-100"></div>

          <div className="space-y-4">
            {/* Step 1 */}
            <div className="flex">
              <div className="relative z-10">
                <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 mr-4">
                  <span className="text-base font-semibold">1</span>
                </div>
              </div>
              <div>
                <h4 className="text-base font-medium text-teal-900">Create Escrow</h4>
                <p className="text-neutral-600 text-sm">
                  Set up a new transaction with property details, counterparty information, and escrow conditions.
                </p>
                <div className="flex items-center text-teal-700 text-xs">
                  <LockKeyhole className="h-3 w-3 mr-1" />
                  <span>Smart contract automatically deployed</span>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex">
              <div className="relative z-10">
                <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 mr-4">
                  <span className="text-base font-semibold">2</span>
                </div>
              </div>
              <div>
                <h4 className="text-base font-medium text-teal-900">Fund Escrow</h4>
                <p className="text-neutral-600 text-sm">
                  Buyer deposits funds into the escrow smart contract, where they're securely held.
                </p>
                <div className="flex items-center text-teal-700 text-xs">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  <span>Funds locked until conditions are met</span>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex">
              <div className="relative z-10">
                <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 mr-4">
                  <span className="text-base font-semibold">3</span>
                </div>
              </div>
              <div>
                <h4 className="text-base font-medium text-teal-900">Document Verification</h4>
                <p className="text-neutral-600 text-sm">
                  Upload and verify required documents such as title deeds, inspection reports, and signed agreements.
                </p>
                <div className="flex items-center text-teal-700 text-xs">
                  <FileCheck className="h-3 w-3 mr-1" />
                  <span>Secure document verification</span>
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex">
              <div className="relative z-10">
                <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 mr-4">
                  <span className="text-base font-semibold">4</span>
                </div>
              </div>
              <div>
                <h4 className="text-base font-medium text-teal-900">Funds Release</h4>
                <p className="text-neutral-600 text-sm">
                  Once all conditions are met and verified, funds are automatically released to the seller.
                </p>
                <div className="flex items-center text-teal-700 text-xs">
                  <Clock className="h-3 w-3 mr-1" />
                  <span>Typically 70% faster than traditional escrow</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Benefits - Made more compact with grid */}
      <div className="bg-teal-50 rounded-lg p-4 border border-teal-100">
        <h3 className="text-base font-semibold text-teal-900 mb-2">Key Benefits</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-start">
            <ArrowRight className="h-4 w-4 text-teal-700 mt-0.5 mr-1 flex-shrink-0" />
            <span>Transparent tracking</span>
          </div>
          <div className="flex items-start">
            <ArrowRight className="h-4 w-4 text-teal-700 mt-0.5 mr-1 flex-shrink-0" />
            <span>Reduced fees</span>
          </div>
          <div className="flex items-start">
            <ArrowRight className="h-4 w-4 text-teal-700 mt-0.5 mr-1 flex-shrink-0" />
            <span>Automated compliance</span>
          </div>
          <div className="flex items-start">
            <ArrowRight className="h-4 w-4 text-teal-700 mt-0.5 mr-1 flex-shrink-0" />
            <span>Immutable records</span>
          </div>
        </div>
      </div>
    </div>
  )
}
