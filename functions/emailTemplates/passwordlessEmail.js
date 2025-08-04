/**
 * ClearHold Branded Email Template for Passwordless Authentication
 * Following brand design principles with:
 * - Deep Teal (#1A3C34) as primary color
 * - Soft Gold (#D4AF37) as accent color
 * - Montserrat for headings
 * - Open Sans for body text
 * - Mobile-responsive design
 */

function generatePasswordlessEmailTemplate(link, userEmail) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Sign in to ClearHold</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    /* Import brand fonts */
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700&family=Open+Sans:wght@400;500&display=swap');
    
    /* Reset styles */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    
    /* Base styles */
    body {
      margin: 0 !important;
      padding: 0 !important;
      background-color: #F5F5F5 !important;
      font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      width: 100% !important;
      min-width: 100% !important;
    }
    
    /* Prevent blue links on iOS */
    a[x-apple-data-detectors] {
      color: inherit !important;
      text-decoration: none !important;
    }
    
    /* Mobile styles */
    @media screen and (max-width: 600px) {
      .email-container {
        width: 100% !important;
        margin: 0 !important;
      }
      
      .header {
        padding: 24px 20px !important;
      }
      
      .logo-text {
        font-size: 28px !important;
      }
      
      .tagline {
        font-size: 12px !important;
      }
      
      .content {
        padding: 32px 20px !important;
      }
      
      h1 {
        font-size: 20px !important;
      }
      
      p {
        font-size: 14px !important;
      }
      
      .cta-button {
        padding: 14px 24px !important;
        font-size: 14px !important;
        display: block !important;
        width: auto !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
      }
      
      .security-notice {
        padding: 16px 20px !important;
      }
      
      .link-section {
        padding: 16px !important;
      }
      
      .footer {
        padding: 24px 20px !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #F5F5F5; width: 100%; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
  <div style="display: none; max-height: 0px; overflow: hidden;">
    Sign in to your ClearHold account with this secure link
  </div>
  
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #F5F5F5;">
    <tr>
      <td style="padding: 0;">
        <!-- Email Container -->
        <table class="email-container" role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 0 auto; width: 600px; max-width: 600px; background-color: #FFFFFF;">
          
          <!-- Header with Dark Teal Background -->
          <tr>
            <td style="padding: 0;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td class="header" style="background-color: #1A3C34; padding: 32px 24px; text-align: center;">
                    <h1 class="logo-text" style="font-family: 'Montserrat', Arial, sans-serif; font-size: 32px; font-weight: 600; color: #FFFFFF; margin: 0; letter-spacing: -0.5px;">
                      Clear<span style="color: #D4AF37;">Hold</span>
                    </h1>
                    <p class="tagline" style="font-family: 'Open Sans', Arial, sans-serif; font-size: 14px; color: #D4AF37; margin: 8px 0 0 0; letter-spacing: 0.5px;">
                      Secure Real Estate Escrow on Blockchain
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Gold accent line -->
          <tr>
            <td style="padding: 0; line-height: 3px; font-size: 3px; height: 3px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="background-color: #D4AF37; height: 3px; line-height: 3px; font-size: 3px;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding: 0;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td class="content" style="padding: 48px 32px; background-color: #FFFFFF;">
                    <h1 style="font-family: 'Montserrat', Arial, sans-serif; font-size: 24px; font-weight: 600; color: #1A3C34; margin: 0 0 24px 0; line-height: 1.3;">
                      Sign in to your account
                    </h1>
                    
                    <p style="font-family: 'Open Sans', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #374151; margin: 0 0 16px 0;">
                      Hello,
                    </p>
                    
                    <p style="font-family: 'Open Sans', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #374151; margin: 0 0 16px 0;">
                      We received a request to sign in to ClearHold using this email address (${userEmail}). Click the button below to securely access your account:
                    </p>
                    
                    <!-- CTA Button -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 32px auto; width: 100%; max-width: 400px;">
                      <tr>
                        <td align="center" style="padding: 0;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                            <tr>
                              <td style="border-radius: 8px; background-color: #1A3C34; text-align: center;">
                                <a href="${link}" class="cta-button" style="display: block; font-family: 'Open Sans', Arial, sans-serif; font-size: 16px; font-weight: 500; text-decoration: none; color: #FFFFFF; background-color: #1A3C34; padding: 16px 32px; border-radius: 8px; border: 1px solid #1A3C34; text-align: center; min-width: 200px;">
                                  Sign In to ClearHold
                                </a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Security Notice -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 32px 0;">
                      <tr>
                        <td class="security-notice" style="background-color: #F3F4F6; border-left: 4px solid #D4AF37; padding: 20px 24px; border-radius: 0 8px 8px 0;">
                          <p style="font-family: 'Montserrat', Arial, sans-serif; font-size: 14px; font-weight: 600; color: #1A3C34; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px;">
                            Security Information
                          </p>
                          <ul style="margin: 0; padding-left: 20px; color: #374151;">
                            <li style="font-family: 'Open Sans', Arial, sans-serif; font-size: 14px; line-height: 1.6; margin-bottom: 6px;">This link expires in <strong>1 hour</strong></li>
                            <li style="font-family: 'Open Sans', Arial, sans-serif; font-size: 14px; line-height: 1.6; margin-bottom: 6px;">This link can only be used <strong>once</strong></li>
                            <li style="font-family: 'Open Sans', Arial, sans-serif; font-size: 14px; line-height: 1.6; margin-bottom: 6px;">You'll be signed in on the device you use to open this link</li>
                            <li style="font-family: 'Open Sans', Arial, sans-serif; font-size: 14px; line-height: 1.6; margin-bottom: 0;">Never share this link with anyone</li>
                          </ul>
                        </td>
                      </tr>
                    </table>
                    
                    <p style="font-family: 'Open Sans', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #374151; margin: 0 0 16px 0;">
                      If the button doesn't work, you can copy and paste this link into your browser:
                    </p>
                    
                    <!-- Link Section -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 24px 0;">
                      <tr>
                        <td class="link-section" style="background-color: #F9FAFB; padding: 20px; border-radius: 8px; border: 1px solid #E5E7EB;">
                          <p style="font-family: 'Open Sans', Arial, sans-serif; font-size: 12px; color: #9CA3AF; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px;">
                            Secure Sign-In Link
                          </p>
                          <p style="font-family: 'Courier New', monospace; font-size: 14px; color: #1A3C34; word-break: break-all; line-height: 1.5; margin: 0;">
                            ${link}
                          </p>
                        </td>
                      </tr>
                    </table>
                    
                    <p style="font-family: 'Open Sans', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #374151; margin: 0 0 16px 0;">
                      If you didn't request this sign-in link, you can safely ignore this email. Your account remains secure.
                    </p>
                    
                    <p style="font-family: 'Open Sans', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #374151; margin: 32px 0 0 0;">
                      Best regards,<br>The ClearHold Team
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 0;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td class="footer" style="background-color: #1A3C34; padding: 32px; text-align: center;">
                    <p style="font-family: 'Open Sans', Arial, sans-serif; font-size: 14px; color: #E5E7EB; margin: 0 0 8px 0; line-height: 1.6;">
                      Need help? Our support team is here for you.
                    </p>
                    
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 16px auto;">
                      <tr>
                        <td style="padding: 0 12px;">
                          <a href="https://clearhold.app/help" style="font-family: 'Open Sans', Arial, sans-serif; font-size: 14px; color: #D4AF37; text-decoration: none;">Help Center</a>
                        </td>
                        <td style="padding: 0 12px;">
                          <a href="https://clearhold.app/contact" style="font-family: 'Open Sans', Arial, sans-serif; font-size: 14px; color: #D4AF37; text-decoration: none;">Contact Support</a>
                        </td>
                        <td style="padding: 0 12px;">
                          <a href="https://clearhold.app/security" style="font-family: 'Open Sans', Arial, sans-serif; font-size: 14px; color: #D4AF37; text-decoration: none;">Security</a>
                        </td>
                      </tr>
                    </table>
                    
                    <p style="font-family: 'Open Sans', Arial, sans-serif; font-size: 12px; color: #9CA3AF; margin: 16px 0 0 0; line-height: 1.6;">
                      © 2024 ClearHold. All rights reserved.<br>
                      <span style="font-size: 11px; color: #6B7280;">
                        You're receiving this email because you requested to sign in to ClearHold.<br>
                        <a href="https://clearhold.app/privacy" style="color: #9CA3AF; text-decoration: underline;">Privacy Policy</a>
                      </span>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
        </table>
        <!-- End Email Container -->
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

module.exports = { generatePasswordlessEmailTemplate };