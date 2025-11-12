import FormData from "form-data";
import multer from "multer";

// Configure multer for memory storage (for Didit API)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
});

// Middleware for handling file uploads
export const uploadFields = upload.fields([
  { name: "user_image", maxCount: 1 },
  { name: "ref_image", maxCount: 1 },
]);

/**
 * Verify face using Didit API
 * Compares user_image (selfie) with ref_image (reference photo)
 */
export const verifyFace = async (req, res) => {
  try {
    // Check if DIDIT_API_KEY is configured
    if (!process.env.DIDIT_API_KEY) {
      console.error("Missing DIDIT_API_KEY");
      return res.status(500).json({ 
        message: "Server missing DIDIT_API_KEY" 
      });
    }

    const files = req.files || {};
    const userFile = files.user_image?.[0];
    const refFile = files.ref_image?.[0];

    // Validate that both files are provided
    if (!userFile || !refFile) {
      return res.status(400).json({ 
        message: "Both user_image and ref_image are required" 
      });
    }

    console.log("verify-face request: user_image size:", userFile.size, "mimetype:", userFile.mimetype);
    console.log("verify-face request: ref_image size:", refFile.size, "mimetype:", refFile.mimetype);

    // Create FormData for Didit API
    const form = new FormData();
    
    // Append files with proper filenames and content types
    form.append("user_image", userFile.buffer, {
      filename: userFile.originalname || "selfie.jpg",
      contentType: userFile.mimetype || "image/jpeg",
    });
    form.append("ref_image", refFile.buffer, {
      filename: refFile.originalname || "id.jpg",
      contentType: refFile.mimetype || "image/jpeg",
    });

    // Compute content-length (some APIs reject chunked requests)
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

    // Build request body with proper content-length
    let requestBody = form;
    if (contentLength) {
      try {
        // form-data's getBuffer() works only when no streams are present
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

    // Make request to Didit API
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
    
    // Read response body
    let rawText = "";
    try {
      rawText = await response.text();
    } catch (err) {
      console.warn("Failed to read response body as text:", err.message);
    }

    // Parse JSON response
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

    // Handle error responses
    if (!response.ok) {
      return res.status(status).json({
        message: "Face verification failed",
        details: parsed ?? rawText ?? null,
        diditStatus: status,
        diditHeaders: respHeaders,
      });
    }

    // Success response
    return res.status(200).json(
      parsed ?? { 
        message: "No JSON returned from Didit API", 
        raw: rawText 
      }
    );
  } catch (error) {
    console.error("Error verifying faces:", error);
    return res.status(500).json({ 
      message: "Face verification failed", 
      error: error.message 
    });
  }
};

