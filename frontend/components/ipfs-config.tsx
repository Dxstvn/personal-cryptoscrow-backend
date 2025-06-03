"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Database, AlertCircle, CheckCircle, Key } from "lucide-react"
import { debugIPFSConnection } from "@/lib/ipfs-client"

export default function IPFSConfig() {
  const [accessKey, setAccessKey] = useState("")
  const [secretKey, setSecretKey] = useState("")
  const [isConnected, setIsConnected] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    // Check connection on mount
    checkConnection()

    // Load saved settings if available (in a real app, these would come from environment variables)
    const savedAccessKey = localStorage.getItem("filebase_access_key")
    const savedSecretKey = localStorage.getItem("filebase_secret_key")

    if (savedAccessKey) setAccessKey(savedAccessKey)
    if (savedSecretKey) setSecretKey(savedSecretKey)
  }, [])

  const checkConnection = async () => {
    try {
      setIsTesting(true)
      setError(null)
      setSuccess(null)

      // Use the debug function for more detailed error information
      const debugResult = await debugIPFSConnection()

      if (debugResult.startsWith("Successfully")) {
        setIsConnected(true)
        setSuccess(debugResult)
      } else {
        setIsConnected(false)
        setError(debugResult)
      }
    } catch (err) {
      console.error("Connection test error:", err)
      setError(`Connection failed: ${err instanceof Error ? err.message : String(err)}`)
      setIsConnected(false)
    } finally {
      setIsTesting(false)
    }
  }

  const saveSettings = async () => {
    // In a real app, you would update environment variables or server-side configuration
    // For this demo, we'll just save to localStorage
    localStorage.setItem("filebase_access_key", accessKey)
    localStorage.setItem("filebase_secret_key", secretKey)

    // Test connection with new settings
    await checkConnection()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Filebase IPFS Configuration</CardTitle>
        <CardDescription>Configure your connection to Filebase's IPFS service</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Connection Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="bg-green-50 text-green-700 border-green-200">
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Success</AlertTitle>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="access-key">Filebase Access Key</Label>
          <Input
            id="access-key"
            value={accessKey}
            onChange={(e) => setAccessKey(e.target.value)}
            placeholder="Enter your Filebase Access Key"
          />
          <p className="text-xs text-neutral-500">
            Your Filebase Access Key (set in Vercel environment variables as FILEBASE_ACCESS_KEY)
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="secret-key">Filebase Secret Key</Label>
          <Input
            id="secret-key"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            type="password"
            placeholder="Enter your Filebase Secret Key"
          />
          <p className="text-xs text-neutral-500">
            Your Filebase Secret Key (set in Vercel environment variables as FILEBASE_SECRET_KEY)
          </p>
        </div>

        <div className="pt-2">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}></div>
            <span className="text-sm">
              {isConnected ? "Connected to Filebase IPFS" : "Not connected to Filebase IPFS"}
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Make sure you have valid Filebase credentials and your Filebase bucket is active
          </p>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={checkConnection} disabled={isTesting}>
          {isTesting ? (
            <>
              <Database className="mr-2 h-4 w-4 animate-spin" /> Testing...
            </>
          ) : (
            <>
              <Database className="mr-2 h-4 w-4" /> Test Connection
            </>
          )}
        </Button>
        <Button onClick={saveSettings} className="bg-teal-900 hover:bg-teal-800 text-white">
          <Key className="mr-2 h-4 w-4" /> Save Credentials
        </Button>
      </CardFooter>
    </Card>
  )
}
