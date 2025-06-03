/**
 * Generate a new encryption key for file encryption
 * @returns Promise<CryptoKey> A new AES-GCM key
 */
export async function generateKey(): Promise<CryptoKey> {
  // Generate a new AES-GCM key
  return window.crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true, // extractable
    ["encrypt", "decrypt"],
  )
}

/**
 * Encrypt a file using AES-GCM
 * @param file The file to encrypt
 * @returns Promise<{encryptedBlob: Blob, encryptionKey: string}> The encrypted file and the key
 */
export async function encryptFile(file: File): Promise<{ encryptedBlob: Blob; encryptionKey: string }> {
  try {
    // Generate a new key
    const key = await generateKey()

    // Generate a random IV (Initialization Vector)
    const iv = window.crypto.getRandomValues(new Uint8Array(12))

    // Convert file to ArrayBuffer
    const fileBuffer = await file.arrayBuffer()

    // Encrypt the file
    const encryptedBuffer = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      key,
      fileBuffer,
    )

    // Combine IV and encrypted data
    const combinedBuffer = new Uint8Array(iv.length + new Uint8Array(encryptedBuffer).length)
    combinedBuffer.set(iv, 0)
    combinedBuffer.set(new Uint8Array(encryptedBuffer), iv.length)

    // Export the key to a string format
    const exportedKey = await exportKey(key)

    return {
      encryptedBlob: new Blob([combinedBuffer]),
      encryptionKey: exportedKey,
    }
  } catch (error) {
    console.error("Encryption error:", error)
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Decrypt a file using AES-GCM
 * @param encryptedBlob The encrypted file
 * @param encryptionKey The encryption key as a string
 * @returns Promise<Blob> The decrypted file
 */
export async function decryptFile(encryptedBlob: Blob, encryptionKey: string): Promise<Blob> {
  try {
    // Import the key from string format
    const key = await importKey(encryptionKey)

    // Convert blob to ArrayBuffer
    const encryptedBuffer = await encryptedBlob.arrayBuffer()
    const encryptedArray = new Uint8Array(encryptedBuffer)

    // Extract IV (first 12 bytes)
    const iv = encryptedArray.slice(0, 12)

    // Extract encrypted data (remaining bytes)
    const encryptedData = encryptedArray.slice(12)

    // Decrypt the data
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      key,
      encryptedData,
    )

    return new Blob([decryptedBuffer])
  } catch (error) {
    console.error("Decryption error:", error)
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Export a CryptoKey to a string format
 * @param key The CryptoKey to export
 * @returns Promise<string> The key as a hex string
 */
export async function exportKey(key: CryptoKey): Promise<string> {
  // Export the key to raw format
  const exportedKey = await window.crypto.subtle.exportKey("raw", key)

  // Convert to hex string
  return Array.from(new Uint8Array(exportedKey))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/**
 * Import a key from a string format
 * @param hexKey The key as a hex string
 * @returns Promise<CryptoKey> The imported CryptoKey
 */
export async function importKey(hexKey: string): Promise<CryptoKey> {
  // Convert hex string to byte array
  const keyBytes = new Uint8Array(hexKey.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) || [])

  // Import the key
  return window.crypto.subtle.importKey(
    "raw",
    keyBytes,
    {
      name: "AES-GCM",
      length: 256,
    },
    false, // not extractable
    ["encrypt", "decrypt"],
  )
}

/**
 * Mock implementation for environments where Web Crypto API is not available
 * This is a fallback for testing or development
 */
export function createMockCryptoUtils() {
  return {
    async generateKey() {
      console.warn("Using mock crypto implementation")
      return "mock-key" as unknown as CryptoKey
    },

    async encryptFile(file: File) {
      console.warn("Using mock encryption")
      return {
        encryptedBlob: file,
        encryptionKey: "mock-encryption-key",
      }
    },

    async decryptFile(encryptedBlob: Blob) {
      console.warn("Using mock decryption")
      return encryptedBlob
    },
  }
}
