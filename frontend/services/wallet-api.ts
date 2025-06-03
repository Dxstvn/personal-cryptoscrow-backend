import type { ConnectedWallet, BlockchainNetwork } from '@/types/wallet'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

/**
 * API service for wallet connections with backend integration
 */
export class WalletApiService {
  
  /**
   * Get authorization headers with Firebase ID token
   */
  private async getAuthHeaders(): Promise<HeadersInit> {
    try {
      // Try to get Firebase user and token
      const { getAuth } = await import('firebase/auth')
      const auth = getAuth()
      const user = auth.currentUser
      
      if (user) {
        const token = await user.getIdToken()
        return {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    } catch (error) {
      console.warn('Could not get Firebase auth token:', error)
    }
    
    return {
      'Content-Type': 'application/json'
    }
  }

  /**
   * Register a connected wallet with the backend
   */
  async registerWallet(wallet: ConnectedWallet): Promise<{ success: boolean; message?: string }> {
    try {
      console.log('Registering wallet with backend:', {
        address: wallet.address,
        name: wallet.name,
        network: wallet.network
      })

      const headers = await this.getAuthHeaders()
      
      const response = await fetch(`${API_BASE_URL}/wallet/register`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          address: wallet.address,
          name: wallet.name,
          network: wallet.network,
          publicKey: wallet.publicKey, // For Solana wallets
          isPrimary: wallet.isPrimary || false
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      console.log('✅ Wallet registered successfully:', data)
      
      return { success: true, message: data.message }
    } catch (error) {
      console.error('❌ Error registering wallet:', error)
      
      // In development mode, don't fail completely
      if (process.env.NODE_ENV === 'development') {
        console.warn('🔧 Development mode: Simulating successful wallet registration')
        return { success: true, message: 'Wallet registered (development mode)' }
      }
      
      return { 
        success: false, 
        message: (error as Error).message || 'Failed to register wallet with backend' 
      }
    }
  }

  /**
   * Update user profile with wallet address during authentication
   */
  async updateUserProfile(updates: {
    walletAddress?: string
    walletAddresses?: Array<{
      address: string
      network: BlockchainNetwork
      name: string
      isPrimary?: boolean
    }>
  }): Promise<{ success: boolean; message?: string }> {
    try {
      console.log('Updating user profile with wallet data:', updates)

      const headers = await this.getAuthHeaders()
      
      const response = await fetch(`${API_BASE_URL}/auth/profile`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updates)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      console.log('✅ User profile updated successfully:', data)
      
      return { success: true, message: data.message }
    } catch (error) {
      console.error('❌ Error updating user profile:', error)
      
      // In development mode, don't fail completely
      if (process.env.NODE_ENV === 'development') {
        console.warn('🔧 Development mode: Simulating successful profile update')
        return { success: true, message: 'Profile updated (development mode)' }
      }
      
      return { 
        success: false, 
        message: (error as Error).message || 'Failed to update user profile' 
      }
    }
  }

  /**
   * Get all connected wallets from the backend
   */
  async getConnectedWallets(): Promise<ConnectedWallet[]> {
    try {
      console.log('Fetching connected wallets from backend')

      const headers = await this.getAuthHeaders()
      
      const response = await fetch(`${API_BASE_URL}/wallet`, {
        method: 'GET',
        headers
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      console.log('✅ Fetched connected wallets:', data)
      
      return data.wallets || []
    } catch (error) {
      console.error('❌ Error fetching connected wallets:', error)
      
      // In development mode, return empty array
      if (process.env.NODE_ENV === 'development') {
        console.warn('🔧 Development mode: Returning empty wallet list')
        return []
      }
      
      throw error
    }
  }

  /**
   * Remove a wallet from the backend
   */
  async removeWallet(address: string, network: BlockchainNetwork): Promise<{ success: boolean; message?: string }> {
    try {
      console.log('Removing wallet from backend:', { address, network })

      const headers = await this.getAuthHeaders()
      
      const response = await fetch(`${API_BASE_URL}/wallet/${address}`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ network })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      console.log('✅ Wallet removed successfully:', data)
      
      return { success: true, message: data.message }
    } catch (error) {
      console.error('❌ Error removing wallet:', error)
      
      // In development mode, don't fail completely
      if (process.env.NODE_ENV === 'development') {
        console.warn('🔧 Development mode: Simulating successful wallet removal')
        return { success: true, message: 'Wallet removed (development mode)' }
      }
      
      return { 
        success: false, 
        message: (error as Error).message || 'Failed to remove wallet from backend' 
      }
    }
  }

  /**
   * Set primary wallet on the backend
   */
  async setPrimaryWallet(address: string, network: BlockchainNetwork): Promise<{ success: boolean; message?: string }> {
    try {
      console.log('Setting primary wallet on backend:', { address, network })

      const headers = await this.getAuthHeaders()
      
      const response = await fetch(`${API_BASE_URL}/wallet/primary`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ address, network })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      console.log('✅ Primary wallet set successfully:', data)
      
      return { success: true, message: data.message }
    } catch (error) {
      console.error('❌ Error setting primary wallet:', error)
      
      // In development mode, don't fail completely
      if (process.env.NODE_ENV === 'development') {
        console.warn('🔧 Development mode: Simulating successful primary wallet update')
        return { success: true, message: 'Primary wallet set (development mode)' }
      }
      
      return { 
        success: false, 
        message: (error as Error).message || 'Failed to set primary wallet on backend' 
      }
    }
  }

  /**
   * Sync wallet balance with backend
   */
  async syncWalletBalance(address: string, network: BlockchainNetwork, balance: string): Promise<{ success: boolean }> {
    try {
      const headers = await this.getAuthHeaders()
      
      const response = await fetch(`${API_BASE_URL}/wallet/balance`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ address, network, balance })
      })

      if (!response.ok) {
        console.warn('Failed to sync wallet balance:', response.statusText)
        return { success: false }
      }

      return { success: true }
    } catch (error) {
      console.warn('Error syncing wallet balance:', error)
      return { success: false }
    }
  }

  /**
   * Get user's wallet preferences from backend
   */
  async getWalletPreferences(): Promise<{
    primaryWallet?: { address: string; network: BlockchainNetwork }
    preferredNetworks?: BlockchainNetwork[]
  }> {
    try {
      const headers = await this.getAuthHeaders()
      
      const response = await fetch(`${API_BASE_URL}/wallet/preferences`, {
        method: 'GET',
        headers
      })

      if (!response.ok) {
        return {}
      }

      const data = await response.json()
      return data.preferences || {}
    } catch (error) {
      console.warn('Error fetching wallet preferences:', error)
      return {}
    }
  }

  /**
   * Send comprehensive wallet detection data to backend
   */
  async sendWalletDetection(detectedWallets: {
    evmWallets: any[]
    solanaWallets: any[]
    bitcoinWallets: any[]
  }): Promise<{ success: boolean; message?: string }> {
    try {
      console.log('Sending wallet detection data to backend:', {
        evm: detectedWallets.evmWallets.length,
        solana: detectedWallets.solanaWallets.length,
        bitcoin: detectedWallets.bitcoinWallets.length
      })

      const headers = await this.getAuthHeaders()
      
      const response = await fetch(`${API_BASE_URL}/wallet/detection`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ detectedWallets })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      console.log('✅ Wallet detection data sent successfully:', data)
      
      return { success: true, message: data.message }
    } catch (error) {
      console.error('❌ Error sending wallet detection data:', error)
      
      // In development mode, don't fail completely
      if (process.env.NODE_ENV === 'development') {
        console.warn('🔧 Development mode: Simulating successful detection data send')
        return { success: true, message: 'Detection data sent (development mode)' }
      }
      
      return { 
        success: false, 
        message: (error as Error).message || 'Failed to send wallet detection data to backend' 
      }
    }
  }
}

// Create singleton instance
export const walletApi = new WalletApiService()

// Legacy export for backward compatibility
export default {
  registerWallet: (address: string, name: string) => 
    walletApi.registerWallet({
      address,
      name,
      network: 'ethereum',
      provider: null,
      isPrimary: false
    }),
  getConnectedWallets: () => walletApi.getConnectedWallets(),
  removeWallet: (address: string) => walletApi.removeWallet(address, 'ethereum')
}
