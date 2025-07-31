// src/services/kyc/secureFileStorageService.js

import { getStorage } from 'firebase-admin/storage';
import { getAdminApp } from '../../api/routes/auth/admin.js';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../databaseService.js';

/**
 * Secure File Storage Service
 * Handles encrypted file storage for KYC documents
 */
export class SecureFileStorageService {
  constructor() {
    this.bucket = null;
    this.initialized = false;
    this.encryptionKey = process.env.KYC_ENCRYPTION_KEY || crypto.randomBytes(32);
  }

  /**
   * Initialize storage bucket
   */
  async initialize() {
    if (this.initialized) return;

    try {
      const adminApp = await getAdminApp();
      const storage = getStorage(adminApp);
      this.bucket = storage.bucket();
      
      this.initialized = true;
      console.log('[SecureFileStorage] Service initialized');
    } catch (error) {
      console.error('[SecureFileStorage] Initialization error:', error);
      throw error;
    }
  }

  /**
   * Upload and encrypt KYC document
   * @param {Buffer} fileBuffer - File data
   * @param {Object} metadata - File metadata
   * @returns {Promise<Object>} Upload result
   */
  async uploadDocument(fileBuffer, metadata) {
    try {
      await this.initialize();

      // Validate file
      await this.validateFile(fileBuffer, metadata);

      // Generate unique file ID
      const fileId = uuidv4();
      const timestamp = Date.now();
      
      // Encrypt file
      const encryptedData = await this.encryptFile(fileBuffer);
      
      // Generate file path
      const filePath = this.generateFilePath(metadata.userId, metadata.documentType, fileId);
      
      // Create file reference
      const file = this.bucket.file(filePath);
      
      // Upload encrypted file
      await file.save(encryptedData.encrypted, {
        metadata: {
          contentType: 'application/octet-stream',
          metadata: {
            originalName: this.sanitizeFilename(metadata.filename),
            documentType: metadata.documentType,
            userId: metadata.userId,
            uploadedAt: new Date().toISOString(),
            encrypted: 'true',
            iv: encryptedData.iv,
            authTag: encryptedData.authTag,
            fileHash: encryptedData.originalHash
          }
        },
        resumable: false,
        validation: 'crc32c'
      });

      // Set access control
      await this.setFilePermissions(file);

      // Store document hash to prevent duplicates
      await this.storeDocumentHash(encryptedData.originalHash, metadata);

      // Generate signed URL for temporary access (24 hours)
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
      });

      const result = {
        fileId,
        filePath,
        signedUrl,
        uploadedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        metadata: {
          size: fileBuffer.length,
          encrypted: true,
          documentType: metadata.documentType
        }
      };

      console.log(`[SecureFileStorage] Document uploaded: ${fileId}`);
      
      return result;
    } catch (error) {
      console.error('[SecureFileStorage] Upload error:', error);
      throw error;
    }
  }

  /**
   * Download and decrypt KYC document
   * @param {string} filePath - File path in storage
   * @param {string} userId - User ID for access control
   * @returns {Promise<Buffer>} Decrypted file data
   */
  async downloadDocument(filePath, userId) {
    try {
      await this.initialize();

      const file = this.bucket.file(filePath);
      
      // Check if file exists
      const [exists] = await file.exists();
      if (!exists) {
        throw new Error('Document not found');
      }

      // Get file metadata
      const [metadata] = await file.getMetadata();
      
      // Verify access permissions
      if (metadata.metadata.userId !== userId) {
        throw new Error('Access denied');
      }

      // Download encrypted file
      const [encryptedData] = await file.download();
      
      // Decrypt file
      const decryptedData = await this.decryptFile(
        encryptedData,
        metadata.metadata.iv,
        metadata.metadata.authTag
      );

      // Verify file integrity
      const hash = crypto.createHash('sha256').update(decryptedData).digest('hex');
      if (hash !== metadata.metadata.fileHash) {
        throw new Error('File integrity check failed');
      }

      console.log(`[SecureFileStorage] Document downloaded: ${filePath}`);
      
      return decryptedData;
    } catch (error) {
      console.error('[SecureFileStorage] Download error:', error);
      throw error;
    }
  }

  /**
   * Delete KYC document
   * @param {string} filePath - File path in storage
   * @param {string} userId - User ID for access control
   */
  async deleteDocument(filePath, userId) {
    try {
      await this.initialize();

      const file = this.bucket.file(filePath);
      
      // Get file metadata
      const [metadata] = await file.getMetadata();
      
      // Verify access permissions
      if (metadata.metadata.userId !== userId) {
        throw new Error('Access denied');
      }

      // Delete file
      await file.delete();
      
      console.log(`[SecureFileStorage] Document deleted: ${filePath}`);
    } catch (error) {
      console.error('[SecureFileStorage] Delete error:', error);
      throw error;
    }
  }

  /**
   * Validate file before upload
   */
  async validateFile(fileBuffer, metadata) {
    // Check file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (fileBuffer.length > maxSize) {
      throw new Error('File size exceeds 10MB limit');
    }

    // Validate file type by magic numbers
    const fileType = await this.detectFileType(fileBuffer);
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    
    if (!allowedTypes.includes(fileType)) {
      throw new Error(`Invalid file type: ${fileType}`);
    }

    // Check for duplicate uploads
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const isDuplicate = await this.checkDuplicateDocument(hash);
    
    if (isDuplicate) {
      throw new Error('Document has already been uploaded');
    }

    return true;
  }

  /**
   * Detect file type by magic numbers
   */
  async detectFileType(buffer) {
    const magicNumbers = {
      'ffd8ffe0': 'image/jpeg',
      'ffd8ffe1': 'image/jpeg',
      'ffd8ffe2': 'image/jpeg',
      '89504e47': 'image/png',
      '25504446': 'application/pdf'
    };

    const header = buffer.slice(0, 4).toString('hex');
    
    for (const [magic, type] of Object.entries(magicNumbers)) {
      if (header.startsWith(magic)) {
        return type;
      }
    }

    return 'unknown';
  }

  /**
   * Encrypt file data
   */
  async encryptFile(buffer) {
    const algorithm = 'aes-256-gcm';
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, this.encryptionKey, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(buffer),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    const originalHash = crypto.createHash('sha256').update(buffer).digest('hex');
    
    return {
      encrypted,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      originalHash
    };
  }

  /**
   * Decrypt file data
   */
  async decryptFile(encryptedBuffer, ivBase64, authTagBase64) {
    const algorithm = 'aes-256-gcm';
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');
    
    const decipher = crypto.createDecipheriv(algorithm, this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([
      decipher.update(encryptedBuffer),
      decipher.final()
    ]);
    
    return decrypted;
  }

  /**
   * Generate secure file path
   */
  generateFilePath(userId, documentType, fileId) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    
    return `kyc-documents/${year}/${month}/${userId}/${documentType}/${fileId}`;
  }

  /**
   * Sanitize filename
   */
  sanitizeFilename(filename) {
    // Remove path traversal attempts and special characters
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/\.{2,}/g, '.')
      .substring(0, 255);
  }

  /**
   * Set file permissions
   */
  async setFilePermissions(file) {
    try {
      // Make file private - only accessible via signed URLs
      await file.makePrivate();
    } catch (error) {
      console.error('[SecureFileStorage] Error setting permissions:', error);
    }
  }

  /**
   * Store document hash to prevent duplicates
   */
  async storeDocumentHash(hash, metadata) {
    try {
      const db = await getDb();
      await db.collection('documentHashes').add({
        hash,
        userId: metadata.userId,
        documentType: metadata.documentType,
        uploadedAt: new Date(),
        metadata: {
          fileName: this.sanitizeFilename(metadata.filename),
          fileSize: metadata.size,
          mimeType: metadata.mimeType
        }
      });
    } catch (error) {
      console.error('[SecureFileStorage] Error storing document hash:', error);
    }
  }

  /**
   * Check for duplicate documents
   */
  async checkDuplicateDocument(hash) {
    try {
      const db = await getDb();
      const snapshot = await db.collection('documentHashes')
        .where('hash', '==', hash)
        .limit(1)
        .get();
      
      return !snapshot.empty;
    } catch (error) {
      console.error('[SecureFileStorage] Error checking duplicate:', error);
      return false;
    }
  }

  /**
   * Generate temporary access URL
   * @param {string} filePath - File path in storage
   * @param {number} expirationMinutes - URL expiration time in minutes
   */
  async generateTemporaryUrl(filePath, expirationMinutes = 60) {
    try {
      await this.initialize();

      const file = this.bucket.file(filePath);
      
      // Check if file exists
      const [exists] = await file.exists();
      if (!exists) {
        throw new Error('Document not found');
      }

      // Generate signed URL
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + expirationMinutes * 60 * 1000
      });

      return {
        url: signedUrl,
        expiresAt: new Date(Date.now() + expirationMinutes * 60 * 1000).toISOString()
      };
    } catch (error) {
      console.error('[SecureFileStorage] Error generating URL:', error);
      throw error;
    }
  }

  /**
   * Cleanup expired documents
   * This should be run periodically (e.g., daily cron job)
   */
  async cleanupExpiredDocuments() {
    try {
      await this.initialize();

      // List all files in KYC documents folder
      const [files] = await this.bucket.getFiles({
        prefix: 'kyc-documents/',
        autoPaginate: true
      });

      let deletedCount = 0;
      
      for (const file of files) {
        const [metadata] = await file.getMetadata();
        const uploadedAt = new Date(metadata.metadata.uploadedAt);
        const retentionDays = 90; // Keep documents for 90 days
        const expiryDate = new Date(uploadedAt);
        expiryDate.setDate(expiryDate.getDate() + retentionDays);
        
        if (expiryDate < new Date()) {
          await file.delete();
          deletedCount++;
          console.log(`[SecureFileStorage] Deleted expired document: ${file.name}`);
        }
      }

      console.log(`[SecureFileStorage] Cleanup completed. Deleted ${deletedCount} expired documents`);
      
      return { deletedCount };
    } catch (error) {
      console.error('[SecureFileStorage] Cleanup error:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const secureFileStorage = new SecureFileStorageService();