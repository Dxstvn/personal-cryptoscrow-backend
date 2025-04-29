import express from 'express';
import multer from 'multer';
import { Storage } from '@google-cloud/storage';
import { getFirestore } from 'firebase/firestore';
import { ethEscrowApp } from '../auth/authIndex.js';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { adminApp } from '../auth/admin.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const storage = new Storage();
const bucket = storage.bucket(process.env.FIREBASE_STORAGE_BUCKET);
const db = getFirestore(ethEscrowApp);

// Simple Firebase Auth middleware
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
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// Upload endpoint: requires dealId in body, userId from auth
router.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { dealId } = req.body;
    const userId = req.userId;
    if (!req.file || !dealId || !userId) {
      return res.status(400).json({ error: 'Missing file, dealId, or userId' });
    }

    // Create a unique filename
    const filename = `${Date.now()}-${req.file.originalname}`;
    const file = bucket.file(filename);

    // Create a write stream to upload the file
    const stream = file.createWriteStream({
      metadata: {
        contentType: req.file.mimetype,
      },
    });

    stream.on('error', (err) => {
      console.error('Error uploading file:', err);
      res.status(500).json({ error: 'Error uploading file' });
    });

    stream.on('finish', async () => {
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
      // Store in subcollection under the deal
      const fileRef = await db
        .collection('deals')
        .doc(dealId)
        .collection('files')
        .add({
          filename: req.file.originalname,
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
    });

    stream.end(req.file.buffer);
  } catch (error) {
    console.error('Error in upload route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 