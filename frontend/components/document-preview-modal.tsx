"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Download, X } from "lucide-react"

interface Document {
  id: string
  name: string
  url: string
  type: string
  size: number
  uploadDate: string
}

interface DocumentPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  document: Document
}

export default function DocumentPreviewModal({ isOpen, onClose, document }: DocumentPreviewModalProps) {
  const [previewUrl, setPreviewUrl] = useState<string>("")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !document) return

    const loadDocument = async () => {
      setIsLoading(true)
      setError(null)

      try {
        // For direct preview, just use the URL
        setPreviewUrl(document.url)
      } catch (err) {
        console.error("Error loading document preview:", err)
        setError("Failed to load document preview")
      } finally {
        setIsLoading(false)
      }
    }

    loadDocument()
  }, [isOpen, document])

  const handleDownload = () => {
    window.open(document.url, "_blank")
  }

  const renderPreview = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center items-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      )
    }

    if (error) {
      return (
        <div className="flex flex-col justify-center items-center h-96">
          <p className="text-red-500 mb-4">{error}</p>
          <Button onClick={handleDownload}>Download Instead</Button>
        </div>
      )
    }

    if (document.type.startsWith("image/")) {
      return (
        <div className="flex justify-center items-center">
          <img
            src={previewUrl || "/placeholder.svg"}
            alt={document.name}
            className="max-w-full max-h-[70vh] object-contain"
            onError={() => setError("Failed to load image")}
          />
        </div>
      )
    } else if (document.type === "application/pdf") {
      return (
        <iframe
          src={`${previewUrl}#toolbar=0`}
          className="w-full h-[70vh]"
          title={document.name}
          onError={() => setError("Failed to load PDF")}
        />
      )
    } else {
      return (
        <div className="flex flex-col justify-center items-center h-96">
          <p className="mb-4">Preview not available for this file type</p>
          <Button onClick={handleDownload}>Download File</Button>
        </div>
      )
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-[90vw]">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="truncate max-w-[80%]">{document?.name}</DialogTitle>
          <div className="flex space-x-2">
            <Button variant="outline" size="icon" onClick={handleDownload} title="Download">
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={onClose} title="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        <div className="mt-4">{renderPreview()}</div>
      </DialogContent>
    </Dialog>
  )
}
