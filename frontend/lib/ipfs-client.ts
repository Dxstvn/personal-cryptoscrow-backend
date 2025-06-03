"\"use client"

// Client-side IPFS functions using Filebase
// These functions call our API routes which now use Filebase

// Track connection state to avoid repeated failed requests
const ipfsConnectionState = {
  available: null as boolean | null,
  lastChecked: 0,
  checkInterval: 30000, // 30 seconds
}

/**
 * Validates connection to IPFS using Filebase via the server-side proxy
 * @param file The file to validate with
 * @returns Promise<{path: string; fileKey: string}> The IPFS CID and Filebase file key
 */
export async function uploadToIPFS(file: File): Promise<{ path: string; fileKey: string }> {
  try {
    // Check if IPFS is available before attempting upload
    const isAvailable = await isIPFSNodeAvailable()
    if (!isAvailable) {
      throw new Error("IPFS service is not available. Please try again later.")
    }

    // Create form data
    const formData = new FormData()
    formData.append("file", file)

    // Upload via server-side proxy
    const response = await fetch("/api/ipfs/upload", {
      method: "POST",
      body: formData,
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || "Upload failed")
    }

    const result = await response.json()
    console.log("Connection validated successfully:", result.message)
    return { path: result.path, fileKey: result.fileKey }
  } catch (error) {
    console.error("Error validating IPFS connection:", error)
    throw new Error(`IPFS validation failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Checks if the Filebase IPFS service is available via server-side proxy
 * Uses caching to avoid too many requests
 * @returns Promise<boolean> True if the service is available
 */
export async function isIPFSNodeAvailable(): Promise<boolean> {
  try {
    const now = Date.now()

    // Return cached result if it's recent enough
    if (
      ipfsConnectionState.available !== null &&
      now - ipfsConnectionState.lastChecked < ipfsConnectionState.checkInterval
    ) {
      return ipfsConnectionState.available
    }

    // Make the actual check
    const response = await fetch("/api/ipfs/status", {
      // Add cache busting to prevent browser caching
      headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
      cache: "no-store",
    })

    if (!response.ok) {
      ipfsConnectionState.available = false
      ipfsConnectionState.lastChecked = now
      return false
    }

    const data = await response.json()
    ipfsConnectionState.available = data.available
    ipfsConnectionState.lastChecked = now
    return data.available
  } catch (error) {
    console.error("IPFS service status check error:", error)
    ipfsConnectionState.available = false
    ipfsConnectionState.lastChecked = Date.now()
    return false
  }
}

/**
 * Debug IPFS connection issues
 * @returns Detailed error information
 */
export async function debugIPFSConnection(): Promise<string> {
  try {
    const response = await fetch("/api/ipfs/status", {
      // Add cache busting to prevent browser caching
      headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
      cache: "no-store",
    })

    if (!response.ok) {
      return `HTTP error: ${response.status} ${response.statusText}`
    }

    const data = await response.json()

    if (data.available) {
      return `Successfully connected to Filebase IPFS service`
    } else {
      return `Failed to connect to Filebase IPFS service: ${data.error}`
    }
  } catch (error) {
    return `Connection error: ${error instanceof Error ? error.message : String(error)}`
  }
}

/**
 * Retry a function with exponential backoff
 * @param fn The function to retry
 * @param maxRetries Maximum number of retries
 * @param baseDelay Base delay in ms
 * @returns Result of the function
 */
export async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 3, baseDelay = 1000): Promise<T> {
  let lastError: any

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      console.warn(`Attempt ${attempt + 1}/${maxRetries} failed:`, error)
      lastError = error

      // Exponential backoff
      const delay = baseDelay * Math.pow(2, attempt)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

export async function downloadFromIPFS(cid: string): Promise<Blob> {
  try {
    const response = await fetch("/api/ipfs/download", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cid }),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    // Assuming the API returns the file data as a Blob or similar
    // You might need to adjust this part based on your actual API response
    return new Blob([JSON.stringify(data)], { type: "application/json" })
  } catch (error) {
    console.error("Error downloading from IPFS:", error)
    throw error
  }
}
