import Otp from "../models/otp.js";
import User from "../models/user.js";
import { emailApi } from "../utils/mailer.js";


export const sendOtp = async (req, res) => {
  const { email, registration } = req.body;

  try {
    // Basic env check for Brevo client
    if (!emailApi) {
      console.error("Brevo email client not initialized (BREVO_API_KEY missing)");
      return res.status(500).json({ error: "Email service not configured" });
    }

    // Check user existence based on registration flag
    const user = await User.findOne({ email });

    if (registration) {
      // New registration → email must NOT exist
      if (user) {
        return res.status(400).json({ message: "Email already registered" });
      }
    } else {
      // Not registration (e.g. login/forgot password) → email MUST exist
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
    }

    // Check if an OTP already exists and is still valid
    let otp = await Otp.findOne({ email });
    const now = new Date();

    if (otp && otp.expiresAt > now) {
      return res.status(200).json({ message: "OTP already sent. Please check your email." });
    }

    // Generate 4-digit OTP
    const otpCode = Math.floor(1000 + Math.random() * 9000);

    // Create / Update OTP record
    otp = await Otp.findOneAndUpdate(
      { email },
      {
        code: otpCode,
        expiresAt: new Date(now.getTime() + 5 * 60000), // 5 min expiry
      },
      { upsert: true, new: true }
    );

    // Prepare sender + payload for Brevo
    const sender = {
      name: process.env.BREVO_SENDER_NAME || "Your App",
      email: process.env.BREVO_SENDER_EMAIL || process.env.BREVO_FROM || "no-reply@example.com",
    };

    const sendSmtpEmail = {
      subject: "Your OTP Code",
      sender,
      to: [{ email, name: user?.name || undefined }],
      htmlContent: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OTP Verification</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow: hidden;">
          <tr>
            <td style="padding: 40px 30px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">OTP Verification</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">Hello${user?.name ? ` ${user.name}` : ''},</p>
              <p style="margin: 0 0 30px 0; color: #666666; font-size: 15px; line-height: 1.6;">Please use the following verification code to complete your request:</p>
              <div style="text-align: center; margin: 30px 0;">
                <div style="display: inline-block; background-color: #f8f9fa; border: 2px dashed #667eea; border-radius: 8px; padding: 20px 40px;">
                  <p style="margin: 0; font-size: 36px; font-weight: 700; color: #667eea; letter-spacing: 8px; font-family: 'Courier New', monospace;">${otpCode}</p>
                </div>
              </div>
              <p style="margin: 30px 0 0 0; color: #999999; font-size: 13px; line-height: 1.6; text-align: center;">This code will expire in <strong style="color: #e74c3c;">5 minutes</strong>.</p>
              <p style="margin: 20px 0 0 0; color: #999999; font-size: 12px; line-height: 1.6; text-align: center;">If you didn't request this code, please ignore this email.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 30px; background-color: #f8f9fa; text-align: center; border-top: 1px solid #e9ecef;">
              <p style="margin: 0; color: #999999; font-size: 12px;">© ${new Date().getFullYear()} ${process.env.BREVO_SENDER_NAME || 'Your App'}. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
      textContent: `Your OTP code is ${otpCode}. It will expire in 5 minutes.`,
    };

    // Send via Brevo
    const response = await emailApi.sendTransacEmail(sendSmtpEmail);
    console.log("Brevo sendTransacEmail response:", response);

    return res.status(200).json({ message: "OTP sent successfully" });
  } catch (error) {
    console.error("Send OTP error:", error?.response || error?.message || error);
    return res.status(500).json({ error: "Server error" });
  }
};



export const verifyOtp = async (req, res) => {
  const { email, otp } = req.body;

  try {
    const record = await Otp.findOne({ email, code: otp });

    if (!record) {
      return res.status(401).json({ message: "Invalid OTP" });
    }

    await Otp.deleteOne({ email, code: otp });

    res.status(200).json({ message: "OTP verified successfully" });
  } catch (error) {
    console.error("Verify OTP error:", error.message);
    res.status(500).json({ error: "Server error" });
  }
};
