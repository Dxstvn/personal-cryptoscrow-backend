import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function HeroSection() {
  return (
    <section className="relative py-24 md:py-32 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-teal-900 via-teal-800 to-teal-900"></div>

      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0 bg-[url('/placeholder.svg?height=800&width=800')] bg-repeat opacity-5"></div>
      </div>

      {/* Animated gradient orbs */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-gold-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
      <div
        className="absolute bottom-10 right-10 w-72 h-72 bg-teal-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"
        style={{ animationDelay: "1s" }}
      ></div>

      <div className="container px-4 md:px-6 relative">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="flex flex-col space-y-8">
            <div>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl mb-6 text-white font-display">
                <span className="block">Secure Real Estate</span>
                <span className="block bg-clip-text text-transparent bg-gradient-to-r from-neutral-50 to-gold-300">
                  with Cryptocurrency
                </span>
              </h1>
              <p className="text-xl text-neutral-100 max-w-[600px]">
                Our escrow service provides a secure, transparent platform for real estate transactions using
                cryptocurrency, eliminating fraud and ensuring safe transfers.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button asChild size="lg" variant="secondary" className="font-medium">
                <Link href="/dashboard" className="flex items-center">
                  Get Started <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="border-white/30 text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/learn-more">Learn More</Link>
              </Button>
            </div>

            <div className="flex items-center space-x-4 text-sm">
              <div className="flex -space-x-2">
                <div className="w-8 h-8 rounded-full bg-gold-400 flex items-center justify-center text-xs font-medium text-teal-900">
                  JD
                </div>
                <div className="w-8 h-8 rounded-full bg-gold-300 flex items-center justify-center text-xs font-medium text-teal-900">
                  MK
                </div>
                <div className="w-8 h-8 rounded-full bg-gold-200 flex items-center justify-center text-xs font-medium text-teal-900">
                  TS
                </div>
              </div>
              <p className="text-neutral-100">Trusted by 1,000+ property investors</p>
            </div>
          </div>

          <div className="relative">
            <div className="glass-card p-6 shadow-2xl rounded-xl border border-white/10 backdrop-blur-sm">
              <img
                src="/placeholder.svg?height=600&width=800"
                alt="Real estate transaction dashboard"
                className="rounded-lg w-full"
              />
              <div className="absolute -bottom-6 -right-6 bg-white rounded-xl p-4 shadow-lg">
                <p className="font-semibold text-teal-900 font-display">Average time saved</p>
                <p className="text-3xl font-bold text-gold-500 font-display">14 days</p>
                <p className="text-sm text-teal-700">per transaction</p>
              </div>
            </div>

            {/* Decorative elements */}
            <div className="absolute -top-4 -left-4 w-8 h-8 rounded-full bg-gold-500"></div>
            <div className="absolute top-1/2 -right-4 w-6 h-6 rounded-full bg-teal-500"></div>
          </div>
        </div>
      </div>
    </section>
  )
}
