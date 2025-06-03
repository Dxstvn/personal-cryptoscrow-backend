// Simplified Filebase client that avoids filesystem operations
import { S3Client } from "@aws-sdk/client-s3"

export const BUCKET_NAME = "ipfs-escrow-test"

// Create a minimal S3 client configuration to avoid filesystem operations
export function createFilebaseClient() {
  // Only create the client when explicitly called to avoid initialization errors
  return new S3Client({
    region: "us-east-1", // Filebase uses us-east-1
    endpoint: "https://s3.filebase.com",
    credentials: {
      accessKeyId: process.env.FILEBASE_ACCESS_KEY || "",
      secretAccessKey: process.env.FILEBASE_SECRET_KEY || "",
    },
    // Explicitly disable loading config from shared files
    forcePathStyle: true,
    // Disable AWS SDK's automatic retry mechanism which may use fs
    maxAttempts: 1,
  })
}

// Generate a unique file key for S3
export function generateFileKey(fileName: string): string {
  const timestamp = Date.now()
  const randomString = Math.random().toString(36).substring(2, 10)
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_")
  return `${timestamp}-${randomString}-${sanitizedFileName}`
}
