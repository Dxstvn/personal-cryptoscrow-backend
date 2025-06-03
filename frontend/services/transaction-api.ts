// API base URL for the deployed backend
const API_URL = "http://44.202.141.56:3000"

/**
 * Creates a new transaction/escrow deal
 */
export async function createTransaction(data: any, token: string) {
  const response = await fetch(`${API_URL}/deals/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || "Failed to create transaction")
  }

  return response.json()
}

/**
 * Gets all transactions for the current user
 */
export async function getTransactions(token: string) {
  const response = await fetch(`${API_URL}/deals`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || "Failed to fetch transactions")
  }

  return response.json()
}

/**
 * Gets a specific transaction by ID
 */
export async function getTransaction(id: string, token: string) {
  const response = await fetch(`${API_URL}/deals/${id}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || "Failed to fetch transaction")
  }

  return response.json()
}

/**
 * Updates a condition status for a transaction
 */
export async function updateConditionStatus(
  transactionId: string,
  conditionId: string,
  newStatus: string,
  comment: string,
  token: string,
) {
  const response = await fetch(`${API_URL}/deals/${transactionId}/conditions/${conditionId}/buyer-review`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      newBackendStatus: newStatus,
      reviewComment: comment,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || "Failed to update condition status")
  }

  return response.json()
}

/**
 * Syncs transaction status with the blockchain
 */
export async function syncTransactionStatus(
  transactionId: string,
  newStatus: string,
  eventMessage: string,
  token: string,
  finalApprovalDeadline?: string,
  disputeResolutionDeadline?: string,
) {
  const body: any = {
    newSCStatus: newStatus,
    eventMessage,
  }

  if (finalApprovalDeadline) {
    body.finalApprovalDeadlineISO = finalApprovalDeadline
  }

  if (disputeResolutionDeadline) {
    body.disputeResolutionDeadlineISO = disputeResolutionDeadline
  }

  const response = await fetch(`${API_URL}/deals/${transactionId}/sync-status`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || "Failed to sync transaction status")
  }

  return response.json()
}

/**
 * Starts the final approval period for a transaction
 */
export async function startFinalApproval(transactionId: string, finalApprovalDeadline: string, token: string) {
  const response = await fetch(`${API_URL}/deals/${transactionId}/sc/start-final-approval`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      finalApprovalDeadlineISO: finalApprovalDeadline,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || "Failed to start final approval period")
  }

  return response.json()
}

/**
 * Raises a dispute for a transaction
 */
export async function raiseDispute(
  transactionId: string,
  disputeResolutionDeadline: string,
  token: string,
  conditionId?: string,
) {
  const body: any = {
    disputeResolutionDeadlineISO: disputeResolutionDeadline,
  }

  if (conditionId) {
    body.conditionId = conditionId
  }

  const response = await fetch(`${API_URL}/deals/${transactionId}/sc/raise-dispute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || "Failed to raise dispute")
  }

  return response.json()
}
