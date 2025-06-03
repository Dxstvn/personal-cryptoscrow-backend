"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"

type SidebarContextType = {
  expanded: boolean
  toggleSidebar: () => void
  setExpanded: (expanded: boolean) => void
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined)

export function SidebarProvider({ children }: { children: ReactNode }) {
  // Get initial state from localStorage if available
  const [expanded, setExpanded] = useState<boolean>(true)

  // Initialize from localStorage on mount
  useEffect(() => {
    const savedState = localStorage.getItem("sidebarExpanded")
    if (savedState !== null) {
      setExpanded(savedState === "true")
    }
  }, [])

  const toggleSidebar = () => {
    const newState = !expanded
    setExpanded(newState)
    // Save to localStorage
    localStorage.setItem("sidebarExpanded", String(newState))
  }

  return <SidebarContext.Provider value={{ expanded, toggleSidebar, setExpanded }}>{children}</SidebarContext.Provider>
}

export function useSidebar() {
  const context = useContext(SidebarContext)
  if (context === undefined) {
    throw new Error("useSidebar must be used within a SidebarProvider")
  }
  return context
}
