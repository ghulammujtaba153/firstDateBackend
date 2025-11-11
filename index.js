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
import multer from "multer";
import FormData from "form-data";
import { createServer } from "http";
import { Server } from "socket.io";
import { initializeSocket } from "./socket/socketHandler.js";

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
    origin: process.env.CLIENT_URL || "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Initialize Socket.io handlers
initializeSocket(io);

// Make io available globally for use in routes/controllers
app.set('io', io);


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



const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file (adjust as needed)
});

app.post(
  "/api/verify-face",
  upload.fields([
    { name: "user_image", maxCount: 1 },
    { name: "ref_image", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      if (!process.env.DIDIT_API_KEY) {
        console.error("Missing DIDIT_API_KEY");
        return res.status(500).json({ message: "Server missing DIDIT_API_KEY" });
      }

      const files = req.files || {};
      const userFile = files.user_image?.[0];
      const refFile = files.ref_image?.[0];

      if (!userFile || !refFile) {
        return res.status(400).json({ message: "Both user_image and ref_image are required" });
      }

      console.log("verify-face request: user_image size:", userFile.size, "mimetype:", userFile.mimetype);
      console.log("verify-face request: ref_image size:", refFile.size, "mimetype:", refFile.mimetype);

      const form = new FormData();
      // ensure sensible filenames / extensions
      form.append("user_image", userFile.buffer, {
        filename: userFile.originalname || "selfie.jpg",
        contentType: userFile.mimetype || "image/jpeg",
      });
      form.append("ref_image", refFile.buffer, {
        filename: refFile.originalname || "id.jpg",
        contentType: refFile.mimetype || "image/jpeg",
      });

      // compute content-length (some APIs reject chunked requests)
      const contentLength = await new Promise((resolve) => {
        form.getLength((err, length) => {
          if (err) {
            console.warn("Could not compute form length:", err.message);
            return resolve(null);
          }
          resolve(length);
        });
      });

      const formHeaders = form.getHeaders();

      // If we were able to compute length and all parts are buffers (no streams),
      // build a single Buffer body to ensure content-length matches actual bytes.
      let requestBody = form;
      if (contentLength) {
        try {
          // form-data's getBuffer() works only when no streams are present.
          const bodyBuffer = form.getBuffer();
          if (bodyBuffer && Buffer.isBuffer(bodyBuffer)) {
            formHeaders["content-length"] = bodyBuffer.length;
            requestBody = bodyBuffer;
          } else {
            // fallback: don't set content-length and send stream
            delete formHeaders["content-length"];
          }
        } catch (err) {
          console.warn("form.getBuffer() unavailable — sending streamed body:", err.message);
          delete formHeaders["content-length"];
        }
      }

      console.log("Outgoing Didit request headers:", {
        ...formHeaders,
        "x-api-key": process.env.DIDIT_API_KEY ? "[REDACTED]" : null,
      });

      const response = await fetch("https://verification.didit.me/v2/face-match/", {
        method: "POST",
        headers: {
          accept: "application/json",
          "x-api-key": process.env.DIDIT_API_KEY,
          ...formHeaders,
        },
        body: requestBody,
      });

      const status = response.status;
      const respHeaders = Object.fromEntries(response.headers.entries());
      let rawText = "";
      try {
        rawText = await response.text();
      } catch (err) {
        console.warn("Failed to read response body as text:", err.message);
      }

      let parsed = null;
      if (rawText) {
        try {
          parsed = JSON.parse(rawText);
        } catch (err) {
          parsed = { raw: rawText, parseError: err.message };
        }
      }

      console.log("Didit response status:", status);
      console.log("Didit response headers:", respHeaders);
      console.log("Didit response body (truncated):", (rawText || "").slice(0, 1000));

      if (!response.ok) {
        // include headers + body to help debug 400 responses
        return res.status(status).json({
          message: "Face verification failed",
          details: parsed ?? rawText ?? null,
          diditStatus: status,
          diditHeaders: respHeaders,
        });
      }

      // success
      return res.status(200).json(parsed ?? { message: "No JSON returned from Didit API", raw: rawText });
    } catch (error) {
      console.error("Error verifying faces:", error);
      return res.status(500).json({ message: "Face verification failed", error: error.message });
    }
  }
);


// Use httpServer instead of app.listen for Socket.io
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 Socket.io server initialized`);
});