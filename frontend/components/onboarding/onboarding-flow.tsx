"use client"

import { useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { useOnboarding } from "@/context/onboarding-context"
import WelcomeStep from "./steps/welcome-step"
import WalletStep from "./steps/wallet-step"
import TransactionsStep from "./steps/transactions-step"
import DocumentsStep from "./steps/documents-step"
import { ArrowRight, ArrowLeft } from "lucide-react"

export default function OnboardingFlow() {
  const { showOnboarding, setShowOnboarding, setHasCompletedOnboarding, currentStep, setCurrentStep, totalSteps } =
    useOnboarding()

  // Reset step when onboarding is shown
  useEffect(() => {
    if (showOnboarding) {
      setCurrentStep(0)
    }
  }, [showOnboarding, setCurrentStep])

  // Handle next step
  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleComplete()
    }
  }

  // Handle previous step
  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  // Handle skip/complete
  const handleComplete = () => {
    setShowOnboarding(false)
    setHasCompletedOnboarding(true)
  }

  // Render the current step
  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <WelcomeStep />
      case 1:
        return <WalletStep />
      case 2:
        return <TransactionsStep />
      case 3:
        return <DocumentsStep />
      default:
        return <WelcomeStep />
    }
  }

  if (!showOnboarding) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-8"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative w-full max-w-3xl bg-white rounded-xl shadow-2xl mx-4 max-h-[90vh] flex flex-col"
        >
          {/* Decorative elements */}
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-teal-500 via-teal-700 to-gold-500"></div>
          <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full bg-teal-100 opacity-50"></div>
          <div className="absolute -bottom-24 -left-24 w-48 h-48 rounded-full bg-gold-100 opacity-50"></div>

          {/* Progress indicator */}
          <div className="flex justify-center pt-8 pb-4 relative z-10">
            {Array.from({ length: totalSteps }).map((_, index) => (
              <div key={index} className="relative mx-2">
                <div
                  className={`w-3 h-3 rounded-full transition-all duration-300 ${
                    index === currentStep
                      ? "bg-teal-600 scale-125"
                      : index < currentStep
                        ? "bg-teal-300"
                        : "bg-neutral-200"
                  }`}
                />
                {index < totalSteps - 1 && (
                  <div
                    className={`absolute top-1/2 left-full w-8 h-0.5 -translate-y-1/2 transition-all duration-300 ${
                      index < currentStep ? "bg-teal-300" : "bg-neutral-200"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Step content */}
          <div className="px-8 overflow-y-auto flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
              >
                {renderStep()}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Navigation buttons */}
          <div className="flex justify-between p-6 relative z-10 border-t border-neutral-100 mt-4">
            <div>
              {currentStep > 0 && (
                <Button
                  variant="outline"
                  onClick={handlePrevious}
                  className="border-teal-200 text-teal-700 hover:bg-teal-50"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" /> Previous
                </Button>
              )}
            </div>
            <div className="flex gap-4">
              <Button variant="ghost" onClick={handleComplete} className="text-neutral-600 hover:text-neutral-800">
                {currentStep === totalSteps - 1 ? "Skip" : "Skip Tour"}
              </Button>
              <Button className="bg-teal-900 hover:bg-teal-800 text-white" onClick={handleNext}>
                {currentStep === totalSteps - 1 ? "Get Started" : "Next"}
                {currentStep !== totalSteps - 1 && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
