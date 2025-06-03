"use client"

import { useEffect, useState } from "react"
import { debugIPFSConnection } from "@/lib/ipfs-client"
import { Badge } from "@/components/ui/badge"
import { Database, AlertCircle, RefreshCw } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"

export default function IPFSStatus() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null)
  const [isChecking, setIsChecking] = useState(true)
  const [errorDetails, setErrorDetails] = useState<string>("")
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  const checkConnection = async () => {
    try {
      setIsChecking(true)
      setErrorDetails("")

      // Use the debug function for more detailed error information
      const debugResult = await debugIPFSConnection()
      setLastChecked(new Date())

      if (debugResult.startsWith("Successfully")) {
        setIsConnected(true)
      } else {
        setIsConnected(false)
        setErrorDetails(debugResult)
      }
    } catch (error) {
      console.error("Connection test error:", error)
      setErrorDetails(`Connection failed: ${error instanceof Error ? error.message : String(error)}`)
      setIsConnected(false)
    } finally {
      setIsChecking(false)
    }
  }

  useEffect(() => {
    checkConnection()

    // Check connection periodically
    const interval = setInterval(checkConnection, 60000) // Check every minute

    return () => clearInterval(interval)
  }, [])

  if (isChecking && isConnected === null) {
    return (
      <Badge variant="outline" className="bg-neutral-100 text-neutral-600 gap-1 py-1">
        <Database className="h-3.5 w-3.5 animate-pulse" />
        <span>Checking IPFS...</span>
      </Badge>
    )
  }

  if (isConnected) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1 py-1">
              <Database className="h-3.5 w-3.5" />
              <span>IPFS Connected</span>
              {isChecking && <RefreshCw className="h-3 w-3 ml-1 animate-spin" />}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>Connected to Filebase IPFS service</p>
            {lastChecked && <p className="text-xs mt-1">Last checked: {lastChecked.toLocaleTimeString()}</p>}
            <Button
              variant="outline"
              size="sm"
              className="mt-2 h-7 text-xs w-full"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                checkConnection()
              }}
              disabled={isChecking}
            >
              {isChecking ? "Checking..." : "Check Again"}
            </Button>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1 py-1">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>IPFS Disconnected</span>
            {isChecking && <RefreshCw className="h-3 w-3 ml-1 animate-spin" />}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p>Unable to connect to Filebase IPFS service</p>
          {errorDetails && <p className="text-xs mt-1 text-red-600 max-w-xs break-words">{errorDetails}</p>}
          {lastChecked && <p className="text-xs mt-1">Last checked: {lastChecked.toLocaleTimeString()}</p>}
          <div className="mt-2 text-xs">
            <p>Possible solutions:</p>
            <ul className="list-disc list-inside mt-1">
              <li>Check Filebase credentials</li>
              <li>Verify Filebase service status</li>
              <li>Check your internet connection</li>
            </ul>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 h-7 text-xs w-full"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              checkConnection()
            }}
            disabled={isChecking}
          >
            {isChecking ? "Checking..." : "Check Again"}
          </Button>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
