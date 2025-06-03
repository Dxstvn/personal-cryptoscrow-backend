// API base URL - environment-dependent
const getApiUrl = () => {
  // Check if we're in development mode
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return "http://localhost:3000"
  }
  
  // Production/staging - use the domain
  return process.env.NEXT_PUBLIC_API_URL || "https://clearhold.app"
}

const API_URL = getApiUrl()

/**
 * Makes a POST request to the API
 * @param endpoint - API endpoint
 * @param data - Request body data
 * @returns Promise with response data
 */
export async function postRequest<T>(endpoint: string, data: any): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
    credentials: 'include', // Include cookies for CORS
  })

  const responseData = await response.json()

  if (!response.ok) {
    throw new Error(responseData.message || "An error occurred")
  }

  return responseData
}

/**
 * Makes a GET request to the API
 * @param endpoint - API endpoint
 * @param token - Optional auth token
 * @returns Promise with response data
 */
export async function getRequest<T>(endpoint: string, token?: string): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    method: "GET",
    headers,
    credentials: 'include', // Include cookies for CORS
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.message || "An error occurred")
  }

  return data
}
