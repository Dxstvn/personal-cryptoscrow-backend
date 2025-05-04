import express from 'express';
import multer from 'multer';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage as getAdminStorage } from 'firebase-admin/storage';
import { ethEscrowApp } from '../auth/authIndex.js';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { adminApp } from '../auth/admin.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const storage = getStorage(ethEscrowApp);
const db = getFirestore(adminApp);

// Authentication middleware
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const auth = getAdminAuth(adminApp);
    const decodedToken = await auth.verifyIdToken(token);
    req.userId = decodedToken.uid;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// Upload endpoint
router.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { dealId } = req.body;
    const userId = req.userId;
    if (!req.file || !dealId || !userId) {
      return res.status(400).json({ error: 'Missing file, dealId, or userId' });
    }

    // Check if deal exists
    const dealRef = db.collection('deals').doc(dealId);
    const dealDoc = await dealRef.get();
    if (!dealDoc.exists) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    // Restrict file types
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Invalid file type' });
    }

    // Generate unique filename with dealId prefix
    
    // In the POST /upload route, after generating the filename and uploading the file
  const filename = `deals/${dealId}/${uuidv4()}-${req.file.originalname}`;
  const storageRef = ref(storage, filename);
  await uploadBytes(storageRef, req.file.buffer, { contentType: req.file.mimetype });
  const publicUrl = await getDownloadURL(storageRef);

  // Store metadata in Firestore, including storagePath
  const fileRef = await dealRef.collection('files').add({
    filename: req.file.originalname,
    storagePath: filename, // Add the full storage path
    url: publicUrl,
    contentType: req.file.mimetype,
    size: req.file.size,
    uploadedAt: new Date(),
    uploadedBy: userId,
});

    res.status(200).json({
      message: 'File uploaded successfully',
      fileId: fileRef.id,
      url: publicUrl,
    });
  } catch (error) {
    console.error('Error in upload route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Retrieve all files for deals the user is part of
router.get('/my-deals', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;

    // Query deals where the user is a participant
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
    const adminStorage = getAdminStorage(adminApp);
    const bucket = adminStorage.bucket();
    const file = bucket.file(fileData.storagePath);

    // Set response headers
    res.setHeader('Content-Type', fileData.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileData.filename}"`);

    // Stream the file to the client
    const readStream = file.createReadStream();
    readStream.on('error', (err) => {
      console.error('Error streaming file:', err);
      if (!res.headersSent) {
        res.status(500).send('Error downloading file');
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