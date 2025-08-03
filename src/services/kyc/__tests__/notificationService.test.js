import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KYCNotificationService } from '../notificationService.js';

// Mock dependencies
vi.mock('../../databaseService.js', () => ({
  getDb: vi.fn(() => mockDb)
}));

// Create global mock transporter
const globalMockTransporter = {
  sendMail: vi.fn(),
  verify: vi.fn()
};

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => globalMockTransporter)
  },
  createTransport: vi.fn(() => globalMockTransporter)
}));

// Mock Firebase Admin
vi.mock('firebase-admin', () => ({
  default: {
    firestore: {
      FieldValue: {
        increment: vi.fn(val => `increment(${val})`)
      }
    }
  },
  firestore: {
    FieldValue: {
      increment: vi.fn(val => `increment(${val})`)
    }
  }
}));

// Mock Firestore
const mockCollection = vi.fn();
const mockDoc = vi.fn();
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockUpdate = vi.fn();
const mockAdd = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();

const mockDb = {
  collection: mockCollection.mockReturnThis(),
  doc: mockDoc.mockReturnThis(),
  get: mockGet,
  set: mockSet,
  update: mockUpdate,
  add: mockAdd,
  where: mockWhere.mockReturnThis(),
  orderBy: mockOrderBy.mockReturnThis(),
  limit: mockLimit.mockReturnThis()
};

describe('KYCNotificationService', () => {
  let notificationService;
  let mockTransporter;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup environment
    process.env.SMTP_HOST = 'smtp.test.com';
    process.env.SMTP_USER = 'test@test.com';
    process.env.SMTP_PASS = 'testpass';
    process.env.SMTP_FROM = 'noreply@test.com';
    process.env.FRONTEND_URL = 'https://test.com';

    // Reset global mock transporter
    globalMockTransporter.sendMail.mockResolvedValue({ messageId: 'test-123' });
    globalMockTransporter.verify.mockResolvedValue(true);
    
    mockTransporter = globalMockTransporter;
    
    notificationService = new KYCNotificationService();
  });

  afterEach(() => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
  });

  describe('initialize', () => {
    it('should initialize email transporter with credentials', async () => {
      mockTransporter.verify.mockResolvedValue(true);
      
      const nodemailer = await import('nodemailer');

      await notificationService.initialize();

      expect(nodemailer.default.createTransport).toHaveBeenCalledWith({
        host: 'smtp.test.com',
        port: 587,
        secure: false,
        auth: {
          user: 'test@test.com',
          pass: 'testpass'
        }
      });

      expect(mockTransporter.verify).toHaveBeenCalled();
    });

    it('should handle missing email credentials', async () => {
      delete process.env.SMTP_HOST;
      
      const newService = new KYCNotificationService();
      await newService.initialize();

      const { createTransport } = await import('nodemailer');
      expect(createTransport).not.toHaveBeenCalled();
    });

    it('should handle email verification failure', async () => {
      mockTransporter.verify.mockRejectedValue(new Error('SMTP connection failed'));

      await notificationService.initialize();

      // Should not throw, but log error
      expect(mockTransporter.verify).toHaveBeenCalled();
    });
  });

  describe('sendNotification', () => {
    beforeEach(async () => {
      await notificationService.initialize();
      
      // Mock user data
      mockGet.mockResolvedValue({
        exists: true,
        data: () => ({
          email: 'user@test.com',
          firstName: 'John',
          notificationPreferences: {
            email: true,
            push: true,
            inApp: true
          },
          pushToken: 'mock-push-token'
        })
      });
    });

    it('should send notification successfully', async () => {
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-123' });

      const result = await notificationService.sendNotification(
        'user-123',
        'kyc_approved',
        { expiryDate: '2025-01-01' }
      );

      expect(result).toMatchObject({
        success: true,
        notificationId: expect.any(String),
        methods: ['in_app', 'email', 'push']
      });

      // Check in-app notification created
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          type: 'kyc_approved',
          title: 'KYC Verification Approved',
          read: false
        })
      );

      // Check email sent
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@test.com',
          subject: 'KYC Verification Approved',
          html: expect.stringContaining('Congratulations')
        })
      );

      // Check user notification count updated
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          'notificationCounts.unread': 'increment(1)'
        })
      );
    });

    it('should handle unknown notification type', async () => {
      await expect(
        notificationService.sendNotification('user-123', 'unknown_type', {})
      ).rejects.toThrow('Unknown notification type');
    });

    it('should handle user not found', async () => {
      mockGet.mockResolvedValueOnce({
        exists: false
      });

      await expect(
        notificationService.sendNotification('invalid-user', 'kyc_approved', {})
      ).rejects.toThrow('User not found');
    });

    it('should respect user notification preferences', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          email: 'user@test.com',
          notificationPreferences: {
            email: false, // Email disabled
            push: true,
            inApp: true
          },
          pushToken: 'token'
        })
      });

      const result = await notificationService.sendNotification(
        'user-123',
        'kyc_approved',
        {}
      );

      expect(result.methods).toContain('in_app');
      expect(result.methods).toContain('push');
      expect(result.methods).not.toContain('email');
      expect(mockTransporter.sendMail).not.toHaveBeenCalled();
    });

    it('should handle missing email address', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          // No email field
          notificationPreferences: { email: true }
        })
      });

      const result = await notificationService.sendNotification(
        'user-123',
        'kyc_approved',
        {}
      );

      expect(result.methods).toEqual(['in_app']);
      expect(mockTransporter.sendMail).not.toHaveBeenCalled();
    });

    it('should handle email send failure gracefully', async () => {
      mockTransporter.sendMail.mockRejectedValue(new Error('SMTP error'));

      const result = await notificationService.sendNotification(
        'user-123',
        'kyc_approved',
        {}
      );

      // Should still succeed with in-app notification
      expect(result.success).toBe(true);
      expect(result.methods).toContain('in_app');
    });
  });

  describe('generateMessage', () => {
    it('should generate appropriate messages for each type', () => {
      const testCases = [
        {
          type: 'kyc_initiated',
          data: {},
          expected: 'Your KYC verification process has been started'
        },
        {
          type: 'kyc_document_received',
          data: { documentType: 'passport' },
          expected: 'We have received your passport'
        },
        {
          type: 'kyc_rejected',
          data: { reason: 'Document unclear' },
          expected: 'Document unclear'
        },
        {
          type: 'document_expiring',
          data: { documentType: 'driver license', daysUntilExpiry: 30 },
          expected: 'Your driver license will expire in 30 days'
        },
        {
          type: 'kyc_reminder',
          data: { progress: 75 },
          expected: 'You have completed 75% of the process'
        }
      ];

      testCases.forEach(({ type, data, expected }) => {
        const message = notificationService.generateMessage(type, data);
        expect(message).toContain(expected);
      });
    });

    it('should handle missing data gracefully', () => {
      const message = notificationService.generateMessage('kyc_document_received', {});
      expect(message).toContain('document');
    });
  });

  describe('generateEmailContent', () => {
    it('should generate HTML email content', () => {
      const user = { firstName: 'John' };
      const data = { expiryDate: '2025-01-01' };

      const content = notificationService.generateEmailContent(
        'kyc_approved',
        user,
        data
      );

      expect(content).toContain('<!DOCTYPE html>');
      expect(content).toContain('Congratulations John!');
      expect(content).toContain('2025-01-01');
      expect(content).toContain('ClearHold');
    });

    it('should handle missing template gracefully', () => {
      const content = notificationService.generateEmailContent(
        'unknown_template',
        { firstName: 'John' },
        {}
      );

      expect(content).toContain('KYC Status Update');
    });

    it('should include action buttons with correct URLs', () => {
      const content = notificationService.generateEmailContent(
        'kyc_initiated',
        { firstName: 'John' },
        {}
      );

      expect(content).toContain('https://test.com/kyc');
      expect(content).toContain('Complete Verification');
    });
  });

  describe('sendBulkNotifications', () => {
    beforeEach(() => {
      mockGet.mockResolvedValue({
        exists: true,
        data: () => ({
          email: 'user@test.com',
          notificationPreferences: { email: true, inApp: true }
        })
      });
    });

    it('should send notifications to multiple users', async () => {
      const userIds = ['user-1', 'user-2', 'user-3'];

      const results = await notificationService.sendBulkNotifications(
        userIds,
        'kyc_reminder',
        { progress: 50 }
      );

      expect(results.success).toHaveLength(3);
      expect(results.failed).toHaveLength(0);
      expect(mockSet).toHaveBeenCalledTimes(3);
    });

    it('should handle partial failures', async () => {
      mockGet
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({ email: 'user1@test.com' })
        })
        .mockResolvedValueOnce({
          exists: false // User not found
        })
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({ email: 'user3@test.com' })
        });

      const results = await notificationService.sendBulkNotifications(
        ['user-1', 'user-2', 'user-3'],
        'kyc_reminder',
        {}
      );

      expect(results.success).toHaveLength(2);
      expect(results.failed).toHaveLength(1);
      expect(results.failed[0]).toMatchObject({
        userId: 'user-2',
        error: expect.any(String)
      });
    });

    it('should process in batches', async () => {
      const userIds = Array(25).fill(null).map((_, i) => `user-${i}`);

      await notificationService.sendBulkNotifications(
        userIds,
        'kyc_reminder',
        {}
      );

      // Should process in batches of 10
      expect(mockGet.mock.calls.length).toBe(25);
    });
  });

  describe('scheduleNotification', () => {
    it('should schedule notification for future delivery', async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const notificationId = await notificationService.scheduleNotification(
        'user-123',
        'document_expiring',
        { documentType: 'passport', daysUntilExpiry: 7 },
        futureDate
      );

      expect(notificationId).toBeDefined();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          type: 'document_expiring',
          scheduledFor: futureDate,
          status: 'pending'
        })
      );
    });
  });

  describe('processScheduledNotifications', () => {
    it('should process due scheduled notifications', async () => {
      const mockScheduledNotifications = [
        {
          data: () => ({
            id: 'sched-1',
            userId: 'user-1',
            type: 'kyc_reminder',
            data: { progress: 50 },
            scheduledFor: new Date(Date.now() - 1000)
          }),
          ref: { update: vi.fn() }
        },
        {
          data: () => ({
            id: 'sched-2',
            userId: 'user-2',
            type: 'document_expiring',
            data: { daysUntilExpiry: 7 },
            scheduledFor: new Date(Date.now() - 2000)
          }),
          ref: { update: vi.fn() }
        }
      ];

      mockGet.mockResolvedValueOnce({
        docs: mockScheduledNotifications
      });

      // Mock user data for notifications
      mockGet.mockResolvedValue({
        exists: true,
        data: () => ({ email: 'user@test.com' })
      });

      const results = await notificationService.processScheduledNotifications();

      expect(results).toEqual({
        processed: 2,
        failed: 0
      });

      // Check that notifications were marked as sent
      mockScheduledNotifications.forEach(doc => {
        expect(doc.ref.update).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'sent',
            sentAt: expect.any(Date)
          })
        );
      });
    });

    it('should handle notification send failures', async () => {
      const mockDoc = {
        data: () => ({
          userId: 'user-1',
          type: 'kyc_reminder',
          data: {}
        }),
        ref: { update: vi.fn() }
      };

      mockGet.mockResolvedValueOnce({
        docs: [mockDoc]
      });

      // Make notification fail
      mockGet.mockResolvedValueOnce({
        exists: false // User not found
      });

      const results = await notificationService.processScheduledNotifications();

      expect(results.failed).toBe(1);
      expect(mockDoc.ref.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          error: expect.any(String)
        })
      );
    });
  });

  describe('checkExpiringDocuments', () => {
    it('should send reminders for expiring documents', async () => {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 7); // 7 days from now

      const mockUsers = [
        {
          id: 'user-1',
          data: () => ({
            documents: {
              identity: {
                type: 'passport',
                expiryDate: expiryDate.toISOString()
              }
            },
            email: 'user1@test.com'
          })
        }
      ];

      mockGet.mockResolvedValueOnce({
        forEach: (callback) => mockUsers.forEach(callback)
      });

      // Mock user data for notification
      mockGet.mockResolvedValue({
        exists: true,
        data: () => ({ email: 'user1@test.com' })
      });

      const count = await notificationService.checkExpiringDocuments();

      expect(count).toBe(1);
      expect(mockSet).toHaveBeenCalled();
    });

    it('should only send on specific day intervals', async () => {
      const testCases = [
        { days: 30, shouldSend: true },
        { days: 14, shouldSend: true },
        { days: 7, shouldSend: true },
        { days: 1, shouldSend: true },
        { days: 15, shouldSend: false },
        { days: 8, shouldSend: false }
      ];

      for (const { days, shouldSend } of testCases) {
        vi.clearAllMocks();

        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + days);

        mockGet.mockResolvedValueOnce({
          forEach: (callback) => {
            callback({
              id: 'user-1',
              data: () => ({
                documents: {
                  identity: {
                    type: 'passport',
                    expiryDate: expiryDate.toISOString()
                  }
                }
              })
            });
          }
        });

        if (shouldSend) {
          mockGet.mockResolvedValue({
            exists: true,
            data: () => ({ email: 'user@test.com' })
          });
        }

        const count = await notificationService.checkExpiringDocuments();

        if (shouldSend) {
          expect(count).toBe(1);
        } else {
          expect(count).toBe(0);
        }
      }
    });
  });

  describe('getUserNotificationPreferences', () => {
    it('should get user preferences', async () => {
      mockGet.mockResolvedValue({
        exists: true,
        data: () => ({
          notificationPreferences: {
            email: false,
            push: true,
            inApp: true,
            kycAlerts: true
          }
        })
      });

      const prefs = await notificationService.getUserNotificationPreferences('user-123');

      expect(prefs).toEqual({
        email: false,
        push: true,
        inApp: true,
        kycAlerts: true
      });
    });

    it('should return defaults if no preferences set', async () => {
      mockGet.mockResolvedValue({
        exists: true,
        data: () => ({}) // No preferences
      });

      const prefs = await notificationService.getUserNotificationPreferences('user-123');

      expect(prefs).toEqual({
        email: true,
        push: true,
        inApp: true,
        kycAlerts: true,
        amlAlerts: true,
        documentExpiry: true
      });
    });
  });

  describe('updateNotificationPreferences', () => {
    it('should update user preferences', async () => {
      const newPrefs = {
        email: false,
        push: true,
        inApp: true
      };

      const result = await notificationService.updateNotificationPreferences(
        'user-123',
        newPrefs
      );

      expect(result).toEqual(newPrefs);
      expect(mockUpdate).toHaveBeenCalledWith({
        notificationPreferences: newPrefs,
        'notificationPreferences.updatedAt': expect.any(Date)
      });
    });
  });

  describe('Performance Tests', () => {
    it('should send notifications efficiently', async () => {
      mockGet.mockResolvedValue({
        exists: true,
        data: () => ({ email: 'user@test.com' })
      });

      const startTime = Date.now();
      
      await notificationService.sendNotification(
        'user-123',
        'kyc_approved',
        {}
      );

      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should handle concurrent notifications', async () => {
      mockGet.mockResolvedValue({
        exists: true,
        data: () => ({ email: 'user@test.com' })
      });

      const promises = Array(5).fill(null).map((_, i) =>
        notificationService.sendNotification(
          `user-${i}`,
          'kyc_approved',
          {}
        )
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      expect(results.every(r => r.success)).toBe(true);
    });
  });
});