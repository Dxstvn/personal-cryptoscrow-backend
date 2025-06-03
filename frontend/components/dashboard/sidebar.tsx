"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  LayoutDashboard,
  Wallet,
  Users,
  Settings,
  HelpCircle,
  X,
  Plus,
  ChevronLeft,
  ChevronRight,
  FileText,
} from "lucide-react"
import { useAuth } from "@/context/auth-context"
import { useSidebar } from "@/context/sidebar-context"
import { useMobile } from "@/hooks/use-mobile"

interface SidebarProps {
  open: boolean
  setOpen: (open: boolean) => void
}

export default function DashboardSidebar({ open, setOpen }: SidebarProps) {
  const pathname = usePathname()
  const { user, isDemoAccount } = useAuth()
  const { expanded, toggleSidebar } = useSidebar()
  const isMobile = useMobile()

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

  const navigation = [
    {
      name: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
      current: pathname === "/dashboard",
    },
    {
      name: "Transactions",
      href: "/transactions",
      icon: FileText,
      current: pathname === "/transactions" || pathname.startsWith("/transactions/"),
    },
    {
      name: "Wallet",
      href: "/wallet",
      icon: Wallet,
      current: pathname === "/wallet",
    },
    {
      name: "Contacts",
      href: "/contacts",
      icon: Users,
      current: pathname === "/contacts",
    },
    {
      name: "Settings",
      href: "/settings",
      icon: Settings,
      current: pathname === "/settings" || pathname.startsWith("/settings/"),
    },
    {
      name: "Help & Support",
      href: "/support",
      icon: HelpCircle,
      current: pathname === "/support",
    },
  ]

  // On mobile, we use a different approach (drawer-style sidebar)
  if (isMobile) {
    return (
      <>
        {/* Mobile sidebar backdrop */}
        {open && <div className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75" onClick={() => setOpen(false)} />}

        {/* Mobile sidebar */}
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-64 bg-white transition-transform duration-300 ease-in-out border-r border-gray-200",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {/* Sidebar header */}
          <div className="h-16 flex items-center px-4 border-b border-gray-200">
            <Link href="/dashboard" className="flex items-center">
              <div className="w-10 h-10 rounded-md bg-teal-600 flex items-center justify-center text-white font-bold mr-3">
                CE
              </div>
              <span className="text-xl font-bold">CryptoEscrow</span>
            </Link>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="ml-auto">
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* New Transaction button */}
          <div className="p-4">
            <Button asChild className="w-full bg-black hover:bg-gray-800 text-white">
              <Link href="/transactions/new" className="flex items-center justify-center">
                <Plus className="mr-2 h-4 w-4" /> New Transaction
              </Link>
            </Button>
          </div>

          {/* Sidebar content */}
          <ScrollArea className="flex-1 px-3 py-2">
            <nav className="flex flex-col gap-1">
              {navigation.map((route) => {
                const isActive = pathname === route.href || pathname?.startsWith(`${route.href}/`)

                return (
                  <Link
                    key={route.href}
                    href={route.href}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                    )}
                  >
                    <route.icon className={cn("h-5 w-5", isActive ? "text-gray-900" : "text-gray-500")} />
                    {route.name}
                  </Link>
                )
              })}
            </nav>
          </ScrollArea>

          {/* User profile */}
          <div className="mt-auto border-t border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-800 font-semibold">
                {getUserInitials()}
              </div>
              <div>
                <p className="font-medium">{getDisplayName()}</p>
                <p className="text-xs text-gray-500">{user?.email}</p>
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  // Desktop sidebar with collapsible functionality
  return (
    <div
      className={cn(
        "relative h-screen bg-white border-r border-gray-200 transition-all duration-300 ease-in-out",
        expanded ? "w-64" : "w-20",
      )}
    >
      {/* Toggle button */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-20 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-100"
      >
        {expanded ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>

      {/* Sidebar header */}
      <div className="h-16 flex items-center px-4 border-b border-gray-200">
        <Link href="/dashboard" className="flex items-center">
          <div className="w-10 h-10 rounded-md bg-teal-600 flex items-center justify-center text-white font-bold">
            CE
          </div>
          {expanded && <span className="text-xl font-bold ml-3">CryptoEscrow</span>}
        </Link>
      </div>

      {/* New Transaction button */}
      <div className="p-4">
        <Button asChild className={cn("bg-black hover:bg-gray-800 text-white", expanded ? "w-full" : "w-12 h-12 p-0")}>
          <Link href="/transactions/new" className="flex items-center justify-center">
            <Plus className={expanded ? "mr-2 h-4 w-4" : "h-5 w-5"} />
            {expanded && "New Transaction"}
          </Link>
        </Button>
      </div>

      {/* Sidebar content */}
      <ScrollArea className="flex-1 px-3 py-2 h-[calc(100vh-16rem)]">
        <nav className="flex flex-col gap-1">
          {navigation.map((route) => {
            const isActive = pathname === route.href || pathname?.startsWith(`${route.href}/`)

            return (
              <Link
                key={route.href}
                href={route.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                  !expanded && "justify-center px-0",
                )}
                title={!expanded ? route.name : undefined}
              >
                <route.icon className={cn("h-5 w-5", isActive ? "text-gray-900" : "text-gray-500")} />
                {expanded && route.name}
              </Link>
            )
          })}
        </nav>
      </ScrollArea>

      {/* User profile */}
      <div className="mt-auto border-t border-gray-200 p-4">
        <div className={cn("flex items-center", expanded ? "gap-3" : "justify-center")}>
          <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-800 font-semibold">
            {getUserInitials()}
          </div>
          {expanded && (
            <div className="overflow-hidden">
              <p className="font-medium truncate">{getDisplayName()}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
