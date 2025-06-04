import request from 'supertest';
import { JsonRpcProvider, Wallet, parseEther } from 'ethers';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, deleteDoc, collection, getDocs, query, where, terminate } from 'firebase/firestore';
import { ethEscrowApp } from '../../../api/routes/auth/authIndex.js';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Server management
let serverProcess = null;
let app = null;
let provider = null;

export const startTestServer = async () => {
  try {
    // Import the app directly instead of spawning a process
    const { default: testApp } = await import('../../../server.js');
    app = testApp;
    
    // Wait for server to be ready
    let retries = 5;
    while (retries > 0) {
      try {
        const response = await request(app).get('/health');
        if (response.status === 200) {
          console.log('✅ Test server app loaded and ready');
          return `http://localhost:${process.env.PORT || 3000}`;
        }
      } catch (error) {
        retries--;
        if (retries === 0) throw error;
        await delay(1000);
      }
    }
  } catch (error) {
    console.error('Failed to load test server app:', error);
    throw error;
  }
};

export const stopTestServer = async () => {
  try {
    // Terminate Firestore to prevent open handles
    if (db) {
      await terminate(db);
      console.log('✅ Firestore connections terminated');
    }
    
    // Terminate provider if exists
    if (provider) {
      await provider.destroy();
      provider = null;
      console.log('✅ Provider connections terminated');
    }
    
    // Clear app reference
    app = null;
    
    console.log('✅ Test server stopped');
  } catch (error) {
    console.warn('Error during server shutdown:', error);
    throw error;
  }
};

// Firebase helpers
const auth = getAuth(ethEscrowApp);
const db = getFirestore(ethEscrowApp);

export const createTestUser = async (email, password, additionalData = {}) => {
  try {
    // Create user in Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Create user document in Firestore
    const userDocRef = doc(db, 'users', user.uid);
    await setDoc(userDocRef, {
      email,
      uid: user.uid,
      createdAt: new Date(),
      walletAddresses: [],
      ...additionalData
    });
    
    console.log(`✅ Created test user: ${email}`);
    return { user, idToken: await user.getIdToken() };
  } catch (error) {
    console.error(`Failed to create test user ${email}:`, error);
    throw error;
  }
};

export const loginTestUser = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const idToken = await userCredential.user.getIdToken();
    console.log(`✅ Logged in test user: ${email}`);
    return { user: userCredential.user, idToken };
  } catch (error) {
    console.error(`Failed to login test user ${email}:`, error);
    throw error;
  }
};

export const deleteTestUser = async (uid) => {
  try {
    // Delete user document
    await deleteDoc(doc(db, 'users', uid));
    
    // Delete user's contacts
    const contactsQuery = query(collection(db, 'contacts'), where('userId', '==', uid));
    const contactsSnapshot = await getDocs(contactsQuery);
    for (const doc of contactsSnapshot.docs) {
      await deleteDoc(doc.ref);
    }
    
    // Delete user's transactions
    const transactionsQuery = query(collection(db, 'transactions'), where('userId', '==', uid));
    const transactionsSnapshot = await getDocs(transactionsQuery);
    for (const doc of transactionsSnapshot.docs) {
      await deleteDoc(doc.ref);
    }
    
    console.log(`✅ Deleted test user data for UID: ${uid}`);
  } catch (error) {
    console.error(`Failed to delete test user ${uid}:`, error);
  }
};

// API request helpers
export class ApiClient {
  constructor(baseUrl, idToken = null) {
    this.baseUrl = baseUrl;
    this.idToken = idToken;
  }
  
  setAuthToken(idToken) {
    this.idToken = idToken;
  }
  
  async makeRequest(method, endpoint, data = null) {
    // Use the app directly with supertest instead of HTTP requests
    const req = request(app)[method.toLowerCase()](endpoint);
    
    if (this.idToken) {
      req.set('Authorization', `Bearer ${this.idToken}`);
    }
    
    if (data) {
      req.send(data);
    }
    
    const response = await req;
    return response;
  }
  
  get(endpoint) {
    return this.makeRequest('GET', endpoint);
  }
  
  post(endpoint, data) {
    return this.makeRequest('POST', endpoint, data);
  }
  
  put(endpoint, data) {
    return this.makeRequest('PUT', endpoint, data);
  }
  
  delete(endpoint) {
    return this.makeRequest('DELETE', endpoint);
  }
}

// Blockchain helpers
export const getProvider = async (retries = 5, delayMs = 1000) => {
  if (provider) {
    return provider;
  }
  
  for (let i = 0; i < retries; i++) {
    try {
      provider = new JsonRpcProvider(process.env.RPC_URL);
      // Wait for the provider to be ready
      await provider.getNetwork();
      console.log('✅ Successfully connected to RPC_URL:', process.env.RPC_URL);
      return provider;
    } catch (error) {
      if (i < retries - 1) {
        console.warn(`Failed to connect to RPC (attempt ${i + 1}/${retries}). Retrying in ${delayMs}ms...`);
        await delay(delayMs);
      } else {
        console.error('❌ Failed to connect to RPC after multiple retries:', process.env.RPC_URL, error);
        throw error;
      }
    }
  }
};

let fundingWalletInstance = null;
let fundingWalletNonce = null;

export const getWallet = async (privateKey) => {
  console.log('Creating wallet from private key');
  
  if (!privateKey) {
    throw new Error('Private key is undefined or empty');
  }
  
  // Remove 0x prefix if present
  const cleanPrivateKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
  
  // Validate private key format (should be 64 hex characters)
  if (!/^[0-9a-fA-F]{64}$/.test(cleanPrivateKey)) {
    throw new Error(`Invalid private key format. Expected 64 hex characters, got: ${cleanPrivateKey.length} characters`);
  }
  
  try {
    const provider = await getProvider();
    // ethers.Wallet expects private key without 0x prefix
    const wallet = new Wallet(cleanPrivateKey, provider);
    console.log(`✅ Created wallet with address: ${wallet.address}`);
    return wallet;
  } catch (error) {
    console.error('Failed to create wallet:', error.message);
    throw error;
  }
};

export const fundTestAccount = async (address, amount = '10') => {
  const provider = await getProvider();
  if (!fundingWalletInstance) {
    // For Hardhat network, we can use the first default account to fund others
    fundingWalletInstance = new Wallet('ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', provider);
    fundingWalletNonce = await fundingWalletInstance.getNonce();
  }
  
  const tx = await fundingWalletInstance.sendTransaction({
    to: address,
    value: parseEther(amount),
    nonce: fundingWalletNonce
  });
  
  await tx.wait();
  fundingWalletNonce++; // Increment nonce for the next transaction
  console.log(`✅ Funded ${address} with ${amount} ETH`);
};

// Test data generators
export const generateContactData = (overrides = {}) => {
  return {
    name: `Test Contact ${Date.now()}`,
    email: `contact${Date.now()}@example.com`,
    walletAddress: Wallet.createRandom().address,
    ...overrides
  };
};

export const generateTransactionData = async (contactId, overrides = {}) => {
  const buyerWallet = process.env.TEST_USER_A_PK ? await getWallet(process.env.TEST_USER_A_PK) : null;
  const sellerWallet = process.env.TEST_USER_B_PK ? await getWallet(process.env.TEST_USER_B_PK) : null;
  
  return {
    contactId,
    type: 'goodsAndServices',
    amount: '0.1',
    currency: 'ETH',
    description: 'Test transaction',
    buyerAddress: buyerWallet ? buyerWallet.address : '',
    sellerAddress: sellerWallet ? sellerWallet.address : '',
    ...overrides
  };
};

// Utility functions
export const waitForTransaction = async (txHash) => {
  const provider = getProvider();
  const receipt = await provider.waitForTransaction(txHash);
  return receipt;
};

export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const cleanupTestData = async (userIds = []) => {
  console.log('🧹 Cleaning up test data...');
  
  for (const uid of userIds) {
    await deleteTestUser(uid);
  }
  
  console.log('✅ Test data cleanup complete');
}; 