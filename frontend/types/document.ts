import type { Timestamp } from "firebase/firestore"

export interface Document {
  id?: string
  name: string
  cid: string
  fileKey: string // Added fileKey for Filebase
  encryptionKey: string
  uploadedBy: string
  uploadedAt: Timestamp
  size?: string
  type?: string
  status: "signed" | "pending"
  dealId: string
}

export interface Deal {
  id: string
  propertyAddress: string
  participants: string[]
  documents?: Document[]
  createdAt: Timestamp
  status: "active" | "completed" | "cancelled"
}
