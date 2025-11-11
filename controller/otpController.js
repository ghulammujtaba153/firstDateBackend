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
      htmlContent: `<h2>OTP Verification</h2>
                    <p>Your OTP code is: <b>${otpCode}</b></p>
                    <p>This code will expire in <b>5 minutes</b>.</p>`,
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
