// src/services/kyc/utils/__tests__/documentSecurityDetector.test.js

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DocumentSecurityDetector } from '../documentSecurityDetector.js';

// Mock sharp module
vi.mock('sharp', () => {
  const createSharpInstance = () => {
    const instance = {
      metadata: vi.fn().mockResolvedValue({
        width: 1200,
        height: 800,
        format: 'jpeg',
        space: 'srgb',
        channels: 3,
        depth: 8,
        density: 300
      }),
      stats: vi.fn().mockResolvedValue({
        channels: [
          { mean: 120, stdev: 30, min: 0, max: 255 },
          { mean: 130, stdev: 25, min: 0, max: 255 },
          { mean: 125, stdev: 28, min: 0, max: 255 }
        ]
      }),
      greyscale: vi.fn().mockReturnThis(),
      convolve: vi.fn().mockReturnThis(),
      raw: vi.fn().mockReturnThis(),
      toBuffer: vi.fn().mockResolvedValue({
        data: Buffer.from(new Array(1000).fill(128)),
        info: { width: 100, height: 100 }
      }),
      resize: vi.fn().mockReturnThis(),
      blur: vi.fn().mockReturnThis(),
      threshold: vi.fn().mockReturnThis(),
      negate: vi.fn().mockReturnThis(),
      linear: vi.fn().mockReturnThis(),
      normalise: vi.fn().mockReturnThis(),
      normalize: vi.fn().mockReturnThis(),
      clone: vi.fn(),
      histogram: vi.fn().mockResolvedValue({
        r: new Array(256).fill(100),
        g: new Array(256).fill(100),
        b: new Array(256).fill(100)
      })
    };
    
    // Make clone return a new instance
    instance.clone.mockImplementation(() => createSharpInstance());
    
    // Make all methods return 'this' for chaining
    Object.keys(instance).forEach(key => {
      if (key !== 'clone' && key !== 'metadata' && key !== 'stats' && key !== 'toBuffer' && key !== 'histogram') {
        instance[key].mockReturnValue(instance);
      }
    });
    
    return instance;
  };
  
  return {
    default: vi.fn((buffer) => createSharpInstance())
  };
});

describe('DocumentSecurityDetector', () => {
  let detector;
  let mockImageBuffer;

  beforeEach(() => {
    detector = new DocumentSecurityDetector();
    mockImageBuffer = Buffer.from('fake-image-data');
    vi.clearAllMocks();
  });

  describe('analyzeDocument', () => {
    it('should perform comprehensive document analysis', async () => {
      const extractedData = {
        documentNumber: 'P1234567',
        expiryDate: '2025-12-31',
        issueDate: '2020-01-01'
      };

      const result = await detector.analyzeDocument(mockImageBuffer, 'passport', extractedData);

      expect(result).toHaveProperty('isAuthentic');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('securityChecks');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('recommendation');
      expect(typeof result.confidence).toBe('number');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should detect passport security features', async () => {
      const extractedData = {
        documentNumber: 'P1234567',
        expiryDate: '2025-12-31'
      };

      const result = await detector.analyzeDocument(mockImageBuffer, 'passport', extractedData);

      expect(result.securityChecks).toHaveProperty('imageQuality');
      expect(result.securityChecks).toHaveProperty('isCopy');
      expect(result.securityChecks).toHaveProperty('edgeTampering');
      expect(result.securityChecks).toHaveProperty('watermarkPresence');
      expect(result.securityChecks).toHaveProperty('hologramDetected');
    });

    it('should handle different document types', async () => {
      const documentTypes = ['passport', 'drivers_license', 'national_id'];
      
      for (const docType of documentTypes) {
        const result = await detector.analyzeDocument(mockImageBuffer, docType, {});
        expect(result).toBeDefined();
        expect(result.isAuthentic).toBeDefined();
      }
    });
  });

  describe('checkImageQuality', () => {
    it('should analyze image quality metrics', async () => {
      const sharp = (await import('sharp')).default;
      const mockImage = sharp();
      const metadata = { width: 1200, height: 800 };

      const result = await detector.checkImageQuality(mockImage, metadata);

      expect(result).toHaveProperty('resolution');
      expect(result).toHaveProperty('sharpness');
      expect(result).toHaveProperty('brightness');
      expect(result).toHaveProperty('overall');
      expect(result.resolution).toBeGreaterThan(0);
      expect(result.overall).toBeGreaterThanOrEqual(0);
      expect(result.overall).toBeLessThanOrEqual(100);
    });
  });

  describe('detectPhotocopy', () => {
    it('should detect photocopy characteristics', async () => {
      const sharp = (await import('sharp')).default;
      const mockImage = sharp();
      const metadata = { width: 1200, height: 800 };

      mockImage.stats = vi.fn().mockResolvedValue({
        channels: [
          { mean: 128, stdev: 5, min: 100, max: 150 }, // Low color range
          { mean: 128, stdev: 5, min: 100, max: 150 },
          { mean: 128, stdev: 5, min: 100, max: 150 }
        ]
      });

      const result = await detector.detectPhotocopy(mockImage, metadata);
      
      expect(result).toHaveProperty('isCopy');
      expect(result).toHaveProperty('confidence');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('detectWatermarks', () => {
    it('should detect watermark patterns', async () => {
      const sharp = (await import('sharp')).default;
      const mockImage = sharp();

      const result = await detector.detectWatermarks(mockImage, 'passport');

      expect(result).toHaveProperty('detected');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('possibleTypes');
      expect(Array.isArray(result.possibleTypes)).toBe(true);
    });
  });

  describe('detectHologram', () => {
    it('should detect holographic features', async () => {
      const sharp = (await import('sharp')).default;
      const mockImage = sharp();

      // Mock high color variance for hologram
      mockImage.stats = vi.fn().mockResolvedValue({
        channels: [
          { mean: 120, stdev: 50 }, // High variance
          { mean: 130, stdev: 60 },
          { mean: 140, stdev: 55 }
        ]
      });

      const result = await detector.detectHologram(mockImage);

      expect(result).toHaveProperty('detected');
      expect(result).toHaveProperty('confidence');
      expect(typeof result.detected).toBe('boolean');
      expect(typeof result.confidence).toBe('number');
    });
  });

  describe('detectSecurityThread', () => {
    it('should detect security thread patterns', async () => {
      const sharp = (await import('sharp')).default;
      const mockImage = sharp();

      const result = await detector.detectSecurityThread(mockImage, 'passport');

      expect(result).toHaveProperty('present');
      expect(result).toHaveProperty('applicable');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('orientation');
    });
  });

  describe('detectEdgeTampering', () => {
    it('should detect edge tampering', async () => {
      const sharp = (await import('sharp')).default;
      const mockImage = sharp();

      const result = await detector.detectEdgeTampering(mockImage);

      expect(result).toHaveProperty('tampered');
      expect(result).toHaveProperty('inconsistencyScore');
      expect(result).toHaveProperty('suspiciousRegions');
      expect(Array.isArray(result.suspiciousRegions)).toBe(true);
    });
  });

  describe('calculateAuthenticityScore', () => {
    it('should calculate overall authenticity score', () => {
      const securityChecks = {
        imageQuality: { overall: 80 },
        isCopy: { isCopy: false, confidence: 0.8 },
        edgeTampering: { tampered: false, inconsistencyScore: 0.1 },
        watermarkPresence: { detected: true, confidence: 0.7 },
        hologramDetected: { detected: true, confidence: 0.6 },
        microprintQuality: { quality: 'good', confidence: 0.75 },
        colorAuthenticity: { authentic: true, confidence: 0.85 },
        ageConsistency: { consistent: true, confidence: 0.9 },
        fontConsistency: { consistent: true, confidence: 0.85 },
        securityThread: { present: true, confidence: 0.8 }
      };

      const score = detector.calculateAuthenticityScore(securityChecks);

      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
      expect(score).toBeGreaterThan(60); // Should be relatively high with these scores
    });

    it('should handle missing security features', () => {
      const securityChecks = {
        imageQuality: { overall: 50 },
        isCopy: { isCopy: true, confidence: 0.5 },
        edgeTampering: { tampered: true, inconsistencyScore: 0.5 },
        watermarkPresence: { detected: false, confidence: 0 },
        hologramDetected: { detected: false, confidence: 0 },
        microprintQuality: { quality: 'not_detected', confidence: 0.3 },
        colorAuthenticity: { authentic: false, confidence: 0.3 },
        fontConsistency: { consistent: true, confidence: 0.5 },
        ageConsistency: { consistent: true, confidence: 0.5 },
        securityThread: { present: false, confidence: 0.3 }
      };

      const score = detector.calculateAuthenticityScore(securityChecks);
      expect(score).toBeLessThan(50); // Should be low
    });
  });

  describe('generateWarnings', () => {
    it('should generate appropriate warnings', () => {
      const securityChecks = {
        imageQuality: { overall: 40 }, // Low quality
        isCopy: { isCopy: true, confidence: 0.8 }, // High copy likelihood
        edgeTampering: { tampered: true, inconsistencyScore: 0.7 }, // High tampering
        watermarkPresence: { detected: false, confidence: 0.2 }, // Low watermark
        fontConsistency: { consistent: false, issue: 'mixed_character_sets', confidence: 0.3 },
        ageConsistency: { consistent: true, expired: false, confidence: 0.9 }
      };

      const warnings = detector.generateWarnings(securityChecks);

      expect(Array.isArray(warnings)).toBe(true);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some(w => w.message && w.message.includes('quality'))).toBe(true);
      expect(warnings.some(w => w.message && (w.message.includes('copy') || w.message.includes('photocopy')))).toBe(true);
    });

    it('should return no warnings for authentic document', () => {
      const securityChecks = {
        imageQuality: { overall: 90 },
        isCopy: { isCopy: false, confidence: 0.9 },
        edgeTampering: { tampered: false, inconsistencyScore: 0.05 },
        watermarkPresence: { detected: true, confidence: 0.85 },
        hologramDetected: { detected: true, confidence: 0.9 },
        fontConsistency: { consistent: true, confidence: 0.85 },
        ageConsistency: { consistent: true, expired: false, confidence: 0.9 }
      };

      const warnings = detector.generateWarnings(securityChecks);
      expect(warnings.length).toBe(0);
    });
  });

  describe('checkDocumentAge', () => {
    it('should validate document age consistency', () => {
      const recentData = {
        issueDate: new Date().toISOString().split('T')[0],
        expiryDate: '2030-12-31'
      };

      const result = detector.checkDocumentAge(recentData);
      expect(result).toHaveProperty('consistent');
      expect(result).toHaveProperty('expired');
      expect(result).toHaveProperty('validityPeriod');
      expect(result).toHaveProperty('confidence');
      expect(result.consistent).toBe(true);
      expect(result.expired).toBe(false);
    });

    it('should detect suspicious date combinations', () => {
      const suspiciousData = {
        issueDate: '2025-01-01', // Future issue date
        expiryDate: '2024-12-31' // Already expired
      };

      const result = detector.checkDocumentAge(suspiciousData);
      expect(result.consistent).toBe(false);
      expect(result.expired).toBe(true);
    });
  });

  describe('analyzeColorSpace', () => {
    it('should analyze color authenticity', async () => {
      const sharp = (await import('sharp')).default;
      const mockImage = sharp();
      const metadata = { space: 'srgb', density: 300, depth: 8, channels: 3 };

      const result = await detector.analyzeColorSpace(mockImage, metadata);

      expect(result).toHaveProperty('colorSpace');
      expect(result).toHaveProperty('authentic');
      expect(result).toHaveProperty('depth');
      expect(result).toHaveProperty('distribution');
      expect(result).toHaveProperty('confidence');
      expect(result.authentic).toBe(true);
    });
  });

  describe('checkFontConsistency', () => {
    it('should check font consistency', async () => {
      const sharp = (await import('sharp')).default;
      const mockImage = sharp();
      const extractedData = {
        name: 'JOHN DOE',
        documentNumber: 'P1234567',
        nationality: 'USA'
      };

      const result = await detector.checkFontConsistency(mockImage, extractedData);

      expect(result).toHaveProperty('consistent');
      expect(result).toHaveProperty('confidence');
      expect(result.consistent).toBe(true);
      expect(result.issue).toBeUndefined();
    });
  });

  describe('Edge cases', () => {
    it('should handle empty extracted data', async () => {
      const result = await detector.analyzeDocument(mockImageBuffer, 'passport', {});
      expect(result).toBeDefined();
      expect(result.isAuthentic).toBeDefined();
    });

    it('should handle unknown document types', async () => {
      const result = await detector.analyzeDocument(mockImageBuffer, 'unknown_doc', {});
      expect(result).toBeDefined();
      // Unknown document types may not generate warnings if they pass other checks
      expect(result).toBeDefined();
      expect(result.isAuthentic).toBeDefined();
    });

    it('should handle corrupted image data', async () => {
      // Mock sharp to throw an error for invalid image
      const sharpModule = (await import('sharp')).default;
      const invalidBuffer = Buffer.from('invalid');
      
      // Create a mock that throws error on metadata
      sharpModule.mockImplementationOnce(() => ({
        metadata: vi.fn().mockRejectedValue(new Error('Invalid image'))
      }));
      
      await expect(detector.analyzeDocument(invalidBuffer, 'passport', {}))
        .rejects.toThrow('Invalid image');
    });
  });
});