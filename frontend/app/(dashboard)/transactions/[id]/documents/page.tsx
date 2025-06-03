"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AlertCircle, FileText, CheckCircle, Clock, Download, Eye, Trash2 } from "lucide-react"
import FileUpload from "@/components/file-upload"
import { useAuth } from "@/context/auth-context"
import { useToast } from "@/components/ui/use-toast"

// Document type interface based on Firestore structure
interface DocumentFile {
  id: string
  filename: string
  url: string
  contentType: string
  size: number
  uploadedAt: string
  uploadedBy: string
  documentType: string
  status: string
}

export default function TransactionDocumentsPage() {
  const { id: dealId } = useParams()
  const { user } = useAuth()
  const { toast } = useToast()
  const [documents, setDocuments] = useState<DocumentFile[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("all")

  // Mock function to fetch documents
  const fetchDocuments = async () => {
    setLoading(true)
    try {
      // This would be replaced with your actual API call
      // For now, we'll use mock data
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Mock data
      const mockDocuments: DocumentFile[] = [
        {
          id: "doc1",
          filename: "Purchase Agreement.pdf",
          url: "https://example.com/files/purchase-agreement.pdf",
          contentType: "application/pdf",
          size: 2500000,
          uploadedAt: new Date().toISOString(),
          uploadedBy: user?.uid || "unknown",
          documentType: "CONTRACT",
          status: "APPROVED",
        },
        {
          id: "doc2",
          filename: "Property Inspection.pdf",
          url: "https://example.com/files/inspection.pdf",
          contentType: "application/pdf",
          size: 5100000,
          uploadedAt: new Date().toISOString(),
          uploadedBy: user?.uid || "unknown",
          documentType: "INSPECTION",
          status: "PENDING",
        },
      ]

      setDocuments(mockDocuments)
    } catch (error) {
      console.error("Error fetching documents:", error)
      toast({
        title: "Error",
        description: "Failed to load documents. Please try again later.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  // Handle document upload completion
  const handleUploadComplete = (fileData: any) => {
    // In a real implementation, this would come from the API response
    const newDocument: DocumentFile = {
      id: `doc${Date.now()}`,
      ...fileData,
    }

    setDocuments((prev) => [newDocument, ...prev])

    toast({
      title: "Document Uploaded",
      description: `${fileData.filename} has been uploaded successfully and is pending review.`,
    })
  }

  // Handle document deletion
  const handleDeleteDocument = async (docId: string) => {
    try {
      // This would be replaced with your actual API call
      // For now, we'll just update the state
      await new Promise((resolve) => setTimeout(resolve, 500))

      setDocuments((prev) => prev.filter((doc) => doc.id !== docId))

      toast({
        title: "Document Deleted",
        description: "The document has been deleted successfully.",
      })
    } catch (error) {
      console.error("Error deleting document:", error)
      toast({
        title: "Error",
        description: "Failed to delete document. Please try again later.",
        variant: "destructive",
      })
    }
  }

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B"
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
    return (bytes / (1024 * 1024)).toFixed(1) + " MB"
  }

  // Get status badge color
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "APPROVED":
        return (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-200">
            <CheckCircle className="h-3 w-3 mr-1" /> Approved
          </Badge>
        )
      case "REJECTED":
        return (
          <Badge className="bg-red-100 text-red-800 hover:bg-red-200">
            <AlertCircle className="h-3 w-3 mr-1" /> Rejected
          </Badge>
        )
      case "PENDING":
      default:
        return (
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200">
            <Clock className="h-3 w-3 mr-1" /> Pending
          </Badge>
        )
    }
  }

  // Filter documents based on active tab
  const filteredDocuments = documents.filter((doc) => {
    if (activeTab === "all") return true
    return doc.status === activeTab.toUpperCase()
  })

  // Fetch documents on component mount
  useEffect(() => {
    fetchDocuments()
  }, [])

  return (
    <div className="container px-4 md:px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Transaction Documents</h1>
        <p className="text-muted-foreground">Upload and manage documents for transaction {dealId}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Upload Document</CardTitle>
              <CardDescription>Add required documents for this transaction</CardDescription>
            </CardHeader>
            <CardContent>
              <FileUpload onUploadComplete={handleUploadComplete} dealId={dealId as string} userId={user?.uid} />
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Transaction Documents</CardTitle>
              <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="pending">Pending</TabsTrigger>
                  <TabsTrigger value="approved">Approved</TabsTrigger>
                  <TabsTrigger value="rejected">Rejected</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center items-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-700"></div>
                </div>
              ) : filteredDocuments.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No documents</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {activeTab === "all" ? "No documents have been uploaded yet." : `No ${activeTab} documents found.`}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex items-center">
                        <div className="bg-teal-100 p-2 rounded">
                          <FileText className="h-6 w-6 text-teal-700" />
                        </div>
                        <div className="ml-4">
                          <p className="font-medium">{doc.filename}</p>
                          <div className="flex items-center text-sm text-gray-500 space-x-4">
                            <span>{formatFileSize(doc.size)}</span>
                            <span>{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                            <span>{doc.documentType.replace("_", " ")}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {getStatusBadge(doc.status)}
                        <div className="flex space-x-1">
                          <Button variant="ghost" size="icon" title="View">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Download">
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Delete"
                            onClick={() => handleDeleteDocument(doc.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
