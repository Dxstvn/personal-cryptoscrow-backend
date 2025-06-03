import { create } from "zustand"
import { persist } from "zustand/middleware"

// Mock data types
export interface Transaction {
  id: string
  propertyAddress: string
  amount: string
  status:
    | "verification"
    | "awaiting_funds"
    | "in_escrow"
    | "pending_approval"
    | "completed"
    | "pending_buyer_review"
    | "pending_conditions"
    | "awaiting_seller_confirmation"
  counterparty: string
  date: string
  progress: number
  description?: string
  documents?: Document[]
  participants?: string[]
  escrowAddress?: string
  timeline?: TimelineEvent[]
  initiatedBy?: "buyer" | "seller"
  buyerConditions?: ContractRequirements
  sellerAccepted?: boolean
}

// Update the Document interface to include reviewStatus
export interface Document {
  id: string
  name: string
  cid: string
  encryptionKey: string
  uploadedBy: string
  uploadedAt: string
  size: string
  type: string
  status: "signed" | "pending"
  dealId: string
  fileKey?: string
  reviewStatus?: "pending" | "approved" | "declined"
  reviewedBy?: string
  reviewedAt?: string
}

export interface TimelineEvent {
  id: string
  date: string
  event: string
  status: "completed" | "in_progress" | "pending"
}

export interface Contact {
  id: string
  name: string
  email: string
  phone: string
  company: string
  type: "buyer" | "seller" | "agent"
  favorite: boolean
}

export interface Activity {
  id: number
  type: "payment_sent" | "payment_received" | "document_signed" | "message"
  title: string
  description: string
  time: string
  date: string
}

export interface Deadline {
  id: number
  title: string
  date: string
  time: string
  transaction: string
}

export interface CryptoAsset {
  id: string
  name: string
  symbol: string
  amount: number
  price: string
  value: number
  change: string
  trend: "up" | "down" | "neutral"
}

export interface ContractRequirements {
  requirement1: string
  requirement2: string
}

// Initial mock data
const initialTransactions: Transaction[] = [
  {
    id: "TX123456",
    propertyAddress: "123 Blockchain Ave, Crypto City",
    amount: "2.5 ETH",
    status: "verification",
    counterparty: "John Smith",
    date: "2023-04-15",
    progress: 40,
    description: "3 bedroom, 2 bathroom single-family home with modern amenities and a spacious backyard.",
    escrowAddress: "0x1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t",
    participants: ["user123", "user456"],
    initiatedBy: "buyer",
    timeline: [
      { id: "t1", date: "2023-04-15", event: "Transaction created", status: "completed" },
      { id: "t2", date: "2023-04-15", event: "KYC verification initiated", status: "completed" },
      { id: "t3", date: "2023-04-16", event: "Smart contract deployed", status: "completed" },
      { id: "t4", date: "2023-04-18", event: "Awaiting property inspection", status: "in_progress" },
      { id: "t5", date: "2023-04-25", event: "Title transfer", status: "pending" },
      { id: "t6", date: "2023-05-01", event: "Funds release", status: "pending" },
    ],
    buyerConditions: { requirement1: "Clean title", requirement2: "Passed inspection" },
    sellerAccepted: true,
  },
  {
    id: "TX789012",
    propertyAddress: "456 Smart Contract St, Token Town",
    amount: "150,000 USDC",
    status: "awaiting_funds",
    counterparty: "Sarah Johnson",
    date: "2023-04-10",
    progress: 20,
    description: "Commercial property with 5 office spaces and ground floor retail.",
    participants: ["user123", "user789"],
    initiatedBy: "buyer",
    buyerConditions: { requirement1: "Appraisal at value", requirement2: "No environmental issues" },
    sellerAccepted: false,
  },
  {
    id: "TX345678",
    propertyAddress: "789 Ledger Lane, Blockchain Heights",
    amount: "3.2 ETH",
    status: "completed",
    counterparty: "Michael Chen",
    date: "2023-03-28",
    progress: 100,
    participants: ["user123", "user321"],
    initiatedBy: "buyer",
    buyerConditions: { requirement1: "N/A", requirement2: "N/A" },
    sellerAccepted: true,
  },
  {
    id: "TX901234",
    propertyAddress: "321 Crypto Court, DeFi District",
    amount: "75,000 USDC",
    status: "completed",
    counterparty: "Emily Rodriguez",
    date: "2023-03-15",
    progress: 100,
    participants: ["user123", "user654"],
    initiatedBy: "buyer",
    buyerConditions: { requirement1: "N/A", requirement2: "N/A" },
    sellerAccepted: true,
  },
  // Add new seller-initiated transactions
  {
    id: "TX567890",
    propertyAddress: "555 Seller Ave, Blockchain City",
    amount: "4.5 ETH",
    status: "pending_buyer_review",
    counterparty: "Alex Johnson",
    date: "2023-04-20",
    progress: 15,
    description: "Luxury penthouse with panoramic city views and private rooftop terrace.",
    participants: ["user123", "user789"],
    initiatedBy: "seller",
    timeline: [
      { id: "t1", date: "2023-04-20", event: "Transaction created by seller", status: "completed" },
      { id: "t2", date: "2023-04-20", event: "Awaiting buyer review", status: "in_progress" },
    ],
    buyerConditions: { requirement1: "Buyer approval", requirement2: "Clear title" },
    sellerAccepted: false,
  },
  {
    id: "TX678901",
    propertyAddress: "777 Escrow Lane, Token Heights",
    amount: "3.8 ETH",
    status: "pending_conditions",
    counterparty: "Jamie Williams",
    date: "2023-04-18",
    progress: 30,
    description: "Modern townhouse with smart home features and energy-efficient design.",
    participants: ["user123", "user456"],
    initiatedBy: "seller",
    timeline: [
      { id: "t1", date: "2023-04-18", event: "Transaction created by seller", status: "completed" },
      { id: "t2", date: "2023-04-19", event: "Buyer reviewed transaction", status: "completed" },
      { id: "t3", date: "2023-04-19", event: "Buyer added conditions", status: "completed" },
      { id: "t4", date: "2023-04-19", event: "Awaiting seller confirmation", status: "in_progress" },
    ],
    buyerConditions: { requirement1: "Seller disclosure", requirement2: "Inspection report" },
    sellerAccepted: false,
  },
]

const initialDocuments: Document[] = [
  {
    id: "doc1",
    name: "Purchase Agreement.pdf",
    cid: "QmHash1",
    encryptionKey: "abc123",
    uploadedBy: "user123",
    uploadedAt: "2023-04-15T10:30:00Z",
    size: "2.4 MB",
    type: "PDF",
    status: "signed",
    dealId: "TX123456",
  },
  {
    id: "doc2",
    name: "Property Inspection.pdf",
    cid: "QmHash2",
    encryptionKey: "def456",
    uploadedBy: "user123",
    uploadedAt: "2023-04-10T14:45:00Z",
    size: "5.1 MB",
    type: "PDF",
    status: "pending",
    dealId: "TX123456",
  },
  {
    id: "doc3",
    name: "Title Transfer.pdf",
    cid: "QmHash3",
    encryptionKey: "ghi789",
    uploadedBy: "user123",
    uploadedAt: "2023-03-28T09:15:00Z",
    size: "1.8 MB",
    type: "PDF",
    status: "signed",
    dealId: "TX789012",
  },
]

const initialContacts: Contact[] = [
  {
    id: "C123456",
    name: "John Smith",
    email: "john.smith@example.com",
    phone: "+1 (555) 123-4567",
    company: "Blockchain Properties LLC",
    type: "buyer",
    favorite: true,
  },
  {
    id: "C789012",
    name: "Sarah Johnson",
    email: "sarah.johnson@example.com",
    phone: "+1 (555) 987-6543",
    company: "Crypto Realty Group",
    type: "seller",
    favorite: false,
  },
  {
    id: "C345678",
    name: "Michael Chen",
    email: "michael.chen@example.com",
    phone: "+1 (555) 456-7890",
    company: "Digital Asset Properties",
    type: "agent",
    favorite: true,
  },
  {
    id: "C901234",
    name: "Emily Rodriguez",
    email: "emily.rodriguez@example.com",
    phone: "+1 (555) 234-5678",
    company: "Smart Contract Homes",
    type: "buyer",
    favorite: false,
  },
]

const initialActivities: Activity[] = [
  {
    id: 1,
    type: "payment_sent",
    title: "Payment Sent",
    description: "You sent 2.5 ETH to John Smith",
    time: "2 hours ago",
    date: "2023-04-15",
  },
  {
    id: 2,
    type: "payment_received",
    title: "Payment Received",
    description: "You received 0.5 BTC from Sarah Johnson",
    time: "Yesterday",
    date: "2023-04-14",
  },
  {
    id: 3,
    type: "document_signed",
    title: "Document Signed",
    description: "Purchase agreement signed by all parties",
    time: "2 days ago",
    date: "2023-04-13",
  },
  {
    id: 4,
    type: "message",
    title: "New Message",
    description: "Michael Chen sent you a message",
    time: "3 days ago",
    date: "2023-04-12",
  },
]

const initialDeadlines: Deadline[] = [
  {
    id: 1,
    title: "Escrow Funding Deadline",
    date: "April 20, 2023",
    time: "11:59 PM EST",
    transaction: "TX123456",
  },
  {
    id: 2,
    title: "Document Submission",
    date: "April 25, 2023",
    time: "5:00 PM EST",
    transaction: "TX789012",
  },
  {
    id: 3,
    title: "Final Inspection",
    date: "May 2, 2023",
    time: "10:00 AM EST",
    transaction: "TX123456",
  },
]

const initialAssets: CryptoAsset[] = [
  {
    id: "btc",
    name: "Bitcoin",
    symbol: "BTC",
    amount: 1.25,
    price: "$42,850.23",
    value: 53562.79,
    change: "+2.4%",
    trend: "up",
  },
  {
    id: "eth",
    name: "Ethereum",
    symbol: "ETH",
    amount: 32.5,
    price: "$3,125.67",
    value: 101584.28,
    change: "+1.8%",
    trend: "up",
  },
  {
    id: "usdc",
    name: "USD Coin",
    symbol: "USDC",
    amount: 75000,
    price: "$1.00",
    value: 75000,
    change: "0.0%",
    trend: "neutral",
  },
  {
    id: "sol",
    name: "Solana",
    symbol: "SOL",
    amount: 250,
    price: "$102.45",
    value: 25612.5,
    change: "-1.2%",
    trend: "down",
  },
]

// Database store
interface DatabaseState {
  transactions: Transaction[]
  documents: Document[]
  contacts: Contact[]
  activities: Activity[]
  deadlines: Deadline[]
  assets: CryptoAsset[]

  // Transaction methods
  getTransactions: () => Transaction[]
  getTransactionById: (id: string) => Transaction | undefined
  addTransaction: (transaction: Omit<Transaction, "id">) => Transaction
  updateTransaction: (id: string, updates: Partial<Transaction>) => Transaction | undefined
  deleteTransaction: (id: string) => void

  // Document methods
  getDocuments: () => Document[]
  getDocumentsByDealId: (dealId: string) => Document[]
  addDocument: (document: Omit<Document, "id">) => Document
  updateDocument: (id: string, updates: Partial<Document>) => Document | undefined
  deleteDocument: (id: string) => void

  // Contact methods
  getContacts: () => Contact[]
  getContactById: (id: string) => Contact | undefined
  addContact: (contact: Omit<Contact, "id">) => Contact
  updateContact: (id: string, updates: Partial<Contact>) => Contact | undefined
  deleteContact: (id: string) => void

  // Activity methods
  getActivities: () => Activity[]
  addActivity: (activity: Omit<Activity, "id">) => Activity

  // Deadline methods
  getDeadlines: () => Deadline[]
  addDeadline: (deadline: Omit<Deadline, "id">) => Deadline

  // Asset methods
  getAssets: () => CryptoAsset[]
  updateAsset: (id: string, updates: Partial<CryptoAsset>) => CryptoAsset | undefined

  // Add methods for approving and declining documents
  approveDocument: (id: string, reviewerId: string) => Document | undefined
  declineDocument: (id: string, reviewerId: string) => Document | undefined
}

// Update the useDatabaseStore to handle different user types
export const useDatabaseStore = create<DatabaseState>()(
  persist(
    (set, get) => ({
      transactions: initialTransactions,
      documents: initialDocuments,
      contacts: initialContacts,
      activities: initialActivities,
      deadlines: initialDeadlines,
      assets: initialAssets,

      // Transaction methods
      getTransactions: () => {
        // This is a workaround since we can't directly use hooks in zustand
        // We'll check if we're in a browser environment and try to get the current user
        let isDemoAccount = false
        try {
          if (typeof window !== "undefined") {
            // Try to get the current user email from localStorage
            const userEmail = localStorage.getItem("current-user-email")
            isDemoAccount = userEmail === "jasmindustin@gmail.com"
          }
        } catch (e) {
          console.error("Error checking user type:", e)
        }

        // Return demo data for demo account, empty array for others
        return isDemoAccount ? get().transactions : []
      },

      getTransactionById: (id) => get().transactions.find((t) => t.id === id),

      addTransaction: (transaction) => {
        const newTransaction = {
          ...transaction,
          id: `TX${Math.floor(Math.random() * 1000000)
            .toString()
            .padStart(6, "0")}`,
        }
        set((state) => ({ transactions: [...state.transactions, newTransaction] }))
        return newTransaction
      },
      updateTransaction: (id, updates) => {
        let updatedTransaction: Transaction | undefined

        set((state) => {
          const transactions = state.transactions.map((t) => {
            if (t.id === id) {
              updatedTransaction = { ...t, ...updates }
              return updatedTransaction
            }
            return t
          })

          return { transactions }
        })

        return updatedTransaction
      },
      deleteTransaction: (id) => {
        set((state) => ({
          transactions: state.transactions.filter((t) => t.id !== id),
        }))
      },

      // Document methods
      getDocuments: () => {
        // Similar approach for documents
        let isDemoAccount = false
        try {
          if (typeof window !== "undefined") {
            const userEmail = localStorage.getItem("current-user-email")
            isDemoAccount = userEmail === "jasmindustin@gmail.com"
          }
        } catch (e) {
          console.error("Error checking user type:", e)
        }

        return isDemoAccount ? get().documents : []
      },

      getDocumentsByDealId: (dealId) => get().documents.filter((d) => d.dealId === dealId),
      addDocument: (document) => {
        const newDocument = {
          ...document,
          id: `doc${Math.floor(Math.random() * 1000000)
            .toString()
            .padStart(6, "0")}`,
        }
        set((state) => ({ documents: [...state.documents, newDocument] }))
        return newDocument
      },
      updateDocument: (id, updates) => {
        let updatedDocument: Document | undefined

        set((state) => {
          const documents = state.documents.map((d) => {
            if (d.id === id) {
              updatedDocument = { ...d, ...updates }
              return updatedDocument
            }
            return d
          })

          return { documents }
        })

        return updatedDocument
      },
      deleteDocument: (id) => {
        set((state) => ({
          documents: state.documents.filter((d) => d.id !== id),
        }))
      },

      // Contact methods
      getContacts: () => {
        // Similar approach for contacts
        let isDemoAccount = false
        try {
          if (typeof window !== "undefined") {
            const userEmail = localStorage.getItem("current-user-email")
            isDemoAccount = userEmail === "jasmindustin@gmail.com"
          }
        } catch (e) {
          console.error("Error checking user type:", e)
        }

        return isDemoAccount ? get().contacts : []
      },
      getContactById: (id) => get().contacts.find((c) => c.id === id),
      addContact: (contact) => {
        const newContact = {
          ...contact,
          id: `C${Math.floor(Math.random() * 1000000)
            .toString()
            .padStart(6, "0")}`,
        }
        set((state) => ({ contacts: [...state.contacts, newContact] }))
        return newContact
      },
      updateContact: (id, updates) => {
        let updatedContact: Contact | undefined

        set((state) => {
          const contacts = state.contacts.map((c) => {
            if (c.id === id) {
              updatedContact = { ...c, ...updates }
              return updatedContact
            }
            return c
          })

          return { contacts }
        })

        return updatedContact
      },
      deleteContact: (id) => {
        set((state) => ({
          contacts: state.contacts.filter((c) => c.id !== id),
        }))
      },

      // Activity methods
      getActivities: () => {
        // Similar approach for activities
        let isDemoAccount = false
        try {
          if (typeof window !== "undefined") {
            const userEmail = localStorage.getItem("current-user-email")
            isDemoAccount = userEmail === "jasmindustin@gmail.com"
          }
        } catch (e) {
          console.error("Error checking user type:", e)
        }

        return isDemoAccount ? get().activities : []
      },
      addActivity: (activity) => {
        const newActivity = {
          ...activity,
          id: get().activities.length + 1,
        }
        set((state) => ({ activities: [newActivity, ...state.activities] }))
        return newActivity
      },

      // Deadline methods
      getDeadlines: () => {
        // Similar approach for deadlines
        let isDemoAccount = false
        try {
          if (typeof window !== "undefined") {
            const userEmail = localStorage.getItem("current-user-email")
            isDemoAccount = userEmail === "jasmindustin@gmail.com"
          }
        } catch (e) {
          console.error("Error checking user type:", e)
        }

        return isDemoAccount ? get().deadlines : []
      },
      addDeadline: (deadline) => {
        const newDeadline = {
          ...deadline,
          id: get().deadlines.length + 1,
        }
        set((state) => ({ deadlines: [...state.deadlines, newDeadline] }))
        return newDeadline
      },

      // Asset methods
      getAssets: () => {
        // Similar approach for assets
        let isDemoAccount = false
        try {
          if (typeof window !== "undefined") {
            const userEmail = localStorage.getItem("current-user-email")
            isDemoAccount = userEmail === "jasmindustin@gmail.com"
          }
        } catch (e) {
          console.error("Error checking user type:", e)
        }

        return isDemoAccount ? get().assets : []
      },
      updateAsset: (id, updates) => {
        let updatedAsset: CryptoAsset | undefined

        set((state) => {
          const assets = state.assets.map((a) => {
            if (a.id === id) {
              updatedAsset = { ...a, ...updates }
              return updatedAsset
            }
            return a
          })

          return { assets }
        })

        return updatedAsset
      },

      // Add methods for approving and declining documents
      approveDocument: (id: string, reviewerId: string) => {
        let updatedDocument: Document | undefined

        set((state) => {
          const documents = state.documents.map((d) => {
            if (d.id === id) {
              updatedDocument = {
                ...d,
                status: "signed" as const,
                reviewStatus: "approved" as const,
                reviewedBy: reviewerId,
                reviewedAt: new Date().toISOString(),
              }
              return updatedDocument
            }
            return d
          })

          return { documents }
        })

        return updatedDocument
      },

      declineDocument: (id: string, reviewerId: string) => {
        let updatedDocument: Document | undefined

        set((state) => {
          const documents = state.documents.map((d) => {
            if (d.id === id) {
              updatedDocument = {
                ...d,
                reviewStatus: "declined" as const,
                reviewedBy: reviewerId,
                reviewedAt: new Date().toISOString(),
              }
              return updatedDocument
            }
            return d
          })

          return { documents }
        })

        return updatedDocument
      },
    }),
    {
      name: "crypto-escrow-db",
    },
  ),
)
