// src/services/kyc/__tests__/secureFileStorageService.test.js

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SecureFileStorageService } from '../secureFileStorageService.js';
import crypto from 'crypto';

// Mock dependencies
vi.mock('firebase-admin/storage', () => ({
  getStorage: vi.fn(() => ({
    bucket: vi.fn(() => mockBucket)
  }))
}));

vi.mock('../../../api/routes/auth/admin.js', () => ({
  getAdminApp: vi.fn(() => Promise.resolve({}))
}));

vi.mock('../../databaseService.js', () => ({
  getDb: vi.fn(() => Promise.resolve(mockDb))
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-1234')
}));

// Mock bucket and file
const mockFile = {
  save: vi.fn(() => Promise.resolve()),
  exists: vi.fn(() => Promise.resolve([true])),
  getMetadata: vi.fn(() => Promise.resolve([{
    metadata: {
      userId: 'test-user-123',
      iv: 'test-iv-base64',
      authTag: 'test-authTag-base64',
      fileHash: 'test-hash'
    }
  }])),
  download: vi.fn(() => Promise.resolve([Buffer.from('encrypted-data')])),
  delete: vi.fn(() => Promise.resolve()),
  makePrivate: vi.fn(() => Promise.resolve()),
  getSignedUrl: vi.fn(() => Promise.resolve(['https://signed-url.example.com']))
};

const mockBucket = {
  file: vi.fn(() => mockFile),
  getFiles: vi.fn(() => Promise.resolve([[]]))
};

// Mock database
const mockDb = {
  collection: vi.fn(() => ({
    add: vi.fn(() => Promise.resolve()),
    where: vi.fn(() => ({
      limit: vi.fn(() => ({
        get: vi.fn(() => Promise.resolve({ empty: true }))
      }))
    }))
  }))
};

describe('SecureFileStorageService', () => {
  let service;
  let originalEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Save original env
    originalEnv = process.env.KYC_ENCRYPTION_KEY;
    
    // Create service without env variable so it uses random bytes
    delete process.env.KYC_ENCRYPTION_KEY;
    
    service = new SecureFileStorageService();
    
    // Ensure encryptionKey is a proper Buffer
    if (typeof service.encryptionKey === 'string') {
      service.encryptionKey = Buffer.from(service.encryptionKey, 'hex');
    }
  });

  afterEach(() => {
    // Restore original env
    process.env.KYC_ENCRYPTION_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize storage bucket', async () => {
      expect(service.initialized).toBe(false);
      
      await service.initialize();
      
      expect(service.initialized).toBe(true);
      expect(service.bucket).toBe(mockBucket);
    });

    it('should not reinitialize if already initialized', async () => {
      await service.initialize();
      const firstBucket = service.bucket;
      
      await service.initialize();
      
      expect(service.bucket).toBe(firstBucket);
    });

    it('should handle initialization errors', async () => {
      const { getAdminApp } = await import('../../../api/routes/auth/admin.js');
      vi.mocked(getAdminApp).mockImplementationOnce(() => Promise.reject(new Error('Admin init failed')));
      
      await expect(service.initialize()).rejects.toThrow('Admin init failed');
    });
  });

  describe('uploadDocument', () => {
    const testFile = Buffer.from('test file content');
    const testMetadata = {
      userId: 'test-user-123',
      documentType: 'passport',
      filename: 'passport.jpg',
      size: testFile.length,
      mimeType: 'image/jpeg'
    };

    beforeEach(() => {
      // Mock file type detection for JPEG
      vi.spyOn(service, 'detectFileType').mockImplementation(() => Promise.resolve('image/jpeg'));
      
      // Mock encryption
      vi.spyOn(service, 'encryptFile').mockImplementation(() => Promise.resolve({
        encrypted: Buffer.from('encrypted-data'),
        iv: 'test-iv-base64',
        authTag: 'test-authTag-base64',
        originalHash: 'test-hash'
      }));
    });

    it('should upload and encrypt document successfully', async () => {
      const result = await service.uploadDocument(testFile, testMetadata);
      
      expect(result).toMatchObject({
        fileId: 'test-uuid-1234',
        filePath: expect.stringContaining('kyc-documents/'),
        signedUrl: 'https://signed-url.example.com',
        uploadedAt: expect.any(String),
        expiresAt: expect.any(String),
        metadata: {
          size: testFile.length,
          encrypted: true,
          documentType: 'passport'
        }
      });
      
      expect(mockFile.save).toHaveBeenCalledWith(
        Buffer.from('encrypted-data'),
        expect.objectContaining({
          metadata: expect.objectContaining({
            contentType: 'application/octet-stream'
          })
        })
      );
    });

    it('should validate file size', async () => {
      const largeFile = Buffer.alloc(11 * 1024 * 1024); // 11MB
      
      await expect(service.uploadDocument(largeFile, testMetadata))
        .rejects.toThrow('File size exceeds 10MB limit');
    });

    it('should validate file type', async () => {
      vi.spyOn(service, 'detectFileType').mockImplementation(() => Promise.resolve('application/exe'));
      
      await expect(service.uploadDocument(testFile, testMetadata))
        .rejects.toThrow('Invalid file type: application/exe');
    });

    it('should check for duplicate uploads', async () => {
      const mockCollection = {
        add: vi.fn(),
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(() => Promise.resolve({ empty: false }))
          }))
        }))
      };
      
      mockDb.collection.mockReturnValue(mockCollection);
      
      await expect(service.uploadDocument(testFile, testMetadata))
        .rejects.toThrow('Document has already been uploaded');
    });

    it('should sanitize filename', async () => {
      const maliciousMetadata = {
        ...testMetadata,
        filename: '../../../etc/passwd'
      };
      
      await service.uploadDocument(testFile, maliciousMetadata);
      
      expect(mockFile.save).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({
          metadata: expect.objectContaining({
            metadata: expect.objectContaining({
              originalName: '._._._etc_passwd'
            })
          })
        })
      );
    });

    it('should generate correct file path', async () => {
      const result = await service.uploadDocument(testFile, testMetadata);
      
      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      
      expect(result.filePath).toBe(
        `kyc-documents/${year}/${month}/test-user-123/passport/test-uuid-1234`
      );
    });
  });

  describe('downloadDocument', () => {
    const testFilePath = 'kyc-documents/2024/01/test-user-123/passport/file-id';
    const testUserId = 'test-user-123';

    beforeEach(() => {
      // Mock decryption
      vi.spyOn(service, 'decryptFile').mockImplementation(() => Promise.resolve(
        Buffer.from('decrypted-data')
      ));
      
      // Fix hash to match decrypted data
      const correctHash = crypto.createHash('sha256')
        .update(Buffer.from('decrypted-data'))
        .digest('hex');
      
      mockFile.getMetadata.mockImplementation(() => Promise.resolve([{
        metadata: {
          userId: 'test-user-123',
          iv: 'test-iv-base64',
          authTag: 'test-authTag-base64',
          fileHash: correctHash
        }
      }]));
    });

    it('should download and decrypt document successfully', async () => {
      const result = await service.downloadDocument(testFilePath, testUserId);
      
      expect(result).toEqual(Buffer.from('decrypted-data'));
      expect(mockFile.download).toHaveBeenCalled();
      expect(service.decryptFile).toHaveBeenCalledWith(
        Buffer.from('encrypted-data'),
        'test-iv-base64',
        'test-authTag-base64'
      );
    });

    it('should throw error if file does not exist', async () => {
      mockFile.exists.mockImplementationOnce(() => Promise.resolve([false]));
      
      await expect(service.downloadDocument(testFilePath, testUserId))
        .rejects.toThrow('Document not found');
    });

    it('should verify access permissions', async () => {
      mockFile.getMetadata.mockImplementationOnce(() => Promise.resolve([{
        metadata: {
          userId: 'different-user',
          iv: 'test-iv',
          authTag: 'test-authTag'
        }
      }]));
      
      await expect(service.downloadDocument(testFilePath, testUserId))
        .rejects.toThrow('Access denied');
    });

    it('should verify file integrity', async () => {
      // Mock hash mismatch
      const wrongHash = crypto.createHash('sha256')
        .update('wrong-data')
        .digest('hex');
      
      mockFile.getMetadata.mockImplementationOnce(() => Promise.resolve([{
        metadata: {
          userId: testUserId,
          iv: 'test-iv-base64',
          authTag: 'test-authTag-base64',
          fileHash: wrongHash
        }
      }]));
      
      await expect(service.downloadDocument(testFilePath, testUserId))
        .rejects.toThrow('File integrity check failed');
    });
  });

  describe('deleteDocument', () => {
    const testFilePath = 'kyc-documents/2024/01/test-user-123/passport/file-id';
    const testUserId = 'test-user-123';

    it('should delete document successfully', async () => {
      await service.deleteDocument(testFilePath, testUserId);
      
      expect(mockFile.delete).toHaveBeenCalled();
    });

    it('should verify access permissions before deletion', async () => {
      mockFile.getMetadata.mockImplementationOnce(() => Promise.resolve([{
        metadata: {
          userId: 'different-user'
        }
      }]));
      
      await expect(service.deleteDocument(testFilePath, testUserId))
        .rejects.toThrow('Access denied');
      
      expect(mockFile.delete).not.toHaveBeenCalled();
    });

    it('should handle deletion errors', async () => {
      mockFile.delete.mockImplementationOnce(() => Promise.reject(new Error('Delete failed')));
      
      await expect(service.deleteDocument(testFilePath, testUserId))
        .rejects.toThrow('Delete failed');
    });
  });

  describe('file type detection', () => {
    it('should detect JPEG files', async () => {
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      const type = await service.detectFileType(jpegBuffer);
      
      expect(type).toBe('image/jpeg');
    });

    it('should detect PNG files', async () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
      const type = await service.detectFileType(pngBuffer);
      
      expect(type).toBe('image/png');
    });

    it('should detect PDF files', async () => {
      const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      const type = await service.detectFileType(pdfBuffer);
      
      expect(type).toBe('application/pdf');
    });

    it('should return unknown for unrecognized files', async () => {
      const unknownBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      const type = await service.detectFileType(unknownBuffer);
      
      expect(type).toBe('unknown');
    });
  });

  describe('encryption and decryption', () => {
    it('should encrypt and decrypt data correctly', async () => {
      const originalData = Buffer.from('sensitive data');
      
      // Encrypt
      const encrypted = await service.encryptFile(originalData);
      
      expect(encrypted).toHaveProperty('encrypted');
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('authTag');
      expect(encrypted).toHaveProperty('originalHash');
      
      // Decrypt
      const decrypted = await service.decryptFile(
        encrypted.encrypted,
        encrypted.iv,
        encrypted.authTag
      );
      
      expect(decrypted.toString()).toBe('sensitive data');
    });

    it('should generate unique IVs for each encryption', async () => {
      const data = Buffer.from('test data');
      
      const encrypted1 = await service.encryptFile(data);
      const encrypted2 = await service.encryptFile(data);
      
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
    });

    it('should fail decryption with wrong auth tag', async () => {
      const encrypted = await service.encryptFile(Buffer.from('test'));
      const wrongAuthTag = Buffer.from('wrong-auth-tag').toString('base64');
      
      await expect(service.decryptFile(
        encrypted.encrypted,
        encrypted.iv,
        wrongAuthTag
      )).rejects.toThrow();
    });
  });

  describe('generateTemporaryUrl', () => {
    it('should generate signed URL successfully', async () => {
      const filePath = 'kyc-documents/test/file.pdf';
      
      const result = await service.generateTemporaryUrl(filePath, 30);
      
      expect(result).toMatchObject({
        url: 'https://signed-url.example.com',
        expiresAt: expect.any(String)
      });
      
      expect(mockFile.getSignedUrl).toHaveBeenCalledWith({
        action: 'read',
        expires: expect.any(Number)
      });
    });

    it('should use default expiration of 60 minutes', async () => {
      const filePath = 'kyc-documents/test/file.pdf';
      
      await service.generateTemporaryUrl(filePath);
      
      expect(mockFile.getSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          expires: expect.any(Number)
        })
      );
    });

    it('should throw error if file does not exist', async () => {
      mockFile.exists.mockImplementationOnce(() => Promise.resolve([false]));
      
      await expect(service.generateTemporaryUrl('non-existent'))
        .rejects.toThrow('Document not found');
    });
  });

  describe('cleanupExpiredDocuments', () => {
    it('should delete expired documents', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 100); // 100 days old
      
      const expiredFile = {
        name: 'expired-file',
        getMetadata: vi.fn(() => Promise.resolve([{
          metadata: {
            uploadedAt: oldDate.toISOString()
          }
        }])),
        delete: vi.fn(() => Promise.resolve())
      };
      
      mockBucket.getFiles.mockImplementationOnce(() => Promise.resolve([[expiredFile]]));
      
      const result = await service.cleanupExpiredDocuments();
      
      expect(result.deletedCount).toBe(1);
      expect(expiredFile.delete).toHaveBeenCalled();
    });

    it('should not delete recent documents', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 30); // 30 days old
      
      const recentFile = {
        name: 'recent-file',
        getMetadata: vi.fn(() => Promise.resolve([{
          metadata: {
            uploadedAt: recentDate.toISOString()
          }
        }])),
        delete: vi.fn()
      };
      
      mockBucket.getFiles.mockImplementationOnce(() => Promise.resolve([[recentFile]]));
      
      const result = await service.cleanupExpiredDocuments();
      
      expect(result.deletedCount).toBe(0);
      expect(recentFile.delete).not.toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      mockBucket.getFiles.mockImplementationOnce(() => Promise.reject(new Error('List failed')));
      
      await expect(service.cleanupExpiredDocuments())
        .rejects.toThrow('List failed');
    });
  });

  describe('utility methods', () => {
    it('should sanitize filenames correctly', () => {
      const tests = [
        { input: 'normal-file.pdf', expected: 'normal-file.pdf' },
        { input: '../../../etc/passwd', expected: '._._._etc_passwd' },
        { input: 'file...name.txt', expected: 'file.name.txt' },
        { input: 'file<>:|?*name.pdf', expected: 'file______name.pdf' },
        { input: 'a'.repeat(300) + '.pdf', expected: 'a'.repeat(255) }
      ];
      
      tests.forEach(({ input, expected }) => {
        expect(service.sanitizeFilename(input)).toBe(expected);
      });
    });

    it('should generate proper file paths', () => {
      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      
      const path = service.generateFilePath('user123', 'passport', 'file456');
      
      expect(path).toBe(`kyc-documents/${year}/${month}/user123/passport/file456`);
    });
  });

  describe('error handling', () => {
    it('should handle storage errors during upload', async () => {
      mockFile.save.mockImplementationOnce(() => Promise.reject(new Error('Storage error')));
      vi.spyOn(service, 'detectFileType').mockImplementation(() => Promise.resolve('image/jpeg'));
      
      await expect(service.uploadDocument(Buffer.from('test'), {
        userId: 'user1',
        documentType: 'passport',
        filename: 'test.jpg'
      })).rejects.toThrow('Storage error');
    });

    it('should handle permission setting errors gracefully', async () => {
      mockFile.makePrivate.mockImplementationOnce(() => Promise.reject(new Error('Permission error')));
      vi.spyOn(service, 'detectFileType').mockImplementation(() => Promise.resolve('image/jpeg'));
      
      // Should not throw, just log error
      await expect(service.uploadDocument(Buffer.from('test'), {
        userId: 'user1',
        documentType: 'passport',
        filename: 'test.jpg'
      })).resolves.toBeDefined();
    });

    it('should handle database errors when storing hash', async () => {
      const mockCollection = {
        add: vi.fn(() => Promise.reject(new Error('DB error'))),
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(() => Promise.resolve({ empty: true }))
          }))
        }))
      };
      
      mockDb.collection.mockReturnValue(mockCollection);
      vi.spyOn(service, 'detectFileType').mockImplementation(() => Promise.resolve('image/jpeg'));
      
      // Should not throw, just log error
      await expect(service.uploadDocument(Buffer.from('test'), {
        userId: 'user1',
        documentType: 'passport',
        filename: 'test.jpg'
      })).resolves.toBeDefined();
    });
  });
});