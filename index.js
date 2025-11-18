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
import { createServer } from "http";
import { Server } from "socket.io";
import { initializeSocket } from "./socket/socketHandler.js";
import http from "http";
import { initMatchScheduler } from "./schedulers/matchScheduler.js";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { RtcTokenBuilder, RtcRole } = pkg;
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Create HTTP server and Socket.io instance
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    credentials: true
  }
});

// Initialize Socket.io handlers
initializeSocket(io);

// expose io on app for controllers that use req.app.get("io")
app.set("io", io);

// Initialize scheduler with io so it can emit events
initMatchScheduler(io);

// Make io available globally for use in routes/controllers
app.set('io', io);


app.use(cors({
  origin: "*", 
  credentials: true
}));

app.use(express.json());

// Serve static files from uploads directory
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const APP_ID = process.env.AGORA_APP_ID;
const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

app.use(passport.initialize());




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

    // Generate unique numeric UID from string (MongoDB ObjectId)
    // Use a hash function to convert ObjectId string to unique numeric value
    let numericUid;
    if (typeof uid === 'string') {
      // Simple hash function to convert string to unique number
      // This ensures different ObjectIds produce different numeric UIDs
      let hash = 0;
      for (let i = 0; i < uid.length; i++) {
        const char = uid.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      // Ensure positive number and within Agora's UID range (0 to 2^32-1)
      numericUid = Math.abs(hash) % 2147483647; // Max safe integer for Agora
    } else {
      numericUid = uid;
    }
    
    console.log("UID conversion:", {
      original: uid,
      numeric: numericUid,
      type: typeof numericUid
    });
    
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


// Connect to database and start server
const startServer = async () => {
  try {
    // Connect to database first
    await connectDB();
    console.log('✅ Database connection established');
    
    // Start server after database is connected
    httpServer.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📡 Socket.io server initialized`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();