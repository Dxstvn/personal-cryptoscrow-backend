import { getIdToken } from "@/lib/firebase-client"

// Backend API URL
const API_URL = "http://localhost:3000/contact"

/**
 * Send a contact invitation to another user
 */
export async function sendContactInvitation(contactEmail: string) {
  const token = await getIdToken()

  const response = await fetch(`${API_URL}/invite`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ contactEmail }),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || "Failed to send invitation")
  }

  return data
}

/**
 * Get pending contact invitations for the current user
 */
export async function getPendingInvitations() {
  const token = await getIdToken()

  const response = await fetch(`${API_URL}/pending`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || "Failed to get pending invitations")
  }

  return data.invitations
}

/**
 * Respond to a contact invitation (accept or deny)
 */
export async function respondToInvitation(invitationId: string, action: "accept" | "deny") {
  const token = await getIdToken()

  const response = await fetch(`${API_URL}/response`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ invitationId, action }),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || "Failed to respond to invitation")
  }

  return data
}

/**
 * Get the user's contacts
 */
export async function getUserContacts() {
  const token = await getIdToken()

  const response = await fetch(`${API_URL}/contacts`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || "Failed to get contacts")
  }

  return data.contacts
}
