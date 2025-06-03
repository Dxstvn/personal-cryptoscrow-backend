"use client"

import { Menu, LogOut } from "lucide-react"
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
import { useMobile } from "@/hooks/use-mobile"
import ConnectWalletButton from "@/components/connect-wallet-button"

interface HeaderProps {
  sidebarOpen?: boolean
  setSidebarOpen?: (open: boolean) => void
}

export default function Header({ sidebarOpen, setSidebarOpen }: HeaderProps) {
  const { user, signOut } = useAuth()
  const isMobile = useMobile()

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between border-b bg-white px-4 shadow-sm sm:px-6 lg:px-8">
      <div className="flex items-center">
        {isMobile && setSidebarOpen && (
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)} className="mr-2">
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <Link href="/dashboard" className="flex items-center md:hidden">
          <div className="w-8 h-8 rounded-md bg-teal-900 flex items-center justify-center text-white font-bold mr-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
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
          <span className="text-xl font-bold">CryptoEscrow</span>
        </Link>
      </div>

      <div className="flex items-center gap-x-4">
        <ConnectWalletButton variant="ghost" size="default" />

        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gold-100 to-gold-200 flex items-center justify-center text-teal-800 font-semibold">
                  {user?.email?.charAt(0).toUpperCase() || "A"}
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
