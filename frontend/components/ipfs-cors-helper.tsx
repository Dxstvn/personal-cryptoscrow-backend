"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle, AlertCircle, Terminal } from "lucide-react"

export default function IPFSCorsHelper() {
  const [isConfiguring, setIsConfiguring] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const configureCors = async () => {
    setIsConfiguring(true)
    setSuccess(null)
    setError(null)

    try {
      // These are the commands we need to run
      const commands = [
        'ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin \'["http://localhost:3000", "https://localhost:3000", "http://127.0.0.1:3000", "https://127.0.0.1:3000", "*"]\'',
        'ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods \'["GET", "POST", "PUT"]\'',
        'ipfs config --json API.HTTPHeaders.Access-Control-Allow-Headers \'["X-Requested-With", "Content-Type", "User-Agent"]\'',
      ]

      setSuccess(
        "Please run these commands in your terminal to enable CORS for your IPFS node, then restart your IPFS daemon:",
      )
    } catch (err) {
      setError(`Failed to generate CORS configuration: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsConfiguring(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>IPFS CORS Configuration Helper</CardTitle>
        <CardDescription>
          Configure your IPFS node to allow cross-origin requests from your web application
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="bg-green-50 text-green-700 border-green-200">
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>CORS Configuration Commands</AlertTitle>
            <AlertDescription>
              <p className="mb-2">{success}</p>
              <div className="bg-gray-900 text-gray-100 p-3 rounded-md text-sm font-mono overflow-x-auto">
                <p className="mb-1">
                  ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["http://localhost:3000",
                  "https://localhost:3000", "http://127.0.0.1:3000", "https://127.0.0.1:3000", "*"]'
                </p>
                <p className="mb-1">
                  ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["GET", "POST", "PUT"]'
                </p>
                <p>
                  ipfs config --json API.HTTPHeaders.Access-Control-Allow-Headers '["X-Requested-With", "Content-Type",
                  "User-Agent"]'
                </p>
              </div>
              <p className="mt-2">After running these commands, restart your IPFS daemon with:</p>
              <div className="bg-gray-900 text-gray-100 p-3 rounded-md text-sm font-mono mt-2">
                <p>ipfs shutdown</p>
                <p>ipfs daemon</p>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <p className="text-sm text-gray-600">
          Your IPFS node is running correctly, but your browser is likely blocking access due to CORS restrictions. This
          helper will generate the commands needed to configure CORS for your IPFS node.
        </p>
      </CardContent>
      <CardFooter>
        <Button onClick={configureCors} disabled={isConfiguring} className="bg-teal-900 hover:bg-teal-800 text-white">
          {isConfiguring ? (
            <>
              <Terminal className="mr-2 h-4 w-4 animate-spin" /> Generating...
            </>
          ) : (
            <>
              <Terminal className="mr-2 h-4 w-4" /> Generate CORS Commands
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  )
}
