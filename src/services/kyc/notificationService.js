// src/services/kyc/notificationService.js

import { getDb } from '../databaseService.js';
import { v4 as uuidv4 } from 'uuid';
import nodemailer from 'nodemailer';
import admin from 'firebase-admin';

/**
 * KYC Notification Service
 * Handles all KYC-related notifications and alerts
 */
export class KYCNotificationService {
  constructor() {
    this.emailTransporter = null;
    this.notificationTemplates = {
      kyc_initiated: {
        subject: 'KYC Verification Started',
        priority: 'normal',
        template: 'kyc_initiated'
      },
      kyc_document_received: {
        subject: 'Document Received - KYC Verification',
        priority: 'normal',
        template: 'kyc_document_received'
      },
      kyc_approved: {
        subject: 'KYC Verification Approved',
        priority: 'high',
        template: 'kyc_approved'
      },
      kyc_rejected: {
        subject: 'KYC Verification Requires Attention',
        priority: 'high',
        template: 'kyc_rejected'
      },
      kyc_expired: {
        subject: 'KYC Verification Expired - Action Required',
        priority: 'high',
        template: 'kyc_expired'
      },
      manual_review_required: {
        subject: 'Manual Review Required - KYC Verification',
        priority: 'urgent',
        template: 'manual_review_required'
      },
      aml_alert: {
        subject: 'Important: AML Screening Alert',
        priority: 'urgent',
        template: 'aml_alert'
      },
      risk_level_changed: {
        subject: 'Risk Profile Updated',
        priority: 'normal',
        template: 'risk_level_changed'
      },
      document_expiring: {
        subject: 'Document Expiring Soon - Update Required',
        priority: 'normal',
        template: 'document_expiring'
      },
      kyc_reminder: {
        subject: 'Complete Your KYC Verification',
        priority: 'normal',
        template: 'kyc_reminder'
      }
    };
  }

  /**
   * Initialize the notification service
   */
  async initialize() {
    try {
      // Initialize email transporter if email credentials are provided
      if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        this.emailTransporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        });

        // Verify connection
        await this.emailTransporter.verify();
        console.log('[KYCNotification] Email service initialized');
      } else {
        console.log('[KYCNotification] Email service not configured, using in-app notifications only');
      }
    } catch (error) {
      console.error('[KYCNotification] Error initializing email service:', error);
    }
  }

  /**
   * Send notification to user
   * @param {string} userId - User ID
   * @param {string} type - Notification type
   * @param {Object} data - Additional data for the notification
   */
  async sendNotification(userId, type, data = {}) {
    console.log(`[KYCNotification] Sending ${type} notification to user ${userId}`);

    try {
      const db = await getDb();
      
      // Get user data
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new Error('User not found');
      }

      const user = userDoc.data();
      const template = this.notificationTemplates[type];

      if (!template) {
        throw new Error(`Unknown notification type: ${type}`);
      }

      // Create in-app notification
      const notification = await this.createInAppNotification(userId, type, template, data);

      const methods = ['in_app'];

      // Send email if available and user has email notifications enabled
      if (user.email && user.notificationPreferences?.email !== false && this.emailTransporter) {
        await this.sendEmailNotification(user, template, data);
        methods.push('email');
      }

      // Send push notification if enabled
      if (user.pushToken && user.notificationPreferences?.push !== false) {
        await this.sendPushNotification(user, template, data);
        methods.push('push');
      }

      // Log notification
      await this.logNotification(userId, type, notification.id);

      return {
        success: true,
        notificationId: notification.id,
        methods
      };
    } catch (error) {
      console.error('[KYCNotification] Error sending notification:', error);
      throw error;
    }
  }

  /**
   * Create in-app notification
   */
  async createInAppNotification(userId, type, template, data) {
    const db = await getDb();
    const notificationId = uuidv4();

    const notification = {
      id: notificationId,
      userId,
      type,
      title: template.subject,
      message: this.generateMessage(type, data),
      priority: template.priority,
      data,
      read: false,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    };

    await db.collection('notifications').doc(notificationId).set(notification);

    // Update user's unread count
    await db.collection('users').doc(userId).update({
      'notificationCounts.unread': admin.firestore.FieldValue.increment(1),
      'notificationCounts.lastNotification': new Date()
    });

    return notification;
  }

  /**
   * Send email notification
   */
  async sendEmailNotification(user, template, data) {
    if (!this.emailTransporter) return;

    try {
      const htmlContent = this.generateEmailContent(template.template, user, data);
      
      const mailOptions = {
        from: process.env.SMTP_FROM || 'noreply@clearhold.com',
        to: user.email,
        subject: template.subject,
        html: htmlContent,
        priority: template.priority === 'urgent' ? 'high' : 'normal'
      };

      await this.emailTransporter.sendMail(mailOptions);
      console.log(`[KYCNotification] Email sent to ${user.email}`);
    } catch (error) {
      console.error('[KYCNotification] Error sending email:', error);
    }
  }

  /**
   * Send push notification
   */
  async sendPushNotification(user, template, data) {
    // This would integrate with your push notification service (FCM, APNS, etc.)
    // For now, just log the attempt
    console.log(`[KYCNotification] Push notification would be sent to ${user.pushToken}`);
  }

  /**
   * Generate notification message based on type
   */
  generateMessage(type, data) {
    const messages = {
      kyc_initiated: 'Your KYC verification process has been started. Please complete all required steps.',
      kyc_document_received: `We have received your ${data.documentType || 'document'}. Processing in progress.`,
      kyc_approved: 'Congratulations! Your KYC verification has been approved.',
      kyc_rejected: `Your KYC verification needs attention: ${data.reason || 'Please check the details and try again.'}`,
      kyc_expired: 'Your KYC verification has expired. Please complete the verification process again.',
      manual_review_required: 'Your verification requires manual review. We will update you within 24-48 hours.',
      aml_alert: `AML screening alert: ${data.alertType || 'Please contact support for more information.'}`,
      risk_level_changed: `Your risk profile has been updated to ${data.newLevel || 'unknown'}.`,
      document_expiring: `Your ${data.documentType || 'verification document'} will expire in ${data.daysUntilExpiry || 'a few'} days.`,
      kyc_reminder: `Please complete your KYC verification. You have completed ${data.progress || '0'}% of the process.`
    };

    return messages[type] || 'You have a new notification regarding your KYC status.';
  }

  /**
   * Generate email content
   */
  generateEmailContent(template, user, data) {
    // In production, use a proper email templating engine
    const baseTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4a90e2; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .button { display: inline-block; padding: 10px 20px; background-color: #4a90e2; color: white; text-decoration: none; border-radius: 5px; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>ClearHold</h1>
          </div>
          <div class="content">
            {{CONTENT}}
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>&copy; 2024 ClearHold. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const contentTemplates = {
      kyc_initiated: `
        <h2>Welcome ${user.firstName || 'User'}!</h2>
        <p>Your KYC verification process has been initiated.</p>
        <p>To complete your verification, please:</p>
        <ol>
          <li>Upload a valid government-issued ID</li>
          <li>Complete the liveness check</li>
          <li>Provide required personal information</li>
        </ol>
        <p style="text-align: center; margin-top: 30px;">
          <a href="${process.env.FRONTEND_URL}/kyc" class="button">Complete Verification</a>
        </p>
      `,
      kyc_approved: `
        <h2>Congratulations ${user.firstName || 'User'}!</h2>
        <p>Your KYC verification has been successfully approved.</p>
        <p>You now have access to:</p>
        <ul>
          <li>Increased transaction limits</li>
          <li>All platform features</li>
          <li>Enhanced security benefits</li>
        </ul>
        <p>Your verification is valid until: <strong>${data.expiryDate || 'N/A'}</strong></p>
      `,
      kyc_rejected: `
        <h2>Action Required</h2>
        <p>Unfortunately, we couldn't complete your KYC verification.</p>
        <p><strong>Reason:</strong> ${data.reason || 'Verification requirements not met'}</p>
        <p>What to do next:</p>
        <ul>
          <li>Review the reason for rejection</li>
          <li>Ensure all documents are clear and valid</li>
          <li>Retry the verification process</li>
        </ul>
        <p style="text-align: center; margin-top: 30px;">
          <a href="${process.env.FRONTEND_URL}/kyc" class="button">Retry Verification</a>
        </p>
      `,
      aml_alert: `
        <h2>Important Security Notice</h2>
        <p>Our automated screening system has flagged your account for review.</p>
        <p><strong>Alert Type:</strong> ${data.alertType || 'Compliance Review'}</p>
        <p>This is a routine security measure. Our compliance team will review your account and contact you if any additional information is needed.</p>
        <p>If you have any questions, please contact our support team.</p>
      `,
      document_expiring: `
        <h2>Document Expiring Soon</h2>
        <p>Your ${data.documentType || 'verification document'} will expire in <strong>${data.daysUntilExpiry || 'a few'} days</strong>.</p>
        <p>To maintain your verified status, please upload an updated document before it expires.</p>
        <p style="text-align: center; margin-top: 30px;">
          <a href="${process.env.FRONTEND_URL}/kyc/documents" class="button">Update Document</a>
        </p>
      `
    };

    const content = contentTemplates[template] || `
      <h2>KYC Status Update</h2>
      <p>${this.generateMessage(template, data)}</p>
    `;

    return baseTemplate.replace('{{CONTENT}}', content);
  }

  /**
   * Log notification for audit
   */
  async logNotification(userId, type, notificationId) {
    try {
      const db = await getDb();
      
      await db.collection('complianceAudits').add({
        auditId: uuidv4(),
        userId,
        action: 'notification_sent',
        timestamp: new Date(),
        performedBy: 'system',
        details: {
          notificationType: type,
          notificationId
        },
        result: 'success'
      });
    } catch (error) {
      console.error('[KYCNotification] Error logging notification:', error);
    }
  }

  /**
   * Send bulk notifications
   */
  async sendBulkNotifications(userIds, type, data = {}) {
    console.log(`[KYCNotification] Sending bulk ${type} notifications to ${userIds.length} users`);

    const results = {
      success: [],
      failed: []
    };

    // Process in batches to avoid overwhelming the system
    const batchSize = 10;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (userId) => {
        try {
          await this.sendNotification(userId, type, data);
          results.success.push(userId);
        } catch (error) {
          console.error(`[KYCNotification] Failed to send to ${userId}:`, error);
          results.failed.push({ userId, error: error.message });
        }
      }));
    }

    return results;
  }

  /**
   * Schedule a notification for future delivery
   */
  async scheduleNotification(userId, type, data, scheduledFor) {
    const db = await getDb();
    const scheduledNotificationId = uuidv4();

    await db.collection('scheduledNotifications').doc(scheduledNotificationId).set({
      id: scheduledNotificationId,
      userId,
      type,
      data,
      scheduledFor: new Date(scheduledFor),
      status: 'pending',
      createdAt: new Date()
    });

    console.log(`[KYCNotification] Scheduled ${type} notification for user ${userId} at ${scheduledFor}`);

    return scheduledNotificationId;
  }

  /**
   * Process scheduled notifications (should be called by a cron job)
   */
  async processScheduledNotifications() {
    const db = await getDb();
    const now = new Date();

    try {
      const scheduledNotifications = await db.collection('scheduledNotifications')
        .where('status', '==', 'pending')
        .where('scheduledFor', '<=', now)
        .limit(50)
        .get();

      const results = {
        processed: 0,
        failed: 0
      };

      for (const doc of scheduledNotifications.docs) {
        const notification = doc.data();
        
        try {
          await this.sendNotification(notification.userId, notification.type, notification.data);
          
          // Mark as sent
          await doc.ref.update({
            status: 'sent',
            sentAt: new Date()
          });
          
          results.processed++;
        } catch (error) {
          console.error(`[KYCNotification] Failed to process scheduled notification ${notification.id}:`, error);
          
          // Mark as failed
          await doc.ref.update({
            status: 'failed',
            error: error.message,
            failedAt: new Date()
          });
          
          results.failed++;
        }
      }

      console.log(`[KYCNotification] Processed ${results.processed} scheduled notifications, ${results.failed} failed`);
      return results;
    } catch (error) {
      console.error('[KYCNotification] Error processing scheduled notifications:', error);
      throw error;
    }
  }

  /**
   * Get user's notification preferences
   */
  async getUserNotificationPreferences(userId) {
    try {
      const db = await getDb();
      const userDoc = await db.collection('users').doc(userId).get();
      
      if (!userDoc.exists) {
        throw new Error('User not found');
      }

      const user = userDoc.data();
      return user.notificationPreferences || {
        email: true,
        push: true,
        inApp: true,
        kycAlerts: true,
        amlAlerts: true,
        documentExpiry: true
      };
    } catch (error) {
      console.error('[KYCNotification] Error getting notification preferences:', error);
      throw error;
    }
  }

  /**
   * Update user's notification preferences
   */
  async updateNotificationPreferences(userId, preferences) {
    try {
      const db = await getDb();
      
      await db.collection('users').doc(userId).update({
        notificationPreferences: preferences,
        'notificationPreferences.updatedAt': new Date()
      });

      console.log(`[KYCNotification] Updated notification preferences for user ${userId}`);
      return preferences;
    } catch (error) {
      console.error('[KYCNotification] Error updating notification preferences:', error);
      throw error;
    }
  }

  /**
   * Check for expiring documents and send reminders
   */
  async checkExpiringDocuments() {
    const db = await getDb();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    try {
      // Find users with documents expiring in the next 30 days
      const usersQuery = await db.collection('users')
        .where('documents.identity.expiryDate', '<=', thirtyDaysFromNow)
        .where('documents.identity.expiryDate', '>=', new Date())
        .get();

      const notifications = [];

      usersQuery.forEach(doc => {
        const user = doc.data();
        const expiryDate = new Date(user.documents.identity.expiryDate);
        const daysUntilExpiry = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));

        // Send notifications at 30, 14, 7, and 1 day intervals
        if ([30, 14, 7, 1].includes(daysUntilExpiry)) {
          notifications.push({
            userId: doc.id,
            documentType: user.documents.identity.type,
            daysUntilExpiry
          });
        }
      });

      // Send notifications
      for (const notification of notifications) {
        await this.sendNotification(notification.userId, 'document_expiring', {
          documentType: notification.documentType,
          daysUntilExpiry: notification.daysUntilExpiry
        });
      }

      console.log(`[KYCNotification] Sent ${notifications.length} document expiry reminders`);
      return notifications.length;
    } catch (error) {
      console.error('[KYCNotification] Error checking expiring documents:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const kycNotificationService = new KYCNotificationService();