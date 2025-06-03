import { useEffect } from 'react'
import { useAuth } from '@/context/auth-context'
import { useWallet } from '@/context/wallet-context'
import { walletApi } from '@/services/wallet-api'

/**
 * Hook that integrates wallet connection with user authentication
 * Automatically syncs connected wallets with the user's backend profile
 */
export function useWalletAuthIntegration() {
  const { user } = useAuth()
  const { connectedWallets, currentAddress, currentNetwork } = useWallet()

  // Sync wallet addresses with user profile when wallets change
  useEffect(() => {
    if (!user || connectedWallets.length === 0) return

    const syncWalletsWithProfile = async () => {
      try {
        // Prepare wallet data for backend
        const walletAddresses = connectedWallets.map(wallet => ({
          address: wallet.address,
          network: wallet.network,
          name: wallet.name,
          isPrimary: wallet.isPrimary || false
        }))

        // Also set the primary wallet address for backward compatibility
        const primaryWallet = connectedWallets.find(w => w.isPrimary)
        const primaryWalletAddress = primaryWallet?.address || currentAddress

        // Update user profile with wallet information
        await walletApi.updateUserProfile({
          walletAddress: primaryWalletAddress,
          walletAddresses
        })

        console.log('✅ Synced wallets with user profile:', {
          primaryWallet: primaryWalletAddress,
          totalWallets: walletAddresses.length
        })
      } catch (error) {
        console.warn('Failed to sync wallets with user profile:', error)
      }
    }

    // Debounce the sync to avoid too many API calls
    const timeoutId = setTimeout(syncWalletsWithProfile, 1000)
    return () => clearTimeout(timeoutId)
  }, [user, connectedWallets, currentAddress, currentNetwork])

  // Return sync function for manual syncing if needed
  const manualSync = async () => {
    if (!user || connectedWallets.length === 0) {
      throw new Error('No user or wallets to sync')
    }

    const walletAddresses = connectedWallets.map(wallet => ({
      address: wallet.address,
      network: wallet.network,
      name: wallet.name,
      isPrimary: wallet.isPrimary || false
    }))

    const primaryWallet = connectedWallets.find(w => w.isPrimary)
    const primaryWalletAddress = primaryWallet?.address || currentAddress

    return await walletApi.updateUserProfile({
      walletAddress: primaryWalletAddress,
      walletAddresses
    })
  }

  return {
    manualSync,
    hasWallets: connectedWallets.length > 0,
    isAuthenticated: !!user
  }
}
