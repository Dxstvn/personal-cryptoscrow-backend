// Fix existing user data for testing
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from './src/api/routes/auth/admin.js';

async function fixExistingUser() {
  console.log('🔧 Fixing existing user data for testing...');
  
  try {
    const adminApp = await getAdminApp();
    const auth = getAuth(adminApp);
    const db = getFirestore(adminApp);
    
    const email = 'testuser.a@example.com';
    
    // Get user by email
    const userRecord = await auth.getUserByEmail(email);
    console.log(`Found user: ${userRecord.uid}`);
    
    // Get current user document
    const userDoc = await db.collection('users').doc(userRecord.uid).get();
    
    if (userDoc.exists) {
      const userData = userDoc.data();
      console.log('Current user data:', JSON.stringify(userData, null, 2));
      
      // Check wallet format
      if (userData.wallets && Array.isArray(userData.wallets)) {
        const firstWallet = userData.wallets[0];
        if (typeof firstWallet === 'string') {
          console.log('❌ User has old wallet format (string array)');
          
          // Convert to new format
          const newWallets = userData.wallets.map((walletAddress, index) => ({
            address: walletAddress.toLowerCase(),
            name: index === 0 ? 'Primary Wallet' : `Wallet ${index + 1}`,
            network: 'ethereum',
            isPrimary: index === 0,
            addedAt: new Date()
          }));
          
          // Update user document
          await db.collection('users').doc(userRecord.uid).update({
            wallets: newWallets
          });
          
          console.log('✅ Fixed user wallet format');
          console.log('New wallets:', JSON.stringify(newWallets, null, 2));
        } else {
          console.log('✅ User already has correct wallet format');
        }
      } else {
        console.log('⚠️ User has no wallets, creating empty array');
        await db.collection('users').doc(userRecord.uid).update({
          wallets: []
        });
      }
    } else {
      console.log('❌ User document not found in Firestore');
    }
    
  } catch (error) {
    console.error('Error fixing user:', error);
  }
}

fixExistingUser().then(() => {
  console.log('✨ User fix complete');
  process.exit(0);
}).catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});