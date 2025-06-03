"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { useAuth } from "@/context/auth-context"

type OnboardingContextType = {
  showOnboarding: boolean
  setShowOnboarding: (show: boolean) => void
  hasCompletedOnboarding: boolean
  setHasCompletedOnboarding: (completed: boolean) => void
  currentStep: number
  setCurrentStep: (step: number) => void
  totalSteps: number
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined)

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(true)
  const [currentStep, setCurrentStep] = useState(0)
  const totalSteps = 4

  // Check if user has completed onboarding
  useEffect(() => {
    if (user) {
      // For jasmindustin@gmail.com, always show onboarding
      if (user.email === "jasmindustin@gmail.com") {
        setShowOnboarding(true)
        setHasCompletedOnboarding(false) // Always set to false for demo account
        return
      }

      // For other users, check localStorage
      const hasCompleted = localStorage.getItem(`onboarding-completed-${user.uid}`) === "true"
      setHasCompletedOnboarding(hasCompleted)

      // If they haven't completed onboarding, show it
      if (!hasCompleted) {
        setShowOnboarding(true)
      }
    }
  }, [user])

  // Mark onboarding as completed
  const handleCompletedOnboarding = (completed: boolean) => {
    setHasCompletedOnboarding(completed)

    if (user && user.email !== "jasmindustin@gmail.com" && completed) {
      localStorage.setItem(`onboarding-completed-${user.uid}`, "true")
    }
  }

  return (
    <OnboardingContext.Provider
      value={{
        showOnboarding,
        setShowOnboarding,
        hasCompletedOnboarding,
        setHasCompletedOnboarding: handleCompletedOnboarding,
        currentStep,
        setCurrentStep,
        totalSteps,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  )
}

export function useOnboarding() {
  const context = useContext(OnboardingContext)
  if (context === undefined) {
    throw new Error("useOnboarding must be used within an OnboardingProvider")
  }
  return context
}
