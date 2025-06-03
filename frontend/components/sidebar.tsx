"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  LayoutDashboard,
  Building2,
  Wallet,
  Users,
  Settings,
  HelpCircle,
  Plus,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from "lucide-react"
import { useAuth } from "@/context/auth-context"
import { useMobile } from "@/hooks/use-mobile"
import { useState, useEffect } from "react"

export default function Sidebar() {
  const pathname = usePathname()
  const { user, signOut } = useAuth()
  const isMobile = useMobile()
  const [expanded, setExpanded] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Initialize from localStorage on mount
  useEffect(() => {
    if (!isMobile) {
      const savedState = localStorage.getItem("sidebarExpanded")
      if (savedState !== null) {
        setExpanded(savedState === "true")
      }
    }
  }, [isMobile])

  // Close mobile sidebar when path changes
  useEffect(() => {
    if (isMobile) {
      setMobileOpen(false)
    }
  }, [pathname, isMobile])

  const toggleSidebar = () => {
    const newState = !expanded
    setExpanded(newState)
    localStorage.setItem("sidebarExpanded", String(newState))
  }

  const routes = [
    {
      name: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      name: "Transactions",
      href: "/transactions",
      icon: Building2,
    },
    {
      name: "Wallet",
      href: "/wallet",
      icon: Wallet,
    },
    {
      name: "Contacts",
      href: "/contacts",
      icon: Users,
    },
    {
      name: "Settings",
      href: "/settings",
      icon: Settings,
    },
    {
      name: "Help & Support",
      href: "/support",
      icon: HelpCircle,
    },
  ]

  // Get user's initials for the avatar
  const getUserInitials = () => {
    if (!user || !user.email) return "U"

    // Try to extract initials from email (before the @ symbol)
    const emailName = user.email.split("@")[0]
    // Split by non-letter characters and take first letter of each part
    const initials = emailName
      .split(/[^a-zA-Z]/)
      .filter((part) => part.length > 0)
      .map((part) => part[0].toUpperCase())
      .slice(0, 2)
      .join("")

    return initials || user.email[0].toUpperCase()
  }

  // Format display name from email
  const getDisplayName = () => {
    if (!user || !user.email) return "User"

    // Try to extract a name from the email
    const emailName = user.email.split("@")[0]
    // Split by non-letter characters
    const nameParts = emailName.split(/[^a-zA-Z]/).filter((part) => part.length > 0)

    if (nameParts.length > 0) {
      // Capitalize first letter of each part
      return nameParts.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(" ")
    }

    return emailName
  }

  // Mobile sidebar
  if (isMobile) {
    return (
      <>
        {/* Mobile toggle button - fixed to the top left */}
        <button
          onClick={() => setMobileOpen(true)}
          className="fixed top-4 left-4 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md text-teal-900"
          aria-label="Open navigation"
        >
          <ChevronRight size={20} />
        </button>

        {/* Mobile sidebar backdrop */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
        )}

        {/* Mobile sidebar */}
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-64 bg-white transition-transform duration-300 ease-in-out border-r border-neutral-100 shadow-lg",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {/* Sidebar header */}
          <div className="h-16 flex items-center px-4 border-b border-neutral-100">
            <Link href="/dashboard" className="flex items-center">
              <div className="w-10 h-10 rounded-md bg-teal-900 flex items-center justify-center text-white font-bold mr-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
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
              <span className="text-xl font-display font-semibold">CryptoEscrow</span>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileOpen(false)}
              className="ml-auto text-teal-900"
              aria-label="Close navigation"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </div>

          {/* New Transaction button */}
          <div className="p-4">
            <Button asChild className="w-full bg-teal-900 hover:text-gold-300 text-white shadow-sm">
              <Link href="/transactions/new" className="flex items-center justify-center">
                <Plus className="mr-2 h-4 w-4" /> New Transaction
              </Link>
            </Button>
          </div>

          {/* Sidebar content */}
          <ScrollArea className="flex-1 px-3 py-2">
            <nav className="flex flex-col gap-1">
              {routes.map((route) => {
                const isActive = pathname === route.href || pathname?.startsWith(`${route.href}/`)

                return (
                  <Link
                    key={route.href}
                    href={route.href}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-teal-50 text-teal-900"
                        : "text-neutral-600 hover:bg-neutral-50 hover:text-teal-900",
                    )}
                  >
                    <route.icon className={cn("h-5 w-5", isActive ? "text-teal-900" : "text-neutral-500")} />
                    {route.name}
                  </Link>
                )
              })}
            </nav>
          </ScrollArea>

          {/* User profile */}
          <div className="mt-auto border-t border-neutral-100 p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gold-100 to-gold-200 flex items-center justify-center text-teal-900 font-semibold">
                {getUserInitials()}
              </div>
              <div className="overflow-hidden">
                <p className="font-medium truncate">{getDisplayName()}</p>
                <p className="text-xs text-neutral-500 truncate">{user?.email}</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full flex items-center justify-center text-red-600 border-red-100 hover:bg-red-50"
              onClick={signOut}
            >
              <LogOut className="mr-2 h-4 w-4" /> Sign Out
            </Button>
          </div>
        </div>
      </>
    )
  }

  // Desktop sidebar with collapsible functionality
  return (
    <div
      className={cn(
        "h-screen bg-white border-r border-neutral-100 transition-all duration-300 ease-in-out sticky top-0 z-30 shadow-sm",
        expanded ? "w-64" : "w-20",
      )}
    >
      {/* Toggle button */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-20 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-neutral-100 bg-white text-teal-900 hover:bg-teal-50 shadow-sm"
        aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
      >
        {expanded ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>

      {/* Sidebar header */}
      <div className="h-16 flex items-center px-4 border-b border-neutral-100">
        <Link href="/dashboard" className="flex items-center">
          <div className="w-10 h-10 rounded-md bg-teal-900 flex items-center justify-center text-white font-bold">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
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
          {expanded && <span className="text-xl font-display font-semibold ml-3">CryptoEscrow</span>}
        </Link>
      </div>

      {/* New Transaction button */}
      <div className="p-4">
        <Button variant="primary" className={cn("btn-primary", expanded ? "w-full" : "w-12 h-12 p-0")} asChild>
          <Link href="/transactions/new" className="flex items-center justify-center">
            <Plus className={expanded ? "mr-2 h-4 w-4" : "h-5 w-5"} />
            {expanded && "New Transaction"}
          </Link>
        </Button>
      </div>

      {/* Sidebar content */}
      <ScrollArea className="h-[calc(100vh-16rem)] px-3 py-2">
        <nav className="flex flex-col gap-1">
          {routes.map((route) => {
            const isActive = pathname === route.href || pathname?.startsWith(`${route.href}/`)

            return (
              <Link
                key={route.href}
                href={route.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive ? "bg-teal-50 text-teal-900" : "text-neutral-600 hover:bg-neutral-50 hover:text-teal-900",
                  !expanded && "justify-center px-0",
                )}
                title={!expanded ? route.name : undefined}
              >
                <route.icon className={cn("h-5 w-5", isActive ? "text-teal-900" : "text-neutral-500")} />
                {expanded && route.name}
              </Link>
            )
          })}
        </nav>
      </ScrollArea>

      {/* User profile */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-neutral-100 p-4 bg-white">
        <div className={cn("flex items-center", expanded ? "gap-3" : "justify-center")}>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gold-100 to-gold-200 flex items-center justify-center text-teal-900 font-semibold">
            {getUserInitials()}
          </div>
          {expanded && (
            <div className="overflow-hidden">
              <p className="font-medium truncate">{getDisplayName()}</p>
              <p className="text-xs text-neutral-500 truncate">{user?.email}</p>
            </div>
          )}
        </div>
        {expanded && (
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-3 flex items-center justify-center text-red-600 border-red-100 hover:bg-red-50"
            onClick={signOut}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sign Out
          </Button>
        )}
      </div>
    </div>
  )
}
