import FormData from "form-data";
import multer from "multer";
import User from "../models/user.js";

// Configure multer for memory storage (for Didit API)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
});

// Middleware for handling file uploads - new workflow format (legacy, not needed for hosted UI)
export const uploadWorkflowFields = upload.fields([
  { name: "ref_image", maxCount: 1 },
  { name: "selfie_image", maxCount: 1 },
]);

// Middleware for backward compatibility
export const uploadFields = upload.fields([
  { name: "user_image", maxCount: 1 },
  { name: "ref_image", maxCount: 1 },
]);

/**
 * Start DIDIT Identity Workflow - Redirect to DIDIT's Hosted UI
 * This starts a workflow session and returns the URL for DIDIT's hosted verification UI
 */
export const startDiditWorkflow = async (req, res) => {
  try {
    const API_KEY = process.env.DIDIT_API_KEY;
    const WORKFLOW_ID = process.env.DIDIT_WORKFLOW_ID; // Workflow ID from DIDIT console

    if (!API_KEY) {
      return res.status(500).json({ message: "Missing DIDIT_API_KEY" });
    }

    if (!WORKFLOW_ID) {
      return res.status(500).json({ message: "Missing DIDIT_WORKFLOW_ID" });
    }

    // Get user ID from request (from auth middleware or body)
    const userId = req.user?.id || req.body?.userId || req.query?.userId;

    // 1️⃣ START WORKFLOW SESSION
    // This creates a verification session and returns a URL for DIDIT's hosted UI
    const workflowData = {
      workflow_id: WORKFLOW_ID,
      vendor_data: userId || "user_verification", // Optional: associate with user
      callback: process.env.DIDIT_CALLBACK_URL || `${process.env.BASE_URL || process.env.SERVER_URL || "http://localhost:5000"}/api/callback`, // Webhook callback URL
    };

    // Try the session endpoint (for hosted UI with workflow_id)
    let startResponse;
    let startJson;

    try {
      // First try: Use /v2/session/ endpoint (recommended for hosted UI)
      startResponse = await fetch("https://verification.didit.me/v2/session/", {
        method: "POST",
        headers: {
          "accept": "application/json",
          "x-api-key": API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(workflowData),
      });

      startJson = await startResponse.json();
    } catch (err) {
      // Fallback: Try /v2/workflows/start endpoint
      console.log("Trying fallback endpoint /v2/workflows/start");
      startResponse = await fetch("https://verification.didit.me/v2/workflows/start", {
        method: "POST",
        headers: {
          "accept": "application/json",
          "x-api-key": API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(workflowData),
      });

      startJson = await startResponse.json();
    }

    if (!startResponse.ok) {
      console.error("Failed to start Didit workflow:", startJson);
      return res.status(400).json({
        message: "Failed to start Didit workflow",
        details: startJson,
      });
    }

    const sessionId = startJson.session_id;
    // DIDIT returns the verification URL in different possible fields
    const workflowUrl = startJson.url || startJson.verification_url || startJson.redirect_url;

    if (!workflowUrl && sessionId) {
      // If URL is not provided, construct it from session_id
      // DIDIT typically provides: https://verification.didit.me/verify/{session_id}
      // or: https://verification.didit.me/workflow/{session_id}
      const constructedUrl = `https://verification.didit.me/verify/${sessionId}`;
      console.log("✅ Workflow session started (constructed URL):", sessionId);

      return res.status(200).json({
        message: "Workflow session created successfully",
        sessionId,
        workflowUrl: constructedUrl,
        redirectUrl: constructedUrl,
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        message: "No session ID received from DIDIT",
        details: startJson,
      });
    }

    console.log("✅ Workflow session started:", sessionId, "URL:", workflowUrl);

    // 2️⃣ Return workflow URL for frontend to redirect
    return res.status(200).json({
      message: "Workflow session created successfully",
      sessionId,
      workflowUrl: workflowUrl || `https://verification.didit.me/verify/${sessionId}`,
      redirectUrl: workflowUrl || `https://verification.didit.me/verify/${sessionId}`,
    });

  } catch (error) {
    console.error("DIDIT workflow error:", error);
    return res.status(500).json({
      message: "Failed to start workflow",
      error: error.message,
    });
  }
};

/**
 * Get Workflow Status
 * Poll this endpoint to check the status of a workflow session
 */
export const getWorkflowStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ message: "sessionId is required" });
    }

    const API_KEY = process.env.DIDIT_API_KEY;
    if (!API_KEY) {
      return res.status(500).json({ message: "Missing DIDIT_API_KEY" });
    }

    const response = await fetch(`https://verification.didit.me/v2/workflows/${sessionId}/status`, {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-api-key": API_KEY,
      },
    });

    const json = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        message: "Failed to check workflow status",
        details: json,
      });
    }

    return res.status(200).json(json);
  } catch (error) {
    console.error("Get workflow status error:", error);
    return res.status(500).json({
      message: "Failed to check workflow status",
      error: error.message,
    });
  }
};

/**
 * DIDIT Webhook Callback Handler
 * This endpoint receives webhook notifications from DIDIT when verification status changes
 */
// export const diditWebhookCallback = async (req, res) => {
//   try {
//     const { session_id, status, vendor_data, result } = req.body;

//     console.log("📥 DIDIT Webhook received:", {
//       session_id,
//       status,
//       vendor_data,
//       result,
//     });

//     // Verify webhook (optional: verify signature if DIDIT provides one)
//     // const signature = req.headers['x-didit-signature'];
//     // if (!verifyWebhookSignature(req.body, signature)) {
//     //   return res.status(401).json({ message: "Invalid signature" });
//     // }

//     // Update user verification status based on vendor_data (user ID)
//     if (vendor_data && vendor_data !== "user_verification") {
//       try {
//         const user = await User.findById(vendor_data);
        
//         if (user) {
//           // Check if verification was successful
//           const isVerified = status === "completed" || status === "success" || 
//                            (result?.face_match?.match === true) ||
//                            (result?.verification?.status === "verified");

//           if (isVerified) {
//             user.verified = true;
//             await user.save();
//             console.log(`✅ User ${vendor_data} verified successfully`);
//           } else {
//             console.log(`❌ User ${vendor_data} verification failed:`, status, result);
//           }
//         }
//       } catch (userError) {
//         console.error("Error updating user verification status:", userError);
//       }
//     }

//     // Return 200 to acknowledge receipt
//     res.status(200).json({ message: "Webhook received successfully" });
//   } catch (error) {
//     console.error("DIDIT webhook error:", error);
//     res.status(500).json({
//       message: "Failed to process webhook",
//       error: error.message,
//     });
//   }
// };

export const diditWebhookCallback = async (req, res) => {
  try {
    const { session_id, status, vendor_data, result } = req.body;

    console.log("📥 DIDIT Webhook received:", {
      session_id,
      status,
      vendor_data,
      result,
    });

    // STEP 1: Ignore non-final statuses
    const isFinal =
      status === "completed" ||
      status === "success" ||
      status === "failed" ||
      result !== undefined;

    if (!isFinal) {
      console.log(`⏳ Verification pending: ${status}`);
      return res.status(200).json({ message: "Pending update acknowledged" });
    }

    // STEP 2: Final verification result
    const isVerified =
      status === "completed" ||
      status === "success" ||
      (result?.face_match?.match === true) ||
      (result?.verification?.status === "verified");

    // STEP 3: Update user if ID provided
    if (vendor_data && vendor_data !== "user_verification") {
      const user = await User.findById(vendor_data);

      if (user) {
        user.verified = isVerified;
        await user.save();

        console.log(
          isVerified
            ? `✅ User ${vendor_data} verified successfully`
            : `❌ User ${vendor_data} final verification failed`
        );
      }
    }

    res.status(200).json({ message: "Webhook processed" });
  } catch (error) {
    console.error("DIDIT webhook error:", error);
    res.status(500).json({
      message: "Failed to process webhook",
      error: error.message,
    });
  }
};

/**
 * Verify Face - Legacy endpoint for backward compatibility
 * This uses the old direct comparison method (file upload)
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

    // For legacy endpoint, we need to use file upload workflow
    // This is kept for backward compatibility but uses the workflow API
    const API_KEY = process.env.DIDIT_API_KEY;
    
    // Start workflow session
    const startResponse = await fetch("https://verification.didit.me/v2/workflows/start", {
      method: "POST",
      headers: {
        accept: "application/json",
        "x-api-key": API_KEY,
      },
    });

    const startJson = await startResponse.json();
    const sessionId = startJson.session_id;

    if (!startResponse.ok || !sessionId) {
      return res.status(400).json({
        message: "Failed to start workflow",
        details: startJson,
      });
    }

    // Upload reference image
    const refForm = new FormData();
    refForm.append("document", refFile.buffer, {
      filename: refFile.originalname || "ref_image.jpg",
      contentType: refFile.mimetype || "image/jpeg",
    });

    await fetch(`https://verification.didit.me/v2/workflows/${sessionId}/document`, {
      method: "POST",
      headers: {
        "x-api-key": API_KEY,
        ...refForm.getHeaders(),
      },
      body: refForm,
    });

    // Upload selfie
    const selfieForm = new FormData();
    selfieForm.append("selfie", userFile.buffer, {
      filename: userFile.originalname || "selfie.jpg",
      contentType: userFile.mimetype || "image/jpeg",
    });

    await fetch(`https://verification.didit.me/v2/workflows/${sessionId}/selfie`, {
      method: "POST",
      headers: {
        "x-api-key": API_KEY,
        ...selfieForm.getHeaders(),
      },
      body: selfieForm,
    });

    // Execute workflow
    const executeRes = await fetch(`https://verification.didit.me/v2/workflows/${sessionId}/execute`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "x-api-key": API_KEY,
      }
    });

    const executeJson = await executeRes.json();

    return res.status(200).json({
      message: "Verification completed",
      sessionId,
      result: executeJson,
    });
  } catch (error) {
    console.error("Verify face error:", error);
    return res.status(500).json({
      message: "Failed to verify face",
      error: error.message,
    });
  }
};
