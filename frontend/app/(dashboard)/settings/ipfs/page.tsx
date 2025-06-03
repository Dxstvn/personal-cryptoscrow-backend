import IPFSConfig from "@/components/ipfs-config"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, ExternalLink } from "lucide-react"
import Link from "next/link"

export default function IPFSSettingsPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <Link href="/settings" className="flex items-center text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Settings
        </Link>
        <h1 className="text-2xl font-bold">IPFS Settings</h1>
        <p className="text-gray-500">Configure your connection to Filebase's IPFS service</p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <IPFSConfig />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>About IPFS</CardTitle>
              <CardDescription>InterPlanetary File System</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-neutral-600">
                IPFS is a distributed system for storing and accessing files, websites, applications, and data.
              </p>
              <p className="text-sm text-neutral-600">
                Files uploaded to IPFS are encrypted and stored in a decentralized manner, ensuring security and
                redundancy.
              </p>
              <div className="pt-2">
                <Button variant="outline" className="w-full" asChild>
                  <a
                    href="https://docs.ipfs.tech/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" /> IPFS Documentation
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Filebase IPFS</CardTitle>
              <CardDescription>S3-compatible IPFS service</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-neutral-600">
                Filebase provides an S3-compatible API for IPFS, making it easy to store and retrieve files on IPFS.
              </p>
              <p className="text-sm text-neutral-600">
                With Filebase, you can easily upload and pin content to IPFS using the familiar S3 API.
              </p>
              <div className="pt-2">
                <Button variant="outline" className="w-full" asChild>
                  <a
                    href="https://docs.filebase.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" /> Filebase Documentation
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
