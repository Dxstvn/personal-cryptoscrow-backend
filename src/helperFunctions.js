import { adminAuth, adminFirestore, PROJECT_ID } from '../jest.emulator.setup.js'; // Use test setup
// Use built-in fetch (Node.js 18+) or fallback to node-fetch
const fetchFn = globalThis.fetch || (await import('node-fetch')).default;
import { Timestamp } from 'firebase-admin/firestore'; // Import Timestamp

const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';
const DUMMY_API_KEY = 'demo-api-key'; // Standard for emulators
const TEST_PROJECT_ID = PROJECT_ID || 'demo-test'; // Use project ID from test setup

// Helper to generate a syntactically valid, but mock, Ethereum address
const generateMockAddress = (prefix = '00') => {
    // Generate a 40-character hex string
    let randomHex = Array(40).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
    // Ensure it doesn't clash with a known prefix too much if desired
    return `0x${prefix}${randomHex.substring(prefix.length)}`;
};


// Reusable createTestUser helper
export async function createTestUser(email, profileData = {}) {
    let userRecord;
    try {
        userRecord = await adminAuth.createUser({
            email,
            password: 'testpass',
            emailVerified: true
        });
    } catch (error) {
        console.error(`HELPER: Failed to create user ${email} in Admin SDK:`, error);
        throw error;
    }

    const userWallets = profileData.wallets && profileData.wallets.length > 0
        ? profileData.wallets
        : [generateMockAddress(email.substring(0, 2))]; // Generate a unique-ish mock address

    try {
        await adminFirestore.collection('users').doc(userRecord.uid).set({
            email: email.toLowerCase(),
            first_name: profileData.first_name || 'Test',
            last_name: profileData.last_name || 'User',
            phone_number: profileData.phone_number || '1234567890',
            wallets: userWallets,
            createdAt: Timestamp.now(), // Use Firestore Timestamp
        });
    } catch (error) {
        console.error(`HELPER: Failed to create Firestore profile for ${email}:`, error);
        await adminAuth.deleteUser(userRecord.uid).catch(delErr => console.error('HELPER: Failed to clean up auth user after Firestore error', delErr));
        throw error;
    }

    try {
        // Use Admin SDK to create a custom token
        const customToken = await adminAuth.createCustomToken(userRecord.uid);
        
        // Exchange custom token for ID token using the Firebase Auth REST API
        const signInUrl = `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${DUMMY_API_KEY}`;
        const signInResponse = await fetchFn(signInUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                token: customToken, 
                returnSecureToken: true 
            })
        });
        
        const signInData = await signInResponse.json();
        
        if (!signInResponse.ok || !signInData.idToken) {
            console.error(`HELPER: Failed to exchange custom token for ID token for ${email}:`, { status: signInResponse.status, body: signInData });
            throw new Error(`HELPER: Failed to get ID token for ${email}. Status: ${signInResponse.status}, Body: ${JSON.stringify(signInData)}`);
        }
        
        return {
            uid: userRecord.uid,
            token: signInData.idToken, // Use ID token instead of custom token
            email: email.toLowerCase(),
            wallets: userWallets
        };
    } catch (error) {
        console.error(`HELPER: Error creating token for user ${email}:`, error);
        await adminAuth.deleteUser(userRecord.uid).catch(delErr => console.error('HELPER: Failed to clean up auth user after token error', delErr));
        await adminFirestore.collection('users').doc(userRecord.uid).delete().catch(delErr => console.error('HELPER: Failed to clean up Firestore profile after token error', delErr));
        throw error;
    }
}

// Updated Cleanup Helper
export async function cleanUp() {
    try {
        const listUsersResult = await adminAuth.listUsers(1000);
        if (listUsersResult.users.length > 0) {
            const deleteUserPromises = listUsersResult.users.map(user => adminAuth.deleteUser(user.uid));
            await Promise.all(deleteUserPromises);
        }
    } catch (error) {
        // Non-critical if users don't exist or auth emulator is down temporarily
        // console.warn('HELPER: Minor issue during Auth cleanup:', error.message);
    }

    const collectionsToClear = ['users', 'contactInvitations', 'deals'];
    for (const collectionName of collectionsToClear) {
        try {
            const snapshot = await adminFirestore.collection(collectionName).limit(500).get();
            if (snapshot.empty) continue;

            const batch = adminFirestore.batch();
            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
            if (snapshot.size === 500) {
                 console.warn(`HELPER: Collection ${collectionName} had 500+ items. Consider a more robust paginated delete for cleanup if needed for very large test setups.`);
            }
        } catch (error) {
            console.warn(`HELPER: Minor issue during Firestore cleanup of ${collectionName}:`, error.message);
        }
    }
}
