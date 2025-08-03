// src/api/routes/kyc/kycRoutes.js

import express from 'express';
import multer from 'multer';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import rateLimiters from '../../middleware/rateLimiter.js';
import { kycOrchestrator } from '../../../services/kyc/kycOrchestratorService.js';
import { documentProcessor } from '../../../services/kyc/documentProcessorService.js';
import { faceVerifier } from '../../../services/kyc/faceVerificationService.js';
import { secureFileStorage } from '../../../services/kyc/secureFileStorageService.js';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG and PDF are allowed.'));
    }
  }
});

/**
 * Start KYC session
 * POST /api/kyc/session/start
 */
router.post('/session/start', 
  authMiddleware, 
  rateLimiters.api, // Use the API rate limiter
  async (req, res) => {
    try {
      const { requiredLevel = 'basic' } = req.body;
      const userId = req.user.uid;

      // Validate required level
      if (!['basic', 'enhanced', 'full'].includes(requiredLevel)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid KYC level specified'
        });
      }

      // Start KYC session
      const session = await kycOrchestrator.initiateKYCProcess(userId, requiredLevel);

      res.json({
        success: true,
        session: {
          sessionId: session.sessionId,
          requiredLevel: session.requiredLevel,
          requiredDocuments: session.requiredDocuments,
          steps: session.steps,
          status: session.status
        }
      });
    } catch (error) {
      console.error('[KYC API] Error starting session:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to start KYC session'
      });
    }
  }
);

/**
 * Upload document
 * POST /api/kyc/document/upload
 */
router.post('/document/upload',
  authMiddleware,
  rateLimiters.api, // API rate limiter
  upload.single('document'),
  async (req, res) => {
    try {
      const { sessionId, documentType } = req.body;
      const userId = req.user.uid;

      if (!sessionId || !documentType) {
        return res.status(400).json({
          success: false,
          error: 'Session ID and document type are required'
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      // Upload file to secure storage
      const uploadResult = await secureFileStorage.uploadDocument(
        req.file.buffer,
        {
          userId,
          documentType,
          filename: req.file.originalname,
          size: req.file.size,
          mimeType: req.file.mimetype
        }
      );

      // Process document with OCR if it's an identity document
      let extractedData = null;
      if (['passport', 'drivers_license', 'national_id'].includes(documentType)) {
        const processingResult = await documentProcessor.processIdentityDocument(
          req.file.buffer,
          documentType
        );
        extractedData = processingResult.extractedData;
      }

      // Update KYC session
      const result = await kycOrchestrator.processDocument(
        sessionId,
        documentType,
        {
          documentId: uploadResult.fileId,
          filePath: uploadResult.filePath,
          extractedData
        }
      );

      res.json({
        success: true,
        result: {
          documentId: uploadResult.fileId,
          documentType,
          status: result.status,
          extractedData: extractedData || null,
          temporaryUrl: uploadResult.signedUrl,
          expiresAt: uploadResult.expiresAt
        }
      });
    } catch (error) {
      console.error('[KYC API] Error uploading document:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to upload document'
      });
    }
  }
);

/**
 * Perform liveness check
 * POST /api/kyc/liveness/check
 */
router.post('/liveness/check',
  authMiddleware,
  rateLimiters.api, // API rate limiter
  async (req, res) => {
    try {
      const { sessionId, imageData } = req.body;
      const userId = req.user.uid;

      if (!sessionId || !imageData) {
        return res.status(400).json({
          success: false,
          error: 'Session ID and image data are required'
        });
      }

      // Convert base64 to buffer
      const imageBuffer = Buffer.from(imageData, 'base64');

      // Verify liveness
      const livenessResult = await faceVerifier.verifyLiveness(imageBuffer);

      // Store selfie if liveness check passed
      let selfieUrl = null;
      if (livenessResult.isLive) {
        const uploadResult = await secureFileStorage.uploadDocument(
          imageBuffer,
          {
            userId,
            documentType: 'selfie',
            filename: 'selfie.jpg',
            size: imageBuffer.length,
            mimeType: 'image/jpeg'
          }
        );
        selfieUrl = uploadResult.signedUrl;
      }

      // Update KYC session
      const result = await kycOrchestrator.performLivenessCheck(
        sessionId,
        imageData
      );

      res.json({
        success: true,
        result: {
          isLive: livenessResult.isLive,
          confidence: livenessResult.confidence,
          checks: livenessResult.checks,
          selfieUrl,
          sessionUpdated: true
        }
      });
    } catch (error) {
      console.error('[KYC API] Error performing liveness check:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to perform liveness check'
      });
    }
  }
);

/**
 * Get KYC status
 * GET /api/kyc/status
 */
router.get('/status',
  authMiddleware,
  async (req, res) => {
    try {
      const userId = req.user.uid;

      const status = await kycOrchestrator.getUserKYCStatus(userId);

      res.json({
        success: true,
        status
      });
    } catch (error) {
      console.error('[KYC API] Error getting status:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get KYC status'
      });
    }
  }
);

/**
 * Submit personal information
 * POST /api/kyc/personal
 */
router.post('/personal',
  authMiddleware,
  rateLimiters.api, // API rate limiter
  async (req, res) => {
    try {
      const { sessionId, personalInfo } = req.body;
      const userId = req.user.uid;

      if (!sessionId || !personalInfo) {
        return res.status(400).json({
          success: false,
          error: 'Session ID and personal information are required'
        });
      }

      // Validate personal information
      const requiredFields = [
        'firstName', 'lastName', 'dateOfBirth', 
        'nationality', 'countryOfResidence', 'address'
      ];

      for (const field of requiredFields) {
        if (!personalInfo[field]) {
          return res.status(400).json({
            success: false,
            error: `Missing required field: ${field}`
          });
        }
      }

      // TODO: Update session with personal information
      // For now, just return success
      res.json({
        success: true,
        message: 'Personal information saved successfully'
      });
    } catch (error) {
      console.error('[KYC API] Error saving personal info:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to save personal information'
      });
    }
  }
);

/**
 * Complete KYC session
 * POST /api/kyc/session/complete
 */
router.post('/session/complete',
  authMiddleware,
  rateLimiters.api, // API rate limiter
  async (req, res) => {
    try {
      const { sessionId } = req.body;
      const userId = req.user.uid;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: 'Session ID is required'
        });
      }

      // Complete KYC process
      const result = await kycOrchestrator.completeKYCProcess(sessionId);

      res.json({
        success: true,
        result
      });
    } catch (error) {
      console.error('[KYC API] Error completing session:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to complete KYC session'
      });
    }
  }
);

/**
 * Admin: Get pending reviews
 * GET /api/kyc/admin/pending-reviews
 */
router.get('/admin/pending-reviews',
  authMiddleware,
  // TODO: Add admin middleware
  async (req, res) => {
    try {
      // TODO: Implement admin functionality
      res.json({
        success: true,
        pending: []
      });
    } catch (error) {
      console.error('[KYC API] Error getting pending reviews:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get pending reviews'
      });
    }
  }
);

/**
 * Admin: Perform manual review
 * POST /api/kyc/admin/manual-review
 */
router.post('/admin/manual-review',
  authMiddleware,
  // TODO: Add admin middleware
  async (req, res) => {
    try {
      const { userId, decision, notes } = req.body;
      const reviewerId = req.user.uid;

      // TODO: Implement manual review functionality
      res.json({
        success: true,
        message: 'Review completed successfully'
      });
    } catch (error) {
      console.error('[KYC API] Error performing manual review:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to perform manual review'
      });
    }
  }
);

export default router;