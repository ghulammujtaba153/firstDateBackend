import Otp from "../models/otp.js";
import User from "../models/user.js";
import { transporter } from "../utils/mailer.js";


export const sendOtp = async (req, res) => {
  const { email, registration } = req.body;

  try {
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

    // Send OTP via email
    await transporter.sendMail({
      from: `"Your App" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your OTP Code",
      text: `Your OTP code is ${otpCode}. It will expire in 5 minutes.`,
      html: `<h2>OTP Verification</h2>
             <p>Your OTP code is: <b>${otpCode}</b></p>
             <p>This code will expire in <b>5 minutes</b>.</p>`,
    });

    return res.status(200).json({ message: "OTP sent successfully" });
  } catch (error) {
    console.error("Send OTP error:", error.message);
    return res.status(500).json({ error: "Server error" });
  }
};




export const verifyOtp = async (req, res) => {
    const { email, otp } = req.body; // changed here

    try {
        const record = await Otp.findOne({ email, code: otp }); // map otp → code

        if (!record) {
            return res.status(401).json({ message: 'Invalid OTP' });
        }

        await Otp.deleteOne({ email, code: otp });
        
        res.status(200).json({ message: 'OTP verified successfully' });
    } catch (error) {
        console.error("Verify OTP error:", error.message);
        res.status(500).json({ error: "Server error" });
    }
};
