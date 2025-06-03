import type { User } from "firebase/auth"
import { create } from "zustand"

// Mock user data
const MOCK_USERS = [
  {
    uid: "user123",
    email: "demo@cryptoescrow.com",
    displayName: "Demo User",
    photoURL: null,
    emailVerified: true,
  },
  {
    uid: "admin456",
    email: "admin@cryptoescrow.com",
    displayName: "Admin User",
    photoURL: null,
    emailVerified: true,
  },
]

// Mock authentication store
interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
  signInWithEmail: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  error: null,

  signInWithEmail: async (email: string, password: string) => {
    set({ loading: true, error: null })

    try {
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Find mock user with matching email
      const mockUser = MOCK_USERS.find((user) => user.email === email)

      if (mockUser && password === "password") {
        // Convert to Firebase User format
        const user = {
          ...mockUser,
          getIdToken: async () => "mock-token-" + Date.now(),
          // Add other required User methods
          delete: async () => {},
          reload: async () => {},
          toJSON: () => mockUser,
        } as unknown as User

        set({ user, loading: false })

        // Store in localStorage to persist across refreshes
        localStorage.setItem("mockUser", JSON.stringify(mockUser))
      } else {
        throw new Error("Invalid email or password")
      }
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  signInWithGoogle: async () => {
    set({ loading: true, error: null })

    try {
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Always use the first mock user for Google sign-in
      const mockUser = MOCK_USERS[0]

      // Convert to Firebase User format
      const user = {
        ...mockUser,
        getIdToken: async () => "mock-token-" + Date.now(),
        // Add other required User methods
        delete: async () => {},
        reload: async () => {},
        toJSON: () => mockUser,
      } as unknown as User

      set({ user, loading: false })

      // Store in localStorage to persist across refreshes
      localStorage.setItem("mockUser", JSON.stringify(mockUser))
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  signOut: async () => {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500))

    set({ user: null })
    localStorage.removeItem("mockUser")
  },
}))

// Initialize from localStorage if available
if (typeof window !== "undefined") {
  const storedUser = localStorage.getItem("mockUser")

  if (storedUser) {
    try {
      const mockUser = JSON.parse(storedUser)

      // Convert to Firebase User format
      const user = {
        ...mockUser,
        getIdToken: async () => "mock-token-" + Date.now(),
        // Add other required User methods
        delete: async () => {},
        reload: async () => {},
        toJSON: () => mockUser,
      } as unknown as User

      // Set after a short delay to simulate initialization
      setTimeout(() => {
        useAuthStore.setState({ user, loading: false })
      }, 500)
    } catch (e) {
      // Handle parse error
      useAuthStore.setState({ loading: false })
    }
  } else {
    // No stored user
    setTimeout(() => {
      useAuthStore.setState({ loading: false })
    }, 500)
  }
}
