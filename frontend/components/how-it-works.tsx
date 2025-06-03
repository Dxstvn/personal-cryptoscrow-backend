import { FileCheck, LockKeyhole, UserCheck } from "lucide-react"

export default function HowItWorks() {
  return (
    <section className="py-24 bg-gradient-to-b from-brand-50 to-white">
      <div className="container px-4 md:px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl bg-clip-text text-transparent bg-gradient-to-r from-brand-700 to-brand-900">
            How It Works
          </h2>
          <p className="mt-4 text-lg text-neutral-600 max-w-3xl mx-auto">
            Our platform simplifies the complex process of real estate transactions with cryptocurrency.
          </p>
        </div>

        <div className="relative max-w-5xl mx-auto">
          {/* Connection line */}
          <div className="absolute top-24 left-1/2 h-[calc(100%-6rem)] w-0.5 bg-gradient-to-b from-brand-200 to-purple-200 -translate-x-1/2 hidden md:block"></div>

          {/* Steps */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16">
            {/* Step 1 */}
            <div className="relative md:text-right">
              <div className="md:absolute md:right-0 md:translate-x-1/2 z-10 bg-white w-12 h-12 rounded-full border-2 border-brand-200 flex items-center justify-center mb-4 md:mb-0 shadow-md">
                <span className="text-brand-700 font-bold">1</span>
              </div>
              <div className="glass-card p-6 rounded-xl">
                <div className="flex md:justify-end mb-4">
                  <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center">
                    <LockKeyhole className="h-6 w-6 text-brand-600" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold mb-2 text-brand-900">Smart Contract-Based Escrow</h3>
                <p className="text-neutral-600">
                  When a buyer and seller agree on a property sale, they deposit funds (crypto) into a smart
                  contract-controlled escrow account.
                </p>
              </div>
            </div>

            <div className="md:mt-32"></div>

            {/* Step 2 */}
            <div className="md:mt-32"></div>

            <div className="relative">
              <div className="md:absolute md:left-0 md:-translate-x-1/2 z-10 bg-white w-12 h-12 rounded-full border-2 border-purple-200 flex items-center justify-center mb-4 md:mb-0 shadow-md">
                <span className="text-purple-700 font-bold">2</span>
              </div>
              <div className="glass-card p-6 rounded-xl">
                <div className="mb-4">
                  <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                    <UserCheck className="h-6 w-6 text-purple-600" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold mb-2 text-brand-900">Verification & Compliance</h3>
                <p className="text-neutral-600">
                  The platform verifies the identity of both parties (KYC/AML compliance) and ensures the property's
                  legal standing.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="relative md:text-right">
              <div className="md:absolute md:right-0 md:translate-x-1/2 z-10 bg-white w-12 h-12 rounded-full border-2 border-brand-200 flex items-center justify-center mb-4 md:mb-0 shadow-md">
                <span className="text-brand-700 font-bold">3</span>
              </div>
              <div className="glass-card p-6 rounded-xl">
                <div className="flex md:justify-end mb-4">
                  <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center">
                    <FileCheck className="h-6 w-6 text-brand-600" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold mb-2 text-brand-900">Secure Fund Release</h3>
                <p className="text-neutral-600">
                  Upon successful property transfer and legal approvals, the escrow releases funds to the seller
                  automatically.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
