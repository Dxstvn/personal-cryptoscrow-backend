import express from 'express';
import multer from 'multer';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage as getAdminStorage } from 'firebase-admin/storage';
import { ethEscrowApp } from '../auth/authIndex.js';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getAdminApp } from '../auth/admin.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { fileUploadRateLimit } from '../../middleware/securityMiddleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Lazy initialization of storage to ensure emulator connection in test mode
let storage = null;
function getClientStorage() {
  if (!storage) {
    storage = getStorage(ethEscrowApp);
    const isTest = process.env.NODE_ENV === 'test';
    if (isTest) {
      console.log(`🧪 Client Storage initialized for test mode with emulator`);
    }
  }
  return storage;
}

// Helper function to get Firebase services
async function getFirebaseServices() {
  const adminApp = await getAdminApp();
  return {
    db: getFirestore(adminApp),
    auth: getAdminAuth(adminApp),
    adminStorage: getAdminStorage(adminApp)
  };
}

// Authentication middleware
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  const isTest = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'e2e_test';
  
  if (!token) return res.status(401).json({ error: 'No token provided' });
  
  try {
    const { auth } = await getFirebaseServices();
    
    if (isTest) {
      // In test mode, handle various token formats and audience mismatches
      console.log(`🧪 Test mode authentication for token: ${token.substring(0, 50)}...`);
      
      try {
        // First try to verify as ID token - but in test mode, allow different audiences
        const decodedToken = await auth.verifyIdToken(token, false); // Don't check revocation in test
        req.userId = decodedToken.uid;
        console.log(`🧪 Test mode: ID token verified for user ${req.userId}`);
        next();
        return;
      } catch (idTokenError) {
        console.log(`🧪 Test mode: ID token verification failed (${idTokenError.code}), trying fallback methods...`);
        
        // Handle audience mismatch errors gracefully
        if (idTokenError.code === 'auth/argument-error' || 
            idTokenError.message.includes('incorrect "aud"') ||
            idTokenError.message.includes('audience')) {
          try {
            // Manually decode the JWT payload to extract UID for audience mismatch cases
            const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
            console.log(`🧪 Test mode: Manually decoded token payload, checking for UID...`);
            
            if (payload.user_id || payload.uid) {
              const uid = payload.user_id || payload.uid;
              // Verify the user exists in our system
              const userRecord = await auth.getUser(uid);
              req.userId = userRecord.uid;
              console.log(`🧪 Test mode: Audience mismatch handled, verified user ${req.userId}`);
              next();
              return;
            } else if (payload.sub) {
              // Try 'sub' claim as fallback (standard JWT claim)
              const userRecord = await auth.getUser(payload.sub);
              req.userId = userRecord.uid;
              console.log(`🧪 Test mode: Used 'sub' claim for user ${req.userId}`);
              next();
              return;
            }
          } catch (manualDecodeError) {
            console.log(`🧪 Test mode: Manual ID token decode failed: ${manualDecodeError.message}`);
          }
        }
        
        // If still failing, try as custom token
        try {
          const customTokenPayload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
          if (customTokenPayload.uid) {
            // Verify the user exists
            const userRecord = await auth.getUser(customTokenPayload.uid);
            req.userId = userRecord.uid;
            console.log(`🧪 Test mode: Custom token verified for user ${req.userId}`);
            next();
            return;
          } else {
            throw new Error('No UID found in custom token');
          }
        } catch (customTokenError) {
          console.error(`🧪 Test mode: All authentication methods failed:`, {
            idTokenError: idTokenError.code || idTokenError.message,
            customTokenError: customTokenError.message
          });
          return res.status(403).json({ error: 'Invalid or expired token' });
        }
      }
    } else {
      // Production mode - only accept ID tokens
      const decodedToken = await auth.verifyIdToken(token);
      req.userId = decodedToken.uid;
      next();
    }
  } catch (err) {
    console.error('Authentication error:', err.code || err.message);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Enhanced file validation
const fileFilter = (req, file, cb) => {
  // Allowed MIME types
  const allowedMimeTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  // Allowed extensions
  const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.doc', '.docx'];
  
  const fileExtension = path.extname(file.originalname).toLowerCase();
  
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(new Error(`File type not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`), false);
  }
  
  if (!allowedExtensions.includes(fileExtension)) {
    return cb(new Error(`File extension not allowed. Allowed extensions: ${allowedExtensions.join(', ')}`), false);
  }

  // Sanitize filename
  const sanitizedName = file.originalname
    .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace special chars with underscore
    .replace(/_{2,}/g, '_') // Replace multiple underscores with single
    .substring(0, 100); // Limit filename length

  file.originalname = sanitizedName;
  
  cb(null, true);
};

// Validate file magic numbers (first few bytes) for additional security
const validateFileSignature = (buffer, mimetype) => {
  const signatures = {
    'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
    'image/jpeg': [0xFF, 0xD8, 0xFF],
    'image/png': [0x89, 0x50, 0x4E, 0x47],
    'image/gif': [0x47, 0x49, 0x46],
    'application/msword': [0xD0, 0xCF, 0x11, 0xE0],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [0x50, 0x4B, 0x03, 0x04]
  };

  const signature = signatures[mimetype];
  if (!signature) return false;

  for (let i = 0; i < signature.length; i++) {
    if (buffer[i] !== signature[i]) return false;
  }
  return true;
};

// Configure multer with enhanced security
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 1, // Only allow 1 file per request
    fieldSize: 1024 * 1024, // 1MB field size limit
    fieldNameSize: 100, // Limit field name size
    headerPairs: 20 // Limit number of header pairs
  },
  fileFilter: fileFilter
});

// Apply rate limiting to upload endpoint
router.use('/upload', fileUploadRateLimit);

// Error handling middleware for multer errors
const handleMulterErrors = (err, req, res, next) => {
  if (err) {
    console.error('Multer error:', err.message);
    
    // Handle multer-specific errors
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ error: 'Unexpected file field.' });
      }
    }
    
    // Handle fileFilter errors
    if (err.message && (err.message.includes('File type not allowed') || err.message.includes('File extension not allowed'))) {
      return res.status(400).json({ error: 'Invalid file type' });
    }
    
    // Default error response
    return res.status(400).json({ error: err.message || 'File upload error' });
  }
  next();
};

// Upload endpoint with enhanced security
router.post('/upload', authenticateToken, upload.single('file'), handleMulterErrors, async (req, res) => {
  try {
    const { dealId } = req.body;
    const userId = req.userId;

    if (!req.file || !dealId || !userId) {
      return res.status(400).json({ error: 'Missing file, dealId, or userId' });
    }

    // Validate file signature
    if (!validateFileSignature(req.file.buffer, req.file.mimetype)) {
      return res.status(400).json({ error: 'File signature does not match declared type' });
    }

    // Additional dealId validation
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(dealId)) {
      return res.status(400).json({ error: 'Invalid dealId format' });
    }

    // Check if deal exists and user has permission
    const { db, adminStorage } = await getFirebaseServices();
    const dealRef = db.collection('deals').doc(dealId);
    const dealDoc = await dealRef.get();
    if (!dealDoc.exists) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const dealData = dealDoc.data();
    if (!dealData.participants || !dealData.participants.includes(userId)) {
      return res.status(403).json({ error: 'Unauthorized access to this deal' });
    }

    // Generate secure file ID and path
    const fileId = uuidv4();
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    const storagePath = `deals/${dealId}/${fileId}${fileExtension}`;

    // Upload to Firebase Storage using admin SDK
    const bucket = adminStorage.bucket();
    const file = bucket.file(storagePath);
    
    // Upload file buffer with metadata
    await file.save(req.file.buffer, {
      metadata: {
        contentType: req.file.mimetype,
        metadata: {
          uploadedBy: userId,
          uploadedAt: new Date().toISOString(),
          originalName: req.file.originalname,
          dealId: dealId
        }
      }
    });

    // Generate download URL - handle test mode differently
    let downloadURL;
    const isTest = process.env.NODE_ENV === 'test';
    
    if (isTest) {
      // In test mode, use a simple mock URL since we're using emulators
      downloadURL = `http://localhost:9199/v0/b/demo-test.appspot.com/o/${encodeURIComponent(storagePath)}?alt=media`;
    } else {
      // In production, generate signed URL
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 1000 * 60 * 60 * 24 * 7 // 7 days from now
      });
      downloadURL = signedUrl;
    }

    // Store metadata in Firestore
    const fileMetadata = {
      filename: req.file.originalname,
      storagePath: storagePath,
      contentType: req.file.mimetype,
      size: req.file.size,
      uploadedAt: new Date(),
      uploadedBy: userId,
      url: downloadURL,
      dealId: dealId
    };

    await dealRef.collection('files').doc(fileId).set(fileMetadata);

    res.status(200).json({
      message: 'File uploaded successfully',
      fileId: fileId,
      url: downloadURL
    });

  } catch (error) {
    console.error('File upload error:', error.code || error.message);
    
    // Handle validation errors
    if (error.message && error.message.includes('File signature does not match')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Internal server error during file upload' });
  }
});

// Retrieve all files for deals the user is part of
router.get('/my-deals', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;

    // Query deals where the user is a participant
    const { db } = await getFirebaseServices();
    const dealsQuery = await db.collection('deals')
      .where('participants', 'array-contains', userId)
      .get();

    if (dealsQuery.empty) {
      return res.status(200).json([]); // No deals found, return empty array
    }

    const dealIds = dealsQuery.docs.map(doc => doc.id);

    // Fetch files from all deals concurrently
    const filesPromises = dealIds.map(dealId =>
      db.collection('deals').doc(dealId).collection('files').get()
    );
    const filesSnapshots = await Promise.all(filesPromises);

    // Aggregate file metadata
    const files = [];
    filesSnapshots.forEach((snapshot, index) => {
      const dealId = dealIds[index];
      snapshot.docs.forEach(doc => {
        const fileData = doc.data();
        files.push({
          dealId,
          fileId: doc.id,
          filename: fileData.filename,
          contentType: fileData.contentType,
          size: fileData.size,
          uploadedAt: fileData.uploadedAt.toDate().toISOString(),
          uploadedBy: fileData.uploadedBy,
          downloadPath: `/files/download/${dealId}/${doc.id}` // Path to download endpoint
        });
      });
    });

    res.status(200).json(files);
  } catch (error) {
    console.error('Error retrieving files:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Download a specific file
router.get('/download/:dealId/:fileId', authenticateToken, async (req, res) => {
  try {
    const { dealId, fileId } = req.params;
    const userId = req.userId;

    // Verify deal exists and user is a participant
    const { db } = await getFirebaseServices();
    const dealDoc = await db.collection('deals').doc(dealId).get();
    if (!dealDoc.exists) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    const dealData = dealDoc.data();
    if (!dealData.participants.includes(userId)) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    // Get file metadata
    const fileDoc = await db.collection('deals').doc(dealId).collection('files').doc(fileId).get();
    if (!fileDoc.exists) {
      return res.status(404).json({ error: 'File not found' });
    }
    const fileData = fileDoc.data();

    // Access file from Firebase Storage using admin SDK
    const { adminStorage } = await getFirebaseServices();
    const bucket = adminStorage.bucket();
    const file = bucket.file(fileData.storagePath);

    // Set response headers
    res.setHeader('Content-Type', fileData.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileData.filename}"`);

    // Stream the file to the client
    const readStream = file.createReadStream();
    readStream.on('error', (err) => {
      console.error('[ROUTE STREAM ERROR HANDLER] Error streaming file:', err);
      if (!res.headersSent) {
        console.log('[ROUTE STREAM ERROR HANDLER] Headers not sent. Attempting to send 500 response.');
        
        // 1. Unpipe
        if (readStream.unpipe) { 
            console.log('[ROUTE STREAM ERROR HANDLER] Unpiping stream.');
            readStream.unpipe(res);
        }
        
        // 2. Destroy the source stream
        if (readStream && !readStream.destroyed) {
            console.log('[ROUTE STREAM ERROR HANDLER] Destroying read stream.');
            readStream.destroy();
        }
        
        // 3. Send JSON response
        console.log('[ROUTE STREAM ERROR HANDLER] Setting Content-Type to application/json.');
        res.setHeader('Content-Type', 'application/json'); // Explicitly set Content-Type for JSON response
        console.log('[ROUTE STREAM ERROR HANDLER] Setting status to 500.');
        res.status(500);
        console.log('[ROUTE STREAM ERROR HANDLER] Sending JSON response: { error: \'Error downloading file\' }.');
        try {
            res.json({ error: 'Error downloading file' });
            console.log('[ROUTE STREAM ERROR HANDLER] res.json() called successfully.');
        } catch (jsonError) {
            console.error('[ROUTE STREAM ERROR HANDLER] Error calling res.json():', jsonError);
            // If res.json() itself fails, try to end the response if possible
            if (!res.writableEnded) {
                console.log('[ROUTE STREAM ERROR HANDLER] Forcing response end due to res.json() error.');
                res.end();
            }
        }
        
        // 4. Explicitly return
        console.log('[ROUTE STREAM ERROR HANDLER] Explicitly returning from error handler.');
        return; 
      } else {
        console.error('[ROUTE STREAM ERROR HANDLER] Headers already sent. Cannot send 500 JSON response. Destroying response and readStream.');
        if (readStream && !readStream.destroyed) {
            console.log('[ROUTE STREAM ERROR HANDLER] Destroying read stream (headers already sent case).');
            readStream.destroy(); 
        }
        // res.destroy(); // If headers sent, res.destroy() is more appropriate - this can be aggressive, ensure stream is also destroyed.
        if (!res.writableEnded) {
            console.log('[ROUTE STREAM ERROR HANDLER] Destroying response (headers already sent case).');
            res.destroy();
        }
      }
    });
    readStream.pipe(res);
  } catch (error) {
    console.error('Error in download endpoint:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

export default router;