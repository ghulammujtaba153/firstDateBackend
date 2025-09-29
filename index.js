// server.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import pkg from "agora-access-token";
import { connectDB } from "./database/db.js";
import router from "./routes/index.js";

const { RtcTokenBuilder, RtcRole } = pkg;
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;


app.use(cors({
  origin: "*", 
  credentials: true
}));

app.use(express.json());

const APP_ID = "c905455f70de484ca552c6d1cb4564ba";
const APP_CERTIFICATE = "65162bc67eb649f8801028f07e9a1195";

connectDB();


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

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    hasAppId: !!APP_ID,
    hasCertificate: !!APP_CERTIFICATE,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔧 Environment check:`, {
    APP_ID: APP_ID ? `${APP_ID.substring(0, 8)}...` : 'MISSING',
    APP_CERTIFICATE: APP_CERTIFICATE ? 'SET' : 'MISSING'
  });
});