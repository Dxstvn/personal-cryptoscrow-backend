import nodemailer from 'nodemailer';
import { generatePasswordlessEmailTemplate } from '../../functions/emailTemplates/passwordlessEmail.js';

class CustomEmailService {
  constructor() {
    // Create reusable transporter using your SMTP settings
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER || 'dustin.jasmin@jaspire.co',
        pass: process.env.SMTP_PASS // Your app password
      }
    });
  }

  /**
   * Send passwordless sign-in email
   * @param {string} email - Recipient email
   * @param {string} link - Magic sign-in link
   * @returns {Promise<Object>} Send result
   */
  async sendPasswordlessEmail(email, link) {
    try {
      // Generate branded email template
      const emailHtml = generatePasswordlessEmailTemplate(link, email);

      // Email options
      const mailOptions = {
        from: '"ClearHold" <noreply@clearhold.app>', // Now using verified alias
        replyTo: 'noreply@clearhold.app',
        to: email,
        subject: 'Sign in to ClearHold',
        html: emailHtml,
        text: `Sign in to ClearHold\n\nClick the link below to sign in:\n${link}\n\nIf you didn't request this, please ignore this email.`
      };

      // Send email
      const result = await this.transporter.sendMail(mailOptions);
      console.log('Email sent successfully:', result.messageId);
      
      return {
        success: true,
        messageId: result.messageId
      };
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  /**
   * Verify SMTP connection
   * @returns {Promise<boolean>} Connection status
   */
  async verifyConnection() {
    try {
      await this.transporter.verify();
      console.log('SMTP connection verified');
      return true;
    } catch (error) {
      console.error('SMTP connection failed:', error);
      return false;
    }
  }
}

export default new CustomEmailService();