"use client"

import { FileText, Lock, Database, Upload, Download, Shield, CheckCircle } from "lucide-react"

export default function DocumentsStep() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="w-20 h-20 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 mx-auto mb-6">
          <FileText className="h-10 w-10" />
        </div>
        <h2 className="text-3xl font-bold text-teal-900 mb-4 font-display">Manage Documents</h2>
        <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
          Securely store and share all your real estate transaction documents. All files are encrypted and stored on
          IPFS for maximum security and decentralization.
        </p>
      </div>

      {/* Document features */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg p-6 border border-neutral-200 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 mb-4">
            <Lock className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold text-teal-900 mb-2">End-to-End Encryption</h3>
          <p className="text-neutral-600 mb-4">
            All documents are encrypted before being stored, ensuring only authorized parties can access them.
          </p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start">
              <CheckCircle className="h-4 w-4 text-teal-600 mt-0.5 mr-2 flex-shrink-0" />
              <span>AES-256 encryption standard</span>
            </li>
            <li className="flex items-start">
              <CheckCircle className="h-4 w-4 text-teal-600 mt-0.5 mr-2 flex-shrink-0" />
              <span>Encryption keys never leave your device</span>
            </li>
            <li className="flex items-start">
              <CheckCircle className="h-4 w-4 text-teal-600 mt-0.5 mr-2 flex-shrink-0" />
              <span>Secure key management</span>
            </li>
          </ul>
        </div>

        <div className="bg-white rounded-lg p-6 border border-neutral-200 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 mb-4">
            <Database className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold text-teal-900 mb-2">IPFS Storage</h3>
          <p className="text-neutral-600 mb-4">
            Documents are stored on the InterPlanetary File System (IPFS), a decentralized storage network.
          </p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start">
              <CheckCircle className="h-4 w-4 text-teal-600 mt-0.5 mr-2 flex-shrink-0" />
              <span>Decentralized and redundant storage</span>
            </li>
            <li className="flex items-start">
              <CheckCircle className="h-4 w-4 text-teal-600 mt-0.5 mr-2 flex-shrink-0" />
              <span>Content-addressed for data integrity</span>
            </li>
            <li className="flex items-start">
              <CheckCircle className="h-4 w-4 text-teal-600 mt-0.5 mr-2 flex-shrink-0" />
              <span>Immutable document history</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Document workflow */}
      <div className="bg-teal-50 rounded-lg p-6 border border-teal-100">
        <h3 className="text-lg font-semibold text-teal-900 mb-4">Document Workflow</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-teal-700 mb-3 shadow-sm">
              <Upload className="h-6 w-6" />
            </div>
            <h4 className="font-medium text-teal-900 mb-1">Upload</h4>
            <p className="text-sm text-neutral-600">
              Securely upload and encrypt your documents directly from your browser
            </p>
          </div>

          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-teal-700 mb-3 shadow-sm">
              <Shield className="h-6 w-6" />
            </div>
            <h4 className="font-medium text-teal-900 mb-1">Verify</h4>
            <p className="text-sm text-neutral-600">
              Documents are verified and linked to your transaction's smart contract
            </p>
          </div>

          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-teal-700 mb-3 shadow-sm">
              <Download className="h-6 w-6" />
            </div>
            <h4 className="font-medium text-teal-900 mb-1">Access</h4>
            <p className="text-sm text-neutral-600">Authorized parties can securely access and download documents</p>
          </div>
        </div>
      </div>
    </div>
  )
}
