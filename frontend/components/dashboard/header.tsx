"use client"

import { Menu, LogOut, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/context/auth-context"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import Link from "next/link"
import { useSidebar } from "@/context/sidebar-context"
import { useMobile } from "@/hooks/use-mobile"

interface HeaderProps {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
}

export default function DashboardHeader({ sidebarOpen, setSidebarOpen }: HeaderProps) {
  const { user, signOut } = useAuth()
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

  return (
    <header className="bg-white border-b border-gray-200 h-16 flex items-center px-4 md:px-6">
      {isMobile ? (
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)} className="mr-2">
          <Menu className="h-5 w-5" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="mr-2 hidden md:flex"
          title={expanded ? "Collapse sidebar" : "Expand sidebar"}
        >
          {expanded ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
        </Button>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center text-teal-800 font-semibold">
                  {getUserInitials()}
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="flex flex-col space-y-1 p-2">
                <p className="text-sm font-medium leading-none">Account</p>
                <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings" className="cursor-pointer">
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/support" className="cursor-pointer">
                  Help & Support
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="cursor-pointer text-red-600 focus:text-red-600">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  )
}
