import { NextResponse } from "next/server"

export async function GET() {
  try {
    // Check if Filebase credentials are configured
    const accessKey = process.env.FILEBASE_ACCESS_KEY
    const secretKey = process.env.FILEBASE_SECRET_KEY

    if (!accessKey || !secretKey) {
      return NextResponse.json({
        available: false,
        error: "Filebase credentials are not configured",
      })
    }

    // Instead of using the S3 client which causes fs errors,
    // we'll do a simple HTTP request to check if Filebase is accessible
    const response = await fetch("https://s3.filebase.com", {
      method: "HEAD",
      headers: {
        // Add a simple header to avoid CORS issues
        "User-Agent": "CryptoEscrow-App",
      },
    })

    if (response.ok || response.status === 403) {
      // 403 is expected for unauthenticated requests to S3 endpoints
      // but it means the service is available
      return NextResponse.json({
        available: true,
      })
    } else {
      return NextResponse.json({
        available: false,
        error: `Filebase service returned status: ${response.status}`,
      })
    }
  } catch (error) {
    console.error("Filebase status check error:", error)

    // Provide more detailed error information
    let errorMessage = "Unknown error"
    if (error instanceof Error) {
      errorMessage = error.message
    }

    return NextResponse.json({
      available: false,
      error: errorMessage,
    })
  }
}
