import User from "../models/user.js"
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { emailApi } from "../utils/mailer.js";
import SibApiV3Sdk from "sib-api-v3-sdk";


export const registerUser = async (req, res) => {
  const { email, phone, password } = req.body
  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email: req.body.email });
    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(req.body.password, salt);
    req.body.password = hashedPassword;

    const user = await User.create({ email, phone, password: hashedPassword });
    res.status(201).json(user);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Server error" });
  }
}


export const loginUser = async (req, res) => {
  try {
    // Check if user exists
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    // Check if password is correct
    const isMatch = await bcrypt.compare(req.body.password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" } // optional expiry
    );

    res.status(200).json({ token, user });
  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({ error: "Server error" });
  }
};


export const onboarding = async (req, res) => {
  const { id } = req.params;



  try {
    const user = await User.findByIdAndUpdate(id, req.body, { new: true });
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: "Server error", message: error.message });
  }
}


export const updateUser = async (req, res) => {
  const { id } = req.params;

  try {
    const updatedUser = await User.findByIdAndUpdate(id, req.body, { new: true });
    res.status(200).json(updatedUser);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
}


export const resetPassword = async (req, res) => {
  try {
    const { email, password } = req.body;
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    await User.findOneAndUpdate({ email }, { password: hashedPassword });
    res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
}

export const getUser = async (req, res) => {
  const { id } = req.params;
  try {
    const user = await User.findById(id);
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
}


export const inviteUser = async (req, res) => {
  try {
    const { email, username, phone, role } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "User with this email already exists" });
    }

    // Generate invitation token
    const invitationToken = jwt.sign(
      { email, type: 'invitation' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Create user (no password yet - will be set when they accept invitation)
    const user = await User.create({
      email,
      username: username || email.split('@')[0],
      phone: phone || '',
      role: role || 'user',
      status: 'inactive', // User is inactive until they set password
    });



    // Prepare email content
    const invitationLink = `${process.env.CLIENT_URL}/invite?token=${invitationToken}`;
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>You're Invited to First Date!</h1>
            </div>
            <div class="content">
              <p>Hello${username ? ` ${username}` : ''},</p>
              <p>You have been invited to join First Date, a premium dating platform. Click the button below to complete your registration and set up your account.</p>
              <div style="text-align: center;">
                <a href="${invitationLink}" class="button">Accept Invitation</a>
              </div>
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #667eea;">${invitationLink}</p>
              <p><strong>This invitation link will expire in 7 days.</strong></p>
              <p>If you didn't expect this invitation, you can safely ignore this email.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} First Date. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Send invitation email using Brevo
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.subject = "Invitation to join First Date";
    sendSmtpEmail.sender = { name: process.env.BREVO_SENDER_NAME, email: process.env.BREVO_SENDER_EMAIL || process.env.BREVO_FROM };
    sendSmtpEmail.to = [{ email: user.email, name: username || user.email }];
    sendSmtpEmail.htmlContent = htmlContent;



    await emailApi.sendTransacEmail(sendSmtpEmail);


    // Return user without sensitive data
    const userResponse = {
      id: user._id,
      email: user.email,
      username: user.username,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
    };

    res.status(201).json({
      message: "Invitation sent successfully",
      user: userResponse,
    });
  } catch (error) {
    console.error("Invite user error:", error);
    if (error.code === 11000) {
      return res.status(400).json({ error: "User with this email already exists" });
    }
    res.status(500).json({ error: "Server error", message: error.message });
  }
}

export const resetPasswordofInvitedUser = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Invalid or missing token" });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(400).json({ error: "Invalid or expired invitation link" });
    }

    // Token must be for invitation
    if (decoded.type !== "invitation") {
      return res.status(400).json({ error: "Invalid token type" });
    }

    // Find the invited user
    const user = await User.findOne({ email: decoded.email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if password already set
    if (user.password) {
      return res
        .status(400)
        .json({ error: "Password already set. Please login instead." });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update user
    user.password = hashedPassword;
    user.status = "active"; // activate account
    await user.save();

    res.status(200).json({
      message: "Password set successfully. Your account is now active.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: "Server error", message: error.message });
  }
};



export const getMe = async (req, res) => {
  try {

    const { token } = req.body;

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password'); // ✅ Exclude password

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Error in getMe:", error);

    res.status(500).json({ message: "Server error" });
  }
};