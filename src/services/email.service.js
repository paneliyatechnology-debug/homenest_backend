import { enqueueEmail } from '../queues/email.queue.js';
import config from '../config/index.js';

/**
 * Service managing transactional email templates and queue dispatches
 */
class EmailService {
  /**
   * Send Password Reset Email with Brevo via BullMQ
   * @param {string} email
   * @param {string} name
   * @param {string} resetUrl
   */
  sendPasswordResetEmail = async (email, name, resetUrl) => {
    const fromName = config.brevo.fromName || 'HomeNest';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                
                <!-- Header -->
                <tr>
                  <td style="padding: 36px 40px 24px; text-align: center; border-bottom: 1px solid #f1f5f9;">
                    <h2 style="color: #1b4332; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">${fromName}</h2>
                    <p style="color: #64748b; font-size: 13px; margin: 6px 0 0; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Security &amp; Account Services</p>
                  </td>
                </tr>

                <!-- Content -->
                <tr>
                  <td style="padding: 32px 40px;">
                    <p style="font-size: 16px; color: #1e293b; margin: 0 0 16px; font-weight: 600;">Hello <strong>${name || 'User'}</strong>,</p>
                    <p style="font-size: 15px; color: #475569; line-height: 1.6; margin: 0 0 24px;">
                      We received a request to reset your password for your <strong>${fromName}</strong> account. Click the button below to choose a new password:
                    </p>
                    
                    <!-- Call To Action Button -->
                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 32px 0;">
                      <tr>
                        <td align="center">
                          <a href="${resetUrl}" target="_blank" style="display: inline-block; background-color: #1b4332; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 36px; border-radius: 8px; box-shadow: 0 2px 4px rgba(27, 67, 50, 0.2);">Reset Password</a>
                        </td>
                      </tr>
                    </table>

                    <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 24px 0 0;">
                      This link is valid for <strong>15 minutes</strong>. If you did not initiate this request, you can safely ignore this email — your account remains completely secure.
                    </p>

                    <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 28px 0 20px;" />

                    <p style="font-size: 12px; color: #94a3b8; line-height: 1.5; margin: 0;">
                      If the button above does not work, copy and paste this link into your browser:<br />
                      <a href="${resetUrl}" style="color: #1b4332; word-break: break-all; text-decoration: underline;">${resetUrl}</a>
                    </p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="background-color: #f8fafc; padding: 20px 40px; text-align: center; border-top: 1px solid #f1f5f9;">
                    <p style="font-size: 12px; color: #94a3b8; margin: 0;">
                      &copy; ${new Date().getFullYear()} ${fromName}. All rights reserved.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    return await enqueueEmail({
      to: email,
      name,
      subject: `${fromName} - Password Reset Request`,
      html,
      text: `Hello ${name || 'User'}! We received a request to reset your password. Please visit this link to set a new password: ${resetUrl} (Valid for 15 minutes).`,
    });
  };

  /**
   * Send Welcome Credentials Email to newly created resident / user
   * @param {Object} options
   * @param {string} options.email
   * @param {string} options.name
   * @param {string} options.password
   * @param {string} [options.role='Resident']
   * @param {string} [options.pgName=null]
   * @param {string} [options.roomNo=null]
   * @param {string} [options.bedNumber=null]
   * @param {string} [options.loginUrl=null]
   */
  sendWelcomeCredentialsEmail = async ({
    email,
    name,
    password,
    role = 'Resident',
    pgName = null,
    roomNo = null,
    bedNumber = null,
    loginUrl = null,
    dueAmount = null,
    rentAmount = null,
    depositAmount = null,
    maintenanceAmount = null,
  }) => {
    const fromName = config.brevo.fromName || 'HomeNest';
    const resolvedLoginUrl = loginUrl || `${config.frontendUrl}/login`;
    const formattedRole = role ? role.charAt(0).toUpperCase() + role.slice(1).toLowerCase() : 'Resident';

    const stayDetailsHtml = (pgName || roomNo || dueAmount)
      ? `
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px 20px; margin: 24px 0 0;">
          <h4 style="margin: 0 0 12px; color: #1e293b; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700;">
            Stay &amp; Accommodation Details
          </h4>
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="font-size: 14px; color: #334155;">
            ${pgName ? `
            <tr>
              <td style="padding: 4px 0; color: #64748b; width: 35%;">PG / Property:</td>
              <td style="padding: 4px 0; font-weight: 600; color: #0f172a;">${pgName}</td>
            </tr>` : ''}
            ${roomNo ? `
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Room Number:</td>
              <td style="padding: 4px 0; font-weight: 600; color: #0f172a;">${roomNo}</td>
            </tr>` : ''}
            ${bedNumber ? `
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Assigned Bed:</td>
              <td style="padding: 4px 0; font-weight: 600; color: #0f172a;">${bedNumber}</td>
            </tr>` : ''}
            ${dueAmount ? `
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Initial Due Amount:</td>
              <td style="padding: 4px 0; font-weight: 700; color: #166534;">
                ₹${Number(dueAmount).toLocaleString('en-IN')}
                <span style="font-size: 12px; font-weight: 400; color: #64748b; display: block; margin-top: 2px;">
                  (Rent: ₹${Number(rentAmount || 0).toLocaleString('en-IN')}${depositAmount ? ` + Deposit: ₹${Number(depositAmount).toLocaleString('en-IN')}` : ''}${maintenanceAmount ? ` + Maint: ₹${Number(maintenanceAmount).toLocaleString('en-IN')}` : ''})
                </span>
              </td>
            </tr>` : ''}
          </table>
        </div>
      `
      : '';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to ${fromName}</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #334155;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 15px;">
          <tr>
            <td align="center">
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 14px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05);">
                
                <!-- Brand Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #1b4332 0%, #2d6a4f 100%); padding: 36px 40px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">${fromName}</h1>
                    <p style="color: #d8f3dc; font-size: 13px; margin: 8px 0 0; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600;">Welcome to Your New Home</p>
                  </td>
                </tr>

                <!-- Content Area -->
                <tr>
                  <td style="padding: 36px 40px;">
                    <p style="font-size: 16px; color: #0f172a; margin: 0 0 12px; font-weight: 600;">
                      Hello <strong>${name || 'Resident'}</strong>,
                    </p>
                    <p style="font-size: 15px; color: #475569; line-height: 1.6; margin: 0 0 24px;">
                      Welcome aboard! An account has been created for you on the <strong>${fromName}</strong> resident portal. You can now log in to view your stay details, raise service requests, access rent receipts, and manage your tenancy effortlessly.
                    </p>

                    <!-- Credentials Box -->
                    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 22px 24px; margin: 24px 0;">
                      <h3 style="margin: 0 0 14px; color: #166534; font-size: 15px; font-weight: 700; display: flex; align-items: center;">
                        <span>Your Login Credentials</span>
                      </h3>
                      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="font-size: 14px;">
                        <tr>
                          <td style="padding: 6px 0; color: #166534; font-weight: 600; width: 35%;">Login Email:</td>
                          <td style="padding: 6px 0; font-weight: 700; color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, monospace;">
                            ${email}
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 6px 0; color: #166534; font-weight: 600;">Temporary Password:</td>
                          <td style="padding: 6px 0;">
                            <span style="display: inline-block; background-color: #ffffff; color: #1b4332; font-family: 'Courier New', Courier, monospace; font-size: 16px; font-weight: 700; padding: 4px 12px; border-radius: 6px; border: 1px solid #86efac; letter-spacing: 1px;">
                              ${password}
                            </span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 6px 0; color: #166534; font-weight: 600;">Account Role:</td>
                          <td style="padding: 6px 0; color: #334155; font-weight: 600;">
                            ${formattedRole}
                          </td>
                        </tr>
                      </table>
                    </div>

                    ${stayDetailsHtml}

                    <!-- CTA Button -->
                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 32px 0 24px;">
                      <tr>
                        <td align="center">
                          <a href="${resolvedLoginUrl}" target="_blank" style="display: inline-block; background-color: #1b4332; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 40px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(27, 67, 50, 0.25);">
                            Log In to Portal &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- Security Advisory Notice -->
                    <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 14px 16px; border-radius: 0 8px 8px 0; margin-top: 24px;">
                      <p style="margin: 0; font-size: 13px; color: #92400e; line-height: 1.5;">
                        <strong>Security Reminder:</strong> For your security, we strongly recommend that you change your password immediately after logging in for the first time.
                      </p>
                    </div>

                    <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 24px 0 0;">
                      If you experience any difficulties accessing your account, please reach out to your property administrator or reply directly to this email.
                    </p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #f1f5f9;">
                    <p style="font-size: 12px; color: #64748b; margin: 0 0 6px;">
                      This is an automated notification from <strong>${fromName}</strong>.
                    </p>
                    <p style="font-size: 12px; color: #94a3b8; margin: 0;">
                      &copy; ${new Date().getFullYear()} ${fromName}. All rights reserved.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const plainText = `
Welcome to ${fromName}!

Hello ${name || 'Resident'},

Your account has been successfully created. You can log in using the credentials below:

- Email: ${email}
- Password: ${password}
- Role: ${formattedRole}
${pgName ? `- Property: ${pgName}\n` : ''}${roomNo ? `- Room: ${roomNo}\n` : ''}${bedNumber ? `- Bed: ${bedNumber}\n` : ''}

Login Portal: ${resolvedLoginUrl}

Security Notice: Please change your password upon your first login.

Best regards,
The ${fromName} Team
    `.trim();

    return await enqueueEmail({
      to: email,
      name,
      subject: `Welcome to ${fromName} - Your Account Credentials`,
      html,
      text: plainText,
    });
  };
}

export default new EmailService();
