// Mock IPFS service

/**
 * Uploads a file to IPFS (mocked)
 * @param file The file to upload
 * @returns Promise<{path: string}> A mock IPFS CID
 */
export async function uploadToIPFS(file: File): Promise<{ path: string }> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 1500))

  // Generate a random CID-like string
  const mockCid = `Qm${Array.from(
    { length: 44 },
    () => "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"[Math.floor(Math.random() * 58)],
  ).join("")}`

  console.log(`Mock IPFS upload: ${file.name} -> ${mockCid}`)

  return { path: mockCid }
}

/**
 * Downloads a file from IPFS (mocked)
 * @param cid The IPFS CID of the file
 * @returns Promise<Blob> A mock file blob
 */
export async function downloadFromIPFS(cid: string): Promise<Blob> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 1000))

  console.log(`Mock IPFS download: ${cid}`)

  // Create a mock file content based on the CID
  const mockContent =
    `This is a mock file content for CID: ${cid}\n\n` +
    `Generated at: ${new Date().toISOString()}\n\n` +
    `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam auctor, nisl eget ultricies aliquam, ` +
    `nunc nisl aliquet nunc, eget aliquam nisl nunc eget nisl. Nullam auctor, nisl eget ultricies aliquam, ` +
    `nunc nisl aliquet nunc, eget aliquam nisl nunc eget nisl.`

  return new Blob([mockContent], { type: "text/plain" })
}

/**
 * Encrypts a file (mocked)
 * @param file The file to encrypt
 * @returns Promise<{encryptedBlob: Blob, encryptionKey: string}> Mock encrypted blob and key
 */
export async function encryptFile(file: File): Promise<{ encryptedBlob: Blob; encryptionKey: string }> {
  // Simulate encryption delay
  await new Promise((resolve) => setTimeout(resolve, 800))

  // Generate a mock encryption key
  const encryptionKey = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0"),
  ).join("")

  console.log(`Mock encryption: ${file.name} with key ${encryptionKey.substring(0, 8)}...`)

  // Return the original file as the "encrypted" blob
  return {
    encryptedBlob: new Blob([await file.arrayBuffer()], { type: file.type }),
    encryptionKey,
  }
}

/**
 * Decrypts a file (mocked)
 * @param encryptedBlob The encrypted blob
 * @param encryptionKey The encryption key
 * @returns Promise<Blob> Mock decrypted blob
 */
export async function decryptFile(encryptedBlob: Blob, encryptionKey: string): Promise<Blob> {
  // Simulate decryption delay
  await new Promise((resolve) => setTimeout(resolve, 800))

  console.log(`Mock decryption with key ${encryptionKey.substring(0, 8)}...`)

  // Return the original blob as the "decrypted" blob
  return encryptedBlob
}
