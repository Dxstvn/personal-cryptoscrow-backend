import { Timestamp } from "firebase/firestore"

// Mock deals data
export const mockDeals = [
  {
    id: "TX123456",
    propertyAddress: "123 Blockchain Ave, Crypto City",
    participants: ["user123"],
    documents: [
      {
        name: "Purchase Agreement.pdf",
        cid: "QmHash1",
        encryptionKey: "abc123",
        uploadedBy: "user123",
        uploadedAt: Timestamp.fromDate(new Date(2023, 3, 15)),
        size: "2.4 MB",
        type: "PDF",
        status: "signed",
        dealId: "TX123456",
      },
      {
        name: "Property Inspection.pdf",
        cid: "QmHash2",
        encryptionKey: "def456",
        uploadedBy: "user123",
        uploadedAt: Timestamp.fromDate(new Date(2023, 3, 10)),
        size: "5.1 MB",
        type: "PDF",
        status: "pending",
        dealId: "TX123456",
      },
    ],
  },
  {
    id: "TX789012",
    propertyAddress: "456 Smart Contract St, Token Town",
    participants: ["user123"],
    documents: [
      {
        name: "Title Transfer.pdf",
        cid: "QmHash3",
        encryptionKey: "ghi789",
        uploadedBy: "user123",
        uploadedAt: Timestamp.fromDate(new Date(2023, 2, 28)),
        size: "1.8 MB",
        type: "PDF",
        status: "signed",
        dealId: "TX789012",
      },
    ],
  },
]

// Function to get mock deals
export function getMockDeals() {
  return mockDeals
}

// Function to get mock documents
export function getMockDocuments() {
  return mockDeals.flatMap((deal) =>
    deal.documents.map((doc) => ({
      ...doc,
      dealId: deal.id,
    })),
  )
}
