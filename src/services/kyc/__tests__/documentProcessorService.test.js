import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DocumentProcessorService } from '../documentProcessorService.js';

// Mock dependencies
vi.mock('tesseract.js', () => ({
  default: {
    createWorker: vi.fn(() => ({
      load: vi.fn(),
      loadLanguage: vi.fn(),
      initialize: vi.fn(),
      recognize: vi.fn(),
      terminate: vi.fn()
    }))
  },
  createWorker: vi.fn(() => ({
    load: vi.fn(),
    loadLanguage: vi.fn(),
    initialize: vi.fn(),
    recognize: vi.fn(),
    terminate: vi.fn()
  }))
}));

vi.mock('canvas', () => ({
  createCanvas: vi.fn(() => ({
    getContext: vi.fn(() => ({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(100) }))
    })),
    width: 640,
    height: 480,
    toBuffer: vi.fn()
  })),
  loadImage: vi.fn()
}));

// Mock crypto
vi.mock('crypto', async () => ({
  ...(await vi.importActual('crypto')),
  createHash: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn(() => 'mock-hash')
  }))
}));

describe('DocumentProcessorService', () => {
  let documentProcessor;
  let mockWorker;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Setup Tesseract mock
    const Tesseract = await import('tesseract.js');
    mockWorker = {
      load: vi.fn().mockResolvedValue(),
      loadLanguage: vi.fn().mockResolvedValue(),
      initialize: vi.fn().mockResolvedValue(),
      recognize: vi.fn(),
      terminate: vi.fn().mockResolvedValue()
    };
    if (Tesseract.default && Tesseract.default.createWorker) {
      Tesseract.default.createWorker.mockReturnValue(mockWorker);
    } else {
      Tesseract.createWorker.mockReturnValue(mockWorker);
    }
    
    documentProcessor = new DocumentProcessorService();
    await documentProcessor.initialize();
  });

  afterEach(async () => {
    await documentProcessor.cleanup();
  });

  describe('processIdentityDocument', () => {
    it('should process passport successfully', async () => {
      const mockImageBuffer = Buffer.from('mock-passport-image');
      
      mockWorker.recognize.mockResolvedValue({
        data: {
          text: `PASSPORT
United States of America
P<USADOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
AB12345670USA9001011M3001011<<<<<<<<<<<<<<00`,
          confidence: 95
        }
      });

      const result = await documentProcessor.processIdentityDocument(mockImageBuffer, 'passport');

      expect(result).toMatchObject({
        documentType: 'passport',
        extractedData: {
          fullName: expect.any(String),
          documentNumber: expect.stringMatching(/^[A-Z0-9]+$/),
          dateOfBirth: expect.any(String),
          expiryDate: expect.any(String),
          nationality: expect.any(String)
        },
        confidence: expect.any(Number),
        mrzData: expect.any(Object)
      });

      expect(mockWorker.recognize).toHaveBeenCalled();
    });

    it('should process driver license successfully', async () => {
      const mockImageBuffer = Buffer.from('mock-license-image');
      
      mockWorker.recognize.mockResolvedValue({
        data: {
          text: `DRIVER LICENSE
DL: 123456789
NAME: JOHN DOE
DOB: 01/01/1990
EXP: 01/01/2030
ADDRESS: 123 MAIN ST
ANYTOWN, CA 12345`,
          confidence: 90
        }
      });

      const result = await documentProcessor.processIdentityDocument(mockImageBuffer, 'drivers_license');

      expect(result).toMatchObject({
        documentType: 'drivers_license',
        extractedData: {
          fullName: 'JOHN DOE',
          documentNumber: '123456789',
          dateOfBirth: '1990-01-01',
          expiryDate: '2030-01-01',
          address: expect.stringContaining('123 MAIN ST')
        },
        confidence: expect.any(Number)
      });
    });

    it('should process national ID successfully', async () => {
      const mockImageBuffer = Buffer.from('mock-id-image');
      
      mockWorker.recognize.mockResolvedValue({
        data: {
          text: `
            NATIONAL IDENTITY CARD
            ID NO: 123-45-6789
            NAME: JOHN DOE
            DATE OF BIRTH: 01/01/1990
            VALID UNTIL: 01/01/2030
          `,
          confidence: 92
        }
      });

      const result = await documentProcessor.processIdentityDocument(mockImageBuffer, 'national_id');

      expect(result).toMatchObject({
        documentType: 'national_id',
        extractedData: {
          fullName: 'JOHN DOE',
          documentNumber: '123-45-6789',
          dateOfBirth: '1990-01-01',
          expiryDate: '2030-01-01'
        }
      });
    });

    it('should handle OCR failure gracefully', async () => {
      mockWorker.recognize.mockRejectedValue(new Error('OCR processing failed'));

      await expect(
        documentProcessor.processIdentityDocument(Buffer.from('bad-image'), 'passport')
      ).rejects.toThrow('OCR processing failed');
    });

    it('should reject low confidence OCR results', async () => {
      mockWorker.recognize.mockResolvedValue({
        data: {
          text: 'Some unclear text',
          confidence: 30 // Low confidence
        }
      });

      await expect(
        documentProcessor.processIdentityDocument(Buffer.from('blurry-image'), 'passport')
      ).rejects.toThrow('Document quality too low');
    });

    it('should validate document type', async () => {
      await expect(
        documentProcessor.processIdentityDocument(Buffer.from('image'), 'invalid_type')
      ).rejects.toThrow('Unsupported document type');
    });
  });

  // Note: extractMRZData is a private method, tested through processIdentityDocument

  describe('verifyDocumentAuthenticity', () => {
    it('should verify authentic document', async () => {
      const documentData = {
        text: 'Clear text with consistent formatting',
        confidence: 95,
        extractedData: {
          documentNumber: 'AB1234567',
          expiryDate: '2030-01-01'
        },
        mrzData: {
          checksumValid: true
        }
      };

      const result = await documentProcessor.verifyDocumentAuthenticity(documentData);

      expect(result).toMatchObject({
        isAuthentic: true,
        confidence: expect.any(Number),
        checks: {
          textClarity: true,
          formatConsistency: true,
          securityFeatures: true,
          dataValidation: true
        }
      });

      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should detect expired documents', async () => {
      const documentData = {
        extractedData: {
          expiryDate: '2020-01-01' // Expired
        }
      };

      const result = await documentProcessor.verifyDocumentAuthenticity(documentData);

      expect(result.isAuthentic).toBe(false);
      expect(result.issues).toContain('Document expired');
    });

    it('should detect suspicious patterns', async () => {
      const documentData = {
        text: 'FAKE DOCUMENT FAKE ID COUNTERFEIT',
        confidence: 50,
        extractedData: {}
      };

      const result = await documentProcessor.verifyDocumentAuthenticity(documentData);

      expect(result.isAuthentic).toBe(false);
      expect(result.confidence).toBeLessThanOrEqual(0.5);
    });
  });

  describe('processAddressProof', () => {
    it('should extract address from utility bill', async () => {
      const mockImageBuffer = Buffer.from('mock-utility-bill');
      
      mockWorker.recognize.mockResolvedValue({
        data: {
          text: `
            ELECTRIC COMPANY
            BILL TO:
            JOHN DOE
            123 MAIN STREET
            APARTMENT 4B
            ANYTOWN, CA 12345
            
            ACCOUNT: 123456789
            BILL DATE: 06/15/2025
            DUE DATE: 07/15/2025
          `,
          confidence: 88
        }
      });

      const result = await documentProcessor.processAddressProof(mockImageBuffer, 'utility_bill');

      expect(result).toMatchObject({
        documentType: 'utility_bill',
        extractedData: {
          name: 'JOHN DOE',
          address: expect.stringContaining('123 MAIN STREET'),
          issueDate: '2025-06-15',
          accountNumber: '123456789'
        },
        isValid: true
      });
    });

    it('should validate document recency', async () => {
      const oldDate = new Date();
      oldDate.setMonth(oldDate.getMonth() - 4); // 4 months old

      mockWorker.recognize.mockResolvedValue({
        data: {
          text: `BILL DATE: ${oldDate.toLocaleDateString()}`,
          confidence: 90
        }
      });

      const result = await documentProcessor.processAddressProof(Buffer.from('old-bill'), 'utility_bill');

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Document too old');
    });
  });

  describe('preprocessImage', () => {
    it('should enhance image quality', async () => {
      const canvas = await import('canvas');
      const mockContext = {
        drawImage: vi.fn(),
        filter: '',
        globalAlpha: 1
      };
      const mockCanvas = {
        getContext: vi.fn(() => mockContext),
        toBuffer: vi.fn(() => Buffer.from('enhanced-image')),
        width: 640,
        height: 480
      };
      canvas.createCanvas.mockReturnValue(mockCanvas);
      canvas.loadImage.mockResolvedValue({ width: 640, height: 480 });

      const result = await documentProcessor.preprocessImage(Buffer.from('original-image'));

      expect(result).toBeInstanceOf(Buffer);
      expect(mockCanvas.getContext).toHaveBeenCalledWith('2d');
    });
  });

  // Note: detectDocumentType is a private method, tested through processIdentityDocument

  // Note: validateExtractedData is a private method, tested through processIdentityDocument

  // Note: parseDateFormats is a private method, tested through processIdentityDocument

  describe('Performance tests', () => {
    it('should process documents within acceptable time', async () => {
      mockWorker.recognize.mockResolvedValue({
        data: { text: 'Quick OCR result', confidence: 95 }
      });

      const startTime = Date.now();
      await documentProcessor.processIdentityDocument(Buffer.from('image'), 'passport');
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle concurrent document processing', async () => {
      mockWorker.recognize.mockResolvedValue({
        data: { text: 'Concurrent result', confidence: 90 }
      });

      const promises = Array(5).fill(null).map(() =>
        documentProcessor.processIdentityDocument(Buffer.from('image'), 'passport')
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(5);
      expect(results.every(r => r.confidence >= 50)).toBe(true);
    });
  });
});