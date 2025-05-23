import request from 'supertest';
import { ethers } from 'ethers';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, deleteDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { ethEscrowApp } from '../../../api/routes/auth/authIndex.js';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Server management
let serverProcess = null;
let app = null;

export const startTestServer = async () => {
  try {
    // Import the app directly instead of spawning a process
    const { default: testApp } = await import('../../../api/routes/auth/quicktest.js');
    app = testApp;
    
    console.log('✅ Test server app loaded successfully');
    return `http://localhost:${process.env.PORT || 3000}`;
  } catch (error) {
    console.error('Failed to load test server app:', error);
    throw error;
  }
};

export const stopTestServer = async () => {
  // No need to kill process since we're using the app directly
  app = null;
  console.log('✅ Test server stopped');
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
export const getProvider = (retries = 5, delayMs = 1000) => {
  try {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    // Perform a simple check to see if the provider is connected
    // provider.getBlockNumber(); // This would throw an error if not connected, good for a quick check
    console.log('✅ Successfully connected to RPC_URL:', process.env.RPC_URL);
    return provider;
  } catch (error) {
    if (retries > 0) {
      console.warn(`Failed to connect to RPC. Retries left: ${retries}. Retrying in ${delayMs}ms...`);
      return new Promise((resolve) => setTimeout(() => resolve(getProvider(retries - 1, delayMs)), delayMs));
    }
    console.error('❌ Failed to connect to RPC after multiple retries:', process.env.RPC_URL, error);
    throw error;
  }
};

export const getWallet = (privateKey) => {
  console.log('Attempting to create wallet with PK:', privateKey ? `${privateKey.substring(0, 10)}...` : 'undefined');
  
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
    const provider = getProvider();
    // ethers.Wallet expects private key without 0x prefix
    const wallet = new ethers.Wallet(cleanPrivateKey, provider);
    console.log(`✅ Created wallet with address: ${wallet.address}`);
    return wallet;
  } catch (error) {
    console.error('Failed to create wallet:', error);
    throw error;
  }
};

export const fundTestAccount = async (address, amount = '10') => {
  // For Hardhat network, we can use the first default account to fund others
  const fundingWallet = getWallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
  
  const tx = await fundingWallet.sendTransaction({
    to: address,
    value: ethers.parseEther(amount)
  });
  
  await tx.wait();
  console.log(`✅ Funded ${address} with ${amount} ETH`);
};

// Test data generators
export const generateContactData = (overrides = {}) => {
  return {
    name: `Test Contact ${Date.now()}`,
    email: `contact${Date.now()}@example.com`,
    walletAddress: ethers.Wallet.createRandom().address,
    ...overrides
  };
};

export const generateTransactionData = (contactId, overrides = {}) => {
  return {
    contactId,
    type: 'goodsAndServices',
    amount: '0.1',
    currency: 'ETH',
    description: 'Test transaction',
    buyerAddress: process.env.TEST_USER_A_PK ? getWallet(process.env.TEST_USER_A_PK).address : '',
    sellerAddress: process.env.TEST_USER_B_PK ? getWallet(process.env.TEST_USER_B_PK).address : '',
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