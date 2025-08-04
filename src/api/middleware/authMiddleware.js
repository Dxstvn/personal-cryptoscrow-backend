import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from '../routes/auth/admin.js';
import jwt from 'jsonwebtoken';

// Helper function to get Firebase services
async function getFirebaseServices() {
  const adminApp = await getAdminApp();
  return {
    auth: getAuth(adminApp)
  };
}

// Authentication middleware
export async function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  const isTest = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'e2e_test';
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    // First, try to verify as custom JWT (from passwordless login)
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      if (decoded.uid && decoded.authMethod === 'passwordless') {
        req.userId = decoded.uid;
        req.user = { 
          uid: decoded.uid, 
          email: decoded.email, 
          emailVerified: decoded.emailVerified,
          authMethod: decoded.authMethod 
        };
        next();
        return;
      }
    } catch (jwtError) {
      // Not a valid JWT, continue to Firebase token verification
    }
    
    const { auth } = await getFirebaseServices();
    
    if (isTest) {
      // In test mode, handle various token formats and audience mismatches
      console.log(`🧪 Test mode authentication for token: ${token.substring(0, 50)}...`);
      
      try {
        // First try to verify as ID token - but in test mode, allow different audiences
        const decodedToken = await auth.verifyIdToken(token, false); // Don't check revocation in test
        req.userId = decodedToken.uid;
        req.user = { uid: decodedToken.uid };
        console.log(`🧪 Test mode: ID token verified for user ${req.userId}`);
        next();
        return;
      } catch (idTokenError) {
        console.log(`🧪 Test mode: ID token verification failed (${idTokenError.code}), trying fallback methods...`);
        
        // In test mode, if token verification fails, try to decode it as a test token
        if (token.startsWith('test-token-')) {
          // Handle test tokens
          const testUserId = token.replace('test-token-', '');
          req.userId = testUserId;
          req.user = { uid: testUserId };
          console.log(`🧪 Test mode: Using test token for user ${testUserId}`);
          next();
          return;
        }
        
        // If it's a custom token or session cookie, handle it
        try {
          // Try verifying as session cookie
          const decodedClaims = await auth.verifySessionCookie(token, false);
          req.userId = decodedClaims.uid;
          req.user = { uid: decodedClaims.uid };
          console.log(`🧪 Test mode: Session cookie verified for user ${req.userId}`);
          next();
          return;
        } catch (sessionError) {
          console.log(`🧪 Test mode: Session cookie verification also failed`);
        }
        
        // Last resort: in test mode, if the token looks like a UID, use it directly
        if (token.length >= 20 && token.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(token)) {
          req.userId = token;
          req.user = { uid: token };
          console.log(`🧪 Test mode: Using token as direct UID: ${token}`);
          next();
          return;
        }
        
        throw idTokenError;
      }
    } else {
      // In production, strictly verify ID tokens
      const decodedToken = await auth.verifyIdToken(token);
      req.userId = decodedToken.uid;
      req.user = { uid: decodedToken.uid };
      next();
    }
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(403).json({ error: 'Invalid token', details: error.message });
  }
}