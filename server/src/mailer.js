/**
 * Resend Email Configuration
 * Production email service for sending real emails to users
 */

const { Resend } = require('resend');

// Load environment variables
try { require('dotenv').config(); } catch (_) {}

// Create Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

// From email address (must be verified in Resend)
const FROM_EMAIL = process.env.FROM_EMAIL || 'Kaarya <onboarding@resend.dev>';

// Email templates
const templates = {
  registrationOtp: (name, code) => ({
    subject: 'Kaarya - Verify Your Email Address',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }
          .container { max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #FF6B35 0%, #ff8f65 100%); padding: 30px; text-align: center; }
          .header h1 { color: #ffffff; margin: 0; font-size: 24px; }
          .content { padding: 30px; text-align: center; }
          .greeting { color: #333; font-size: 18px; margin-bottom: 15px; }
          .message { color: #666; font-size: 14px; line-height: 1.6; margin-bottom: 25px; }
          .code-box { background: #f8f9fa; border: 2px dashed #FF6B35; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .code { font-size: 36px; font-weight: bold; color: #FF6B35; letter-spacing: 8px; font-family: 'Courier New', monospace; }
          .note { color: #999; font-size: 12px; margin-top: 15px; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #999; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Kaarya</h1>
          </div>
          <div class="content">
            <p class="greeting">Hi ${name}! 👋</p>
            <p class="message">Thank you for registering with Kaarya! Please verify your email address by entering the code below:</p>
            <div class="code-box">
              <span class="code">${code}</span>
            </div>
            <p class="note">This code expires in 15 minutes. Please don't share it with anyone.</p>
          </div>
          <div class="footer">
            <p>If you didn't create a Kaarya account, please ignore this email.</p>
            <p>© 2024 Kaarya - Nepal's On-Demand Service Marketplace</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Hi ${name}!\n\nYour Kaarya verification code is: ${code}\n\nThis code expires in 15 minutes. Please don't share it with anyone.\n\nIf you didn't create a Kaarya account, please ignore this email.`,
  }),

  passwordReset: (name, code) => ({
    subject: 'Kaarya - Password Reset Code',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }
          .container { max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #4CAF50 0%, #66bb6a 100%); padding: 30px; text-align: center; }
          .header h1 { color: #ffffff; margin: 0; font-size: 24px; }
          .content { padding: 30px; text-align: center; }
          .greeting { color: #333; font-size: 18px; margin-bottom: 15px; }
          .message { color: #666; font-size: 14px; line-height: 1.6; margin-bottom: 25px; }
          .code-box { background: #f8f9fa; border: 2px dashed #4CAF50; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .code { font-size: 36px; font-weight: bold; color: #4CAF50; letter-spacing: 8px; font-family: 'Courier New', monospace; }
          .note { color: #999; font-size: 12px; margin-top: 15px; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #999; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔑 Password Reset</h1>
          </div>
          <div class="content">
            <p class="greeting">Hi ${name}!</p>
            <p class="message">We received a request to reset your Kaarya password. Use the code below to reset it:</p>
            <div class="code-box">
              <span class="code">${code}</span>
            </div>
            <p class="note">This code expires in 15 minutes. If you didn't request a reset, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>© 2024 Kaarya - Nepal's On-Demand Service Marketplace</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Hi ${name}!\n\nYour Kaarya password reset code is: ${code}\n\nThis code expires in 15 minutes. If you didn't request a reset, please ignore this email.`,
  }),
};

/**
 * Send email using Resend
 * @param {string} to - Recipient email
 * @param {object} template - Email template with subject, html, text
 */
async function sendEmail(to, template) {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    if (error) {
      console.error('❌ Email send error:', error.message);
      return { success: false, error: error.message };
    }

    console.log(`✅ Email sent successfully to ${to}`);
    console.log(`   Message ID: ${data?.id}`);
    return { success: true, messageId: data?.id };
  } catch (error) {
    console.error('❌ Email send error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send registration OTP email
 */
async function sendRegistrationOtp(email, name, code) {
  return sendEmail(email, templates.registrationOtp(name, code));
}

/**
 * Send password reset email
 */
async function sendPasswordReset(email, name, code) {
  return sendEmail(email, templates.passwordReset(name, code));
}

module.exports = {
  sendEmail,
  sendRegistrationOtp,
  sendPasswordReset,
};
