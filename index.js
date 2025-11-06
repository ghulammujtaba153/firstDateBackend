// server.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import pkg from "agora-access-token";
import { connectDB } from "./database/db.js";
import router from "./routes/index.js";
import passport from "./config/passport.js";
import path from "path";
import { fileURLToPath } from "url";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { RtcTokenBuilder, RtcRole } = pkg;
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;


app.use(cors({
  origin: "*", 
  credentials: true
}));

app.use(express.json());

// Serve static files from uploads directory
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const APP_ID = "c905455f70de484ca552c6d1cb4564ba";
const APP_CERTIFICATE = "65162bc67eb649f8801028f07e9a1195";

connectDB();

app.use(passport.initialize());



// server.js - Updated callback route
app.get(
  '/auth/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/login',
    session: false
  }),
  (req, res) => {
    try {
      const user = req.user;
      
      if (!user) {
        console.error("No user in request");
        return res.redirect(`${process.env.CLIENT_URL}/login?error=no_user`);
      }

      // ✅ Check if token exists on user object
      if (!user.token) {
        console.error("No token generated for user:", user._id);
        return res.redirect(`${process.env.CLIENT_URL}/login?error=token_generation_failed`);
      }

      const redirectPath = req.query.state || '/google-auth';
      
      console.log("OAuth successful, redirecting with token");
      
      // ✅ Properly encode the token for URL
      const encodedToken = encodeURIComponent(user.token);
      res.redirect(`${process.env.CLIENT_URL}${redirectPath}?token=${encodedToken}`);
      
    } catch (error) {
      console.error("OAuth callback error:", error);
      res.redirect(`${process.env.CLIENT_URL}/login?error=oauth_failed`);
    }
  }
);


app.use("/api", router);

app.post("/generate-token", (req, res) => {
  try {
    const { channelName, uid } = req.body;
    
    // Validate required fields
    if (!channelName || uid === undefined || uid === null) {
      return res.status(400).json({ 
        error: "channelName and uid are required",
        received: { channelName, uid }
      });
    }

    // Validate environment variables
    if (!APP_ID || !APP_CERTIFICATE) {
      console.error("Missing Agora credentials:", { 
        hasAppId: !!APP_ID, 
        hasCertificate: !!APP_CERTIFICATE 
      });
      return res.status(500).json({ 
        error: "Server configuration error - missing Agora credentials" 
      });
    }

    // Convert uid to number if it's a string
    const numericUid = typeof uid === 'string' ? parseInt(uid) : uid;
    
    const role = RtcRole.PUBLISHER;
    const expirationTimeInSeconds = 3600; // 1 hour
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    // Generate token
    const token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      numericUid,
      role,
      privilegeExpiredTs
    );

    console.log("Token generated successfully:", {
      channelName,
      uid: numericUid,
      tokenLength: token.length,
      expiresAt: new Date(privilegeExpiredTs * 1000).toISOString()
    });

    res.json({ 
      token,
      uid: numericUid,
      channelName,
      expiresAt: privilegeExpiredTs
    });

  } catch (error) {
    console.error("Token generation error:", error);
    res.status(500).json({ 
      error: "Failed to generate token",
      details: error.message 
    });
  }
});



app.post("/api/verify-face", async (req, res) => {
  const { selfie, idImage } = req.body;
  
  // Debug logging
  console.log("Didit Secret Loaded:", process.env.DIDIT_SECRET ? "✅ Yes" : "❌ Missing");
  console.log("API Key (first 20 chars):", process.env.DIDIT_SECRET?.substring(0, 20) + "...");
  console.log("Full Auth Header:", `Bearer ${process.env.DIDIT_SECRET}`);
  
  // Validate inputs
  if (!selfie || !idImage) {
    return res.status(400).json({ 
      message: "Both selfie and idImage are required" 
    });
  }
  
  try {
    const response = await fetch("https://api.didit.me/v1/face/compare", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": process.env.DIDIT_SECRET, // Try without "Bearer" prefix
      },
      body: JSON.stringify({
        image1: selfie,
        image2: idImage,
      }),
    });
    
    const data = await response.json();
    
    // Handle non-2xx responses
    if (!response.ok) {
      console.error("Didit API Error:", response.status, data);
      return res.status(response.status).json({
        message: "Face verification failed",
        details: data,
      });
    }
    
    console.log("Face verification successful:", data);
    res.status(200).json(data);
    
  } catch (error) {
    console.error("Error verifying faces:", error);
    res.status(500).json({ 
      message: "Face verification failed",
      error: error.message 
    });
  }
});



app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
 
});